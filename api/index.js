import express from 'express';
import fs from 'fs';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import axios from 'axios';
import cron from 'node-cron';
import { Posts, Users, Friends } from './utils/posts.js';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const i = axios.create();

i.interceptors.response.use(
  response => response,
  error => {
    return Promise.resolve(error.response);
  }
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public/icons');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${req.body.userId}.png`);
  }
});

const upload = multer({ storage });

const app = express();
const PORT = 3000;
const USERS_FILE = "users.json";
const DATA_FILE = "status.json";
const SECRET_KEY = process.env.SKEY;
const FRIENDS_FILE = "friends.json";

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

cron.schedule('0 0 * * *', () => {
  const users = loadUsers();
  const posts = new Posts();

  Object.keys(users).forEach(userId => {
    const userPosts = posts.getPosts(userId);
    if (!isToday(userPosts[userPosts.length - 1].date + 86400)) {
      users[userId].currentStreak = 0;
    }
  });

  saveUsers(users);
});

// ユーザー登録
app.post("/register", (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res.status(400).json({ error: "ユーザー名、パスワードは必須です" });
  }

  const users = loadUsers();
  const friends = loadFriends();
  if (users[userId]) {
    return res.status(400).json({ error: "このユーザー名は既に使われています" });
  }

  const userValue = Object.keys(users).length + 1;

  users[userId] = {
    userId,
    password: encryptPassword(password),
    userValue,
    icon: "",
    maxStreak: 0,
    currentStreak: 0,
    logged: 0,
    createdAt: Math.floor(new Date().getTime() / 1000)
  };
  friends[userId] = { friends: [], pending: [] };

  saveUsers(users);
  saveFriends(friends);
  res.json({ success: true, user: users[userId] });
});

// ログイン
app.post("/login", (req, res) => {
  const { userId, password } = req.body;
  const users = new Users();

  if (!users[userId]) {
    return res.status(400).json({ error: "ユーザーが見つかりません" });
  }

  if (users.auth(password)) {
    return res.status(400).json({ error: "パスワードが間違っています" });
  }

  res.json({ success: true, user: users[userId] });
});

const rateLimits = new Map(); // ユーザーごとのリクエスト情報を保持

app.post("/status", async (req, res) => {
  const { userId } = req.body;
  const now = Date.now();
  const limitDuration = 60 * 60 * 1000; // 1時間
  const maxRequests = 5;

  const loginRes = await i.post("https://5f.glitch.me/login", req.body);
  if (!loginRes.data.success) return res.status(400).json({ error: "認証に失敗" });

  let statuses = loadStatuses();
  statuses[userId] = req.body.isAwake;
  saveStatuses(statuses);

  const posts = new Posts();
  let userPosts = posts.getPosts(userId);
  if (req.body.message && (req.body.message !== userPosts[userPosts.length - 1]?.content)) {
    if (!rateLimits.has(userId)) {
      rateLimits.set(userId, { count: 1, firstRequestTime: now });
    } else {
      const userData = rateLimits.get(userId);
      if (now - userData.firstRequestTime > limitDuration) {
        userData.count = 1;
        userData.firstRequestTime = now;
      } else {
        if (userData.count >= maxRequests) {
          return res.status(429).json({ error: "1時間に5回までです" });
        }
        userData.count++;
      }
    }
    posts.addPost(userId, req.body.message);
    userPosts = posts.getPosts(userId);
    if (!isToday(userPosts[userPosts.length - 2].date)) {
      const users = loadUsers();
      users[userId].currentStreak++;
      users[userId].maxStreak = Math.max(users[userId].maxStreak, users[userId].currentStreak);
      users[userId].logged++;
      saveUsers(users);
    }
  }

  res.json({ success: true });
});

// ステータス取得
app.get("/status", async (req, res) => {
  const loginRes = await i.post("https://5f.glitch.me/login", req.query);
  if (!loginRes.data.success) return res.status(400).json({ error: "認証に失敗" });

  const { userId } = req.query;
  const statuses = loadStatuses();

  const posts = new Posts();

  const userPosts = posts.getPosts(userId);

  res.json({
    isAwake: statuses[userId],
    post: userPosts[userPosts.length - 1]
  });
});

// 友達機能
app.post("/friend/send", async (req, res) => {
  const loginRes = await i.post("https://5f.glitch.me/login", req.body);
  if (!loginRes.data.success) return res.status(400).json({ error: "認証に失敗" });

  const { userId, friendId } = req.body;
  let friends = loadFriends();
  const users = Object.keys(loadUsers());

  if (!users.includes(friendId)) {
    return res.status(400).json({ error: "相手が存在しません" });
  }

  if (!friends[userId]) friends[userId] = { friends: [], pending: [] };
  if (!friends[friendId]) friends[friendId] = { friends: [], pending: [] };

  if (friends[userId].friends.includes(friendId) || friends[friendId].pending.includes(userId)) {
    return res.status(400).json({ error: "既にフレンド申請を送信済み" });
  }

  let state = "";
  if (friends[userId].pending.includes(friendId)) {
    friends[friendId].pending = friends[friendId].pending.filter(id => id !== userId);
    friends[userId].pending = friends[userId].pending.filter(id => id !== friendId);
    friends[userId].friends.push(friendId);
    friends[friendId].friends.push(userId);
    state = "friend";
  } else {
    friends[friendId].pending.push(userId);
    state = "pending";
  }

  saveFriends(friends);
  res.json({ success: true, state });
});

