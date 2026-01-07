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
    // [新增] 注入自定義樣式，嘗試覆蓋下拉選單的原生藍色 (註：依瀏覽器支援度而定)
    if (!document.getElementById('custom-dropdown-style')) {
        const style = document.createElement('style');
        style.id = 'custom-dropdown-style';
        style.textContent = `
            /* 嘗試修改 Option 的選取與懸停顏色 (主要針對 Firefox 或支援的 Webview) */
            select option:checked,
            select option:hover {
                background-color: #8fa3ad !important; /* 莫蘭迪藍灰 */
                color: white !important;
                box-shadow: 0 0 10px 100px #8fa3ad inset; /* 強制覆蓋背景 */
            }
        `;
        document.head.appendChild(style);
    }

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

    // --- 新增：補充條件區塊 ---
    const extraBox = document.createElement('div');
    extraBox.className = 'category-box';
    
    const header = document.createElement('div');
    header.className = 'category-header';
    header.textContent = '補充條件';
    extraBox.appendChild(header);

    const row = document.createElement('div');
    row.className = 'sub-category-row';

    const textarea = document.createElement('textarea');
    textarea.id = 'extra-input';
    textarea.placeholder = '請輸入其他補充條件 (500字以內)...';
    textarea.maxLength = 500;
    textarea.style.width = '100%';
    textarea.style.height = '100px';
    textarea.style.padding = '10px';
    textarea.style.borderRadius = '8px';
    textarea.style.border = '1px solid var(--border-color)';
    textarea.style.boxSizing = 'border-box';
    textarea.style.fontFamily = 'inherit';
    textarea.style.resize = 'vertical';

    row.appendChild(textarea);
    extraBox.appendChild(row);
    container.appendChild(extraBox);
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
    defaultOpt.text = "隨機選取 / 下拉選擇 / 新增選項";
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

// --- 編輯與互動功能區 (原生 App 風格) ---

// 1. 通用異步視窗 (Promise-based Modal)
function openUniversalModal({ title, desc, defaultValue, showDelete }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('universal-modal');
        const titleEl = document.getElementById('u-modal-title');
        const descEl = document.getElementById('u-modal-desc');
        const inputEl = document.getElementById('u-modal-input');
        const btnConfirm = document.getElementById('u-btn-confirm');
        const btnCancel = document.getElementById('u-btn-cancel');
        const btnDelete = document.getElementById('u-btn-delete');

        // 設定內容
        titleEl.textContent = title;
        descEl.textContent = desc || '';
        inputEl.value = defaultValue || '';
        
        // 設定按鈕狀態
        btnDelete.style.display = showDelete ? 'block' : 'none';
        btnConfirm.textContent = showDelete ? '修改' : '確定'; // 如果有刪除鍵，確認鍵通常代表"修改"

        modal.style.display = 'flex';
        inputEl.focus();

        // 事件處理 (使用一次性監聽器以免重複綁定)
        const close = () => { modal.style.display = 'none'; };
        
        // 為了避免重複綁定，我們先 clone 節點或是重設 onclick
        btnConfirm.onclick = () => {
            close();
            resolve({ action: 'confirm', value: inputEl.value.trim() });
        };
        
        btnCancel.onclick = () => {
            close();
            resolve({ action: 'cancel' });
        };

        btnDelete.onclick = () => {
            if(confirm('確定要刪除這個項目嗎？')) { // 這裡可以用原生 confirm 或再做一層，暫用原生比較快
                close();
                resolve({ action: 'delete' });
            }
        };
    });
}

// 2. 長按事件綁定
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

