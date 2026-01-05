// api.js - 

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
            
            const isFlash = (name) => name.toLowerCase().includes('flash');
            const flashA = isFlash(a.name);
            const flashB = isFlash(b.name);
            
            // 如果 A 是 Flash 但 B 不是，A 排前面 (return -1)
            if (flashA && !flashB) return -1;
            // 如果 B 是 Flash 但 A 不是，B 排前面 (return 1)
            if (!flashA && flashB) return 1;

            // B. 如果大家都是 (或都不是) Flash，那就比版本號：數字越大越新
            const getVer = (name) => {
                const match = name.match(/(\d+(\.\d+)?)/);
                return match ? parseFloat(match[0]) : 0;
            };
            return getVer(b.name) - getVer(a.name); // 大的排前面
        });

        if (models.length > 0) {
            const bestModel = models[0].name.replace('models/', '');
            console.log(`已自動切換至最佳免費模型：${bestModel}`); 
            return `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${apiKey}`;
        }
    } catch (e) {
        console.warn("自動偵測失敗，使用保底方案", e);
    }

    // 萬一真的連不上列表，回退到最經典穩定的 1.5 Flash (這一定是免費的)
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
            // 這裡把它轉成中文錯誤訊息，讓妳比較好讀
            throw new Error(`Google API 拒絕請求 (${data.error.code})：可能是額度不足或模型限制。`);
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
