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

    // 新的詳細 Prompt (要求 AI 幫忙排版)
    const prompt = `
    你是一個專業編劇顧問。請根據以下「隨機抽選的故事元素」，協助我發展一個完整的故事企劃。
    
    【抽選元素清單】：
    ${promptParts.join('\n')}

    請嚴格依照以下 JSON 格式回傳內容（不要使用 Markdown 標示 json）：
    {
        "settings_list": "請整理出一份條列式清單，包含所有標題與對應選項，並且每一個選項都要換行（例如：主角-男性\\n工作-警察...）。",
        "story_circle": "請使用「Dan Harmon 故事圈 (Story Circle)」理論，寫出角色旅程基本設定。請務必將 8 個步驟（1.舒適圈 -> 2.渴望 -> 3.進入陌生世界 -> 4.適應 -> 5.得到 -> 6.代價 -> 7.回歸 -> 8.改變）分段撰寫，每一點之間要換行。",
        "story_outline": "請根據上述設定，撰寫約 600 字的詳細劇情大綱，需有具體的起承轉合與高潮，並適當分段。",
        "analysis": "請針對這個隨機組合進行優劣分析，包含最有張力處與邏輯衝突點，並分點列出。"
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

document.getElementById('btn-history').onclick = () => {
    mainView.style.display = 'none';
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('btn-generate').style.display = 'none';
    historyView.style.display = 'block';
    renderHistory();
};

// 重新啟用返回按鈕 (包含雙層邏輯：文件 -> 清單 -> 首頁)
const btnBackHome = document.getElementById('btn-back-home');
if (btnBackHome) {
    btnBackHome.onclick = () => {
        // 檢查是否有展開的文件
        const openDetail = document.querySelector('.history-detail[style*="display: block"]');
        
        if (openDetail) {
            // 情境 1: 如果有文件展開，就「收合文件」(回到清單)
            document.querySelectorAll('.history-detail').forEach(d => d.style.display = 'none');
            btnBackHome.textContent = '返回首頁';
            // 稍微捲回頂部或保持位置
            window.scrollTo({top: 0, behavior: 'smooth'});
        } else {
            // 情境 2: 如果沒有文件展開，就「回到首頁」
            historyView.style.display = 'none';
            mainView.style.display = 'block';
            // 確保生成按鈕和結果區塊的顯示狀態正確
            document.getElementById('btn-generate').style.display = 'flex';
            if (generatedResult) {
                document.getElementById('result-area').style.display = 'block';
            }
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

        // 將標題區塊獨立出來，加上 click 事件
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
                <div style="text-align:center; margin-top:20px; color:#888; font-size:0.8rem;">(已到底部)</div>
            </div>
        `;
        
        // 只有點擊「標題區域」才觸發展開/收合 (避免選取內文時誤觸)
        const headerArea = item.querySelector('.history-header-area');
        const detail = item.querySelector('.history-detail');

        headerArea.onclick = (e) => {
            const isOpening = detail.style.display !== 'block';
            
            // UX 優化：開啟一個時，自動收合其他所有項目
            document.querySelectorAll('.history-detail').forEach(d => d.style.display = 'none');
            
            if (isOpening) {
                detail.style.display = 'block';
                // 當有文件展開時，按鈕變成「返回清單」
                if(btnBack) btnBack.textContent = '返回清單';
                // 自動捲動到該項目
                setTimeout(() => item.scrollIntoView({behavior: "smooth", block: "start"}), 100);
            } else {
                detail.style.display = 'none';
                // 全部收合時，按鈕變回「返回首頁」
                if(btnBack) btnBack.textContent = '返回首頁';
            }
        };
        
        historyList.appendChild(item);
    });
}

renderApp();
