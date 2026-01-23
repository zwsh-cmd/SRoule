// api.js - 強韌版 (修復 JSON 解析與 Overloaded 重試)

// ==========================================
// Part 1: 基礎工具
// ==========================================

function getApiKey() {
    return localStorage.getItem('gemini_api_key');
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ★★★ 新增：強力 JSON 清洗工具 ★★★
// 專門對付 "Bad control character" 和 Gemini 的廢話
function cleanAndParseJSON(text) {
    try {
        // 1. 先嘗試最簡單的清理 (移除 markdown 標籤)
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // 2. 如果直接解析失敗，嘗試用「手術刀」只切出 {...} 的部分
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }

        // 3. 處理控制字元 (這是導致 Bad control character 的主因)
        // 將字串中的換行符號等轉換為 JSON 安全的格式
        cleanText = cleanText.replace(/[\x00-\x1F\x7F]/g, (char) => {
            // 保留合法的換行與縮排，其他的殺掉
            if (char === '\n' || char === '\t' || char === '\r') return char;
            return '';
        });

        return JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON 解析失敗，原始文字:", text);
        throw new Error("AI 回傳的格式有誤，無法讀取故事資料。");
    }
}

// ==========================================
// Part 2: 請求隊列管理器 (Queue & Rate Limiter)
// ==========================================
class GeminiQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.minDelay = 2000;
        this.retryDelay = 5000;
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
            const result = await currentItem.task();
            currentItem.resolve(result);
            await sleep(this.minDelay);

        } catch (error) {
            console.warn("API 請求發生狀況:", error);

            const errMsg = error.message.toLowerCase();

            // ★★★ 修正：擴大重試範圍 ★★★
            // 加入 503 (Overloaded) 和 "overloaded" 關鍵字
            const shouldRetry = 
                errMsg.includes('429') || 
                errMsg.includes('resource has been exhausted') ||
                errMsg.includes('too many requests') ||
                errMsg.includes('overloaded') || // Google 忙線中
                errMsg.includes('503');          // 服務暫時無法使用

            if (shouldRetry) {
                console.log(`[系統] Google 忙線或限流 (${errMsg})，${this.retryDelay/1000} 秒後重試...`);
                this.queue.unshift(currentItem); // 插隊重試
                await sleep(this.retryDelay);
            } else {
                currentItem.reject(error);
            }
        } finally {
            this.isProcessing = false;
            this.process();
        }
    }
}

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

            const getVer = (n) => {
                const match = n.match(/gemini-(\d+(\.\d+)?)/);
                return match ? parseFloat(match[1]) : 0;
            };
            const verA = getVer(nameA);
            const verB = getVer(nameB);

            // 天花板過濾：超過 2.5 的不要
            const effectiveVerA = verA > 2.5 ? -1 : verA;
            const effectiveVerB = verB > 2.5 ? -1 : verB;

            if (effectiveVerA !== effectiveVerB) return effectiveVerB - effectiveVerA;

            const isFlash = n => n.includes('flash');
            if (isFlash(nameB) && !isFlash(nameA)) return 1;
            if (isFlash(nameA) && !isFlash(nameB)) return -1;

            return 0;
        });

        if (models.length > 0) {
            const bestModel = models[0].name.replace('models/', '');
            return `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${apiKey}`;
        }

    } catch (e) {
        console.warn("模型列表獲取失敗，使用保底方案", e);
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
}


// ==========================================
// Part 4: 外部呼叫介面
// ==========================================

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

    if (data.error) {
        // 將 error code 也放入 message 以便 Queue 判斷
        throw new Error(`${data.error.code} - ${data.error.message}`);
    }

    return data;
}

// 功能 A: 生成故事
async function generateStory(prompt) {
    return apiQueue.add(async () => {
        const data = await _makeRequest(prompt);
        
        if (!data.candidates || !data.candidates[0]) {
            throw new Error("生成內容為空，請稍後再試");
        }

        const text = data.candidates[0].content.parts[0].text;
        
        // ★★★ 改用新寫的強力清洗函式 ★★★
        return cleanAndParseJSON(text);
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
        const data = await _makeRequest(prompt);
        return data.candidates[0].content.parts[0].text;
    });
}
