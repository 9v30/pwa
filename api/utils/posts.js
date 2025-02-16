import fs from 'fs';

const POSTS_FILE = "posts.json"

export class Posts {
  constructor() {
    this.data = this.load();

    return new Proxy(this, {
      get(target, prop) {
        if (prop in target.data) {
          return target.data[prop];
        }
        return target[prop];
      },
      set(target, prop, value) {
        target.data[prop] = value;
        target.save();
        return true;
      },
    });
  }

  load() {
    if (!fs.existsSync(POSTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(POSTS_FILE, "utf8"));
  }

  save() {
    fs.writeFileSync(POSTS_FILE, JSON.stringify(this.data, null, 2));
  }

  addPost(userId, content) {
    if (!this.data[userId]) {
      this.data[userId] = [];
    }

    this.data[userId].push({
      content,
      date: Math.floor(new Date().getTime() / 1000),
    });

    this.save();
  }

  getPosts(userId) {
    return this.data[userId] || [];
  }

  getMostActiveUser() {
    let mostActiveUser = null;
    let maxPosts = 0;

    for (let userId in this.data) {
      if (this.data[userId].length > maxPosts) {
        mostActiveUser = userId;
        maxPosts = this.data[userId].length;
      }
    }

    return mostActiveUser;
  }
}

class Users {
  constructor() {
    this.file = "users.json";
    this.data = this.load();
  }

  load() {
    if (!fs.existsSync(this.file)) return {};
    return JSON.parse(fs.readFileSync(this.file));
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  getUser(userId) {
    return this.data[userId] || null;
  }

  addUser(userId, password) {
    if (this.data[userId]) return false;
    this.data[userId] = {
      userId,
      password: encryptPassword(password),
      userValue: Object.keys(this.data).length + 1,
      icon: "",
      maxStreak: 0,
      currentStreak: 0,
      logged: 0,
      createdAt: Math.floor(Date.now() / 1000)
    };
    this.save();
    return true;
  }

  auth(userId, password) {
    const user = this.getUser(userId);
    if (!user) return false;

    if (decryptPassword(user.password) === password) {
      return true;
    }

    return false;
  }
}

class Friends {
  constructor() {
    this.file = "friends.json";
    this.data = this.load();
  }

  load() {
    if (!fs.existsSync(this.file)) return {};
    return JSON.parse(fs.readFileSync(this.file));
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  getFriends(userId) {
    return this.data[userId] || { friends: [], pending: [] };
  }

  sendRequest(userId, friendId) {
    if (!this.data[userId]) this.data[userId] = { friends: [], pending: [] };
    if (!this.data[friendId]) this.data[friendId] = { friends: [], pending: [] };

    if (this.data[userId].friends.includes(friendId) || this.data[friendId].pending.includes(userId)) {
      return false;
    }

    if (this.data[userId].pending.includes(friendId)) {
      this.data[friendId].pending = this.data[friendId].pending.filter(id => id !== userId);
      this.data[userId].pending = this.data[userId].pending.filter(id => id !== friendId);
      this.data[userId].friends.push(friendId);
      this.data[friendId].friends.push(userId);
    } else {
      this.data[friendId].pending.push(userId);
    }

    this.save();
    return true;
  }
}

function encryptPassword(password) {
  const cipher = crypto.createCipher('aes-256-cbc', process.env.SKEY);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decryptPassword(encryptedPassword) {
  const decipher = crypto.createDecipher('aes-256-cbc', process.env.SKEY);
  let decrypted = decipher.update(encryptedPassword, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
