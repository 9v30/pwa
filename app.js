<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Index Page</title>
</head>
<body>

    <!-- ログイン後の表示内容 -->
    <div id="dashboard" style="display: none;">
        <p>ようこそ、<span id="username"></span>さん！</p>
        <button id="logoutButton">ログアウト</button>
        <p>ダッシュボードの内容...</p>
        <!-- ここにダッシュボードの内容を追加 -->
    </div>

    <script>
        window.onload = function() {
            const loggedIn = localStorage.getItem('loggedIn');
            const username = localStorage.getItem('username');

            if (loggedIn !== 'true') {
                // ログインしていない場合はログインページにリダイレクト
                window.location.href = 'login.html';
            } else {
                // ログインしている場合はダッシュボードを表示
                document.getElementById('dashboard').style.display = 'block';
                document.getElementById('username').textContent = username; // ユーザー名を表示
            }
        };

        // ログアウト処理
        document.getElementById('logoutButton').addEventListener('click', function() {
            localStorage.removeItem('loggedIn');
            localStorage.removeItem('username');  // ログアウト時にユーザー名も削除
            window.location.href = 'login.html'; // ログインページにリダイレクト
        });
    </script>

</body>
</html>
