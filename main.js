// main.js

let appData = loadData();
let currentSelection = {}; // 暫存這次抽到的選項
let generatedResult = null; // 暫存這次生成的故事

const container = document.getElementById('categories-container');

// 初始化：渲染畫面
function renderApp() {
    container.innerHTML = '';
    
    // 遍歷大分類 (A, B, C, D, E)
    for (const [category, content] of Object.entries(appData)) {
        const box = document.createElement('div');
        box.className = 'category-box';
        
        // 大分類標題 (支援長按編輯)
        const title = document.createElement('h2');
        title.textContent = category;
        addLongPressEvent(title, () => renameCategory(category, null));
        box.appendChild(title);

        // 判斷是巢狀結構 (Object) 還是純清單 (Array)
        if (Array.isArray(content)) {
            // 純清單 (如 D, E)
            renderTagList(box, category, null, content);
        } else {
            // 巢狀結構 (如 A, B, C)
            for (const [subCategory, items] of Object.entries(content)) {
                const subTitle = document.createElement('h3');
                subTitle.textContent = subCategory;
                addLongPressEvent(subTitle, () => renameCategory(category, subCategory));
                box.appendChild(subTitle);
                renderTagList(box, category, subCategory, items);
            }
        }
        container.appendChild(box);
    }
}

// 渲染標籤清單與新增按鈕
function renderTagList(parent, cat, subCat, items) {
    const div = document.createElement('div');
    div.className = 'tag-container';
    
    items.forEach((item, index) => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = item;
        span.dataset.id = `${cat}-${subCat || 'main'}-${index}`; // 用於標記
        div.appendChild(span);
    });

    // 新增按鈕 (+)
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.style.padding = '2px 8px';
    addBtn.style.fontSize = '0.8rem';
    addBtn.onclick = () => addItem(cat, subCat);
    div.appendChild(addBtn);

    parent.appendChild(div);
}

// --- 編輯功能區 ---

// 長按事件邏輯
function addLongPressEvent(element, callback) {
    let timer;
    const start = () => timer = setTimeout(callback, 800); // 800ms 視為長按
    const end = () => clearTimeout(timer);

    // 電腦版
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', end);
    element.addEventListener('mouseleave', end);
    // 手機版
    element.addEventListener('touchstart', start);
    element.addEventListener('touchend', end);
}

function renameCategory(cat, subCat) {
    const oldName = subCat || cat;
    const newName = prompt("修改標題名稱：", oldName);
    if (!newName || newName === oldName) return;

    if (subCat) {
        // 修改小分類 Key
        const items = appData[cat][subCat];
        delete appData[cat][subCat];
        appData[cat][newName] = items;
    } else {
        // 修改大分類 Key (比較複雜，先刪再加會改變順序，這裡簡單處理)
        const content = appData[cat];
        delete appData[cat];
        appData[newName] = content;
    }
    saveData(appData);
    renderApp();
}

function addItem(cat, subCat) {
    const newItem = prompt("新增選項：");
    if (!newItem) return;

    if (subCat) {
        appData[cat][subCat].push(newItem);
    } else {
        appData[cat].push(newItem);
    }
    saveData(appData);
    renderApp();
}

// --- 生成邏輯區 ---

document.getElementById('btn-generate').addEventListener('click', async () => {
    // 1. 檢查 Key
    if (!getApiKey()) {
        alert("請先點擊右上角「設定」，輸入你的 Gemini API Key！");
        return;
    }

    // 2. 隨機抽取 & Highlight
    document.querySelectorAll('.tag').forEach(t => t.classList.remove('highlight')); // 清除舊的
    currentSelection = {};
    const promptParts = [];

    for (const [cat, content] of Object.entries(appData)) {
        if (Array.isArray(content)) {
            const item = content[Math.floor(Math.random() * content.length)];
            currentSelection[cat] = item;
            highlightTag(cat, null, item);
            promptParts.push(`${cat}: ${item}`);
        } else {
            for (const [subCat, items] of Object.entries(content)) {
                const item = items[Math.floor(Math.random() * items.length)];
                currentSelection[`${cat} - ${subCat}`] = item;
                highlightTag(cat, subCat, item);
                promptParts.push(`${subCat}: ${item}`);
            }
        }
    }

    // 3. 呼叫 API
    const resultArea = document.getElementById('result-area');
    const loading = document.getElementById('loading');
    const storyContent = document.getElementById('story-content');
    
    resultArea.style.display = 'block';
    loading.style.display = 'block';
    storyContent.innerHTML = '';
    
    // 捲動到結果區
    resultArea.scrollIntoView({ behavior: 'smooth' });

    const prompt = `
    你是一個專業編劇。請使用以下設定寫一個故事大綱：
    ${promptParts.join('\n')}

    請嚴格遵守 JSON 格式回傳，不要有 markdown 符號，格式如下：
    {
        "story_outline": "800字左右的故事大綱...",
        "analysis": "針對此設定的優缺點分析..."
    }
    `;

    try {
        const data = await generateStory(prompt);
        generatedResult = data;
        
        loading.style.display = 'none';
        storyContent.innerHTML = `
            <h3>📖 故事大綱</h3>
            <p>${data.story_outline.replace(/\n/g, '<br>')}</p>
            <hr>
            <h3>📊 優缺點分析</h3>
            <p>${data.analysis.replace(/\n/g, '<br>')}</p>
        `;
    } catch (e) {
        loading.style.display = 'none';
        storyContent.innerHTML = `<p style="color:red">發生錯誤：${e.message}</p>`;
    }
});

