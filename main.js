// main.js - 雲端版

let appData = loadData();

let currentSelection = {};
let generatedResult = null;
let currentUser = null; // 當前使用者
let isCloudMode = false; // 雲端模式狀態

const container = document.getElementById('categories-container');

// 初始化監聽器
document.addEventListener('DOMContentLoaded', () => {
    // 綁定登入登出
    const btnLogin = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogin) btnLogin.onclick = loginWithGoogle; // 來自 firebase-config.js
    if (btnLogout) btnLogout.onclick = logout;

    // 監聽 Firebase 狀態
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(user => {
            const userInfo = document.getElementById('user-info');
            const userAvatar = document.getElementById('user-avatar');
            
            if (user) {
                currentUser = user;
                isCloudMode = true;
                console.log("雲端模式:", user.displayName);
                if (btnLogin) btnLogin.style.display = 'none';
                if (userInfo) userInfo.style.display = 'flex';
                if (userAvatar) userAvatar.src = user.photoURL;
                
                // [Step B: 登入自動同步] 嘗試從雲端下載類別設定
                const db = firebase.firestore(); // 確保取得資料庫實例
                db.collection('users').doc(user.uid).get().then(doc => {
                    // 只有當雲端有設定時，才覆蓋本地
                    if (doc.exists && doc.data().settings) {
                        console.log("☁️ 發現雲端備份，正在還原設定...");
                        
                        const cloudData = doc.data().settings;
                        
                        // [順序修正] 判斷是「真空包裝(字串)」還是「舊版資料(物件)」
                        if (typeof cloudData === 'string') {
                            appData = JSON.parse(cloudData); // 解開真空包裝，順序完美還原
                        } else {
                            appData = cloudData; // 舊版資料相容
                        }
                        
                        // 更新本地暫存 (手動寫入 localStorage，避免呼叫 saveData 造成循環上傳)
                        localStorage.setItem('script_roule_data', JSON.stringify(appData));
                        
                        renderApp(); // 重新渲染畫面，讓設定生效
                    }
                }).catch(err => console.error("自動同步失敗:", err));

                // 如果目前在歷史頁面，重新整理以讀取雲端資料
                if (document.getElementById('history-view').style.display === 'block') {
                    renderHistory();
                }
            } else {
                currentUser = null;
                isCloudMode = false;
                if (btnLogin) btnLogin.style.display = 'block';
                if (userInfo) userInfo.style.display = 'none';
            }
        });
    }
});

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
function openUniversalModal({ title, desc, defaultValue, showDelete, hideInput }) {
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
        
        // [修改] 支援隱藏輸入框 (用於純確認視窗)
        if (hideInput) {
            inputEl.style.display = 'none';
        } else {
            inputEl.style.display = 'block';
        }
        
        // 設定按鈕狀態
        btnDelete.style.display = showDelete ? 'block' : 'none';
        btnConfirm.textContent = showDelete ? '修改' : '確定'; // 如果有刪除鍵，確認鍵通常代表"修改"

        modal.style.display = 'flex';
        if (!hideInput) inputEl.focus();

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

// 3. 修改分類標題 (長按標題) - [安全模式：僅限修改]
async function renameCategory(cat, subCat) {
    const oldKey = subCat || cat;
    const cleanName = cleanTitle(oldKey); 
    
    const result = await openUniversalModal({
        title: '編輯標題',
        desc: '請輸入新的標題名稱：', 
        defaultValue: cleanName,
        showDelete: false // [安全防護] 移除刪除功能
    });

    // 僅保留修改功能，刪除邏輯已移除
    if (result.action === 'confirm' && result.value) {
        const newName = result.value;
        if (newName === cleanName) return; // 名稱沒變，不做事

        // [優化版更名邏輯]：使用「重建順序」法，確保改名後類別不會跑到最後面
        if (subCat) {
            // 1. 修改子分類 (保留順序)
            const newSubCats = {};
            for (const [key, val] of Object.entries(appData[cat])) {
                if (key === subCat) {
                    newSubCats[newName] = val; // 替換新名稱
                } else {
                    newSubCats[key] = val; // 保留原名稱
                }
            }
            appData[cat] = newSubCats;
        } else {
            // 2. 修改大分類 (保留順序)
            const newAppData = {};
            for (const [key, val] of Object.entries(appData)) {
                if (key === cat) {
                    newAppData[newName] = val; // 替換新名稱
                } else {
                    newAppData[key] = val; // 保留原名稱
                }
            }
            appData = newAppData;
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

// 5. 編輯選項 (長按選單) - [安全模式：僅限修改]
async function showDeleteMenu(cat, subCat, currentValue) {
    if (!currentValue) return;

    const arr = subCat ? appData[cat][subCat] : appData[cat];
    const idx = arr.indexOf(currentValue);

    if (idx === -1) return; // 找不到該值

    const result = await openUniversalModal({
        title: '編輯選項',
        desc: '請修改內容名稱：',
        defaultValue: currentValue,
        showDelete: false // [安全防護] 移除刪除功能
    });

    // 僅保留修改功能，刪除邏輯已移除
    if (result.action === 'confirm' && result.value) {
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

    // 新的詳細 Prompt (修正：加入三幕劇與標題生成)
    const prompt = `
    你是一位崇尚 Robert McKee 《故事》美學的好萊塢高階劇本醫生 (Script Doctor)。
    你擅長處理深刻的「人性兩難」與「情境反諷 (Situational Irony)」。

    請根據以下【隨機故事元素】，構思一個具有深度與哲學辯證的故事企劃：
    【抽選元素清單】：
    ${promptParts.join('\n')}

    請嚴格依照以下 JSON 格式回傳內容（內容字串內不要使用 Markdown 語法，僅純文字換行）：
    {
        "story_title": "請為這個故事取一個具有文學性、電影感或懸疑感的精確標題。",
        
        "settings_list": "請完整列出上方【抽選元素清單】的所有項目（包含補充條件），嚴禁省略任何一個標題或選項。格式保持「標題：選項」，每一項換行。",
        
        "three_act_structure": "請依照傳統三幕劇結構列出劇情節點，必須包含標題：I. 起 (Setup)、II-A. 承 (Confrontation - Part 1)、II-B. 轉 (Confrontation - Part 2)、III. 合 (Resolution)。每一步驟換行顯示。",

        "story_circle": "運用 Dan Harmon 故事圈 (Story Circle) 的 8 個步驟規劃。重點要求：必須標示步驟名稱，格式為「1. YOU (主角/現狀)」、「2. NEED (渴望)」、「3. GO (出發)」、「4. SEARCH (追尋/試煉)」、「5. FIND (發現)」、「6. TAKE (代價)」、「7. RETURN (回歸)」、「8. CHANGE (改變)」。請確保步驟 6 主角付出了慘痛代價。每一步驟換行顯示。",
        
        "story_outline": "請撰寫約 500 字的深度故事大綱。請內化三幕劇結構來撰寫，寫成一篇連貫流暢的文章。內容須包含：\\n1. 【伏筆與呼應】：開頭出現的微小元素，必須在結局成為關鍵轉折。\\n2. 【價值觀反諷】：設計一個極致的兩難困境，讓主角被迫採取與其身份/信念背道而馳的行動。",
        
        "analysis": "請進行深度的劇本診斷：\\n1. 【主控思想】：用一句話定義故事的辯證。\\n2. 【反諷張力】：具體指出哪一個橋段展現了悲劇性或諷刺性。\\n3. 【盲點建議】：目前的衝突是否夠殘酷？"
    }
    `;

    try {
        const data = await generateStory(prompt);
        // 將畫面上生成的 displayList 也轉成換行的 HTML，若 AI 回傳空則使用它
        const fallbackList = displayList.join('<br>');

        generatedResult = {
            story_title: data.story_title, // 新增：標題
            settings_list: data.settings_list || fallbackList,
            three_act_structure: data.three_act_structure, // 新增：三幕劇
            story_circle: data.story_circle,
            story_outline: data.story_outline, 
            analysis: data.analysis
        };
        
        loading.style.display = 'none';
        
        // 渲染五個區塊 (新增三幕劇區塊)
        storyContent.innerHTML = `
            <div style="background:#f0f2f5; padding:15px; border-radius:8px; margin-bottom:15px; font-size:0.95rem; line-height:1.6;">
                <h4 style="margin-top:0;">📋 抽選清單</h4>
                <div>${(generatedResult.settings_list).replace(/\n/g, '<br>')}</div>
            </div>

            <h3>📐 三幕劇結構</h3>
            <p>${(data.three_act_structure || '').replace(/\n/g, '<br>')}</p>
            <hr>

            <h3>⭕ 故事圈 (Story Circle)</h3>
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
document.getElementById('btn-save').addEventListener('click', async () => {
    if (!generatedResult) return;
    
    // 使用 AI 生成的標題作為預設值，若沒有則使用 "未命名故事"
    const defaultTitle = generatedResult.story_title || "未命名故事";
    const title = prompt("請為這個故事取個名字：", defaultTitle);
    
    if (!title) return;

    const newStory = {
        id: Date.now(),
        title: title,
        timestamp: new Date().toLocaleString(),
        settings_list: generatedResult.settings_list,
        three_act_structure: generatedResult.three_act_structure, // 新增：儲存三幕劇
        story_circle: generatedResult.story_circle,
        story_outline: generatedResult.story_outline,
        analysis: generatedResult.analysis
    };

    // 雲端儲存邏輯
    if (isCloudMode && currentUser) {
        try {
            await db.collection('users').doc(currentUser.uid).collection('stories').doc(String(newStory.id)).set(newStory);
            alert("☁️ 已儲存到雲端！");
        } catch (e) {
            alert("雲端儲存失敗：" + e.message);
        }
    } else {
        // 本地儲存邏輯
        const savedStories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
        savedStories.unshift(newStory);
        localStorage.setItem('saved_stories', JSON.stringify(savedStories));
        alert("💾 已儲存到本地！(登入後可存到雲端)");
    }
});

// --- 設定視窗邏輯 ---
const modal = document.getElementById('settings-modal');
if (modal) {
    const btnSet = document.getElementById('btn-settings');
    const btnClose = document.getElementById('btn-close-settings');
    const btnSaveKey = document.getElementById('btn-save-key');

    // 打開設定時，推入 #settings 歷史紀錄
    if(btnSet) btnSet.onclick = () => {
        history.pushState({ page: 'settings' }, 'Settings', '#settings');
        modal.style.display = 'flex';
    };

    // 點擊取消時，執行瀏覽器上一頁 (會自動觸發 popstate 關閉視窗)
    if(btnClose) btnClose.onclick = () => history.back();

    if(btnSaveKey) btnSaveKey.onclick = async () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            
            // [修改] 改用 APP 風格視窗提示
            await openUniversalModal({
                title: '設定已儲存',
                desc: 'API Key 已更新完成。',
                defaultValue: '',
                showDelete: false,
                hideInput: true
            });
            
            // 儲存成功後也執行上一頁來關閉
            history.back();
        }
    };

    // [新增] 備份功能 (匯出 JSON)
    const btnBackup = document.getElementById('btn-backup');
    if (btnBackup) {
        btnBackup.onclick = async () => {
            // [修改] 加入確認視窗
            const result = await openUniversalModal({
                title: '匯出備份',
                desc: '確定要下載目前的設定檔嗎？',
                defaultValue: '',
                showDelete: false,
                hideInput: true
            });

            if (result.action === 'confirm') {
                const dataStr = JSON.stringify(appData, null, 2); // 轉成美化過的 JSON 字串
                const blob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                
                // 產生當前時間檔名 (例: ScriptRoule_Backup_2026-01-09.json)
                const date = new Date().toISOString().split('T')[0];
                const a = document.createElement('a');
                a.href = url;
                a.download = `ScriptRoule_Backup_${date}.json`;
                a.click();
                
                URL.revokeObjectURL(url); // 釋放記憶體
            }
        };
    }

    // [新增] 還原功能 (匯入 JSON)
    const btnRestore = document.getElementById('btn-restore');
    const fileInputRestore = document.getElementById('file-input-restore');
    
    if (btnRestore && fileInputRestore) {
        // 1. 點擊按鈕時，觸發隱藏的檔案選擇框
        btnRestore.onclick = () => fileInputRestore.click();

        // 2. 當使用者選好檔案後
        fileInputRestore.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    
                    // [修正] 放寬檢查標準
                    if (importedData && typeof importedData === 'object' && Object.keys(importedData).length > 0) {
                        // [修改] 改用 APP 風格確認視窗
                        const confirmResult = await openUniversalModal({
                            title: '還原確認',
                            desc: '確定要還原此備份嗎？\n目前的設定將會被覆蓋。',
                            defaultValue: '',
                            showDelete: false,
                            hideInput: true
                        });

                        if (confirmResult.action === 'confirm') {
                            appData = importedData;
                            saveData(appData); // 這會自動觸發雲端同步
                            renderApp();
                            
                            // [修改] 改用 APP 風格成功視窗
                            await openUniversalModal({
                                title: '還原成功',
                                desc: '設定已成功還原！',
                                defaultValue: '',
                                showDelete: false,
                                hideInput: true
                            });
                            
                            history.back(); // 關閉設定視窗
                        }
                    } else {
                        // [修改] 錯誤提示
                        await openUniversalModal({
                            title: '還原失敗',
                            desc: '檔案格式錯誤：這似乎不是本 App 的備份檔。',
                            defaultValue: '',
                            showDelete: false,
                            hideInput: true
                        });
                    }
                } catch (err) {
                    // [修改] 讀取失敗提示
                    await openUniversalModal({
                        title: '讀取失敗',
                        desc: '錯誤訊息：' + err,
                        defaultValue: '',
                        showDelete: false,
                        hideInput: true
                    });
                }
                // 清空輸入框，確保下次選同個檔案也能觸發
                fileInputRestore.value = '';
            };
            reader.readAsText(file);
        };
    }

    // [Step C] 恢復原廠設定按鈕邏輯
    const btnResetFactory = document.getElementById('btn-reset-factory');
    if (btnResetFactory) {
        btnResetFactory.onclick = async () => {
            // [修改] 改用 APP 風格的確認視窗 (移除原生 confirm)
            const result = await openUniversalModal({
                title: '恢復原廠設定',
                desc: '⚠️ 這將會「刪除」您所有關於類別的修改，並恢復成剛安裝時的樣子。(歷史紀錄會保留)\n\n確定要執行嗎？',
                defaultValue: '',
                showDelete: false,
                hideInput: true
            });

            if (result.action === 'confirm') {
                // 執行重置：深拷貝原廠設定，確保乾淨
                appData = JSON.parse(JSON.stringify(defaultData));
                saveData(appData);
                renderApp();
                
                // [修改] 改用 APP 風格成功視窗
                await openUniversalModal({
                    title: '重置完成',
                    desc: '已恢復原廠類別設定！',
                    defaultValue: '',
                    showDelete: false,
                    hideInput: true
                });

                history.back(); // 關閉設定視窗
            }
        };
    }
}

// --- 路由與導航控制變數 ---
const mainView = document.getElementById('main-view');
const historyView = document.getElementById('history-view');
const historyListEle = document.getElementById('history-list');

// 1. 回到首頁函式
function goHome() {
    // 切換視圖
    if(historyView) historyView.style.display = 'none';
    if(mainView) mainView.style.display = 'block';
    
    // 恢復產生器介面 (生成結果與按鈕)
    const btnGen = document.getElementById('btn-generate');
    const resArea = document.getElementById('result-area');
    
    if(btnGen) btnGen.style.display = 'flex';
    if(generatedResult && resArea) resArea.style.display = 'block';

    // 重置歷史清單 (全部展開)
    document.querySelectorAll('.history-item').forEach(item => item.style.display = 'block');
    document.querySelectorAll('.history-detail').forEach(d => d.style.display = 'none');
    
    // 重置按鈕文字
    const btnBack = document.getElementById('btn-back-home');
    if(btnBack) btnBack.textContent = '返回首頁';
    
    // 滾動到頂部
    window.scrollTo({top: 0, behavior: 'smooth'});
}

// 2. 監聽瀏覽器返回鍵 (Popstate)
window.addEventListener('popstate', (event) => {
    // [新增] 當網址改變且不再是 #settings 時，強制關閉設定視窗
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && location.hash !== '#settings') {
        settingsModal.style.display = 'none';
    }

    // 如果網址沒有 hash (或是只有 #)，代表回到首頁
    if (!location.hash || location.hash === '#') {
        goHome();
    } 
    // 如果是回到 #history (例如從詳細頁按返回)
    else if (location.hash === '#history') {
        if(mainView) mainView.style.display = 'none';
        if(historyView) historyView.style.display = 'block';
        
        // 確保列表顯示，詳情隱藏
        document.querySelectorAll('.history-item').forEach(item => item.style.display = 'block');
        document.querySelectorAll('.history-detail').forEach(d => d.style.display = 'none');
        
        const btnBack = document.getElementById('btn-back-home');
        if(btnBack) btnBack.textContent = '返回首頁';
    }
});

// 3. 設定「歷史紀錄」按鈕 (加入 #history)
const btnHistory = document.getElementById('btn-history');
if (btnHistory) {
    btnHistory.onclick = () => {
        // [修正] 關鍵：如果已經在歷史頁面，就不重複加入堆疊，避免返回鍵卡住
        if (location.hash === '#history') {
            renderHistory(); 
            return;
        }

        history.pushState({ page: 'history' }, 'History', '#history');

        if(mainView) mainView.style.display = 'none';
        const resArea = document.getElementById('result-area');
        if(resArea) resArea.style.display = 'none';
        const btnGen = document.getElementById('btn-generate');
        if(btnGen) btnGen.style.display = 'none';
        
        if(historyView) historyView.style.display = 'block';
        renderHistory();
    };
}

// 4. 設定「返回首頁/返回清單」按鈕邏輯
const btnBackHome = document.getElementById('btn-back-home');
if (btnBackHome) {
    btnBackHome.onclick = () => {
        // 只要有 hash (不論是 #history 還是 #detail)，都執行上一頁
        if (location.hash) {
            history.back();
        } else {
            goHome();
        }
    };
}

// --- 歷史紀錄渲染 (RenderHistory) ---
async function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;

    list.innerHTML = '<div style="text-align:center; padding:20px;">載入中...</div>';
    
    const btnBack = document.getElementById('btn-back-home');
    if(btnBack && location.hash !== '#detail') btnBack.textContent = '返回首頁';

    let stories = [];

    // 決定讀取來源
    if (isCloudMode && currentUser) {
        try {
            const snapshot = await db.collection('users').doc(currentUser.uid).collection('stories').orderBy('id', 'desc').get();
            if (!snapshot.empty) {
                stories = snapshot.docs.map(doc => doc.data());
            }
        } catch (e) {
            list.innerHTML = `<div style="color:red">讀取失敗：${e.message}</div>`;
            return;
        }
    } else {
        stories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
    }

    list.innerHTML = '';

    if (stories.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:#888; margin-top:50px;">這裡空空的 (尚無紀錄)</div>';
        return;
    }

    stories.forEach(story => {
        const item = document.createElement('div');
        item.className = 'history-item';
        
        const listContent = story.settings_list || '舊資料無詳細清單';
        const threeActContent = story.three_act_structure || '舊資料無三幕劇結構';
        const circleContent = story.story_circle || '舊資料無故事圈';
        const outlineContent = story.story_outline || story.content || ''; 
        const analysisContent = story.analysis || '無分析資料';

        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div class="history-header-area" style="cursor:pointer; flex:1;">
                    <div style="font-weight:bold; font-size:1.1rem; color:#5e6b75;">${story.title}</div>
                    <div style="font-size:0.8rem; color:#999; margin-bottom:8px;">${story.timestamp}</div>
                    ${isCloudMode ? '<span style="font-size:0.7rem; background:#4285F4; color:white; padding:2px 5px; border-radius:4px;">Cloud</span>' : ''}
                </div>
                
                <button class="btn-delete-history" style="background:none; border:none; padding:5px 10px; cursor:pointer; opacity:0.6;" title="刪除此紀錄">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>

            <div class="history-detail" style="display:none; border-top:1px solid #eee; padding-top:10px; margin-top:10px; font-size:0.95rem; line-height:1.5;">
                <div style="background:#f9f9f9; padding:10px; border-radius:5px; margin-bottom:10px;">
                    <strong>📋 設定清單：</strong><br>${listContent.replace(/\n/g, '<br>')}
                </div>
                
                <p><strong>📐 三幕劇結構：</strong><br>${threeActContent.replace(/\n/g, '<br>')}</p>
                <hr style="border:0; border-top:1px dashed #ddd;">
                
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
        const deleteBtn = item.querySelector('.btn-delete-history'); // 抓取垃圾桶按鈕
        const detail = item.querySelector('.history-detail');
        const copyBtn = item.querySelector('.copy-btn');
        let isLongPress = false;

        // [新增] 垃圾桶刪除邏輯
        deleteBtn.onclick = async (e) => {
            e.stopPropagation(); // 避免觸發展開
            const confirmDelete = await openUniversalModal({
                title: '刪除紀錄',
                desc: `確定要刪除「${story.title}」嗎？無法復原。`,
                defaultValue: '',
                showDelete: true // 這裡借用 Modal 的確認按鈕邏輯
            });

            if (confirmDelete.action === 'delete') {
                if (isCloudMode && currentUser) {
                    await db.collection('users').doc(currentUser.uid).collection('stories').doc(String(story.id)).delete();
                } else {
                    const currentStories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
                    const newStories = currentStories.filter(s => s.id !== story.id);
                    localStorage.setItem('saved_stories', JSON.stringify(newStories));
                }
                renderHistory(); 
            }
        };

        // 複製邏輯
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            const fullText = `標題：${story.title}\n時間：${story.timestamp}\n\n【設定清單】\n${listContent}\n\n【三幕劇】\n${threeActContent}\n\n【故事圈】\n${circleContent}\n\n【大綱】\n${outlineContent}\n\n【分析】\n${analysisContent}`;
            navigator.clipboard.writeText(fullText).then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✅ 已複製！';
                copyBtn.style.backgroundColor = '#4CAF50';
                setTimeout(() => { copyBtn.textContent = originalText; copyBtn.style.backgroundColor = '#8fa3ad'; }, 2000);
            }).catch(err => alert('複製失敗'));
        };

        // 點擊展開邏輯 (加入 hash 變更)
        headerArea.onclick = () => {
            if (isLongPress) return;
            // 關鍵：改變網址 hash 為 #detail
            history.pushState({ page: 'detail' }, 'Detail', '#detail');
            
            document.querySelectorAll('.history-item').forEach(el => el.style.display = 'none');
            item.style.display = 'block';
            detail.style.display = 'block';
            
            if(btnBack) btnBack.textContent = '返回清單';
            window.scrollTo({top: 0, behavior: 'smooth'});
        };
        
        list.appendChild(item);
    });
}

// 確保程式一開始會執行渲染
renderApp();
