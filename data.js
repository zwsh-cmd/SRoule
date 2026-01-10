// data.js
const defaultData = {
    "主角": {
        "性別": ["男性", "女性", "男孩", "女孩", "男性長者", "女性長者"],
        "工作": ["警察", "醫生", "學生", "失業中", "家庭主婦/夫", "藝術家", "工程師"],
        "興趣": ["園藝", "極限運動", "烹飪", "集郵", "打電動", "觀察路人"],
        "特色(能力)": ["過目不忘", "力大無窮", "極度悲觀", "擁有陰陽眼", "聽力超群", "幸運"],
        "害怕的事物": ["孤獨", "密閉空間", "水", "承諾", "失敗", "蜘蛛"],
        "身邊有誰": ["控制狂父母", "拖油瓶兄弟", "忠心耿耿的狗", "神秘的鄰居", "青梅竹馬"],
        "背景": ["貧民窟長大", "落魄貴族", "孤兒", "中產階級", "外星移民"]
    },
    "Want 想要": {
        "想要什麼": ["復仇", "找到真愛", "活過今晚", "贏得比賽", "解開謎團", "致富"],
        "阻礙": ["身患絕症", "強大的敵人", "內心的恐懼", "時間不夠", "資源匱乏"]
    },
    "觸發事件": [
        "被背叛", "遇見舊情人", "收到恐嚇信", "家人失蹤",
        "被解雇", "升遷但調職", "公司倒閉", "接到不可能的任務",
        "中樂透", "撿到神秘物品", "迷路", "目擊犯罪",
        "能力突然消失", "能力失控", "發現新能力"
    ],
    "Need 需要學到的功課": [
        "學會原諒", "接受不完美", "懂得依賴他人", "放下過去", "勇敢面對真相", "犧牲小我"
    ],
    "結局": [
        "開放式結局", "悲劇英雄", "大團圓", "主角犧牲", "反轉結局", "看似成功實則失敗"
    ]
};

// 初始化資料：如果有存檔就讀取，但會檢查結構版本並自動修復
function loadData() {
    const saved = localStorage.getItem('script_roule_data');
    if (saved) {
        const parsed = JSON.parse(saved);
        
        // [自動修復] 檢查 "C (觸發事件)" 是否為舊的物件格式
        // 如果它不是陣列 (Array)，代表是舊版，強制用新的 defaultData 覆蓋它
        if (parsed["C (觸發事件)"] && !Array.isArray(parsed["C (觸發事件)"])) {
            console.log("偵測到舊版資料結構，正在自動修復...");
            parsed["C (觸發事件)"] = defaultData["C (觸發事件)"];
            saveData(parsed); // 存回修復後的資料
        }
        
        return parsed;
    }
    return defaultData;
}

// 儲存資料回 localStorage (並嘗試同步雲端)
function saveData(newData) {
    // 1. 本地儲存 (絕對優先，保證速度)
    localStorage.setItem('script_roule_data', JSON.stringify(newData));

    // 2. [Step A: 雲端同步備份] 
    // 檢查 Firebase 是否啟動且使用者已登入，如果是，順便備份到雲端
    if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
        const db = firebase.firestore();
        const uid = firebase.auth().currentUser.uid;

        // 將設定存入 users -> {uid} -> 欄位 settings
        // [順序修正] 使用 JSON.stringify 將資料「真空包裝」成字串，避免 Firebase 打亂順序
        db.collection('users').doc(uid).set({
            settings: JSON.stringify(newData), 
            lastBackup: new Date().toISOString() // 紀錄備份時間
        }, { merge: true })
        .then(() => console.log("☁️ 設定已自動同步至雲端 (順序已鎖定)"))
        .catch(err => console.error("雲端備份失敗 (不影響本地使用):", err));
    }
}
