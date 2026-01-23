// main.js - 雲端版

let appData = loadData();

let currentSelection = {};
let generatedResult = null;
let currentUser = null; // 當前使用者
let isCloudMode = false; // 雲端模式狀態

let currentSearchQuery = ''; // [新增] 紀錄目前的搜尋關鍵字
let isSearching = false; // [修正] 用於標記搜尋視窗狀態，防止 popstate 誤觸重置

const container = document.getElementById('categories-container');

// 初始化監聽器
document.addEventListener('DOMContentLoaded', () => {
    // 關閉瀏覽器預設的捲動恢復
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    // 綁定首頁的強制登入按鈕
    const btnLoginMain = document.getElementById('btn-login-main');
    if (btnLoginMain && typeof loginWithGoogle !== 'undefined') {
        btnLoginMain.onclick = () => {
            // [修正] 點擊瞬間手動打開「載入中」畫面，提供立即回饋
            sessionStorage.setItem('is_manual_login', 'true');
            
            const loginView = document.getElementById('login-view');
            const loadingIndicator = document.getElementById('loading-indicator');
            
            if (loginView) loginView.style.display = 'flex'; // 強制顯示背景
            if (loadingIndicator) loadingIndicator.style.display = 'flex'; // 顯示轉圈
            if (btnLoginMain) btnLoginMain.style.display = 'none'; // 隱藏按鈕
            
            loginWithGoogle();
        };
    }

    // 綁定設定頁面的登出按鈕
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.onclick = async () => {
            try {
                if (typeof auth !== 'undefined') {
                    await auth.signOut();
                    location.reload(); // 登出後直接重整，會回到強制登入畫面
                }
            } catch (e) {
                console.error("登出失敗", e);
            }
        };
    }

    // [關鍵] 監聽 Firebase 狀態 (決定顯示 Login 還是 App)
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(user => {
            const loginView = document.getElementById('login-view');
            const loadingIndicator = document.getElementById('loading-indicator');
            const btnLoginMain = document.getElementById('btn-login-main');
            
            const appHeader = document.getElementById('app-header');
            const btnGen = document.getElementById('btn-generate');
            
            const userInfo = document.getElementById('user-info');
            const userAvatar = document.getElementById('user-avatar');
            const btnLoginSettings = document.getElementById('btn-login');

            if (user) {
                // --- 已登入 ---
                currentUser = user;
                isCloudMode = true;
                
                // 更新使用者資訊
                if (btnLoginSettings) btnLoginSettings.style.display = 'none';
                if (userInfo) userInfo.style.display = 'flex';
                if (userAvatar) userAvatar.src = user.photoURL;

                // 啟動 APP 路由與渲染
                handleInitialRoute();

                // 判斷是否為「手動點擊登入」
                const isManualLogin = sessionStorage.getItem('is_manual_login');

                if (isManualLogin) {
                    // [情況 A] 手動登入：保持「載入中」畫面，直到雲端同步完成
                    // 注意：因為 HTML 預設隱藏，這裡要強制顯示
                    if (loginView) loginView.style.display = 'flex';
                    if (loginView) loginView.style.opacity = '1';
                    if (btnLoginMain) btnLoginMain.style.display = 'none';
                    if (loadingIndicator) loadingIndicator.style.display = 'flex';
                } else {
                    // [情況 B] 重新整理/自動登入：
                    // 因為 HTML 預設隱藏了 login-view，所以這裡什麼都不用做，畫面就是乾淨的 App
                    if (loginView) loginView.style.display = 'none';
                    
                    // 確保 App 介面顯示
                    if (appHeader) appHeader.style.display = 'flex';
                    if (!location.hash && btnGen) btnGen.style.display = 'flex';
                }

                // [雲端同步] 讀取雲端資料 (永遠在背景執行)
                const db = firebase.firestore();
                db.collection('users').doc(user.uid).get()
                    .then(doc => {
                        if (doc.exists && doc.data().settings) {
                            console.log("☁️ 還原雲端設定...");
                            const cloudData = doc.data().settings;
                            appData = (typeof cloudData === 'string') ? JSON.parse(cloudData) : cloudData;
                            localStorage.setItem('script_roule_data', JSON.stringify(appData));
                            renderApp(); // 更新畫面
                        }
                    })
                    .catch(err => console.error("同步失敗:", err))
                    .finally(() => {
                        // 只有在「手動登入」的情況下，才需要執行淡出動畫
                        if (isManualLogin && loginView) {
                            loginView.style.opacity = '0'; // 淡出效果
                            setTimeout(() => {
                                loginView.style.display = 'none';
                                
                                // 顯示 APP 介面
                                if (appHeader) appHeader.style.display = 'flex';
                                if (!location.hash && btnGen) btnGen.style.display = 'flex';
                                
                                // 清除旗標
                                sessionStorage.removeItem('is_manual_login');
                            }, 300);
                        }
                    });

            } else {
                // --- 未登入 ---
                currentUser = null;
                isCloudMode = false;

                // 只有未登入時，才顯示 login-view
                if (loginView) {
                    loginView.style.display = 'flex';
                    loginView.style.opacity = '1';
                }
                
                // 顯示登入按鈕，隱藏載入動畫
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                if (btnLoginMain) btnLoginMain.style.display = 'flex';

                // 隱藏 APP 介面
                if (appHeader) appHeader.style.display = 'none';
                if (btnGen) btnGen.style.display = 'none';
                if (mainView) mainView.style.display = 'none';
                if (historyView) historyView.style.display = 'none';
                const resArea = document.getElementById('result-area');
                if (resArea) resArea.style.display = 'none';
            }
        });
    }
});


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
        header.textContent = category; // [修改] 直接顯示標題
        addLongPressEvent(header, () => renameCategory(category, null));
        box.appendChild(header);

        // 建立網格容器 (讓選項並排)
        const gridBox = document.createElement('div');
        gridBox.className = 'items-grid';

        // 判斷內容結構
        if (Array.isArray(content)) {
            // 純清單 (如 D, E)
            renderDropdownRow(gridBox, category, null, content);
        } else {
            // 巢狀結構 (如 A, B, C)
            for (const [subCategory, items] of Object.entries(content)) {
                renderDropdownRow(gridBox, category, subCategory, items);
            }
        }
        
        box.appendChild(gridBox); // 將網格放入卡片
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

