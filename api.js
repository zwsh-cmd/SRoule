// api.js

// 1. 取得 API Key (資安重點：只從 localStorage 拿)
function getApiKey() {
    return localStorage.getItem('gemini_api_key');
}

// 2. 呼叫 Gemini API
async function generateStory(prompt) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("NO_KEY"); // 拋出錯誤讓 main.js 處理
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
        
        // 錯誤處理
        if (data.error) {
            throw new Error(data.error.message);
        }

        // 解析回傳文字
        const text = data.candidates[0].content.parts[0].text;
        
        // 清理 JSON (有時候 AI 會包在 ```json ... ``` 裡面)
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(cleanText); // 回傳 JSON 物件
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

// 3. 呼叫回應 API (用於歷史紀錄的對話)
async function generateReply(historyContext, userMessage) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("NO_KEY");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
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
