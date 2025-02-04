document.addEventListener("DOMContentLoaded", () => {
    const savedUser = localStorage.getItem("username");
    if (savedUser) {
        window.location.href = "index.html"; // ログインしていればindex.htmlにリダイレクト
    }
});

async function register() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const response = await fetch("/regist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });

    const result = await response.json();
    document.getElementById("message").innerText = result.message || result.error;

    if (result.message === "Registration successful") {
        setTimeout(() => {
            window.location.href = "login.html"; // 登録後はlogin.htmlにリダイレクト
        }, 2000);
    }
}

async function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const response = await fetch("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });

    const result = await response.json();
    if (result.valid) {
        localStorage.setItem("username", username);
        window.location.href = "index.html"; // ログイン成功後、index.htmlにリダイレクト
    } else {
        document.getElementById("message").innerText = "ログイン失敗";
    }
}

function logout() {
    localStorage.removeItem("username");
    window.location.href = "login.html"; // ログアウト後、login.htmlにリダイレクト
}