// 3. 渲染下拉選單列 (改用自定義視窗)
function renderDropdownRow(parent, cat, subCat, items) {
    const row = document.createElement('div');
    row.className = 'sub-category-row';

    // 標題 (小類別)
    if (subCat) {
        const label = document.createElement('div');
        label.className = 'sub-title';
        label.textContent = subCat; 
        addLongPressEvent(label, () => renameCategory(cat, subCat));
        row.appendChild(label);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'select-wrapper';

    // [修改] 建立 "偽" 下拉選單 (div 模擬)
    const fakeSelect = document.createElement('div');
    fakeSelect.className = 'fake-select';
    fakeSelect.id = `select-${cat}-${subCat || 'main'}`; 
    // [修改] 預設改為「不設定」
    fakeSelect.textContent = '不設定'; 
    fakeSelect.dataset.value = '不設定'; 
    fakeSelect.style.color = '#bfaea8'; // 預設使用莫蘭迪粉/灰色

    // 點擊觸發自定義視窗
    fakeSelect.onclick = () => {
        openSelectionModal(
            subCat || cat, 
            items, 
            (selectedVal) => { // onSelect
                // [修改] 根據選擇的值更新顯示樣式
                if (selectedVal === '不設定') {
                    fakeSelect.textContent = '不設定';
                    fakeSelect.style.color = '#bfaea8';
                } else if (selectedVal === '') {
                    fakeSelect.textContent = '隨機選取';
                    fakeSelect.style.color = '#8fa3ad';
                } else {
                    fakeSelect.textContent = selectedVal;
                    fakeSelect.style.color = '#5e6b75';
                }
                fakeSelect.dataset.value = selectedVal;
            },
            () => addItemViaPrompt(cat, subCat), // onAdd
            (valToDelete) => { // [新增] onDelete
                const idx = items.indexOf(valToDelete);
                if (idx > -1) {
                    items.splice(idx, 1); // 刪除資料
                    saveData(appData); // 存檔
                    
                    // 如果刪除的是當前選中的值，重置為「不設定」
                    if (fakeSelect.dataset.value === valToDelete) {
                        fakeSelect.textContent = '不設定';
                        fakeSelect.dataset.value = '不設定';
                        fakeSelect.style.color = '#bfaea8';
                    }
                }
            }
        );
    };

    // [關鍵] 定義 .value 屬性，騙過 generateStory 的取值邏輯
    Object.defineProperty(fakeSelect, 'value', {
        get: function() { return this.dataset.value; },
        set: function(v) { 
            this.dataset.value = v; 
            // [修改] 針對不同值設定顯示樣式
            if (v === '不設定') {
                this.textContent = '不設定';
                this.style.color = '#bfaea8';
            } else if (v === '' || v === '隨機選取') {
                this.textContent = '隨機選取';
                this.style.color = '#8fa3ad';
            } else {
                this.textContent = v;
                this.style.color = '#5e6b75';
            }
        }
    });

    // 綁定長按 (編輯選項)
    addLongPressEvent(fakeSelect, () => showDeleteMenu(cat, subCat, fakeSelect.dataset.value));

    // [修改] 已移除外部 + 號按鈕，統一由選單內新增
    wrapper.appendChild(fakeSelect);
    row.appendChild(wrapper);
    parent.appendChild(row);
}

// --- 編輯與互動功能區 (原生 App 風格) ---

// -1. 自定義選擇清單視窗 (取代原生 Select)
function openSelectionModal(title, options, onSelect, onAdd, onDelete) { // [修改] 增加 onDelete 參數
    return new Promise((resolve) => {
        const modal = document.getElementById('selection-modal');
        const titleEl = document.getElementById('s-modal-title');
        const listEl = document.getElementById('s-modal-list');
        const btnClose = document.getElementById('s-btn-close');

        titleEl.textContent = title;
        listEl.innerHTML = ''; // 清空舊選項

        // 加入歷史狀態 (支援返回鍵關閉)
        history.pushState({ modal: 'selection' }, 'Selection', '#selection');
        modal.style.display = 'flex';

        // 統一關閉邏輯
        const close = () => {
            modal.style.display = 'none';
            window.removeEventListener('popstate', onPopState);
            resolve(null);
        };

        const onPopState = () => {
            // [修正] 關鍵邏輯：如果現在網址是 #selection (表示是從 #confirm 或其他視窗退回來)，不關閉此視窗
            if (location.hash === '#selection') return;

            modal.style.display = 'none';
            window.removeEventListener('popstate', onPopState);
            resolve(null);
        };
        window.addEventListener('popstate', onPopState);

        const closeWithBack = () => {
            // [優化] 主動關閉模式：不等待 history API 回應，直接關閉 UI
            
            // 1. 先移除監聽，防止稍後 history.back() 再次觸發舊的邏輯
            window.removeEventListener('popstate', onPopState);

            // 2. 如果網址還是 #selection，默默地退回上一頁 (修復網址)
            if (location.hash === '#selection') {
                history.back(); 
            }

            // 3. 直接關閉視窗 (解決偶發的點擊無反應問題)
            modal.style.display = 'none';
            resolve(null);
        };

        // 1. [修改] 「不設定」排在最上面 (第一順位)
        const notSetItem = document.createElement('div');
        notSetItem.className = 'selection-item';
        notSetItem.innerHTML = '<span style="color:#bfaea8">🚫 不設定 (AI 將忽略此項)</span>';
        notSetItem.onclick = () => {
             onSelect('不設定');
             closeWithBack();
        };
        listEl.appendChild(notSetItem);

        // 2. 「新增選項」排在第二順位
        if (onAdd) {
            const addItem = document.createElement('div');
            addItem.className = 'selection-item';
            addItem.style.color = 'var(--primary-color)';
            addItem.style.fontWeight = 'bold';
            addItem.style.display = 'flex';
            addItem.style.alignItems = 'center';
            addItem.innerHTML = '<span style="font-size:105%">➕ 新增選項...</span>';
            
            addItem.onclick = async () => {
                const newVal = await onAdd(); 
                if (newVal) {
                    onSelect(newVal); 
                    closeWithBack();
                }
            };
            listEl.appendChild(addItem);
        }

        // 3. 建立其餘選項 (隨機選取 + 資料庫選項)
        const allOptions = ['隨機選取', ...options];
        
        allOptions.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'selection-item';
            
            const textSpan = document.createElement('span');
            
            if (opt === '隨機選取') {
                textSpan.textContent = '🎲 隨機選取';
                textSpan.style.color = '#8fa3ad';
            } else {
                textSpan.textContent = opt;
            }
            
            item.appendChild(textSpan);

            // 長按刪除邏輯
            let isLongPress = false;
            // 隨機選取 不能被刪除
            if (onDelete && opt !== '隨機選取') {
                addLongPressEvent(item, async () => {
                    isLongPress = true; 
                    
                    const confirm = await openConfirmModal({
                        title: '刪除選項',
                        desc: `確定要刪除「${opt}」嗎？`
                    });

                    if (confirm.action === 'confirm') {
                        onDelete(opt);
                        item.remove(); 
                    }
                    setTimeout(() => { isLongPress = false; }, 300);
                });
            }

            item.onclick = () => {
                if (isLongPress) return; 
                onSelect(opt === '隨機選取' ? '' : opt);
                closeWithBack();
            };
            listEl.appendChild(item);
        });;

        // 關閉按鈕與背景點擊
        btnClose.onclick = closeWithBack;
        modal.onclick = (e) => {
            if (e.target === modal) closeWithBack();
        };
    });
}

