// api.js - 智慧萬用版

// 1. 取得 API Key (資安重點：只從 localStorage 拿)
function getApiKey() {
    return localStorage.getItem('gemini_api_key');
}

// 2. [核心功能] 自動尋找最強大的模型
async function getBestModelUrl(apiKey) {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    try {
        // 先問 Google 有哪些模型
        const response = await fetch(listUrl);
        const data = await response.json();
        
        // 篩選出所有 Gemini 且可以生成內容的模型
        let models = data.models.filter(m => 
            m.name.includes('gemini') && 
            m.supportedGenerationMethods.includes('generateContent')
        );

        // 排序邏輯：版本號越新越好 (3 > 2 > 1.5)，如果是同版本，Pro 優先於 Flash
        models.sort((a, b) => {
            // 抓版本號數字 (例如 1.5, 2.0, 3)
            const getVer = (name) => {
                const match = name.match(/(\d+(\.\d+)?)/);
                return match ? parseFloat(match[0]) : 0;
            };
            const verA = getVer(a.name);
            const verB = getVer(b.name);

            if (verA !== verB) return verB - verA; // 數字大的排前面

            // 如果版本一樣，優先選 Pro (因為妳要最強的)
            const isPro = (name) => name.toLowerCase().includes('pro');
            return isPro(b.name) - isPro(a.name);
        });

        if (models.length > 0) {
            const bestModel = models[0].name.replace('models/', '');
            console.log(`已自動切換至最強模型：${bestModel}`); // 妳可以在 Console 看到它選了誰
            return `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${apiKey}`;
        }
    } catch (e) {
        console.warn("自動偵測失敗，使用預設備案", e);
    }

    // 萬一偵測失敗的備案 (使用通用別名)
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
}

// 3. 呼叫 Gemini API
async function generateStory(prompt) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("NO_KEY"); 
    }

    // ★ 這裡改成了動態取得 URL
    const url = await getBestModelUrl(apiKey);

    const requestBody = {
        contents: [{
            parts: [{ text: prompt }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }

        const text = data.candidates[0].content.parts[0].text;
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(cleanText);
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

// 4. 呼叫回應 API (用於歷史紀錄的對話)
async function generateReply(historyContext, userMessage) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("NO_KEY");

    // ★ 這裡也改成了動態取得 URL
    const url = await getBestModelUrl(apiKey);
    
    const prompt = `
    你是一個編劇顧問。
    上一段故事背景：${JSON.stringify(historyContext)}
    
    使用者的問題或回應：${userMessage}
    
    請以繁體中文回答，針對故事內容進行討論或延伸。
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
    return data.candidates[0].content.parts[0].text;
}
