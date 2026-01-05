// api.js - 免費版專用．智慧萬用版

// 1. 取得 API Key
function getApiKey() {
    return localStorage.getItem('gemini_api_key');
}

// 2. [核心功能] 自動尋找「免費且最強」的模型
async function getBestModelUrl(apiKey) {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    try {
        const response = await fetch(listUrl);
        const data = await response.json();
        
        // 篩選出所有 Gemini 且可以生成內容的模型
        let models = data.models.filter(m => 
            m.name.includes('gemini') && 
            m.supportedGenerationMethods.includes('generateContent')
        );

        // ★★★ 關鍵修正排序邏輯 ★★★
        models.sort((a, b) => {
            // A. 先比版本號：數字越大越新 (例如 3 > 2.0 > 1.5)
            const getVer = (name) => {
                const match = name.match(/(\d+(\.\d+)?)/);
                return match ? parseFloat(match[0]) : 0;
            };
            const verA = getVer(a.name);
            const verB = getVer(b.name);

            if (verA !== verB) return verB - verA; // 版本新的排前面

            // B. 如果版本一樣，優先選 "Flash"！ (這是為了救妳的荷包)
            // Flash 通常是免費額度最慷慨的型號，Pro 往往限制很多
            const isFlash = (name) => name.toLowerCase().includes('flash');
            return isFlash(b.name) - isFlash(a.name);
        });

        if (models.length > 0) {
            const bestModel = models[0].name.replace('models/', '');
            console.log(`已自動切換至最佳免費模型：${bestModel}`); 
            return `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${apiKey}`;
        }
    } catch (e) {
        console.warn("自動偵測失敗，使用保底方案", e);
    }

    // 萬一真的連不上列表，回退到最經典穩定的 1.5 Flash
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
}

// 3. 呼叫 Gemini API
async function generateStory(prompt) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("NO_KEY"); 

    const url = await getBestModelUrl(apiKey);

    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        // 如果還是遇到錯誤 (例如 429 Too Many Requests)，顯示清楚的訊息
        if (data.error) {
            console.error("API Error Details:", data.error);
            throw new Error(`Google API 拒絕請求：${data.error.message}`);
        }

        const text = data.candidates[0].content.parts[0].text;
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(cleanText);
    } catch (error) {
        console.error("API 呼叫失敗:", error);
        throw error;
    }
}

// 4. 呼叫回應 API
async function generateReply(historyContext, userMessage) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("NO_KEY");

    const url = await getBestModelUrl(apiKey);
    
    const prompt = `
    你是一個編劇顧問。
    上一段故事背景：${JSON.stringify(historyContext)}
    使用者的問題或回應：${userMessage}
    請以繁體中文回答。
    `;

    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    return data.candidates[0].content.parts[0].text;
}
