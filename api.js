// api.js - Queue 限流版 + 版本天花板鎖定 (Max 2.5 Flash)

// ==========================================
// Part 1: 基礎工具
// ==========================================

function getApiKey() {
    return localStorage.getItem('gemini_api_key');
}

// 讓程式暫停休息的工具 (單位: 毫秒)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// Part 2: 請求隊列管理器 (Queue & Rate Limiter)
// 這是妳的「交通警察」，負責排隊和擋下過快的請求
// ==========================================
class GeminiQueue {
    constructor() {
        this.queue = [];           // 排隊隊伍
        this.isProcessing = false; // 是否正在處理中
        this.minDelay = 2000;      // 平常每 2 秒處理一個 (安全速度)
        this.retryDelay = 5000;    // 如果被擋 (429)，罰站 5 秒再試
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
            
            // 成功後，強制休息一下 (Rate Limiter)
            await sleep(this.minDelay);

        } catch (error) {
            console.warn("API 請求發生狀況:", error);

            // 判斷是否為「請求太頻繁 (429)」或「額度不足」
            const isRateLimit = error.message.includes('429') || 
                                error.message.includes('Resource has been exhausted') ||
                                error.message.includes('Too Many Requests');

            if (isRateLimit) {
                console.log(`[系統] 觸發 429 限流，冷靜 ${this.retryDelay/1000} 秒後重試...`);
                // 把工作「放回隊伍最前面」重試 (插隊)
                this.queue.unshift(currentItem); 
                // 罰站休息久一點
                await sleep(this.retryDelay);    
            } else {
                // 其他錯誤 (如網路斷線、格式錯誤) 就直接報錯，不要重試
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

        // ★★★ 關鍵修改：版本天花板邏輯 ★★★
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
            // 這樣可以避免用到 3.0 Pro 等高額度模型
            const effectiveVerA = verA > 2.5 ? -1 : verA;
            const effectiveVerB = verB > 2.5 ? -1 : verB;

            // 3. 版本比大小：大的排前面 (例如 2.5 > 2.0 > 1.5)
            if (effectiveVerA !== effectiveVerB) {
                return effectiveVerB - effectiveVerA;
            }

            // 4. 同版本時，Flash 優先 (為了省額度)
            const isFlash = n => n.includes('flash');
            // B 是 Flash 但 A 不是 -> B 排前面
            if (isFlash(nameB) && !isFlash(nameA)) return 1;
            // A 是 Flash 但 B 不是 -> A 排前面
            if (isFlash(nameA) && !isFlash(nameB)) return -1;

            return 0;
        });

        if (models.length > 0) {
            const bestModel = models[0].name.replace('models/', '');
            // 在 console 顯示目前抓到的模型，確認有沒有超過 2.5
            console.log(`[系統] 自動鎖定模型：${bestModel} (策略: Max 2.5 Flash)`); 
            return `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${apiKey}`;
        }

    } catch (e) {
        console.warn("模型列表獲取失敗，使用保底方案", e);
    }

    // 終極保底：如果連不上列表，直接指定目前最穩定的 1.5 Flash
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

    // 檢查錯誤，如果是 429，拋出特定錯誤字串讓 Queue 抓到
    if (data.error) {
        if (data.error.code === 429) {
            throw new Error('429'); 
        }
        throw new Error(`API Error: ${data.error.message}`);
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
        // 清理 JSON 格式
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
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
