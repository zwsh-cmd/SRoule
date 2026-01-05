// main.js - 下拉選單版

let appData = loadData();
let currentSelection = {};
let generatedResult = null;

const container = document.getElementById('categories-container');

// 1. 小工具：清理標題 (移除 A, B, a, b 符號)
function cleanTitle(text) {
    // 邏輯：移除 "A (", "a. ", ")" 這些符號
    // 如果是 "A (主角)" -> "主角"
    // 如果是 "a. 性別" -> "性別"
    return text.replace(/^[A-Za-z]+\s*[\(\.]|\)$/g, '').trim();
}

// 2. 初始化：渲染畫面
function renderApp() {
    container.innerHTML = '';
    
    // 遍歷大分類
    for (const [category, content] of Object.entries(appData)) {
        const box = document.createElement('div');
        box.className = 'category-box';
        
        // 大分類標題 (帶橫條底色)
        const header = document.createElement('div');
        header.className = 'category-header';
        header.textContent = cleanTitle(category); // 只顯示乾淨的標題
        addLongPressEvent(header, () => renameCategory(category, null));
        box.appendChild(header);

        // 判斷內容結構
        if (Array.isArray(content)) {
            // 純清單 (如 D, E)
            renderDropdownRow(box, category, null, content);
        } else {
            // 巢狀結構 (如 A, B, C)
            for (const [subCategory, items] of Object.entries(content)) {
                renderDropdownRow(box, category, subCategory, items);
            }
        }
        container.appendChild(box);
    }
}

// 3. 渲染下拉選單列
function renderDropdownRow(parent, cat, subCat, items) {
    const row = document.createElement('div');
    row.className = 'sub-category-row';

    // 如果有小分類標題 (如 "性別")
    if (subCat) {
        const label = document.createElement('div');
        label.className = 'sub-title';
        label.textContent = cleanTitle(subCat);
        addLongPressEvent(label, () => renameCategory(cat, subCat));
        row.appendChild(label);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'select-wrapper';

    // 建立 Select 下拉選單
    const select = document.createElement('select');
    select.id = `select-${cat}-${subCat || 'main'}`; // 給它一個 ID 方便抓取
    
    // 加入一個預設選項 (或是隨機挑選前的提示)
    const defaultOpt = document.createElement('option');
    defaultOpt.text = "--- 請點擊隨機生成 ---";
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        option.text = item;
        select.appendChild(option);
    });

    // 新增內容按鈕 (+)
    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn';
    addBtn.textContent = '+';
    addBtn.title = '新增選項';
    addBtn.onclick = () => addItem(cat, subCat);

    wrapper.appendChild(select);
    wrapper.appendChild(addBtn);
    row.appendChild(wrapper);
    parent.appendChild(row);
}

// --- 編輯功能區 (維持不變) ---
function addLongPressEvent(element, callback) {
    let timer;
    const start = () => timer = setTimeout(callback, 800);
    const end = () => clearTimeout(timer);
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', end);
    element.addEventListener('mouseleave', end);
    element.addEventListener('touchstart', start);
    element.addEventListener('touchend', end);
}

function renameCategory(cat, subCat) {
    const oldKey = subCat || cat;
    // 提示時顯示原始 Key 讓使用者知道在改哪裡，或者只顯示乾淨的
    const newName = prompt("修改標題 (請保留格式以便辨識，或直接輸入新名稱)：", oldKey);
    if (!newName || newName === oldKey) return;

    if (subCat) {
        const items = appData[cat][subCat];
        delete appData[cat][subCat];
        appData[cat][newName] = items;
    } else {
        const content = appData[cat];
        delete appData[cat];
        appData[newName] = content;
    }
    saveData(appData);
    renderApp();
}

function addItem(cat, subCat) {
    const newItem = prompt("新增選項內容：");
    if (!newItem) return;
    if (subCat) appData[cat][subCat].push(newItem);
    else appData[cat].push(newItem);
    saveData(appData);
    renderApp();
}

// --- 生成邏輯區 (重大更新：操作 Select) ---
document.getElementById('btn-generate').addEventListener('click', async () => {
    if (!getApiKey()) {
        alert("請先點擊右上角「設定」，輸入你的 Gemini API Key！");
        return;
    }

    currentSelection = {};
    const promptParts = [];

    // 遍歷資料，進行隨機抽取並更新 UI
    for (const [cat, content] of Object.entries(appData)) {
        if (Array.isArray(content)) {
            // 單層結構 (如 D, E)
            const item = content[Math.floor(Math.random() * content.length)];
            currentSelection[cleanTitle(cat)] = item;
            promptParts.push(`${cleanTitle(cat)}: ${item}`);
            
            // 更新 UI: 找到對應的 Select 並選中該項目
            const select = document.getElementById(`select-${cat}-main`);
            if (select) select.value = item;

        } else {
            // 巢狀結構 (如 A, B, C)
            for (const [subCat, items] of Object.entries(content)) {
                const item = items[Math.floor(Math.random() * items.length)];
                currentSelection[`${cleanTitle(subCat)}`] = item;
                promptParts.push(`${cleanTitle(subCat)}: ${item}`);
                
                // 更新 UI
                const select = document.getElementById(`select-${cat}-${subCat}`);
                if (select) select.value = item;
            }
        }
    }

    // 呼叫 API
    const resultArea = document.getElementById('result-area');
    const loading = document.getElementById('loading');
    const storyContent = document.getElementById('story-content');
    
    resultArea.style.display = 'block';
    loading.style.display = 'block';
    storyContent.innerHTML = '';
    resultArea.scrollIntoView({ behavior: 'smooth' });

    const prompt = `
    你是一個專業編劇。請使用以下隨機抽取的設定寫一個故事大綱：
    ${promptParts.join('\n')}

    請嚴格遵守 JSON 格式回傳：
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

// --- 儲存與其他功能 (維持不變) ---
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
    savedStories.unshift(newStory);
    localStorage.setItem('saved_stories', JSON.stringify(savedStories));
    alert("儲存成功！");
});

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
            <div style="font-weight:bold; font-size:1.1rem; color:#5e6b75;">${story.title}</div>
            <div style="font-size:0.8rem; color:#999; margin-bottom:8px;">${story.timestamp}</div>
            <div class="history-detail" id="detail-${story.id}" style="display:none; border-top:1px solid #eee; padding-top:10px; margin-top:10px;">
                <p><strong>設定：</strong><br>${Object.entries(story.options).map(([k,v]) => `${k}: ${v}`).join(' / ')}</p>
                <p><strong>大綱：</strong><br>${story.content.replace(/\n/g, '<br>')}</p>
                <button onclick="replyStory(${story.id})" class="secondary" style="margin-top:10px;">延伸對話</button>
            </div>
        `;
        item.onclick = (e) => {
            if(e.target.tagName==='BUTTON' || e.target.tagName==='INPUT') return;
            const detail = item.querySelector('.history-detail');
            detail.style.display = detail.style.display === 'block' ? 'none' : 'block';
        };
        historyList.appendChild(item);
    });
}

renderApp();