// 3. 修改分類標題 (長按標題)
async function renameCategory(cat, subCat) {
    const oldKey = subCat || cat;
    const cleanName = cleanTitle(oldKey); 
    
    const result = await openUniversalModal({
        title: '編輯標題',
        desc: '請修改標題名稱，或點擊左下角刪除此分類',
        defaultValue: cleanName,
        showDelete: true // 開啟刪除按鈕
    });

    if (result.action === 'delete') {
        // 刪除邏輯
        if (subCat) {
            delete appData[cat][subCat];
        } else {
            delete appData[cat];
        }
        saveData(appData);
        renderApp();
    }
    else if (result.action === 'confirm' && result.value) {
        // 修改邏輯
        const newName = result.value;
        if (newName === cleanName) return;

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
}

// 4. 新增選項 (點擊 +)
async function addItemViaPrompt(cat, subCat) {
    const result = await openUniversalModal({
        title: '新增選項',
        desc: '',
        defaultValue: '',
        showDelete: false
    });

    if (result.action === 'confirm' && result.value) {
        const cleanVal = result.value;
        const arr = subCat ? appData[cat][subCat] : appData[cat];

        if (arr.includes(cleanVal)) {
            alert("這個選項已經存在囉！");
            return;
        }

        if (subCat) appData[cat][subCat].push(cleanVal);
        else appData[cat].push(cleanVal);
        
        saveData(appData);
        renderApp();
        
        // 自動選中
        setTimeout(() => {
            const selectId = `select-${cat}-${subCat || 'main'}`;
            const select = document.getElementById(selectId);
            if (select) select.value = cleanVal;
        }, 50);
    }
}

// 5. 編輯或刪除選項 (長按選單)
async function showDeleteMenu(cat, subCat, currentValue) {
    if (!currentValue) return;

    const arr = subCat ? appData[cat][subCat] : appData[cat];
    const idx = arr.indexOf(currentValue);

    if (idx === -1) return; // 找不到該值

    const result = await openUniversalModal({
        title: '編輯選項',
        desc: '您可以修改內容，或點擊左下角刪除',
        defaultValue: currentValue,
        showDelete: true // 顯示刪除按鈕
    });

    if (result.action === 'delete') {
        arr.splice(idx, 1);
        saveData(appData);
        renderApp();
    } 
    else if (result.action === 'confirm' && result.value) {
        // 修改內容 (原地替換)
        arr[idx] = result.value;
        saveData(appData);
        renderApp();
        
        // 重新選中修改後的內容
        setTimeout(() => {
            const selectId = `select-${cat}-${subCat || 'main'}`;
            const select = document.getElementById(selectId);
            if (select) select.value = result.value;
        }, 50);
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
    const displayList = []; // 用於顯示在畫面上

    // 遍歷資料
    for (const [cat, content] of Object.entries(appData)) {
        if (Array.isArray(content)) {
            // 單層結構
            const selectId = `select-${cat}-main`;
            const select = document.getElementById(selectId);
            let val = select.value;

            if (!val) {
                val = content[Math.floor(Math.random() * content.length)];
            }
            
            const title = cleanTitle(cat);
            currentSelection[title] = val;
            promptParts.push(`${title}: ${val}`);
            displayList.push(`<b>${title}</b>：${val}`);

        } else {
            // 巢狀結構
            for (const [subCat, items] of Object.entries(content)) {
                const selectId = `select-${cat}-${subCat}`;
                const select = document.getElementById(selectId);
                let val = select.value;

                if (!val) {
                    val = items[Math.floor(Math.random() * items.length)];
                }

                const title = cleanTitle(subCat);
                currentSelection[title] = val;
                promptParts.push(`${title}: ${val}`);
                displayList.push(`<b>${title}</b>：${val}`);
            }
        }
    }

    // 加入補充條件到 Prompt 與顯示列表
    const extraVal = document.getElementById('extra-input').value.trim();
    if (extraVal) {
        promptParts.push(`補充條件: ${extraVal}`);
        displayList.push(`<b>補充條件</b>：${extraVal}`);
    }

    // 呼叫 API
    const resultArea = document.getElementById('result-area');
    const loading = document.getElementById('loading');
    const storyContent = document.getElementById('story-content');
    
    resultArea.style.display = 'block';
    loading.style.display = 'block';
    storyContent.innerHTML = '';
    resultArea.scrollIntoView({ behavior: 'smooth' });

    // 新的詳細 Prompt (修正：完整清單 + 隱藏三幕劇標題)
    const prompt = `
    你是一位崇尚 Robert McKee 《故事》美學的好萊塢高階劇本醫生 (Script Doctor)。
    你擅長處理深刻的「人性兩難」與「情境反諷 (Situational Irony)」。

    請根據以下【隨機故事元素】，構思一個具有深度與哲學辯證的故事企劃：
    【抽選元素清單】：
    ${promptParts.join('\n')}

    請嚴格依照以下 JSON 格式回傳內容（內容字串內不要使用 Markdown 語法，僅純文字換行）：
    {
        "settings_list": "請完整列出上方【抽選元素清單】的所有項目（包含補充條件），嚴禁省略任何一個標題或選項。格式保持「標題：選項」，每一項換行。",
        
        "story_circle": "運用 Dan Harmon 故事圈 (Story Circle) 的 8 個步驟規劃。重點要求：\\n1. 在「步驟 3 (Go)」主角必須進入一個挑戰他原本價值觀的陌生世界。\\n2. 在「步驟 6 (Pay)」必須付出慘痛的代價，這個代價通常是「為了獲得目標，被迫犧牲原本堅持的道德或信念」。\\n3. 確保 8 個步驟邏輯緊密，每一步驟換行顯示。",
        
        "story_outline": "請撰寫約 500 字的深度故事大綱。請內化三幕劇結構（鋪陳、衝突、結局）來撰寫，但「不要」在文中出現「第一幕」、「第二幕」或「鋪陳」、「高潮」等標題，請直接寫成一篇連貫流暢的文章。內容須包含：\\n1. 【伏筆與呼應】：開頭出現的微小元素，必須在結局成為關鍵轉折。\\n2. 【價值觀反諷 (Irony of Character)】：請設計一個極致的兩難困境。例如：「為了和平必須殺戮」、「為了誠實必須說謊」。讓主角被迫採取與其身份/信念背道而馳的行動，才能解決危機。",
        
        "analysis": "請進行深度的劇本診斷：\\n1. 【主控思想 (Controlling Idea)】：用一句話定義故事的辯證（格式：A 戰勝了 B，因為 C。例如：正義戰勝了邪惡，因為英雄犧牲了純真）。\\n2. 【反諷張力】：具體指出這個故事中，哪一個橋段展現了「主角被迫背叛自己信念」的悲劇性或諷刺性。\\n3. 【盲點建議】：目前的衝突是否夠殘酷？主角的選擇是否夠艱難？"
    }
    `;

    try {
        const data = await generateStory(prompt);
        // 將畫面上生成的 displayList 也轉成換行的 HTML，若 AI 回傳空則使用它
        const fallbackList = displayList.join('<br>');

        generatedResult = {
            settings_list: data.settings_list || fallbackList,
            story_circle: data.story_circle,
            story_outline: data.story_outline, 
            analysis: data.analysis
        };
        
        loading.style.display = 'none';
        
        // 渲染四個區塊 (使用 replace 確保換行顯示)
        storyContent.innerHTML = `
            <div style="background:#f0f2f5; padding:15px; border-radius:8px; margin-bottom:15px; font-size:0.95rem; line-height:1.6;">
                <h4 style="margin-top:0;">📋 抽選清單</h4>
                <div>${(generatedResult.settings_list).replace(/\n/g, '<br>')}</div>
            </div>

            <h3>⭕ 故事圈設定</h3>
            <p>${(data.story_circle || '').replace(/\n/g, '<br>')}</p>
            <hr>

            <h3>📖 劇情大綱</h3>
            <p>${(data.story_outline || '').replace(/\n/g, '<br>')}</p>
            <hr>

            <h3>📊 優劣分析與建議</h3>
            <p>${(data.analysis || '').replace(/\n/g, '<br>')}</p>
        `;
    } catch (e) {
        loading.style.display = 'none';
        storyContent.innerHTML = `<p style="color:red">發生錯誤：${e.message}</p>`;
    }
});

// --- 儲存與其他功能 ---
document.getElementById('btn-save').addEventListener('click', () => {
    if (!generatedResult) return;
    const title = prompt("請為這個故事取個名字：", "未命名故事");
    if (!title) return;

    const savedStories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
    // 儲存所有四個區塊
    const newStory = {
        id: Date.now(),
        title: title,
        timestamp: new Date().toLocaleString(),
        settings_list: generatedResult.settings_list,
        story_circle: generatedResult.story_circle,
        story_outline: generatedResult.story_outline,
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

// --- 路由與導航控制 (解決手機返回鍵關閉 App 問題) ---

// 定義共用的「回到首頁」函式
function goHome() {
    // 1. 切換視圖
    historyView.style.display = 'none';
    mainView.style.display = 'block';
    
    // 2. 恢復元件
    document.getElementById('btn-generate').style.display = 'flex';
    if (generatedResult) {
        document.getElementById('result-area').style.display = 'block';
    }

    // 3. 重置歷史清單狀態
    document.querySelectorAll('.history-item').forEach(item => item.style.display = 'block');
    document.querySelectorAll('.history-detail').forEach(d => d.style.display = 'none');
    
    // 4. 重置按鈕
    const btnBack = document.getElementById('btn-back-home');
    if(btnBack) btnBack.textContent = '返回首頁';
    window.scrollTo({top: 0, behavior: 'smooth'});
}

// 監聽手機實體返回鍵 (Popstate)
window.addEventListener('popstate', (event) => {
    // 1. 如果回到首頁 (無 hash 或僅有 #)
    if (!location.hash || location.hash === '#') {
        goHome();
    } 
    // 2. 如果回到歷史列表 (#history) - 可能是從詳細頁回來的
    else if (location.hash === '#history') {
        // 確保顯示歷史頁面容器
        mainView.style.display = 'none';
        historyView.style.display = 'block';
        
        // 重置清單顯示狀態 (收合詳情，顯示列表)
        document.querySelectorAll('.history-item').forEach(item => item.style.display = 'block');
        document.querySelectorAll('.history-detail').forEach(d => d.style.display = 'none');
        
        // 重置按鈕文字
        const btnBack = document.getElementById('btn-back-home');
        if(btnBack) btnBack.textContent = '返回首頁';
    }
});

// 設定「歷史紀錄」按鈕：點擊時加入歷史堆疊 (pushState)
document.getElementById('btn-history').onclick = () => {
    // 加入 #history，讓手機返回鍵能運作而不關閉 App
    history.pushState({ page: 'history' }, 'History', '#history');

    mainView.style.display = 'none';
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('btn-generate').style.display = 'none';
    historyView.style.display = 'block';
    renderHistory();
};

// 設定 App 內「返回」按鈕：明確定義三層邏輯
const btnBackHome = document.getElementById('btn-back-home');
if (btnBackHome) {
    btnBackHome.onclick = () => {
        // 情境 1: 在詳細頁 (#detail) -> 按返回 -> 回到列表 (#history)
        if (location.hash === '#detail') {
            history.back();
        }
        // 情境 2: 在列表頁 (#history) -> 按返回 -> 回到首頁 (無 hash)
        else if (location.hash === '#history') {
            history.back();
        } 
        // 情境 3: 其他狀況 (如無 hash 但介面卡住) -> 強制回首頁
        else {
            goHome();
        }
    };
}

function renderHistory() {
    const stories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
    historyList.innerHTML = '';
    
    // 進入歷史紀錄時，預設顯示「返回首頁」
    const btnBack = document.getElementById('btn-back-home');
    if(btnBack) btnBack.textContent = '返回首頁';

    stories.forEach(story => {
        const item = document.createElement('div');
        item.className = 'history-item';
        
        const listContent = story.settings_list || '舊資料無詳細清單';
        const circleContent = story.story_circle || '舊資料無故事圈';
        const outlineContent = story.story_outline || story.content || ''; 
        const analysisContent = story.analysis || '無分析資料';

        item.innerHTML = `
            <div class="history-header-area" style="cursor:pointer;">
                <div style="font-weight:bold; font-size:1.1rem; color:#5e6b75;">${story.title}</div>
                <div style="font-size:0.8rem; color:#999; margin-bottom:8px;">${story.timestamp}</div>
            </div>
            <div class="history-detail" style="display:none; border-top:1px solid #eee; padding-top:10px; margin-top:10px; font-size:0.95rem; line-height:1.5;">
                <div style="background:#f9f9f9; padding:10px; border-radius:5px; margin-bottom:10px;">
                    <strong>📋 設定清單：</strong><br>
                    ${listContent.replace(/\n/g, '<br>')}
                </div>
                <p><strong>⭕ 故事圈：</strong><br>${circleContent.replace(/\n/g, '<br>')}</p>
                <hr style="border:0; border-top:1px dashed #ddd;">
                <p><strong>📖 大綱：</strong><br>${outlineContent.replace(/\n/g, '<br>')}</p>
                <hr style="border:0; border-top:1px dashed #ddd;">
                <p><strong>📊 分析：</strong><br>${analysisContent.replace(/\n/g, '<br>')}</p>
                
                <button class="copy-btn" style="width:100%; margin:20px 0; background:#8fa3ad; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-size:1rem;">
                    📋 複製全部內容
                </button>

                <div style="text-align:center; color:#888; font-size:0.8rem;">(已到底部)</div>
            </div>
        `;
        
        const headerArea = item.querySelector('.history-header-area');
        const detail = item.querySelector('.history-detail');
        const copyBtn = item.querySelector('.copy-btn');

        // [新增] 避免長按觸發點擊的旗標
        let isLongPress = false;

        // [修改] 綁定長按事件：支援重新命名與刪除
        addLongPressEvent(headerArea, async () => {
            isLongPress = true;
            
            // 跳出選項視窗
            const result = await openUniversalModal({
                title: '編輯標題',
                desc: '請修改標題名稱，或點擊左下角刪除此紀錄',
                defaultValue: story.title,
                showDelete: true
            });

            if (result.action === 'delete') {
                // 執行刪除
                const currentStories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
                const newStories = currentStories.filter(s => s.id !== story.id);
                localStorage.setItem('saved_stories', JSON.stringify(newStories));
                renderHistory(); // 重新渲染列表
            }
            else if (result.action === 'confirm' && result.value) {
                // 執行重新命名
                const newTitle = result.value.trim();
                if (newTitle && newTitle !== story.title) {
                    const currentStories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
                    // 找到該筆資料並更新
                    const targetIndex = currentStories.findIndex(s => s.id === story.id);
                    if (targetIndex !== -1) {
                        currentStories[targetIndex].title = newTitle;
                        localStorage.setItem('saved_stories', JSON.stringify(currentStories));
                        renderHistory();
                    }
                }
            }

            // 重置旗標 (延遲一點以避開 click 事件)
            setTimeout(() => { isLongPress = false; }, 300);
        });

        // 綁定複製按鈕事件
        copyBtn.onclick = (e) => {
            e.stopPropagation(); // 避免觸發收合或其他事件
            
            // 組合純文字內容
            const fullText = 
`標題：${story.title}
時間：${story.timestamp}

【設定清單】
${listContent}

【故事圈】
${circleContent}

【大綱】
${outlineContent}

【分析】
${analysisContent}`;

            // 執行複製
            navigator.clipboard.writeText(fullText).then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✅ 已複製！';
                copyBtn.style.backgroundColor = '#4CAF50'; // 轉為綠色提示
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.style.backgroundColor = '#8fa3ad'; // 恢復原色
                }, 2000);
            }).catch(err => {
                alert('複製失敗，請手動複製。');
                console.error(err);
            });
        };

        headerArea.onclick = () => {
            // [修改] 如果是長按操作，則忽略這次點擊
            if (isLongPress) return;

            // [層級 2 -> 3] 進入詳細內容模式
            
            // 新增：加入 #detail 歷史狀態，讓返回鍵能跳回清單 (#history)
            history.pushState({ page: 'detail' }, 'Detail', '#detail');

            // 1. 隱藏「所有」歷史項目卡片 (讓畫面變乾淨)
            document.querySelectorAll('.history-item').forEach(el => el.style.display = 'none');
            
            // 2. 只顯示「自己」這個項目，並展開內容
            item.style.display = 'block';
            detail.style.display = 'block';
            
            // 3. 更新按鈕為「返回清單」
            if(btnBack) btnBack.textContent = '返回清單';
            
            // 4. 滾動到最上方方便閱讀
            window.scrollTo({top: 0, behavior: 'smooth'});
        };
        
        historyList.appendChild(item);
    });
}

renderApp();