function highlightTag(cat, subCat, text) {
    // 這裡用簡單的文本比對來找 DOM，因為沒有複雜 ID
    const tags = document.querySelectorAll('.tag');
    for (let tag of tags) {
        if (tag.textContent === text) {
            tag.classList.add('highlight');
        }
    }
}

// --- 儲存功能 ---
document.getElementById('btn-save').addEventListener('click', () => {
    if (!generatedResult) return;
    const title = prompt("請為這個故事取個名字：", "未命名故事");
    if (!title) return;

    const savedStories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
    const newStory = {
        id: Date.now(),
        title: title,
        timestamp: new Date().toLocaleString(),
        options: currentSelection,
        content: generatedResult.story_outline,
        analysis: generatedResult.analysis
    };
    
    savedStories.unshift(newStory); // 加在最前面
    localStorage.setItem('saved_stories', JSON.stringify(savedStories));
    alert("儲存成功！");
});

// --- UI 切換邏輯 (設定 Modal, 歷史紀錄) ---
const modal = document.getElementById('settings-modal');
document.getElementById('btn-settings').onclick = () => modal.style.display = 'flex';
document.getElementById('btn-close-settings').onclick = () => modal.style.display = 'none';

document.getElementById('btn-save-key').onclick = () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        alert("Key 已儲存！");
        modal.style.display = 'none';
    }
};

// 歷史紀錄視窗切換
const mainView = document.getElementById('main-view');
const historyView = document.getElementById('history-view');
const historyList = document.getElementById('history-list');

document.getElementById('btn-history').onclick = () => {
    mainView.style.display = 'none';
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('btn-generate').style.display = 'none';
    historyView.style.display = 'block';
    renderHistory();
};

document.getElementById('btn-back-home').onclick = () => {
    historyView.style.display = 'none';
    mainView.style.display = 'block';
    document.getElementById('btn-generate').style.display = 'flex';
};

function renderHistory() {
    const stories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
    historyList.innerHTML = '';
    
    stories.forEach(story => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div style="font-weight:bold; font-size:1.1rem;">${story.title}</div>
            <div style="font-size:0.8rem; color:#888;">${story.timestamp}</div>
            <div class="history-detail" id="detail-${story.id}">
                <p><strong>設定：</strong>${Object.values(story.options).join(', ')}</p>
                <p><strong>大綱：</strong><br>${story.content.replace(/\n/g, '<br>')}</p>
                <p><strong>分析：</strong><br>${story.analysis.replace(/\n/g, '<br>')}</p>
                
                <hr>
                <div class="reply-section">
                    <input type="text" placeholder="對這個故事有什麼想法？" id="input-${story.id}" style="width:70%">
                    <button onclick="replyStory(${story.id})" class="secondary">詢問 AI</button>
                    <div id="reply-area-${story.id}" style="margin-top:10px; background:#f9f9f9; padding:10px;"></div>
                </div>
            </div>
        `;
        
        // 點擊展開
        item.onclick = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
            const detail = document.getElementById(`detail-${story.id}`);
            detail.style.display = detail.style.display === 'block' ? 'none' : 'block';
        };
        
        historyList.appendChild(item);
    });
}

// 全域函數供 HTML onclick 呼叫
window.replyStory = async (id) => {
    const stories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
    const story = stories.find(s => s.id === id);
    const input = document.getElementById(`input-${id}`);
    const replyArea = document.getElementById(`reply-area-${id}`);
    
    if (!input.value) return;
    
    replyArea.innerHTML = "AI 思考中...";
    try {
        const reply = await generateReply(story, input.value);
        replyArea.innerHTML = `<strong>AI 回應：</strong><br>${reply.replace(/\n/g, '<br>')}`;
    } catch (e) {
        replyArea.textContent = "錯誤：" + e.message;
    }
};

// 啟動
renderApp();
