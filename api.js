// api.js - 瀑布降級版 (優先抓最強 Pro，失敗自動換 Flash)

// ==========================================
// Part 1: 基礎工具
// ==========================================

function getApiKey() {
    return localStorage.getItem('gemini_api_key');
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ★★★ 核心工具：智慧型 JSON 修復器 ★★★
function smartJsonFix(jsonStr) {
    let inString = false;
    let result = '';
    
    // 移除 markdown 包裝
    let clean = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // 逐字掃描，修正引號內的換行
    for (let i = 0; i < clean.length; i++) {
        const char = clean[i];
        if (char === '"' && (i === 0 || clean[i-1] !== '\\')) {
            inString = !inString;
        }
        if (inString) {
            if (char === '\n') { result += '\\n'; continue; }
            if (char === '\r') { result += '\\r'; continue; }
            if (char === '\t') { result += '\\t'; continue; }
        }
        result += char;
    }
    
    // 擷取前後大括號
    const firstBrace = result.indexOf('{');
    const lastBrace = result.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        result = result.substring(firstBrace, lastBrace + 1);
    }
    
    try {
        return JSON.parse(result);
    } catch (e) {
        console.error("智慧修復失敗，原始字串:", clean);
        throw new Error("AI 回傳格式受損，請重新生成。");
    }
}


// ==========================================
// Part 2: 請求隊列管理器 (Queue)
// ==========================================
class GeminiQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.minDelay = 1000; // 縮短一點，因為 Pro 很慢，Flash 很快，取折衷
    }

    add(taskFunction) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task: taskFunction, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const currentItem = this.queue.shift();

        try {
            // 執行請求 (這裡的 task 已經包含了降級邏輯)
            const result = await currentItem.task();
            currentItem.resolve(result);
            await sleep(this.minDelay);
        } catch (error) {
            // 如果連最後一線生機都失敗了，才會報錯
            currentItem.reject(error);
        } finally {
            this.isProcessing = false;
            this.process();
        }
    }
}

const apiQueue = new GeminiQueue();


// ==========================================
// Part 3: 模型天梯系統 (Model Ladder)
// ==========================================

// 這裡不只回傳一個，而是回傳「一整串」排序好的模型網址
async function getSortedModelList(apiKey) {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    try {
        const response = await fetch(listUrl);
        const data = await response.json();
        
        if (!data.models) return [];

        let models = data.models.filter(m => 
            m.name.includes('gemini') && 
            m.supportedGenerationMethods.includes('generateContent')
        );

        // ★★★ 天梯排序邏輯 ★★★
        // 規則：版本越新越好 (3.0 > 2.0)，同版本 Pro > Flash
        models.sort((a, b) => {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();

            // 1. 解析版本號 (3.0, 2.0, 1.5...)
            const getVer = (n) => {
                const match = n.match(/gemini-(\d+(\.\d+)?)/);
                return match ? parseFloat(match[1]) : 0;
            };
            const verA = getVer(nameA);
            const verB = getVer(nameB);

            // 2. 版本先決：大的排前面
            if (verA !== verB) return verB - verA;

            // 3. 同版本比強度：Pro > Flash
            // 我們給不同型號打分
            const getScore = (n) => {
                if (n.includes('ultra')) return 10;
                if (n.includes('pro')) return 8;
                if (n.includes('flash')) return 5;
                if (n.includes('nano')) return 1;
                return 0;
            };
            return getScore(nameB) - getScore(nameA);
        });

        // 轉換成網址列表
        const urls = models.map(m => {
            const modelName = m.name.replace('models/', '');
            return {
                name: modelName,
                url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
            };
        });

        console.log("當前模型天梯榜 (由強到弱):", urls.map(u => u.name));
        return urls;

    } catch (e) {
        console.warn("無法取得模型列表，使用保底方案");
        // 如果網路不通，回傳預設的 Flash 保底
        return [{
            name: 'gemini-1.5-flash',
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
        }];
    }
}


// ==========================================
// Part 4: 外部呼叫介面 (含降級迴圈)
// ==========================================

// 這是單次請求，如果失敗會拋出錯誤
async function _tryRequest(prompt, modelUrl) {
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    const response = await fetch(modelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (data.error) {
        // 將錯誤拋出，讓外層去抓
        throw new Error(`${data.error.code} - ${data.error.message}`);
    }
    
    // 檢查空值
    if (!data.candidates || !data.candidates.length || !data.candidates[0].content) {
        throw new Error("EMPTY_RESPONSE");
    }

    return data;
}

// 核心：瀑布式請求 (Cascade Request)
async function requestWithFallback(prompt) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("NO_KEY");

    // 1. 取得天梯榜
    const modelList = await getSortedModelList(apiKey);
    
    let lastError = null;

    // 2. 迴圈嘗試：從最強的開始試
    for (const model of modelList) {
        try {
            console.log(`[系統] 嘗試使用模型：${model.name}...`);
            const data = await _tryRequest(prompt, model.url);
            
            console.log(`✅ 成功！由 ${model.name} 完成任務。`);
            return data; // 成功就直接回傳，結束迴圈

        } catch (error) {
            const errMsg = error.message.toLowerCase();
            
            // 判斷是否可以降級重試 (額度滿、忙線、崩潰)
            const isRetryable = 
                errMsg.includes('429') || 
                errMsg.includes('resource has been exhausted') ||
                errMsg.includes('too many requests') ||
                errMsg.includes('overloaded') || 
                errMsg.includes('503') ||
                errMsg.includes('500') ||
                errMsg.includes('internal error') || 
                errMsg.includes('empty_response');

            if (isRetryable) {
                console.warn(`⚠️ 模型 ${model.name} 失敗 (${errMsg})，正在切換下一階模型...`);
                lastError = error;
                // 這裡不 return，也不 throw，而是讓迴圈繼續跑下一次 (continue)
                // 為了避免瞬間衝擊，切換模型稍微停一下
                await sleep(500); 
                continue; 
            } else {
                // 如果是 Key 錯誤或其他無法挽救的錯誤，直接停止
                throw error;
            }
        }
    }

    // 如果迴圈跑完了還是沒人成功
    throw new Error(`所有模型都失敗了。最後錯誤: ${lastError ? lastError.message : '未知'}`);
}


// 功能 A: 生成故事
async function generateStory(prompt) {
    return apiQueue.add(async () => {
        // 呼叫具備降級功能的請求函式
        const data = await requestWithFallback(prompt);

        const text = data.candidates[0].content.parts[0].text;
        
        // 使用智慧修復器
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

    return apiQueue.add(async () => {
        const data = await requestWithFallback(prompt);
        return data.candidates[0].content.parts[0].text;
    });
}