function openConfirmModal({ title, desc }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('c-modal-title');
        const descEl = document.getElementById('c-modal-desc');
        const btnConfirm = document.getElementById('c-btn-confirm');
        const btnCancel = document.getElementById('c-btn-cancel');

        titleEl.textContent = title;
        descEl.textContent = desc || '';
        
        // [修正] 推入一個暫時的歷史狀態 #confirm
        // 這樣按返回鍵時，只會退回 #history，而不會跳出歷史頁面
        history.pushState({ modal: 'confirm' }, 'Confirm', '#confirm');
        modal.style.display = 'flex';

        // 監聽：當使用者按手機/瀏覽器「返回鍵」時觸發
        const onPopState = (e) => {
            modal.style.display = 'none';
            window.removeEventListener('popstate', onPopState); // 移除監聽
            resolve({ action: 'cancel' }); // 視為取消
        };

        window.addEventListener('popstate', onPopState);

        // 內部函式：透過按鈕關閉時，要手動退回上一頁 (消除 #confirm)
        const closeByButton = (action) => {
            window.removeEventListener('popstate', onPopState); // 先移除監聽，避免重複觸發
            history.back(); // 這行會讓網址變回 #history
            modal.style.display = 'none';
            resolve({ action: action });
        };

        // 點擊背景 -> 取消
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeByButton('cancel');
            }
        };
        
        // 點擊確定
        btnConfirm.onclick = () => closeByButton('confirm');
        
        // 點擊取消
        btnCancel.onclick = () => closeByButton('cancel');
    });
}

