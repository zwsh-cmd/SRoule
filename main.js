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

// 3. 渲染下拉選單列 (Select + 新增按鈕)
function renderDropdownRow(parent, cat, subCat, items) {
    const row = document.createElement('div');
    row.className = 'sub-category-row';

    if (subCat) {
        const label = document.createElement('div');
        label.className = 'sub-title';
        label.textContent = cleanTitle(subCat);
        addLongPressEvent(label, () => renameCategory(cat, subCat));
        row.appendChild(label);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'select-wrapper';

    // 建立 Select (下拉選單)
    const select = document.createElement('select');
    select.id = `select-${cat}-${subCat || 'main'}`;
    
    // 加入預設選項 (隨機)
    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.text = "-- 隨機 / 讓 AI 決定 --";
    select.appendChild(defaultOpt);

    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        option.text = item;
        select.appendChild(option);
    });
    
    // 綁定長按事件到 Select 上，用於刪除選項
    // 注意：部分手機瀏覽器對 Select 的事件支援有限，但我們盡量支援
    select.addEventListener('change', (e) => {
        // 使用者選取後，如果不喜歡可以長按刪除，或是這裡只做選取
    });
    addLongPressEvent(select, () => showDeleteMenu(cat, subCat, select.value));

    // 新增按鈕 (+)
    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn';
    addBtn.textContent = '+'; 
    addBtn.title = '新增選項';
    addBtn.style.marginLeft = '5px';
    addBtn.style.fontSize = '1.2rem';
    addBtn.onclick = () => addItemViaPrompt(cat, subCat);

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

// 功能：透過跳出視窗新增選項
function addItemViaPrompt(cat, subCat) {
    const val = prompt("請輸入新選項內容：");
    if (!val || !val.trim()) return;

    const cleanVal = val.trim();
    const arr = subCat ? appData[cat][subCat] : appData[cat];

    if (arr.includes(cleanVal)) {
        alert("這個選項已經存在囉！");
        return;
    }

    if (subCat) appData[cat][subCat].push(cleanVal);
    else appData[cat].push(cleanVal);
    
    saveData(appData);
    renderApp();
    
    // 自動選中剛剛新增的項目
    setTimeout(() => {
        const selectId = `select-${cat}-${subCat || 'main'}`;
        const select = document.getElementById(selectId);
        if (select) select.value = cleanVal;
    }, 50);
}

// 功能：長按輸入框觸發刪除選單
function showDeleteMenu(cat, subCat, currentValue) {
    const arr = subCat ? appData[cat][subCat] : appData[cat];
    
    // 如果輸入框有值，優先詢問是否刪除該值
    let defaultText = currentValue && arr.includes(currentValue) ? currentValue : "";
    
    const target = prompt(`【刪除模式】\n請輸入要刪除的選項完整名稱：\n(目前清單：${arr.join(', ')})`, defaultText);
    
    if (!target) return;

    const idx = arr.indexOf(target);
    if (idx > -1) {
        if (confirm(`確定要刪除「${target}」嗎？`)) {
            arr.splice(idx, 1);
            saveData(appData);
            renderApp();
        }
    } else {
        alert("找不到該選項，請確認文字完全一致。");
    }
}

// --- 生成邏輯區 (讀取 Select 選擇) ---
document.getElementById('btn-generate').addEventListener('click', async () => {
    if (!getApiKey()) {
        alert("請先點擊右上角「設定」，輸入你的 Gemini API Key！");
        return;
    }

    currentSelection = {};
    const promptParts = [];

    // 遍歷資料
    for (const [cat, content] of Object.entries(appData)) {
        if (Array.isArray(content)) {
            // 單層結構
            const selectId = `select-${cat}-main`;
            const select = document.getElementById(selectId);
            let val = select.value;

            // 邏輯：如果使用者選的是空值 (隨機)，則隨機抽取
            if (!val) {
                val = content[Math.floor(Math.random() * content.length)];
                // 這裡不自動填回 Select，保持 "-- 隨機 --" 的狀態，或者你可以選擇填回
                // select.value = val; 
            }
            
            currentSelection[cleanTitle(cat)] = val;
            promptParts.push(`${cleanTitle(cat)}: ${val}`);

        } else {
            // 巢狀結構
            for (const [subCat, items] of Object.entries(content)) {
                const selectId = `select-${cat}-${subCat}`;
                const select = document.getElementById(selectId);
                let val = select.value;

                if (!val) {
                    val = items[Math.floor(Math.random() * items.length)];
                }

                currentSelection[`${cleanTitle(subCat)}`] = val;
                promptParts.push(`${cleanTitle(subCat)}: ${val}`);
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
    你是一個專業編劇。請使用以下設定寫一個故事大綱：
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
