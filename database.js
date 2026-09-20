// ==========================================
// GameRoom — Persistent Database Engine
// Pure JavaScript storage engine (Zero GLIBC / Native Dependency)
// ==========================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gameroom.json');

// In-memory relational tables
const db = {
  users: [],
  stats: [],
  friends: [],
  game_history: [],
  direct_messages: [],
  lobby_messages: [],
  seq: {
    users: 1,
    stats: 1,
    friends: 1,
    game_history: 1,
    direct_messages: 1,
    lobby_messages: 1,
  },
};

// Immediate sync bootstrap so database is always ready on module import
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    db.users = Array.isArray(data.users) ? data.users : [];
    db.stats = Array.isArray(data.stats) ? data.stats : [];
    db.friends = Array.isArray(data.friends) ? data.friends : [];
    db.game_history = Array.isArray(data.game_history) ? data.game_history : [];
    db.direct_messages = Array.isArray(data.direct_messages) ? data.direct_messages : [];
    db.lobby_messages = Array.isArray(data.lobby_messages) ? data.lobby_messages : [];
    db.seq = {
      users: Number(data.seq?.users) || 1,
      stats: Number(data.seq?.stats) || 1,
      friends: Number(data.seq?.friends) || 1,
      game_history: Number(data.seq?.game_history) || 1,
      direct_messages: Number(data.seq?.direct_messages) || 1,
      lobby_messages: Number(data.seq?.lobby_messages) || 1,
    };
  }
} catch (err) {
  console.warn('Initial sync load fallback:', err.message);
}

export function getPublicAccounts() {
  return db.users.map((u) => ({
    username: u.username,
    display_name: u.display_name,
    avatar: u.avatar,
  }));
}

export function saveDirectMessage(senderId, receiverId, text) {
  const id = db.seq.direct_messages++;
  const msg = {
    id,
    sender_id: parseInt(senderId, 10),
    receiver_id: parseInt(receiverId, 10),
    text: String(text).trim(),
    created_at: new Date().toISOString(),
    read: 0,
  };
  if (!db.direct_messages) db.direct_messages = [];
  db.direct_messages.push(msg);
  persist();
  return msg;
}

export function getDirectMessages(u1, u2) {
  const id1 = parseInt(u1, 10);
  const id2 = parseInt(u2, 10);
  return (db.direct_messages || [])
    .filter((m) => (m.sender_id === id1 && m.receiver_id === id2) || (m.sender_id === id2 && m.receiver_id === id1))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export function getLastDirectMessage(u1, u2) {
  const messages = getDirectMessages(u1, u2);
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

export function getLobbyChatHistory(limit = 60) {
  return Array.isArray(db.lobby_messages) ? db.lobby_messages.slice(-limit) : [];
}

export function saveLobbyChatMessage(messageObj) {
  if (!Array.isArray(db.lobby_messages)) db.lobby_messages = [];
  db.lobby_messages.push(messageObj);
  if (db.lobby_messages.length > 80) {
    db.lobby_messages.splice(0, db.lobby_messages.length - 80);
  }
  persist();
}

export async function initDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      db.users = Array.isArray(data.users) ? data.users : [];
      db.stats = Array.isArray(data.stats) ? data.stats : [];
      db.friends = Array.isArray(data.friends) ? data.friends : [];
      db.game_history = Array.isArray(data.game_history) ? data.game_history : [];
      db.direct_messages = Array.isArray(data.direct_messages) ? data.direct_messages : [];
      db.lobby_messages = Array.isArray(data.lobby_messages) ? data.lobby_messages : [];
      db.seq = {
        users: Number(data.seq?.users) || 1,
        stats: Number(data.seq?.stats) || 1,
        friends: Number(data.seq?.friends) || 1,
        game_history: Number(data.seq?.game_history) || 1,
        direct_messages: Number(data.seq?.direct_messages) || 1,
        lobby_messages: Number(data.seq?.lobby_messages) || 1,
      };
      console.log('✅ Loaded database from', DATA_FILE);
    } catch (e) {
      console.warn('⚠️ Could not load existing database file, reinitializing:', e.message);
      persist();
    }
  } else {
    persist();
    console.log('✅ Initialized clean database at', DATA_FILE);
  }
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write database file:', err);
  }
}