app.delete("/friend/delete", async (req, res) => {
  const loginRes = await i.post("https://5f.glitch.me/login", req.body);
  if (!loginRes.data.success) return res.status(400).json({ error: "認証に失敗" });

  if (!req.body.friendId) return res.status(400).json({ error: "friendIdは必須です" });
  const { userId, friendId } = req.body;
  const friends = loadFriends();
  friends[userId] = friends[userId] || { friends: [], pending: [] };

  friends[userId].friends = friends[userId].friends.filter(user => user !== friendId);
  friends[userId].pending = friends[userId].pending.filter(user => user !== friendId);

  friends[friendId].friends = friends[friendId].friends.filter(user => user !== userId);
  friends[friendId].pending = friends[friendId].pending.filter(user => user !== userId);

  saveFriends(friends);
  res.json({ success: true });
});


app.get("/friend/list", async (req, res) => {
  const loginRes = await i.post("https://5f.glitch.me/login", req.query);
  if (!loginRes.data.success) return res.status(400).json({ error: "認証に失敗" });

  const { userId } = req.query;
  res.json(loadFriends()[userId] || { friends: [], pending: [] });
});

app.get("/friend/status", async (req, res) => {
  const loginRes = await i.post("https://5f.glitch.me/login", req.query);
  if (!loginRes.data.success) return res.status(400).json({ error: "認証に失敗" });

  const { userId } = req.query;
  const friendList = loadFriends()[userId]?.friends || [];
  const statuses = loadStatuses();
  const filteredStatuses = Object.keys(loadStatuses())
    .filter(key => friendList.includes(key))
    .reduce((acc, key) => {
      acc[key] = statuses[key];
      return acc;
    }, {});

  const posts = new Posts();

  Object.keys(filteredStatuses).forEach(key => {
    const userPosts = posts.getPosts(key);
    filteredStatuses[key] = {
      isAwake: filteredStatuses[key],
      post: userPosts[userPosts.length - 1]
    }
  });

  res.json(filteredStatuses);
});



app.get("/users", async (req, res) => {
  const users = loadUsers();

  res.json(Object.keys(users));
});


app.get("/users/:userId", async (req, res) => {
  const users = loadUsers();
  const friends = loadFriends();
  const posts = new Posts();

  const userId = req.params.userId;

  if (!Object.keys(users).includes(userId)) return res.status(400).json({ error: "ユーザーが存在しません" });

  const user = users[userId];
  const userPosts = posts.getPosts(userId);

  res.json({
    userId,
    icon: user.icon,
    friends: friends[userId].friends.length,
    posts: userPosts,
    maxStreak: user.maxStreak,
    currentStreak: user.currentStreak,
    createdAt: user.createdAt
  });
});


app.get("/topuser", async (req, res) => {
  const posts = new Posts();

  res.json(posts.getMostActiveUser());
});

app.post("/upload-icon", upload.single("icon"), async (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res.status(400).json({ error: "認証情報が不足しています" });
  }

  const loginRes = await i.post("https://5f.glitch.me/login", { userId, password });
  if (!loginRes.data.success) {
    return res.status(400).json({ error: "認証に失敗しました" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "ファイルがアップロードされていません" });
  }

  const users = loadUsers();
  if (!users[userId]) {
    return res.status(400).json({ error: "ユーザーが存在しません" });
  }

  // `public/icons/{userId}.png` に保存
  const iconsDir = path.join(__dirname, 'public/icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const newPath = path.join(iconsDir, `${userId}.png`);
  fs.renameSync(req.file.path, newPath);

  const iconUrl = `${req.protocol}://${req.get('host')}/icons/${userId}.png`;
  users[userId].icon = iconUrl;
  saveUsers(users);

  res.json({ success: true, icon: iconUrl });
});

app.get('/test/:endpoint', async (req, res) => {
  const { endpoint } = req.params;
  const { postdata } = req.query;

  try {
    const response = await axios.post(`http://5f.glitch.me/${endpoint}`, JSON.parse(postdata));

    res.json({
      message: 'POST request was successful',
      data: response.data
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error while making POST request',
      error: error
    });
  }
});




// フレンドデータの読み込みと保存
function loadFriends() {
  if (!fs.existsSync(FRIENDS_FILE)) return {};
  return JSON.parse(fs.readFileSync(FRIENDS_FILE, "utf8"));
}

function saveFriends(friends) {
  fs.writeFileSync(FRIENDS_FILE, JSON.stringify(friends, null, 2));
}

// ユーザー情報を読み込む
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

// ユーザー情報を保存する
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ステータス情報を読み込む
function loadStatuses() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

// ステータス情報を保存する
function saveStatuses(statuses) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(statuses, null, 2));
}



function isToday(unixSeconds) {
  const today = new Date();
  const date = new Date(unixSeconds * 1000);

  return today.getFullYear() === date.getFullYear() &&
         today.getMonth() === date.getMonth() &&
         today.getDate() === date.getDate();
}

export function startServer() {
    app.listen(3000, () => console.log(`Server running on http://5f.glitch.me`));
}
