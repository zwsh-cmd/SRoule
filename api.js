// api.js - 終極修復版 (Queue限流 + 版本鎖定 + 智慧JSON修復)

// ==========================================
// Part 1: 基礎工具
// ==========================================

function getApiKey() {
    return localStorage.getItem('gemini_api_key');
}

// 讓程式暫停休息的工具 (單位: 毫秒)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ★★★ 核心工具：智慧型 JSON 修復器 ★★★
// 解決 "Bad control character"：當 AI 在字串裡亂按 Enter 時，幫它修好
function smartJsonFix(jsonStr) {
    let inString = false;
    let result = '';
    
    // 1. 先移除 Markdown 的 ```json 包裝
    let clean = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // 2. 逐字掃描，修正「引號內」的違規換行
    for (let i = 0; i < clean.length; i++) {
        const char = clean[i];
        
        // 判斷是否遇到引號 (要排除掉前面有反斜線 \" 的轉義引號)
        if (char === '"' && (i === 0 || clean[i-1] !== '\\')) {
            inString = !inString; // 切換狀態：進入/離開 字串模式
        }
        
        // 如果現在是在「字串內容」裡面，遇到換行或 Tab，強制轉成符號
        if (inString) {
            if (char === '\n') { result += '\\n'; continue; }
            if (char === '\r') { result += '\\r'; continue; }
            if (char === '\t') { result += '\\t'; continue; }
        }
        
        // 其他字元照原本的樣式加入
        result += char;
    }
    
    // 3. 嘗試擷取前後的大括號 (避免 AI 在前後講廢話)
    const firstBrace = result.indexOf('{');
    const lastBrace = result.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        result = result.substring(firstBrace, lastBrace + 1);
    }
    
    try {
        return JSON.parse(result);
    } catch (e) {
        console.error("智慧修復失敗，原始字串:", clean);
        throw new Error("AI 回傳的格式嚴重受損，無法讀取。");
    }
}


// ==========================================
// Part 2: 請求隊列管理器 (Queue & Rate Limiter)
// ==========================================
class GeminiQueue {
    constructor() {
        this.queue = [];           // 排隊隊伍
        this.isProcessing = false; // 是否正在處理中
        this.minDelay = 2000;      // 平常每 2 秒處理一個 (安全速度)
        this.retryDelay = 5000;    // 如果被擋 (429/503)，罰站 5 秒再試
    }

    // 將請求加入隊列
    add(taskFunction) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task: taskFunction, resolve, reject });
            this.process(); // 嘗試啟動處理
        });
    }

    // 處理迴圈
    async process() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const currentItem = this.queue.shift(); // 取出第一位

        try {
            // 執行請求
            const result = await currentItem.task();
            currentItem.resolve(result); // 成功回傳
            
            // 成功後，強制休息一下
            await sleep(this.minDelay);

        } catch (error) {
            console.warn("API 請求發生狀況:", error);

            const errMsg = error.message.toLowerCase();

            // ★★★ 自動重試判定 (增強版) ★★★
            // 包含 429 (太快)、503 (忙線) 以及 500 (Google 內部錯誤)
            const shouldRetry = 
                errMsg.includes('429') || 
                errMsg.includes('resource has been exhausted') ||
                errMsg.includes('too many requests') ||
                errMsg.includes('overloaded') || 
                errMsg.includes('503') ||
                errMsg.includes('500') ||             // 新增：伺服器崩潰
                errMsg.includes('internal error') ||  // 新增：內部錯誤文字
                errMsg.includes('internal server error');

            if (shouldRetry) {
                console.log(`[系統] Google 伺服器不穩或限流 (${errMsg})，${this.retryDelay/1000} 秒後重試...`);
                // 把工作「放回隊伍最前面」重試 (插隊)
                this.queue.unshift(currentItem); 
                // 罰站休息久一點
                await sleep(this.retryDelay);    
            } else {
                // 其他錯誤 (如 key 錯誤、網路斷線) 就直接報錯
                currentItem.reject(error);
            }
        } finally {
            this.isProcessing = false;
            this.process(); // 繼續處理下一位
        }
    }
}

// 建立全域隊列實體
const apiQueue = new GeminiQueue();


// ==========================================
// Part 3: 模型選擇邏輯 (鎖定 Max 2.5 Flash)
// ==========================================
async function getBestModelUrl(apiKey) {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    try {
        const response = await fetch(listUrl);
        const data = await response.json();
        
        let models = data.models.filter(m => 
            m.name.includes('gemini') && 
            m.supportedGenerationMethods.includes('generateContent')
        );

        models.sort((a, b) => {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();

            // 1. 解析版本號工具
            const getVer = (n) => {
                const match = n.match(/gemini-(\d+(\.\d+)?)/);
                return match ? parseFloat(match[1]) : 0;
            };
            const verA = getVer(nameA);
            const verB = getVer(nameB);

            // 2.【天花板過濾】如果版本超過 2.5，視為「不合格」(設為極小值排到最後)
            const effectiveVerA = verA > 2.5 ? -1 : verA;
            const effectiveVerB = verB > 2.5 ? -1 : verB;

            // 3. 版本比大小：大的排前面 (例如 2.5 > 2.0 > 1.5)
            if (effectiveVerA !== effectiveVerB) {
                return effectiveVerB - effectiveVerA;
            }

            // 4. 同版本時，Flash 優先
            const isFlash = n => n.includes('flash');
            if (isFlash(nameB) && !isFlash(nameA)) return 1;
            if (isFlash(nameA) && !isFlash(nameB)) return -1;

            return 0;
        });

        if (models.length > 0) {
            const bestModel = models[0].name.replace('models/', '');
            console.log(`[系統] 自動鎖定模型：${bestModel}`); 
            return `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${apiKey}`;
        }

    } catch (e) {
        console.warn("模型列表獲取失敗，使用保底方案", e);
    }

    // 終極保底
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
}


// ==========================================
// Part 4: 外部呼叫介面 (所有請求都進 Queue)
// ==========================================

// 內部用的請求執行函式
async function _makeRequest(prompt) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("NO_KEY"); 

    const url = await getBestModelUrl(apiKey);

    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    // 檢查錯誤，如果是 API 端回傳的錯誤，丟出 Error 讓 Queue 捕捉
    if (data.error) {
        // 把錯誤代碼也放進訊息，方便 Queue 判斷是否為 429/503
        throw new Error(`${data.error.code} - ${data.error.message}`);
    }

    return data;
}

// 功能 A: 生成故事
async function generateStory(prompt) {
    // 透過 Queue 執行
    return apiQueue.add(async () => {
        const data = await _makeRequest(prompt);
        
        if (!data.candidates || !data.candidates[0]) {
            throw new Error("生成內容為空，請稍後再試");
        }

        const text = data.candidates[0].content.parts[0].text;
        
        // ★★★ 使用智慧修復器來解析 JSON ★★★
        return smartJsonFix(text);
    });
}

// 功能 B: 生成對話回應
async function generateReply(historyContext, userMessage) {
    const prompt = `
    你是一個編劇顧問。
    上一段故事背景：${JSON.stringify(historyContext)}
    使用者的問題或回應：${userMessage}
    請以繁體中文回答。
    `;

    // 透過 Queue 執行
    return apiQueue.add(async () => {
        const data = await _makeRequest(prompt);
        return data.candidates[0].content.parts[0].text;
    });
}
