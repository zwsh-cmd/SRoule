// firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyAURcWL5t5mGImZpgc2tRr_akRKV8tk0fs",
  authDomain: "scriptr-9df19.firebaseapp.com",
  projectId: "scriptr-9df19",
  storageBucket: "scriptr-9df19.firebasestorage.app",
  messagingSenderId: "981981172556",
  appId: "1:981981172556:web:8f1e9d80a86406eaca75e9"
};
// --- 貼上結束 ---


// 🟢 2. 初始化 Firebase
// 因為我們在 HTML 是用 <script> 引入，所以要用 firebase.initializeApp
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    
    // 設定常用的變數，方便之後呼叫
    window.auth = firebase.auth();
    window.db = firebase.firestore();
    window.provider = new firebase.auth.GoogleAuthProvider();
    
    console.log("Firebase 初始化成功！");
} else {
    console.error("找不到 Firebase SDK，請確認 index.html 有沒有正確引入 script 標籤。");
}

// 🟢 3. 登入與登出功能
function loginWithGoogle() {
    // 使用全域變數 auth 和 provider
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
        .then((result) => {
            console.log("登入成功:", result.user);
        }).catch((error) => {
            console.error("登入失敗:", error);
            alert("登入失敗：" + error.message);
        });
}

function logout() {
    firebase.auth().signOut().then(() => {
        alert("已登出");
        location.reload(); 
    });

}