// 1. 通用異步視窗 (Promise-based Modal)
// [架構升級] 新增 preventBackOnConfirm 參數，允許搜尋功能接管歷史導航
function openUniversalModal({ title, desc, defaultValue, showDelete, hideInput, preventBackOnConfirm }) {
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
        
        if (hideInput) {
            inputEl.style.display = 'none';
        } else {
            inputEl.style.display = 'block';
        }
        
        btnDelete.style.display = showDelete ? 'block' : 'none';
        btnConfirm.textContent = showDelete ? '修改' : '確定';

        history.pushState({ modal: 'universal' }, 'Universal', '#universal');
        modal.style.display = 'flex';
        if (!hideInput) inputEl.focus();

        const onPopState = (e) => {
            modal.style.display = 'none';
            window.removeEventListener('popstate', onPopState);
            resolve({ action: 'cancel' });
        };
        window.addEventListener('popstate', onPopState);

        const closeByButton = (result) => {
            window.removeEventListener('popstate', onPopState);
            
            // [關鍵修改] 如果設定了 preventBackOnConfirm 且是確認動作，就不執行 history.back()
            // 這讓呼叫者 (搜尋按鈕) 可以使用 replaceState 無縫切換頁面
            if (result.action === 'confirm' && preventBackOnConfirm) {
                // 不退回，保留在當前歷史節點供 replace 使用
            } else {
                history.back(); // 其他情況維持原樣，消除 #universal
            }
            
            modal.style.display = 'none';
            resolve(result);
        };

        btnConfirm.onclick = () => {
            closeByButton({ action: 'confirm', value: inputEl.value.trim() });
        };
        
        btnCancel.onclick = () => {
            closeByButton({ action: 'cancel' });
        };

        btnDelete.onclick = () => {
            if(confirm('確定要刪除這個項目嗎？')) { 
                closeByButton({ action: 'delete' });
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
    const cleanName = oldKey; // [修改] 直接使用原名稱
    
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
            return null; // 重複時回傳 null
        }

        if (subCat) appData[cat][subCat].push(cleanVal);
        else appData[cat].push(cleanVal);
        
        // [新增] 1. 在重新渲染前，先備份當前所有選單的選擇狀態 (ID -> Value)
        const savedSelections = {};
        document.querySelectorAll('.fake-select').forEach(el => {
            savedSelections[el.id] = el.value;
        });

        saveData(appData);
        renderApp(); // 這一步會重置所有 DOM 元素
        
        // [新增] 2. 渲染後，將剛剛的選擇狀態還原回去
        document.querySelectorAll('.fake-select').forEach(el => {
            if (savedSelections[el.id]) {
                el.value = savedSelections[el.id]; // 這會觸發 setter 更新 UI (文字顏色等)
            }
        });

        // 自動選中 (針對剛剛新增的那個選項，強制選中新值，覆蓋掉原本的狀態)
        setTimeout(() => {
            const selectId = `select-${cat}-${subCat || 'main'}`;
            const select = document.getElementById(selectId);
            if (select) select.value = cleanVal;
        }, 50);

        return cleanVal; // 成功時回傳新值
    }
    return null; // [修改] 取消時回傳 null
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
        // [修改] 改用 APP 風格視窗提示，取代原生的 alert
        await openUniversalModal({
            title: '需要 API Key',
            desc: '請先點擊右上角「設定」，輸入您的 Gemini API Key！',
            defaultValue: '',
            showDelete: false,
            hideInput: true
        });
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

            // [新增] 如果使用者選擇了「不設定」，則跳過此項目，不加入 Prompt
            if (val === '不設定') continue;

            if (!val) {
                val = content[Math.floor(Math.random() * content.length)];
            }
            
            const title = cat; // [修改] 直接使用原標題
            currentSelection[title] = val;
            promptParts.push(`${title}: ${val}`);
            displayList.push(`<b>${title}</b>：${val}`);

        } else {
            // 巢狀結構
            for (const [subCat, items] of Object.entries(content)) {
                const selectId = `select-${cat}-${subCat}`;
                const select = document.getElementById(selectId);
                let val = select.value;

                // [新增] 如果使用者選擇了「不設定」，則跳過此項目，不加入 Prompt
                if (val === '不設定') continue;

                if (!val) {
                    val = items[Math.floor(Math.random() * items.length)];
                }

                const title = subCat; // [修改] 直接使用原標題
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
        
        "three_act_structure": "請依照傳統三幕劇結構列出劇情節點，必須包含標題：I. 起 (Setup)、II-A. 承 (Confrontation - Part 1)、II-B. 轉 (Confrontation - Part 2)、III. 合 (Resolution)。每一步驟換行顯示。起、承、轉、合，中間要空一行。",

        "story_circle": "運用 Dan Harmon 故事圈 (Story Circle) 的 8 個步驟規劃。重點要求：必須標示步驟名稱，格式為「1. YOU (主角/現狀)」、「2. NEED (渴望)」、「3. GO (出發)」、「4. SEARCH (追尋/試煉)」、「5. FIND (發現)」、「6. TAKE (代價)」、「7. RETURN (回歸)」、「8. CHANGE (改變)」。請確保步驟 6 主角付出了慘痛代價。每一步驟換行顯示。每個標題之間要空一行。",
        
        "story_outline": "請撰寫約 500 字的深度故事大綱，自動分段。請內化三幕劇結構來撰寫，寫成一篇連貫流暢的文章。請勿使用列點格式。每段之間要空一行。",
        
        "analysis": "請進行深度的劇本診斷（每段之間要空一行）：\\n1. 【主題 Subject】：一個概念詞（如：復仇）。\\n2. 【主旨 Theme】：一句道理或哲學衝突（如：饒恕他人就是放過自己）。\\n3. 【Logline】：一句話講完這個故事（如：失業單親媽媽利用法律助理身份對抗污染大企業）。\\n4. 【前提 Premise】：具有吸引力的鉤子（如：如果一名退役殺手的愛狗被殺了，且殺狗的人大有來頭，他會採取什麼行動？）。\\n5. 【反諷張力】：具體指出故事中的諷刺性（如：一個NPC在覺醒後竟愛上人類玩家）。\\n6. 【優勢分析】：分析這個故事的優點。\\n7. 【盲點建議】：分析這個故事值得改進的地方。"
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
            analysis: data.analysis,
            used_model: data.used_model // [新增] 紀錄使用的模型
        };
        
        loading.style.display = 'none';
        
        // 渲染區塊 (新增頁尾顯示模型資訊)
        storyContent.innerHTML = `
            <div style="background:#f0f2f5; padding:15px; border-radius:8px; margin-bottom:15px; font-size:0.95rem; line-height:1.6;">
                <h4 style="margin-top:0;">📋 抽選清單</h4>
                <div>${(generatedResult.settings_list).replace(/\n/g, '<br>')}</div>
            </div>

            <div style="text-align:center; margin: 30px 0 20px 0;">
                <span style="font-size:1.5rem; font-weight:bold; color:#5e6b75; line-height:1.4;">《${generatedResult.story_title}》</span>
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

            <div style="margin-top: 30px; text-align: center; color: #bfaea8; font-size: 0.8rem; border-top: 1px dashed #eee; padding-top: 10px;">
                Generated by ${generatedResult.used_model || 'Unknown AI'}
            </div>
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
    
    // [修改] 改用 APP 風格視窗輸入標題
    const result = await openUniversalModal({
        title: '儲存故事',
        desc: '請為這個故事取個名字：',
        defaultValue: defaultTitle,
        showDelete: false
    });

    // 如果使用者按取消或沒有輸入內容，則不儲存
    if (result.action !== 'confirm' || !result.value) return;

    const title = result.value;

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
            
            // [修改] 改用 APP 風格視窗顯示成功訊息
            await openUniversalModal({
                title: '儲存成功',
                desc: '☁️ 已儲存到雲端！',
                defaultValue: '',
                showDelete: false,
                hideInput: true
            });

        } catch (e) {
            // [修改] 改用 APP 風格視窗顯示失敗訊息
            await openUniversalModal({
                title: '儲存失敗',
                desc: '雲端儲存失敗：' + e.message,
                defaultValue: '',
                showDelete: false,
                hideInput: true
            });
        }
    } else {
        // 本地儲存邏輯
        const savedStories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
        savedStories.unshift(newStory);
        localStorage.setItem('saved_stories', JSON.stringify(savedStories));
        
        // [修改] 改用 APP 風格視窗顯示成功訊息
        await openUniversalModal({
            title: '儲存成功',
            desc: '💾 已儲存到本地！(登入後可存到雲端)',
            defaultValue: '',
            showDelete: false,
            hideInput: true
        });
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
    
    // [已移除] 搜尋按鈕已移至歷史頁面內部，無需在此控制顯示
    // [已移除] 自動捲動到頂部的指令，保持畫面位置
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
    // 如果是回到 #history
    else if (location.hash === '#history') {
        if (isSearching) return; 

        if(mainView) mainView.style.display = 'none';
        if(historyView) historyView.style.display = 'block';
        
        // 清空搜尋狀態
        currentSearchQuery = ''; 
        
        document.querySelectorAll('.history-item').forEach(item => item.style.display = 'block');
        document.querySelectorAll('.history-detail').forEach(d => d.style.display = 'none');
        
        const btnBack = document.getElementById('btn-back-home');
        if(btnBack) btnBack.textContent = '返回首頁';

        renderHistory().then(() => {
            handleScrollToLastItem();
        });
    }
    // 如果是回到 #search (搜尋結果頁)
    else if (location.hash === '#search') {
        if(mainView) mainView.style.display = 'none';
        if(historyView) historyView.style.display = 'block';

        document.querySelectorAll('.history-item').forEach(item => item.style.display = 'block');
        document.querySelectorAll('.history-detail').forEach(d => d.style.display = 'none');

        const btnBack = document.getElementById('btn-back-home');
        if(btnBack) btnBack.textContent = '返回列表'; 

        // [關鍵修正] 從 history.state 恢復搜尋字串，確保返回時不會變成全部歷史
        let savedQuery = currentSearchQuery;
        if (event.state && event.state.query) {
            savedQuery = event.state.query;
            currentSearchQuery = savedQuery; // 同步全域變數
        }

        // 強制帶入搜尋字串渲染
        renderHistory(savedQuery).then(() => {
            handleScrollToLastItem();
        });
    }
});

// [新增] 獨立出捲動邏輯，供 #history 與 #search 共用 (放在外面)
function handleScrollToLastItem() {
    if (window.lastViewedStoryId) {
        // 使用 requestAnimationFrame 確保畫面重繪完成後再執行
        requestAnimationFrame(() => {
            const targetItem = document.getElementById('history-story-' + window.lastViewedStoryId);
            if (targetItem) {
                // 微微延遲以配合某些手機瀏覽器的渲染時機
                setTimeout(() => {
                    const headerOffset = 90;
                    const elementPosition = targetItem.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.scrollY - headerOffset;
                    window.scrollTo({ top: offsetPosition, behavior: 'auto' });
                    
                    // 只有成功捲動或找不到元素時才清除 ID
                    window.lastViewedStoryId = null;
                }, 50);
            } else {
                // 如果真的找不到 (例如被篩選掉了)，也清除 ID 避免殘留
                window.lastViewedStoryId = null;
            }
        });
    }
}

// 3. 設定「歷史紀錄」按鈕 (加入 #history)
const btnHistory = document.getElementById('btn-history');
if (btnHistory) {
    btnHistory.onclick = () => {
        // 如果已經在歷史頁，則只執行重整並確保視圖正確 (解決 Reload 後畫面不同步的問題)
        if (location.hash === '#history' || location.hash === '#search') {
            // 強制校正視圖狀態 (防止網址是對的，但畫面卻停在首頁)
            if(mainView) mainView.style.display = 'none';
            if(historyView) historyView.style.display = 'block';
            const resArea = document.getElementById('result-area');
            if(resArea) resArea.style.display = 'none';
            const btnGen = document.getElementById('btn-generate');
            if(btnGen) btnGen.style.display = 'none';
            
            // 如果是 #search 狀態下按歷史按鈕，清空搜尋並回到完整歷史
            if (location.hash === '#search') {
                currentSearchQuery = '';
                history.replaceState({ page: 'history' }, 'History', '#history');
            }
            
            renderHistory(); 
            window.scrollTo({ top: 0, behavior: 'auto' });
            return;
        }

        // 正常進入歷史頁流程
        history.pushState({ page: 'history' }, 'History', '#history');

        if(mainView) mainView.style.display = 'none';
        const resArea = document.getElementById('result-area');
        if(resArea) resArea.style.display = 'none';
        const btnGen = document.getElementById('btn-generate');
        if(btnGen) btnGen.style.display = 'none';
        
        if(historyView) historyView.style.display = 'block';
        renderHistory();
        
        window.scrollTo({ top: 0, behavior: 'auto' });
    };
}

// [新增] 搜尋按鈕邏輯
const btnSearch = document.getElementById('btn-search');
if (btnSearch) {
    btnSearch.onclick = async () => {
        isSearching = true; 
        
        try {
            // 呼叫時啟用 preventBackOnConfirm: true
            const result = await openUniversalModal({
                title: '搜尋歷史紀錄',
                desc: '請輸入標題或內容關鍵字：',
                defaultValue: currentSearchQuery, 
                showDelete: false,
                preventBackOnConfirm: true // [新參數] 告訴視窗：按確定時不要自動退回
            });

            if (result.action === 'confirm') {
                const query = result.value.trim();
                if (query) {
                    currentSearchQuery = query;
                    
                    // [完美方案] 直接將當前的 #universal 視窗狀態「替換」為 #search 搜尋結果
                    // 不會有 back() 和 push() 的競爭，絕對穩定
                    history.replaceState({ page: 'search', query: query }, 'Search', '#search');
                    
                    renderHistory(currentSearchQuery);
                    window.scrollTo({ top: 0, behavior: 'auto' });
                } else {
                    // 如果輸入空白，還是要手動退回 (因為 preventBackOnConfirm 擋住了自動退回)
                    history.back();
                }
            }
        } finally {
            isSearching = false;
        }
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
// [修改] 增加 searchQuery 參數，預設為空字串
async function renderHistory(searchQuery = '') {
    const list = document.getElementById('history-list');
    if (!list) return;

    list.innerHTML = '<div style="text-align:center; padding:20px;">載入中...</div>';

    // [新增] 根據搜尋狀態修改標題
    const titleEl = document.getElementById('history-title');
    if (titleEl) {
        titleEl.textContent = searchQuery ? '搜尋結果' : '歷史紀錄';
    }
    
    const btnBack = document.getElementById('btn-back-home');
    // 如果是在搜尋模式，按鈕文字改成「返回列表」
    if(btnBack && location.hash !== '#detail') {
        btnBack.textContent = (location.hash === '#search') ? '返回列表' : '返回首頁';
    }

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

    // [新增] 執行篩選邏輯 (加入 ?. 與 || '' 防止舊資料欄位缺失導致崩潰)
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        stories = stories.filter(s => 
            (s.title?.toLowerCase() || '').includes(q) || 
            (s.settings_list?.toLowerCase() || '').includes(q) ||
            (s.story_outline?.toLowerCase() || '').includes(q) ||
            (s.content?.toLowerCase() || '').includes(q) // 兼容舊版 content 欄位
        );
    }

    list.innerHTML = '';

    if (stories.length === 0) {
        const emptyMsg = searchQuery 
            ? `找不到包含「${searchQuery}」的故事` 
            : '這裡空空的 (尚無紀錄)';
        list.innerHTML = `<div style="text-align:center; color:#888; margin-top:50px;">${emptyMsg}</div>`;
        return;
    }

    stories.forEach(story => {
        const item = document.createElement('div');
        item.className = 'history-item';
        // [新增] 給每個項目一個唯一的 ID，方便返回時定位
        item.id = 'history-story-' + story.id;
        
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
            
            // [修改] 改用專用的確認視窗 (HTML 中真的沒有輸入框)
            const result = await openConfirmModal({
                title: '刪除內容',
                desc: `確定要刪除「${story.title}」嗎？`
            });

            if (result.action === 'confirm') {
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

        // [新增] 長按標題重新命名邏輯
        addLongPressEvent(headerArea, async () => {
            isLongPress = true; // 標記為長按，避免觸發點擊展開

            // 使用 openUniversalModal (帶有輸入框的視窗)
            const result = await openUniversalModal({
                title: '重新命名',
                desc: '請輸入新的標題：',
                defaultValue: story.title,
                showDelete: false,
                hideInput: false
            });

            if (result.action === 'confirm' && result.value) {
                const newTitle = result.value.trim();
                // 只有當標題真的有改變時才儲存
                if (newTitle && newTitle !== story.title) {
                    if (isCloudMode && currentUser) {
                        // 雲端更新
                        await db.collection('users').doc(currentUser.uid).collection('stories').doc(String(story.id)).update({ title: newTitle });
                    } else {
                        // 本地更新
                        const currentStories = JSON.parse(localStorage.getItem('saved_stories') || '[]');
                        const targetIndex = currentStories.findIndex(s => s.id === story.id);
                        if (targetIndex !== -1) {
                            currentStories[targetIndex].title = newTitle;
                            localStorage.setItem('saved_stories', JSON.stringify(currentStories));
                        }
                    }
                    renderHistory(); // 重新渲染列表以顯示新標題
                }
            }

            // 延遲重置長按標記，防止手指放開瞬間觸發 click
            setTimeout(() => { isLongPress = false; }, 500);
        });

        // 點擊展開邏輯 (加入 hash 變更)
        headerArea.onclick = () => {
            if (isLongPress) return; // 如果是長按，就不執行展開
            
            // [新增] 紀錄目前點擊的故事 ID，供返回時使用
            window.lastViewedStoryId = story.id;

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

// [新增] 初始化路由檢查 (解決重新整理後畫面跳回首頁的問題)
function handleInitialRoute() {
    renderApp(); // 先建立首頁內容

    const hash = location.hash;
    
    if (hash === '#history') {
        // 歷史模式
        if(mainView) mainView.style.display = 'none';
        if(historyView) historyView.style.display = 'block';
        const resArea = document.getElementById('result-area');
        if(resArea) resArea.style.display = 'none';
        const btnGen = document.getElementById('btn-generate');
        if(btnGen) btnGen.style.display = 'none';
        
        renderHistory();
    } 
    else if (hash === '#search') {
        // 搜尋模式
        if(mainView) mainView.style.display = 'none';
        if(historyView) historyView.style.display = 'block';
        const resArea = document.getElementById('result-area');
        if(resArea) resArea.style.display = 'none';
        const btnGen = document.getElementById('btn-generate');
        if(btnGen) btnGen.style.display = 'none';

        let savedQuery = currentSearchQuery;
        if (history.state && history.state.query) {
            savedQuery = history.state.query;
            currentSearchQuery = savedQuery;
        }

        renderHistory(savedQuery); 
    }
    else {
        // [關鍵修正] 如果是首頁 (無 hash)，強制顯示 mainView
        if(mainView) mainView.style.display = 'block';
        if(historyView) historyView.style.display = 'none';
        const btnGen = document.getElementById('btn-generate');
        if(btnGen) btnGen.style.display = 'flex';
        
        // 確保按鈕文字正確
        const btnBack = document.getElementById('btn-back-home');
        if(btnBack) btnBack.textContent = '返回首頁';
    }
}