// ==========================================================
// dbRun(sql, params) -> returns { lastID, changes }
// ==========================================================
export async function dbRun(sql, params = []) {
  const norm = sql.trim().replace(/\s+/g, ' ');

  // 1. INSERT INTO users (username, password_hash, display_name, avatar, bio) VALUES (?, ?, ?, ?, ?)
  if (norm.startsWith('INSERT INTO users')) {
    const [username, password_hash, display_name, avatar, bio] = params;
    const id = db.seq.users++;
    const row = {
      id,
      username,
      password_hash,
      display_name: display_name || username,
      avatar: avatar || '🎮',
      bio: bio || "Let's play!",
      created_at: new Date().toISOString(),
    };
    db.users.push(row);
    persist();
    return { lastID: id, changes: 1 };
  }

  // 2. INSERT INTO stats (user_id, games_played, wins, losses, draws) VALUES (?, 0, 0, 0, 0)
  if (norm.startsWith('INSERT INTO stats')) {
    const [userId] = params;
    const id = db.seq.stats++;
    const row = {
      id,
      user_id: parseInt(userId, 10),
      games_played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    db.stats.push(row);
    persist();
    return { lastID: id, changes: 1 };
  }

  // 3. UPDATE users SET display_name = ? WHERE id = ?
  if (norm.startsWith('UPDATE users SET display_name = ? WHERE id = ?')) {
    const [name, id] = params;
    const user = db.users.find((u) => u.id === parseInt(id, 10));
    if (user) {
      user.display_name = name;
      persist();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  // 4. UPDATE users SET avatar = ? WHERE id = ?
  if (norm.startsWith('UPDATE users SET avatar = ? WHERE id = ?')) {
    const [avatar, id] = params;
    const user = db.users.find((u) => u.id === parseInt(id, 10));
    if (user) {
      user.avatar = avatar;
      persist();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  // 5. UPDATE users SET bio = ? WHERE id = ?
  if (norm.startsWith('UPDATE users SET bio = ? WHERE id = ?')) {
    const [bio, id] = params;
    const user = db.users.find((u) => u.id === parseInt(id, 10));
    if (user) {
      user.bio = bio;
      persist();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  // 6. UPDATE users SET password_hash = ? WHERE id = ?
  if (norm.startsWith('UPDATE users SET password_hash = ? WHERE id = ?')) {
    const [hash, id] = params;
    const user = db.users.find((u) => u.id === parseInt(id, 10));
    if (user) {
      user.password_hash = hash;
      persist();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  // 7. UPDATE friends SET status = 'accepted' WHERE id = ?
  if (norm.includes("UPDATE friends SET status = 'accepted' WHERE id = ?")) {
    const [id] = params;
    const f = db.friends.find((r) => r.id === parseInt(id, 10));
    if (f) {
      f.status = 'accepted';
      persist();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  // 8. UPDATE friends SET requester_id = ?, receiver_id = ?, status = 'pending', created_at = CURRENT_TIMESTAMP WHERE id = ?
  if (norm.startsWith('UPDATE friends SET requester_id = ?')) {
    const [reqId, recId, id] = params;
    const f = db.friends.find((r) => r.id === parseInt(id, 10));
    if (f) {
      f.requester_id = parseInt(reqId, 10);
      f.receiver_id = parseInt(recId, 10);
      f.status = 'pending';
      f.created_at = new Date().toISOString();
      persist();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  // 9. INSERT INTO friends (requester_id, receiver_id, status) VALUES (?, ?, ?)
  if (norm.startsWith('INSERT INTO friends')) {
    const [requester_id, receiver_id, status] = params;
    const id = db.seq.friends++;
    const row = {
      id,
      requester_id: parseInt(requester_id, 10),
      receiver_id: parseInt(receiver_id, 10),
      status: status || 'pending',
      created_at: new Date().toISOString(),
    };
    db.friends.push(row);
    persist();
    return { lastID: id, changes: 1 };
  }

  // 10. DELETE FROM friends WHERE id = ?
  if (norm.startsWith('DELETE FROM friends WHERE id = ?')) {
    const [id] = params;
    const initLen = db.friends.length;
    db.friends = db.friends.filter((r) => r.id !== parseInt(id, 10));
    persist();
    return { changes: initLen - db.friends.length };
  }

  // 11. DELETE FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)
  if (norm.includes('DELETE FROM friends WHERE (requester_id = ?')) {
    const [u1, u2] = params;
    const id1 = parseInt(u1, 10);
    const id2 = parseInt(u2, 10);
    const initLen = db.friends.length;
    db.friends = db.friends.filter(
      (r) => !( (r.requester_id === id1 && r.receiver_id === id2) || (r.requester_id === id2 && r.receiver_id === id1) )
    );
    persist();
    return { changes: initLen - db.friends.length };
  }

  // 12. INSERT INTO game_history (game_type, player1_id, player2_id, winner_id, result) VALUES (?, ?, ?, ?, ?)
  if (norm.startsWith('INSERT INTO game_history')) {
    const [game_type, player1_id, player2_id, winner_id, result] = params;
    const id = db.seq.game_history++;
    const parseId = (val) => {
      if (val === null || val === undefined) return null;
      const n = Number(val);
      return !isNaN(n) ? n : String(val);
    };
    const row = {
      id,
      game_type,
      player1_id: parseId(player1_id),
      player2_id: parseId(player2_id),
      winner_id: parseId(winner_id),
      result,
      created_at: new Date().toISOString(),
    };
    db.game_history.push(row);
    persist();
    return { lastID: id, changes: 1 };
  }

  // 13. UPDATE stats SET games_played = games_played + 1, wins = wins + 1 WHERE user_id = ?
  if (norm.includes('wins = wins + 1')) {
    const [uid] = params;
    let s = db.stats.find((x) => x.user_id === parseInt(uid, 10));
    if (!s) {
      s = { id: db.seq.stats++, user_id: parseInt(uid, 10), games_played: 0, wins: 0, losses: 0, draws: 0 };
      db.stats.push(s);
    }
    s.games_played++;
    s.wins++;
    persist();
    return { changes: 1 };
  }

  // 14. UPDATE stats SET games_played = games_played + 1, losses = losses + 1 WHERE user_id = ?
  if (norm.includes('losses = losses + 1')) {
    const [uid] = params;
    let s = db.stats.find((x) => x.user_id === parseInt(uid, 10));
    if (!s) {
      s = { id: db.seq.stats++, user_id: parseInt(uid, 10), games_played: 0, wins: 0, losses: 0, draws: 0 };
      db.stats.push(s);
    }
    s.games_played++;
    s.losses++;
    persist();
    return { changes: 1 };
  }

  // 15. UPDATE stats SET games_played = games_played + 1, draws = draws + 1 WHERE user_id = ?
  if (norm.includes('draws = draws + 1')) {
    const [uid] = params;
    let s = db.stats.find((x) => x.user_id === parseInt(uid, 10));
    if (!s) {
      s = { id: db.seq.stats++, user_id: parseInt(uid, 10), games_played: 0, wins: 0, losses: 0, draws: 0 };
      db.stats.push(s);
    }
    s.games_played++;
    s.draws++;
    persist();
    return { changes: 1 };
  }

  console.warn('Unhandled dbRun query:', norm);
  return { changes: 0 };
}

// ==========================================================
// dbGet(sql, params) -> returns single row or undefined
// ==========================================================
export async function dbGet(sql, params = []) {
  const norm = sql.trim().replace(/\s+/g, ' ');

  // 1. SELECT id, username, display_name, avatar, bio, created_at FROM users WHERE id = ?
  // OR SELECT id, username, display_name FROM users WHERE id = ?
  if (norm.startsWith('SELECT') && norm.includes('FROM users WHERE id = ?')) {
    const [id] = params;
    const user = db.users.find((u) => u.id === parseInt(id, 10));
    if (!user) return undefined;
    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      bio: user.bio,
      created_at: user.created_at,
    };
  }

  // 2. SELECT id FROM users WHERE username = ? COLLATE NOCASE
  // OR SELECT id, username, password_hash, display_name, avatar, bio, created_at FROM users WHERE username = ? COLLATE NOCASE
  if (norm.includes('FROM users WHERE username = ? COLLATE NOCASE')) {
    const [username] = params;
    if (!username) return undefined;
    const clean = String(username).trim().toLowerCase();
    const user = db.users.find((u) => {
      const uName = (u.username || '').toLowerCase();
      const dName = (u.display_name || '').toLowerCase();
      if (uName === clean || dName === clean) return true;
      if (clean.includes('@') && (uName === clean.split('@')[0] || dName === clean.split('@')[0])) return true;
      return false;
    });
    if (!user) return undefined;
    return { ...user };
  }

  // 3. SELECT games_played, wins, losses, draws FROM stats WHERE user_id = ?
  if (norm.includes('FROM stats WHERE user_id = ?')) {
    const [userId] = params;
    const s = db.stats.find((x) => x.user_id === parseInt(userId, 10));
    if (s) {
      return {
        games_played: s.games_played,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
      };
    }
    return { games_played: 0, wins: 0, losses: 0, draws: 0 };
  }

  // 4. SELECT password_hash FROM users WHERE id = ?
  if (norm.includes('SELECT password_hash FROM users WHERE id = ?')) {
    const [id] = params;
    const user = db.users.find((u) => u.id === parseInt(id, 10));
    return user ? { password_hash: user.password_hash } : undefined;
  }

  // 5. SELECT id, requester_id, receiver_id, status FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)
  if (norm.includes('FROM friends WHERE (requester_id = ?')) {
    const [u1, u2] = params;
    const id1 = parseInt(u1, 10);
    const id2 = parseInt(u2, 10);
    const match = db.friends.find(
      (r) => (r.requester_id === id1 && r.receiver_id === id2) || (r.requester_id === id2 && r.receiver_id === id1)
    );
    return match ? { ...match } : undefined;
  }

  // 6. SELECT id, requester_id, receiver_id FROM friends WHERE id = ? AND receiver_id = ? AND status = "pending"
  if (norm.includes('FROM friends WHERE id = ? AND receiver_id = ?')) {
    const [reqId, recId] = params;
    const match = db.friends.find(
      (r) => r.id === parseInt(reqId, 10) && r.receiver_id === parseInt(recId, 10) && r.status === 'pending'
    );
    return match ? { ...match } : undefined;
  }

  // 7. SELECT id FROM friends WHERE ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)) AND status = "accepted"
  if (norm.includes('status = "accepted"') && norm.includes('FROM friends')) {
    const [u1, u2] = params;
    const id1 = parseInt(u1, 10);
    const id2 = parseInt(u2, 10);
    const match = db.friends.find(
      (r) => ((r.requester_id === id1 && r.receiver_id === id2) || (r.requester_id === id2 && r.receiver_id === id1)) && r.status === 'accepted'
    );
    return match ? { id: match.id } : undefined;
  }

  console.warn('Unhandled dbGet query:', norm);
  return undefined;
}

// ==========================================================
// dbAll(sql, params) -> returns array of rows
// ==========================================================
export async function dbAll(sql, params = []) {
  const norm = sql.trim().replace(/\s+/g, ' ');

  // 1. Search users:
  if (norm.includes('FROM users WHERE') && (norm.includes('username LIKE ?') || norm.includes('display_name LIKE ?'))) {
    const searchStr = (params[0] || '').replace(/%/g, '').toLowerCase();
    const exId = parseInt(params[params.length - 1], 10) || 0;

    return db.users
      .filter((u) => u.id !== exId && (u.username.toLowerCase().includes(searchStr) || (u.display_name && u.display_name.toLowerCase().includes(searchStr))))
      .slice(0, 20)
      .map((u) => ({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        avatar: u.avatar,
        bio: u.bio,
        created_at: u.created_at,
      }));
  }

  // 2. Search friendships for multiple userIds:
  // SELECT id, requester_id, receiver_id, status FROM friends WHERE (requester_id = ? AND receiver_id IN (...)) OR (receiver_id = ? AND requester_id IN (...))
  if (norm.includes('FROM friends WHERE (requester_id = ? AND receiver_id IN')) {
    const [uid] = params;
    const myId = parseInt(uid, 10);

    return db.friends
      .filter((r) => r.requester_id === myId || r.receiver_id === myId)
      .map((r) => ({
        id: r.id,
        requester_id: r.requester_id,
        receiver_id: r.receiver_id,
        status: r.status,
      }));
  }

  // 3. Accepted friends list:
  // SELECT u.id, u.username, u.display_name, u.avatar, u.bio, f.created_at as friendship_date FROM friends f JOIN users u ...
  if (norm.includes('FROM friends f') && norm.includes("f.status = 'accepted'")) {
    const [uid] = params;
    const myId = parseInt(uid, 10);

    const rels = db.friends.filter(
      (r) => (r.requester_id === myId || r.receiver_id === myId) && r.status === 'accepted'
    );

    const results = [];
    for (const rel of rels) {
      const friendId = rel.requester_id === myId ? rel.receiver_id : rel.requester_id;
      const u = db.users.find((x) => x.id === friendId);
      if (u) {
        results.push({
          id: u.id,
          username: u.username,
          display_name: u.display_name,
          avatar: u.avatar,
          bio: u.bio,
          friendship_date: rel.created_at,
        });
      }
    }

    results.sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username));
    return results;
  }

  // 4. Pending requests received:
  // SELECT f.id as request_id, u.id as user_id, u.username, u.display_name, u.avatar, f.created_at FROM friends f JOIN users u ON u.id = f.requester_id WHERE f.receiver_id = ? AND f.status = 'pending'
  if (norm.includes('f.receiver_id = ? AND f.status = \'pending\'')) {
    const [uid] = params;
    const myId = parseInt(uid, 10);

    const reqs = db.friends.filter((r) => r.receiver_id === myId && r.status === 'pending');
    return reqs
      .map((r) => {
        const u = db.users.find((x) => x.id === r.requester_id) || {};
        return {
          request_id: r.id,
          user_id: u.id,
          username: u.username,
          display_name: u.display_name,
          avatar: u.avatar,
          created_at: r.created_at,
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // 5. Pending requests sent:
  // SELECT f.id as request_id, u.id as user_id, u.username, u.display_name, u.avatar, f.created_at FROM friends f JOIN users u ON u.id = f.receiver_id WHERE f.requester_id = ? AND f.status = 'pending'
  if (norm.includes('f.requester_id = ? AND f.status = \'pending\'')) {
    const [uid] = params;
    const myId = parseInt(uid, 10);

    const reqs = db.friends.filter((r) => r.requester_id === myId && r.status === 'pending');
    return reqs
      .map((r) => {
        const u = db.users.find((x) => x.id === r.receiver_id) || {};
        return {
          request_id: r.id,
          user_id: u.id,
          username: u.username,
          display_name: u.display_name,
          avatar: u.avatar,
          created_at: r.created_at,
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // 6. Game History:
  // SELECT h.*, u1.display_name as p1_name, u1.avatar as p1_avatar, u2.display_name as p2_name, u2.avatar as p2_avatar FROM game_history h JOIN users u1 ...
  if (norm.includes('FROM game_history h')) {
    const [uid] = params;
    const myId = parseInt(uid, 10);

    const history = db.game_history
      .filter((h) => {
        const p1 = !isNaN(Number(h.player1_id)) ? Number(h.player1_id) : String(h.player1_id);
        const p2 = !isNaN(Number(h.player2_id)) ? Number(h.player2_id) : String(h.player2_id);
        return p1 === myId || p2 === myId || String(p1) === String(myId) || String(p2) === String(myId);
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15);

    return history.map((h) => {
      const p1Id = !isNaN(Number(h.player1_id)) ? Number(h.player1_id) : String(h.player1_id);
      const p2Id = !isNaN(Number(h.player2_id)) ? Number(h.player2_id) : String(h.player2_id);

      let u1 = typeof p1Id === 'number' ? db.users.find((x) => x.id === p1Id) : null;
      let u2 = typeof p2Id === 'number' ? db.users.find((x) => x.id === p2Id) : null;

      if (p1Id === 999999 || String(p1Id) === 'bot') {
        u1 = { display_name: 'RoboCat (AI)', avatar: '🤖' };
      }
      if (p2Id === 999999 || String(p2Id) === 'bot') {
        u2 = { display_name: 'RoboCat (AI)', avatar: '🤖' };
      }

      return {
        ...h,
        player1_id: p1Id,
        player2_id: p2Id,
        winner_id: h.winner_id !== null && h.winner_id !== undefined ? (!isNaN(Number(h.winner_id)) ? Number(h.winner_id) : String(h.winner_id)) : null,
        p1_name: u1 ? (u1.display_name || u1.username || 'Player 1') : (typeof p1Id === 'string' && p1Id.startsWith('guest_') ? 'Guest' : 'Player 1'),
        p1_avatar: u1 ? (u1.avatar || '🎮') : '🎮',
        p2_name: u2 ? (u2.display_name || u2.username || 'Player 2') : (typeof p2Id === 'string' && p2Id.startsWith('guest_') ? 'Guest' : 'Player 2'),
        p2_avatar: u2 ? (u2.avatar || '🎮') : '🎮',
      };
    });
  }

  console.warn('Unhandled dbAll query:', norm);
  return [];
}
