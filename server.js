import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbRun, dbGet, dbAll, initDb, getPublicAccounts, saveDirectMessage, getDirectMessages, getLastDirectMessage, getLobbyChatHistory, saveLobbyChatMessage } from './database.js';

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gameroom_super_secret_jwt_key_production_ready';

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS support
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 30000,
  pingInterval: 10000,
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static frontend files from /public
app.use(express.static(path.join(process.cwd(), 'public')));

// Helper: Sanitize string for XSS prevention
function sanitizeText(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

// Generate unique 6-character room code (e.g. ABC123)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// JWT Token Authentication Middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.cookies?.gameroom_token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await dbGet('SELECT id, username, display_name, avatar, bio, created_at FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session' });
  }
}

// Optional JWT Token Authentication Middleware (attaches req.user if present, else req.user = null)
async function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.cookies?.gameroom_token;

  if (!token || token === 'null' || token === 'undefined') {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await dbGet('SELECT id, username, display_name, avatar, bio, created_at FROM users WHERE id = ?', [decoded.id]);
    req.user = user || null;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

// ==========================================
// REST API ROUTES
// ==========================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'GameRoom' });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;

    if (!username || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const trimmedUsername = username.trim();

    // Validation
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters.' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    // Check uniqueness
    const existing = await dbGet('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [trimmedUsername]);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists.' });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const defaultAvatars = ['🎮', '⚡', '🔥', '👾', '🚀', '👑', '🎯', '🐱', '🐺', '🦊', '🐉', '🏆'];
    const randomAvatar = defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];

    const result = await dbRun(
      'INSERT INTO users (username, password_hash, display_name, avatar, bio) VALUES (?, ?, ?, ?, ?)',
      [trimmedUsername, password_hash, trimmedUsername, randomAvatar, "Let's play!"]
    );

    const userId = result.lastID;

    // Initialize stats
    await dbRun('INSERT INTO stats (user_id, games_played, wins, losses, draws) VALUES (?, 0, 0, 0, 0)', [userId]);

    const user = {
      id: userId,
      username: trimmedUsername,
      display_name: trimmedUsername,
      avatar: randomAvatar,
      bio: "Let's play!",
      created_at: new Date().toISOString(),
    };

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('gameroom_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    return res.status(201).json({ user, token });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Server error during registration. Please try again.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Please provide both username and password.' });
    }

    const trimmedInput = String(username).trim();
    const user = await dbGet(
      'SELECT id, username, password_hash, display_name, avatar, bio, created_at FROM users WHERE username = ? COLLATE NOCASE',
      [trimmedInput]
    );

    if (!user) {
      return res.status(401).json({ error: 'No account found with that username or display name. Check your spelling or create an account.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password for this account. You can use "Reset Password" if you forgot it.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('gameroom_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    const safeUser = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      bio: user.bio,
      created_at: user.created_at,
    };

    return res.json({ user: safeUser, token });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login. Please try again.' });
  }
});

// Reset Password (direct recovery for accounts)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { username, newPassword, confirmPassword } = req.body;

    if (!username || !newPassword) {
      return res.status(400).json({ error: 'Please enter your username and new password.' });
    }

    const trimmedInput = String(username).trim();
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const user = await dbGet(
      'SELECT id, username, password_hash, display_name, avatar, bio, created_at FROM users WHERE username = ? COLLATE NOCASE',
      [trimmedInput]
    );

    if (!user) {
      return res.status(404).json({ error: 'No account found with that username or display name.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);
    await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, user.id]);

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('gameroom_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    const safeUser = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      bio: user.bio,
      created_at: user.created_at,
    };

    return res.json({
      success: true,
      message: 'Password updated successfully! Logging you in...',
      user: safeUser,
      token,
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Server error resetting password. Please try again.' });
  }
});

// List existing accounts summary for quick-pick / login assistance
app.get('/api/auth/accounts', (req, res) => {
  try {
    const accounts = getPublicAccounts();
    return res.json({ accounts });
  } catch (err) {
    return res.json({ accounts: [] });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('gameroom_token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Current User profile with statistics
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const stats = await dbGet('SELECT games_played, wins, losses, draws FROM stats WHERE user_id = ?', [req.user.id]);
    // Also re-sign / refresh token so client keeps long-lived session active
    const token = jwt.sign({ id: req.user.id, username: req.user.username }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      user: req.user,
      token,
      stats: stats || { games_played: 0, wins: 0, losses: 0, draws: 0 },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// Update Profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { display_name, avatar, bio, current_password, new_password } = req.body;
    const userId = req.user.id;

    if (display_name) {
      const sanitizedName = sanitizeText(display_name);
      if (sanitizedName.length > 30) {
        return res.status(400).json({ error: 'Display name cannot exceed 30 characters.' });
      }
      await dbRun('UPDATE users SET display_name = ? WHERE id = ?', [sanitizedName, userId]);
    }

    if (avatar) {
      await dbRun('UPDATE users SET avatar = ? WHERE id = ?', [avatar, userId]);
    }

    if (bio !== undefined) {
      const sanitizedBio = sanitizeText(bio).slice(0, 160);
      await dbRun('UPDATE users SET bio = ? WHERE id = ?', [sanitizedBio, userId]);
    }

    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ error: 'Current password is required to set a new password.' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      }

      const userRow = await dbGet('SELECT password_hash FROM users WHERE id = ?', [userId]);
      const valid = await bcrypt.compare(current_password, userRow.password_hash);
      if (!valid) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }

      const newHash = await bcrypt.hash(new_password, 10);
      await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
    }

    const updatedUser = await dbGet('SELECT id, username, display_name, avatar, bio, created_at FROM users WHERE id = ?', [userId]);
    const stats = await dbGet('SELECT games_played, wins, losses, draws FROM stats WHERE user_id = ?', [userId]);

    return res.json({ user: updatedUser, stats });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// Search Users (Publicly searchable with optional friendship enrichment)
app.get('/api/users/search', optionalAuthenticateToken, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({ users: [] });
    }

    const currentUserId = req.user?.id || 0;
    const users = await dbAll(
      `SELECT id, username, display_name, avatar, bio, created_at 
       FROM users 
       WHERE (username LIKE ? OR display_name LIKE ?) AND id != ?
       LIMIT 20`,
      [`%${q}%`, `%${q}%`, currentUserId]
    );

    // Attach friendship status and online presence if user is authenticated
    const userIds = users.map((u) => u.id);
    let friendships = [];
    if (currentUserId && userIds.length > 0) {
      friendships = await dbAll(
        `SELECT id, requester_id, receiver_id, status 
         FROM friends 
         WHERE (requester_id = ? AND receiver_id IN (${userIds.join(',')}))
            OR (receiver_id = ? AND requester_id IN (${userIds.join(',')}))`,
        [currentUserId, currentUserId]
      );
    }

    const enriched = users.map((u) => {
      let friendStatus = 'none';
      let friendRequestId = null;
      if (currentUserId) {
        const relation = friendships.find(
          (f) => (f.requester_id === currentUserId && f.receiver_id === u.id) || (f.receiver_id === currentUserId && f.requester_id === u.id)
        );

        if (relation) {
          if (relation.status === 'accepted') {
            friendStatus = 'friends';
          } else if (relation.requester_id === currentUserId) {
            friendStatus = 'pending_sent';
          } else {
            friendStatus = 'pending_received';
          }
          friendRequestId = relation.id;
        }
      }

      return {
        ...u,
        friendStatus,
        friendRequestId,
        isOnline: isUserOnline(u.id),
        presence: getUserPresence(u.id),
      };
    });

    return res.json({ users: enriched });
  } catch (err) {
    console.error('User search error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
});

// Public profile viewer (for player profile popup)
app.get('/api/users/:userId', optionalAuthenticateToken, async (req, res) => {
  try {
    const targetId = parseInt(req.params.userId, 10);
    const user = await dbGet('SELECT id, username, display_name, avatar, bio, created_at FROM users WHERE id = ?', [targetId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const stats = await dbGet('SELECT games_played, wins, losses, draws FROM stats WHERE user_id = ?', [targetId]);
    return res.json({
      user,
      stats: stats || { games_played: 0, wins: 0, losses: 0, draws: 0 },
      isOnline: isUserOnline(targetId),
      presence: getUserPresence(targetId),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user details.' });
  }
});

// Friends list & pending requests
app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Accepted friends
    const friends = await dbAll(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.bio, f.created_at as friendship_date
       FROM friends f
       JOIN users u ON (u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END)
       WHERE (f.requester_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'
       ORDER BY u.display_name ASC`,
      [userId, userId, userId]
    );

    const friendsWithPresence = friends.map((f) => {
      const lastMsg = getLastDirectMessage(userId, f.id);
      return {
        ...f,
        isOnline: isUserOnline(f.id),
        presence: getUserPresence(f.id),
        lastMessage: lastMsg
          ? {
              text: lastMsg.text,
              createdAt: lastMsg.created_at,
              senderId: lastMsg.sender_id,
              isMine: lastMsg.sender_id === userId,
            }
          : null,
      };
    });

    // Pending requests received
    const requestsReceived = await dbAll(
      `SELECT f.id as request_id, u.id as user_id, u.username, u.display_name, u.avatar, f.created_at
       FROM friends f
       JOIN users u ON u.id = f.requester_id
       WHERE f.receiver_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    // Pending requests sent
    const requestsSent = await dbAll(
      `SELECT f.id as request_id, u.id as user_id, u.username, u.display_name, u.avatar, f.created_at
       FROM friends f
       JOIN users u ON u.id = f.receiver_id
       WHERE f.requester_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    return res.json({
      friends: friendsWithPresence,
      requestsReceived,
      requestsSent,
    });
  } catch (err) {
    console.error('Fetch friends error:', err);
    return res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Send friend request
app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.body.targetUserId || req.body.receiverId;
    const requesterId = req.user.id;
    const receiverId = parseInt(targetUserId, 10);

    if (!receiverId || receiverId === requesterId) {
      return res.status(400).json({ error: 'Invalid user target.' });
    }

    const targetUser = await dbGet('SELECT id, username, display_name FROM users WHERE id = ?', [receiverId]);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check existing relation
    const existing = await dbGet(
      'SELECT id, requester_id, receiver_id, status FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)',
      [requesterId, receiverId, receiverId, requesterId]
    );

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'You are already friends with this user.' });
      }
      if (existing.status === 'pending') {
        if (existing.requester_id === requesterId) {
          return res.status(400).json({ error: 'Friend request already sent.' });
        } else {
          // Auto-accept if recipient also sent
          await dbRun("UPDATE friends SET status = 'accepted' WHERE id = ?", [existing.id]);
          notifyFriendStatusChange(requesterId, receiverId, 'accepted');
          return res.json({ success: true, message: 'Friend request accepted!' });
        }
      }
      // If rejected earlier, update to pending
      await dbRun("UPDATE friends SET requester_id = ?, receiver_id = ?, status = 'pending', created_at = CURRENT_TIMESTAMP WHERE id = ?", [
        requesterId,
        receiverId,
        existing.id,
      ]);
    } else {
      await dbRun('INSERT INTO friends (requester_id, receiver_id, status) VALUES (?, ?, ?)', [requesterId, receiverId, 'pending']);
    }

    // Real-time socket notification to receiver if online
    sendSocketToUser(receiverId, 'friend_request', {
      sender: req.user,
      message: `${req.user.display_name} sent you a friend request.`,
    });

    return res.json({ success: true, message: 'Friend request sent!' });
  } catch (err) {
    console.error('Send friend request error:', err);
    return res.status(500).json({ error: 'Failed to send friend request.' });
  }
});

// Accept or reject friend request
app.post('/api/friends/respond', authenticateToken, async (req, res) => {
  try {
    const { requestId, action } = req.body; // action: 'accept' or 'reject'
    const userId = req.user.id;

    const request = await dbGet('SELECT id, requester_id, receiver_id FROM friends WHERE id = ? AND receiver_id = ? AND status = "pending"', [
      requestId,
      userId,
    ]);

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found or already handled.' });
    }

    if (action === 'accept') {
      await dbRun("UPDATE friends SET status = 'accepted' WHERE id = ?", [requestId]);

      // Notify requester
      sendSocketToUser(request.requester_id, 'friend_request_accepted', {
        user: req.user,
        message: `${req.user.display_name} accepted your friend request!`,
      });

      broadcastPresenceUpdate(userId);
      broadcastPresenceUpdate(request.requester_id);

      return res.json({ success: true, message: 'Friend request accepted.' });
    } else {
      await dbRun('DELETE FROM friends WHERE id = ?', [requestId]);
      return res.json({ success: true, message: 'Friend request rejected.' });
    }
  } catch (err) {
    console.error('Respond friend request error:', err);
    return res.status(500).json({ error: 'Failed to process response.' });
  }
});

// Remove Friend
app.delete('/api/friends/:friendId', authenticateToken, async (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    const userId = req.user.id;

    await dbRun(
      'DELETE FROM friends WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)',
      [userId, friendId, friendId, userId]
    );

    sendSocketToUser(friendId, 'friend_removed', { userId });
    broadcastPresenceUpdate(userId);
    broadcastPresenceUpdate(friendId);

    return res.json({ success: true, message: 'Friend removed.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove friend.' });
  }
});

// ==========================================
// 1-ON-1 DIRECT MESSAGING (INSTAGRAM DM)
// ==========================================

// Get Direct Messages history with a friend
app.get('/api/dm/:friendId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId, 10);
    if (!friendId) {
      return res.status(400).json({ error: 'Invalid friend ID.' });
    }

    const friend = await dbGet('SELECT id, username, display_name, avatar, bio FROM users WHERE id = ?', [friendId]);
    if (!friend) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const rawMessages = getDirectMessages(userId, friendId);
    const messages = rawMessages.map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      receiverId: m.receiver_id,
      text: m.text,
      createdAt: m.created_at,
      timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMine: m.sender_id === userId,
    }));

    return res.json({
      friend: {
        ...friend,
        isOnline: isUserOnline(friendId),
        presence: getUserPresence(friendId),
      },
      messages,
    });
  } catch (err) {
    console.error('Fetch DM error:', err);
    return res.status(500).json({ error: 'Failed to fetch direct messages.' });
  }
});

// Send Direct Message via REST
app.post('/api/dm/:friendId', authenticateToken, async (req, res) => {
  try {
    const senderId = req.user.id;
    const friendId = parseInt(req.params.friendId, 10);
    let text = sanitizeText(req.body.text || '').trim();

    if (!friendId) {
      return res.status(400).json({ error: 'Invalid friend ID.' });
    }
    if (!text) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }
    if (text.length > 300) {
      text = text.slice(0, 300);
    }

    const saved = saveDirectMessage(senderId, friendId, text);
    const payload = {
      id: saved.id,
      senderId,
      receiverId: friendId,
      sender: req.user,
      text: saved.text,
      createdAt: saved.created_at,
      timestamp: new Date(saved.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMine: false,
    };

    // Emit to both recipient and sender sockets in real-time
    sendSocketToUser(friendId, 'dm_message', payload);
    sendSocketToUser(senderId, 'dm_message', { ...payload, isMine: true });

    return res.json({ success: true, message: { ...payload, isMine: true } });
  } catch (err) {
    console.error('Send DM error:', err);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
});

// User Recent Game History
app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    const history = await dbAll(
      `SELECT h.*, 
              u1.display_name as p1_name, u1.avatar as p1_avatar,
              u2.display_name as p2_name, u2.avatar as p2_avatar
       FROM game_history h
       LEFT JOIN users u1 ON u1.id = h.player1_id
       LEFT JOIN users u2 ON u2.id = h.player2_id
       WHERE h.player1_id = ? OR h.player2_id = ?
       ORDER BY h.created_at DESC
       LIMIT 10`,
      [req.user.id, req.user.id]
    );
    return res.json({ history: history || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// ==========================================
// REAL-TIME MULTIPLAYER & SOCKET.IO SYSTEM
// ==========================================

// In-Memory state management
// connectedUsers: Map(userId -> { socketIds: Set, user: Object, status: String, roomCode: String | null })
const connectedUsers = new Map();

// socketToUser: Map(socketId -> userId)
const socketToUser = new Map();

// rooms: Map(roomCode -> RoomObject)
const rooms = new Map();

// invitations: Map(inviteId -> InviteObject)
const invitations = new Map();

// Lobby Chat history (persisted in database, last 60 messages)
const lobbyChatHistory = getLobbyChatHistory(60);

// Rate limiting for chat
const chatRateLimits = new Map();

function isUserOnline(userId) {
  const data = connectedUsers.get(userId) || connectedUsers.get(Number(userId)) || connectedUsers.get(String(userId));
  return !!(data && data.socketIds && data.socketIds.size > 0);
}

function getUserPresence(userId) {
  const data = connectedUsers.get(userId) || connectedUsers.get(Number(userId)) || connectedUsers.get(String(userId));
  if (!data || !data.socketIds || data.socketIds.size === 0) return 'Offline';
  return data.status || 'Online';
}

function sendSocketToUser(userId, event, payload) {
  const data = connectedUsers.get(userId) || connectedUsers.get(Number(userId)) || connectedUsers.get(String(userId));
  if (data && data.socketIds) {
    for (const sid of data.socketIds) {
      io.to(sid).emit(event, payload);
    }
  }
}

function broadcastPresenceUpdate(userId) {
  const presence = getUserPresence(userId);
  io.emit('presence_update', {
    userId,
    isOnline: isUserOnline(userId),
    status: presence,
  });
}

function notifyFriendStatusChange(user1, user2, status) {
  sendSocketToUser(user1, 'friend_status_updated', { friendId: user2, status });
  sendSocketToUser(user2, 'friend_status_updated', { friendId: user1, status });
}

// Helper: Broadcast current public lobby count
function emitLobbyOnlineCount() {
  const count = connectedUsers.size || 1;
  io.to('lobby').emit('lobby_online_count', { count });
}

// Socket authentication & guest middleware (Allows public lobby access)
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await dbGet('SELECT id, username, display_name, avatar, bio FROM users WHERE id = ?', [decoded.id]);
      if (user) {
        socket.userId = user.id;
        socket.username = user.username;
        socket.user = { ...user, isGuest: false };
        socket.isGuest = false;
        return next();
      }
    } catch (err) {
      // Invalid/expired token - gracefully fallback to guest so visitors can still chat!
    }
  }

  // Fallback: Public Lobby Guest Session
  const guestAuth = socket.handshake.auth || {};
  let guestName = sanitizeText(guestAuth.guestName || '').slice(0, 20);
  if (!guestName || guestName.length < 2) {
    guestName = 'Guest_' + Math.floor(1000 + Math.random() * 9000);
  }
  const guestAvatar = guestAuth.guestAvatar || '🐱';
  const guestId = guestAuth.guestId || ('guest_' + Math.random().toString(36).substr(2, 7));

  socket.userId = guestId;
  socket.username = guestName;
  socket.isGuest = true;
  socket.user = {
    id: guestId,
    username: guestName,
    display_name: guestName,
    avatar: guestAvatar,
    bio: 'Public Lobby Visitor',
    isGuest: true,
  };

  next();
});

// Socket.IO Event Handlers
io.on('connection', async (socket) => {
  const userId = socket.userId;
  socketToUser.set(socket.id, userId);

  // Use prepared user from middleware
  const user = socket.user;

  // Track connected user
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, {
      socketIds: new Set([socket.id]),
      user,
      status: 'Online in Lobby',
      roomCode: null,
      isGuest: socket.isGuest,
    });
  } else {
    connectedUsers.get(userId).socketIds.add(socket.id);
  }

  // Join global lobby room for live lobby chat & presence broadcasts
  socket.join('lobby');

  // Broadcast updated lobby online count
  emitLobbyOnlineCount();

  // Broadcast presence for registered users
  if (!socket.isGuest) {
    broadcastPresenceUpdate(userId);
  }

  // Send initial recent lobby chat to newly connected socket
  socket.emit('lobby_history', lobbyChatHistory.slice(-35));

  // Handle Guest Profile / Nickname Update on the fly
  socket.on('update_guest_profile', (data) => {
    if (!socket.isGuest) return;
    const newName = sanitizeText(data?.name || '').slice(0, 20);
    const newAvatar = data?.avatar || '🐱';
    if (newName && newName.length >= 2) {
      socket.username = newName;
      socket.user.username = newName;
      socket.user.display_name = newName;
    }
    if (newAvatar) {
      socket.user.avatar = newAvatar;
    }
    const tracked = connectedUsers.get(userId);
    if (tracked) {
      tracked.user = socket.user;
    }
    socket.emit('guest_profile_updated', socket.user);
    emitLobbyOnlineCount();
  });

  // Handle Lobby Chat Message
  socket.on('lobby_message', (data) => {
    try {
      const now = Date.now();
      const lastMsg = chatRateLimits.get(userId) || 0;
      if (now - lastMsg < 350) {
        return socket.emit('chat_error', { message: 'Slow down! Sending messages too quickly.' });
      }
      chatRateLimits.set(userId, now);

      let text = sanitizeText(data?.text || '');
      if (!text || text.length === 0) return;
      if (text.length > 150) {
        text = text.slice(0, 150);
      }

      // Random slight horizontal offset for floating bubbles
      const randomOffset = Math.floor(Math.random() * 24) - 12;

      const messageObj = {
        id: 'l_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        sender: socket.user,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        offsetX: randomOffset,
      };

      lobbyChatHistory.push(messageObj);
      if (lobbyChatHistory.length > 60) lobbyChatHistory.shift();
      saveLobbyChatMessage(messageObj);

      io.to('lobby').emit('lobby_message', messageObj);
    } catch (e) {
      console.error('Lobby chat error:', e);
    }
  });

  // Handle Real-time 1-on-1 Direct Message (Instagram DM)
  socket.on('send_dm', async ({ receiverId, text }) => {
    try {
      const senderId = socket.userId;
      const recId = parseInt(receiverId, 10);
      if (!senderId || !recId) return;

      let cleanText = sanitizeText(text || '').trim();
      if (!cleanText) return;
      if (cleanText.length > 300) cleanText = cleanText.slice(0, 300);

      const saved = saveDirectMessage(senderId, recId, cleanText);
      const payload = {
        id: saved.id,
        senderId,
        receiverId: recId,
        sender: socket.user,
        text: saved.text,
        createdAt: saved.created_at,
        timestamp: new Date(saved.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      // Real-time deliver to recipient
      sendSocketToUser(recId, 'dm_message', { ...payload, isMine: false });
      // Echo confirmation to sender
      sendSocketToUser(senderId, 'dm_message', { ...payload, isMine: true });
    } catch (e) {
      console.error('Socket send_dm error:', e);
    }
  });

  // Fetch DM conversation history via socket
  socket.on('get_dm_history', async ({ friendId }) => {
    try {
      const senderId = socket.userId;
      const recId = parseInt(friendId, 10);
      if (!senderId || !recId) return;

      const rawMessages = getDirectMessages(senderId, recId);
      const messages = rawMessages.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        receiverId: m.receiver_id,
        text: m.text,
        createdAt: m.created_at,
        timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isMine: m.sender_id === senderId,
      }));

      socket.emit('dm_history', { friendId: recId, messages });
    } catch (e) {
      console.error('Socket get_dm_history error:', e);
    }
  });

  // ==========================================
  // GAME ROOM LOGIC
  // ==========================================

  // Create Room
  socket.on('create_room', ({ gameType }) => {
    try {
      const allowedGames = ['tictactoe', 'rps', 'connect4'];
      const normalizedGame = allowedGames.includes(gameType) ? gameType : 'tictactoe';

      let roomCode = generateRoomCode();
      while (rooms.has(roomCode)) {
        roomCode = generateRoomCode();
      }

      // Clean up previous room if user was in one
      leaveCurrentRoom(socket);

      const newRoom = {
        code: roomCode,
        gameType: normalizedGame,
        state: 'WAITING', // WAITING, PLAYING, FINISHED
        isBotGame: false,
        players: [
          {
            id: socket.user.id,
            username: socket.user.username,
            display_name: socket.user.display_name,
            avatar: socket.user.avatar,
            socketId: socket.id,
            symbol: normalizedGame === 'tictactoe' ? 'X' : normalizedGame === 'connect4' ? '🔴' : null,
            score: 0,
            connected: true,
          },
        ],
        gameState: initializeGameState(normalizedGame, socket.user.id),
        rematchVotes: new Set(),
        chatHistory: [],
        createdAt: Date.now(),
      };

      rooms.set(roomCode, newRoom);
      socket.join(`room_${roomCode}`);

      // Update presence
      updateUserPresence(socket.user.id, 'Waiting in Room', roomCode);

      socket.emit('room_created', {
        room: sanitizeRoomForClient(newRoom, socket.user.id),
      });
    } catch (err) {
      console.error('Create room error:', err);
      socket.emit('error_message', { message: 'Failed to create room.' });
    }
  });

  // Start Instant Game vs AI Bot
  socket.on('start_bot_game', ({ gameType }) => {
    try {
      leaveCurrentRoom(socket);
      let roomCode = generateRoomCode();
      while (rooms.has(roomCode)) {
        roomCode = generateRoomCode();
      }
      const normalizedGame = ['tictactoe', 'rps', 'connect4'].includes(gameType) ? gameType : 'tictactoe';
      const playerSymbol = normalizedGame === 'tictactoe' ? 'X' : normalizedGame === 'connect4' ? '🔴' : null;
      const botSymbol = normalizedGame === 'tictactoe' ? 'O' : normalizedGame === 'connect4' ? '🟡' : null;

      const newRoom = {
        code: roomCode,
        gameType: normalizedGame,
        state: 'PLAYING',
        isBotGame: true,
        players: [
          {
            id: socket.user.id,
            username: socket.user.username,
            display_name: socket.user.display_name,
            avatar: socket.user.avatar,
            socketId: socket.id,
            symbol: playerSymbol,
            score: 0,
            connected: true,
          },
          {
            id: BOT_ID,
            username: 'robocat_ai',
            display_name: 'RoboCat (AI)',
            avatar: '🤖',
            socketId: null,
            symbol: botSymbol,
            score: 0,
            connected: true,
            isBot: true,
          },
        ],
        gameState: initializeGameState(normalizedGame, socket.user.id),
        rematchVotes: new Set(),
        chatHistory: [],
        createdAt: Date.now(),
      };

      rooms.set(roomCode, newRoom);
      socket.join(`room_${roomCode}`);
      updateUserPresence(socket.user.id, getGamePresenceName(normalizedGame), roomCode);

      socket.emit('game_start', {
        room: sanitizeRoomForClient(newRoom, socket.user.id),
        message: 'Match against RoboCat (AI) started!',
      });

      setTimeout(() => {
        sendBotChatMessage(newRoom, "Beep boop! 🤖 Good luck, human! Let's have a great match! 🐾");
      }, 500);
    } catch (err) {
      console.error('start_bot_game error:', err);
    }
  });

  // Add Bot to waiting room
  socket.on('add_bot_to_room', ({ roomCode }) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.players.length >= 2) return;

      const botSymbol = room.gameType === 'tictactoe' ? 'O' : room.gameType === 'connect4' ? '🟡' : null;
      room.players.push({
        id: BOT_ID,
        username: 'robocat_ai',
        display_name: 'RoboCat (AI)',
        avatar: '🤖',
        socketId: null,
        symbol: botSymbol,
        score: 0,
        connected: true,
        isBot: true,
      });

      room.state = 'PLAYING';
      room.isBotGame = true;
      if (room.gameState) {
        room.gameState.currentTurn = room.players[0].id;
      }
      updateUserPresence(socket.user.id, getGamePresenceName(room.gameType), code);

      io.to(`room_${code}`).emit('game_start', {
        room: sanitizeRoomForClient(room, socket.user.id),
        message: 'RoboCat (AI) joined! Game begins!',
      });

      setTimeout(() => {
        sendBotChatMessage(room, "Beep boop! 🤖 I'm here to challenge you! Let's play!");
      }, 500);
    } catch (err) {
      console.error('add_bot_to_room error:', err);
    }
  });

  // Join Room
  socket.on('join_room', ({ roomCode }) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        return socket.emit('error_message', { message: 'Room not found. Check the room code and try again.' });
      }

      // Check if user is already in this room (reconnection)
      const existingPlayer = room.players.find((p) => p.id === socket.user.id);
      if (existingPlayer) {
        existingPlayer.socketId = socket.id;
        existingPlayer.connected = true;
        socket.join(`room_${code}`);
        updateUserPresence(socket.user.id, getGamePresenceName(room.gameType), code);

        io.to(`room_${code}`).emit('player_reconnected', {
          user: socket.user,
          room: sanitizeRoomForClient(room, socket.user.id),
        });
        return socket.emit('room_joined', {
          room: sanitizeRoomForClient(room, socket.user.id),
        });
      }

      // Ensure no leftover bot player exists in room
      room.players = room.players.filter((p) => String(p.id) !== String(BOT_ID));

      // Check player limit (Max 2 players!)
      if (room.players.length >= 2) {
        return socket.emit('error_message', { message: 'This game already has two players. Room is full.' });
      }

      // Clean up previous room
      leaveCurrentRoom(socket);

      // Add as second player
      const symbol = room.gameType === 'tictactoe' ? 'O' : room.gameType === 'connect4' ? '🟡' : null;

      room.players.push({
        id: socket.user.id,
        username: socket.user.username,
        display_name: socket.user.display_name,
        avatar: socket.user.avatar,
        socketId: socket.id,
        symbol,
        score: 0,
        connected: true,
      });

      socket.join(`room_${code}`);

      // Two players are now present! Start 1v1 human match
      room.state = 'PLAYING';
      room.isBotGame = false;
      // Setup turn order
      if (room.gameState) {
        room.gameState.currentTurn = room.players[0].id;
      }

      const presenceName = getGamePresenceName(room.gameType);
      updateUserPresence(room.players[0].id, presenceName, code);
      updateUserPresence(room.players[1].id, presenceName, code);

      // Notify player 1 that player 2 joined
      socket.to(`room_${code}`).emit('player_joined', {
        user: socket.user,
        message: `${socket.user.display_name} joined the game!`,
      });

      // Broadcast game_start and state to both players
      io.to(`room_${code}`).emit('game_start', {
        room: sanitizeRoomForClient(room, null),
        message: 'Both players ready! Game begins!',
      });
    } catch (err) {
      console.error('Join room error:', err);
      socket.emit('error_message', { message: 'Failed to join room.' });
    }
  });

  // Game Move (Server Authoritative)
  const processGameMove = async (socketUser, roomCode, move) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room || room.state !== 'PLAYING') {
        return socket.emit('error_message', { message: 'Game is not in active play state.' });
      }

      const player = room.players.find((p) => String(p.id) === String(socketUser.id));
      if (!player) {
        return socket.emit('error_message', { message: 'You are not a player in this room.' });
      }

      // Route to game-specific logic
      if (room.gameType === 'tictactoe') {
        handleTicTacToeMove(room, socketUser.id, move);
      } else if (room.gameType === 'rps') {
        handleRpsMove(room, socketUser.id, move);
      } else if (room.gameType === 'connect4') {
        handleConnect4Move(room, socketUser.id, move);
      }
    } catch (err) {
      console.error('Game move error:', err);
    }
  };

  socket.on('game_move', async ({ roomCode, move }) => {
    await processGameMove(socket.user, roomCode, move);
  });

  socket.on('game_action', async (data = {}) => {
    const code = data.roomCode || data.roomId || data.code;
    const move = data.move || (data.action?.choice ? { choice: data.action.choice } : data.action) || data;
    await processGameMove(socket.user, code, move);
  });

  // Rematch / Play Again handler
  const handleRematchVote = ({ roomCode }) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;

      room.rematchVotes.add(socket.user.id);

      // Notify other player that a rematch was requested
      const rematchPayload = {
        userId: socket.user.id,
        userName: socket.user.display_name,
        user: socket.user,
        message: `${socket.user.display_name} wants a rematch!`,
      };
      socket.to(`room_${code}`).emit('rematch_requested', rematchPayload);
      socket.to(`room_${code}`).emit('rematch_offered', rematchPayload);

      // If playing vs Bot, the bot auto-accepts the rematch immediately
      if (room.isBotGame) {
        setTimeout(() => {
          room.rematchVotes.add(BOT_ID);
          if (room.rematchVotes.size >= 2) {
            room.rematchVotes.clear();
            room.state = 'PLAYING';
            room.players.reverse();
            room.players.forEach((p) => { p.score = 0; });
            if (room.gameType === 'tictactoe') {
              room.players[0].symbol = 'X';
              room.players[1].symbol = 'O';
            } else if (room.gameType === 'connect4') {
              room.players[0].symbol = '🔴';
              room.players[1].symbol = '🟡';
            }
            room.gameState = initializeGameState(room.gameType, room.players[0].id);

            const sanitized = sanitizeRoomForClient(room, null);
            io.to(`room_${code}`).emit('game_restart', {
              room: sanitized,
              message: 'Rematch started! Good luck!',
            });
            io.to(`room_${code}`).emit('rematch_started', {
              room: sanitized,
              message: 'Rematch started! Good luck!',
            });

            if (String(room.gameState.currentTurn) === String(BOT_ID)) {
              if (room.gameType === 'tictactoe') triggerBotTicTacToeMove(room);
              else if (room.gameType === 'connect4') triggerBotConnect4Move(room);
            }
          }
        }, 400);
        return;
      }

      // If both players voted rematch, reset game!
      if (room.rematchVotes.size >= 2) {
        room.rematchVotes.clear();
        room.state = 'PLAYING';

        // Alternate starting player for fairness
        room.players.reverse(); // swap order so alternate player goes first
        room.players.forEach((p) => { p.score = 0; });
        if (room.gameType === 'tictactoe') {
          room.players[0].symbol = 'X';
          room.players[1].symbol = 'O';
        } else if (room.gameType === 'connect4') {
          room.players[0].symbol = '🔴';
          room.players[1].symbol = '🟡';
        }

        room.gameState = initializeGameState(room.gameType, room.players[0].id);

        const sanitized = sanitizeRoomForClient(room, null);
        io.to(`room_${code}`).emit('game_restart', {
          room: sanitized,
          message: 'Rematch started! Good luck!',
        });
        io.to(`room_${code}`).emit('rematch_started', {
          room: sanitized,
          message: 'Rematch started! Good luck!',
        });
      }
    } catch (err) {
      console.error('Rematch error:', err);
    }
  };

  socket.on('game_rematch', handleRematchVote);
  socket.on('request_rematch', handleRematchVote);

  // Game Room In-Game Live Chat
  socket.on('game_chat', ({ roomCode, text }) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;

      const now = Date.now();
      const lastMsg = chatRateLimits.get(userId) || 0;
      if (now - lastMsg < 400) return;
      chatRateLimits.set(userId, now);

      let cleanText = sanitizeText(text || '');
      if (!cleanText) return;
      if (cleanText.length > 150) cleanText = cleanText.slice(0, 150);

      const offset = Math.floor(Math.random() * 24) - 12;

      const msg = {
        id: 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        sender: socket.user,
        text: cleanText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        offsetX: offset,
      };

      room.chatHistory.push(msg);
      if (room.chatHistory.length > 40) room.chatHistory.shift();

      io.to(`room_${code}`).emit('game_chat_message', msg);

      // In bot matches, RoboCat AI replies with live in-game banter
      if (room.isBotGame && !room.gameState?.winner && !room.gameState?.isDraw) {
        setTimeout(() => {
          if (rooms.has(code)) {
            const botReplies = [
              "Nice move! 🎯",
              "I'm calculating my next play! 🧠",
              "You're a skilled player! ✨",
              "Let's see how this round goes! 🐱",
              "Meow! Having a blast! 🐾",
              "Focus mode activated! ⚡"
            ];
            const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
            sendBotChatMessage(room, reply);
          }
        }, 1100);
      }
    } catch (err) {
      console.error('Game chat error:', err);
    }
  });

  // Leave Room
  socket.on('leave_room', ({ roomCode }) => {
    leaveCurrentRoom(socket, true);
  });

  // ==========================================
  // GAME INVITATION SYSTEM
  // ==========================================

  // Send Invitation to Online Friend
  socket.on('send_invitation', async ({ friendId, gameType }) => {
    try {
      const targetUserId = parseInt(friendId, 10);
      if (!targetUserId || targetUserId === socket.user.id) {
        return socket.emit('error_message', { message: 'Invalid friend selection.' });
      }

      // Verify friendship
      const friendship = await dbGet(
        'SELECT id FROM friends WHERE ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)) AND status = "accepted"',
        [socket.user.id, targetUserId, targetUserId, socket.user.id]
      );

      if (!friendship) {
        return socket.emit('error_message', { message: 'You can only invite friends to games.' });
      }

      if (!isUserOnline(targetUserId)) {
        return socket.emit('error_message', { message: 'This friend is currently offline.' });
      }

      // Create a private game room for sender
      leaveCurrentRoom(socket);

      let roomCode = generateRoomCode();
      while (rooms.has(roomCode)) {
        roomCode = generateRoomCode();
      }

      const normalizedGame = ['tictactoe', 'rps', 'connect4'].includes(gameType) ? gameType : 'tictactoe';

      const newRoom = {
        code: roomCode,
        gameType: normalizedGame,
        state: 'WAITING',
        isBotGame: false,
        players: [
          {
            id: socket.user.id,
            username: socket.user.username,
            display_name: socket.user.display_name,
            avatar: socket.user.avatar,
            socketId: socket.id,
            symbol: normalizedGame === 'tictactoe' ? 'X' : normalizedGame === 'connect4' ? '🔴' : null,
            score: 0,
            connected: true,
          },
        ],
        gameState: initializeGameState(normalizedGame, socket.user.id),
        rematchVotes: new Set(),
        chatHistory: [],
        createdAt: Date.now(),
      };

      rooms.set(roomCode, newRoom);
      socket.join(`room_${roomCode}`);
      updateUserPresence(socket.user.id, 'Waiting in Room', roomCode);

      // Create invitation with 60s expiration
      const inviteId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const inviteData = {
        id: inviteId,
        sender: socket.user,
        receiverId: targetUserId,
        roomCode,
        gameType: normalizedGame,
        gameName: getGameFriendlyName(normalizedGame),
        expiresAt: Date.now() + 60000, // 60 seconds
      };

      invitations.set(inviteId, inviteData);

      // Send confirmation to sender
      socket.emit('invitation_sent', {
        inviteId,
        room: sanitizeRoomForClient(newRoom, socket.user.id),
        message: `Invitation sent to friend! Waiting for response...`,
      });

      // Deliver real-time popup event to friend
      sendSocketToUser(targetUserId, 'game_invitation', inviteData);

      // Auto-expire invitation after 60s
      setTimeout(() => {
        if (invitations.has(inviteId)) {
          invitations.delete(inviteId);
          sendSocketToUser(targetUserId, 'invitation_expired', { inviteId });
          socket.emit('invitation_expired', { inviteId, message: 'Game invitation expired.' });
        }
      }, 60000);
    } catch (err) {
      console.error('Send invitation error:', err);
      socket.emit('error_message', { message: 'Failed to send game invitation.' });
    }
  });

  // Accept Game Invitation
  socket.on('accept_invitation', ({ inviteId }) => {
    try {
      const invite = invitations.get(inviteId);
      if (!invite) {
        return socket.emit('error_message', { message: 'This invitation has expired or is no longer valid.' });
      }

      if (Date.now() > invite.expiresAt) {
        invitations.delete(inviteId);
        return socket.emit('error_message', { message: 'This invitation has expired.' });
      }

      const room = rooms.get(invite.roomCode);
      if (!room) {
        invitations.delete(inviteId);
        return socket.emit('error_message', { message: 'The game room no longer exists.' });
      }

      // Ensure no leftover bot player exists in room
      room.players = room.players.filter((p) => String(p.id) !== String(BOT_ID));

      if (room.players.length >= 2) {
        invitations.delete(inviteId);
        return socket.emit('error_message', { message: 'This game is already full.' });
      }

      // Cleanup invite
      invitations.delete(inviteId);

      // Join the invited room
      leaveCurrentRoom(socket);

      const symbol = room.gameType === 'tictactoe' ? 'O' : room.gameType === 'connect4' ? '🟡' : null;

      room.players.push({
        id: socket.user.id,
        username: socket.user.username,
        display_name: socket.user.display_name,
        avatar: socket.user.avatar,
        socketId: socket.id,
        symbol,
        score: 0,
        connected: true,
      });

      socket.join(`room_${invite.roomCode}`);
      room.state = 'PLAYING';
      room.isBotGame = false;

      const presenceName = getGamePresenceName(room.gameType);
      updateUserPresence(room.players[0].id, presenceName, invite.roomCode);
      updateUserPresence(room.players[1].id, presenceName, invite.roomCode);

      // Notify sender that player accepted and joined
      socket.to(`room_${invite.roomCode}`).emit('player_joined', {
        user: socket.user,
        message: `${socket.user.display_name} joined the game!`,
      });

      // Broadcast game_start to both players
      io.to(`room_${invite.roomCode}`).emit('game_start', {
        room: sanitizeRoomForClient(room, null),
        message: `${socket.user.display_name} accepted the invite! Game starting!`,
      });
    } catch (err) {
      console.error('Accept invite error:', err);
      socket.emit('error_message', { message: 'Failed to accept invitation.' });
    }
  });

  // Decline Game Invitation
  socket.on('decline_invitation', ({ inviteId }) => {
    try {
      const invite = invitations.get(inviteId);
      if (invite) {
        invitations.delete(inviteId);
        sendSocketToUser(invite.sender.id, 'invitation_declined', {
          inviteId,
          userName: socket.user.display_name,
          message: `${socket.user.display_name} declined the game invitation.`,
        });
      }
    } catch (err) {
      console.error('Decline invite error:', err);
    }
  });

  // Handle Disconnection
  socket.on('disconnect', () => {
    socketToUser.delete(socket.id);

    const userData = connectedUsers.get(userId);
    if (userData) {
      userData.socketIds.delete(socket.id);
      if (userData.socketIds.size === 0) {
        connectedUsers.delete(userId);
        if (!socket.isGuest) {
          broadcastPresenceUpdate(userId);
        }
      }
    }

    // Broadcast updated lobby online count
    emitLobbyOnlineCount();

    // Handle game room disconnect
    handlePlayerSocketDisconnect(socket);
  });
});

// Helper: Get user's current room code
function getUserRoomCode(userId) {
  const data = connectedUsers.get(userId);
  return data ? data.roomCode : null;
}

// Update presence and broadcast
function updateUserPresence(userId, status, roomCode = null) {
  const data = connectedUsers.get(userId);
  if (data) {
    data.status = status;
    data.roomCode = roomCode;
  }
  broadcastPresenceUpdate(userId);
}

// Friendly game names
function getGameFriendlyName(type) {
  switch (type) {
    case 'tictactoe':
      return 'Tic-Tac-Toe';
    case 'rps':
      return 'Rock Paper Scissors';
    case 'connect4':
      return 'Connect Four';
    default:
      return 'Multiplayer Game';
  }
}

function getGamePresenceName(type) {
  switch (type) {
    case 'tictactoe':
      return 'Playing Tic-Tac-Toe';
    case 'rps':
      return 'Playing Rock Paper Scissors';
    case 'connect4':
      return 'Playing Connect Four';
    default:
      return 'In Game';
  }
}

// Remove player from current room cleanly
function leaveCurrentRoom(socket, notifyOpponent = false) {
  for (const [code, room] of rooms.entries()) {
    const playerIndex = room.players.findIndex((p) => p.id === socket.user?.id);
    if (playerIndex !== -1) {
      const leavingPlayer = room.players[playerIndex];
      socket.leave(`room_${code}`);
      room.players.splice(playerIndex, 1);

      if (notifyOpponent) {
        socket.to(`room_${code}`).emit('player_left', {
          user: socket.user,
          message: `${socket.user.display_name} left the game.`,
        });
      }

      if (room.players.length === 0) {
        rooms.delete(code);
      } else {
        // If remaining player is alone, room goes to WAITING or finishes
        // Also remove any bot player and reset isBotGame
        room.players = room.players.filter((p) => String(p.id) !== String(BOT_ID));
        room.isBotGame = false;
        if (room.players.length === 0) {
          rooms.delete(code);
        } else {
          room.state = 'WAITING';
          io.to(`room_${code}`).emit('room_state_updated', {
            room: sanitizeRoomForClient(room, null),
          });
        }
      }

      updateUserPresence(socket.user.id, 'Online', null);
      break;
    }
  }
}

// Handle socket disconnect for in-progress rooms
function handlePlayerSocketDisconnect(socket) {
  for (const [code, room] of rooms.entries()) {
    const player = room.players.find((p) => p.id === socket.userId);
    if (player) {
      player.connected = false;

      socket.to(`room_${code}`).emit('player_disconnected', {
        userId: socket.userId,
        userName: socket.user?.display_name || 'Opponent',
        message: `${socket.user?.display_name || 'Opponent'} disconnected. Waiting for reconnection...`,
      });

      // If both disconnected or room is in WAITING, clean up after grace period
      setTimeout(() => {
        const currentRoom = rooms.get(code);
        if (currentRoom) {
          const isPlayerStillDisconnected = currentRoom.players.some((p) => p.id === socket.userId && !p.connected);
          if (isPlayerStillDisconnected) {
            // Remove disconnected player
            currentRoom.players = currentRoom.players.filter((p) => p.id !== socket.userId);
            currentRoom.players = currentRoom.players.filter((p) => String(p.id) !== String(BOT_ID));
            currentRoom.isBotGame = false;
            if (currentRoom.players.length === 0) {
              rooms.delete(code);
            } else {
              currentRoom.state = 'WAITING';
              io.to(`room_${code}`).emit('player_left', {
                user: socket.user,
                message: `${socket.user?.display_name || 'Opponent'} disconnected and left.`,
              });
            }
          }
        }
      }, 45000); // 45 seconds grace period
    }
  }
}

// Sanitize room data for client consumption (e.g. RPS hidden choices!)
function sanitizeRoomForClient(room, viewingUserId) {
  if (!room) return null;

  const cloned = JSON.parse(JSON.stringify(room));
  delete cloned.rematchVotes; // internal Set

  // If RPS, hide opponent's choice until round result is revealed!
  if (room.gameType === 'rps' && cloned.gameState) {
    const choices = room.gameState.choices || {};
    const sanitizedChoices = {};

    for (const [uid, choice] of Object.entries(choices)) {
      if (room.gameState.result) {
        // Round concluded: reveal both
        sanitizedChoices[uid] = choice;
      } else if (String(uid) === String(viewingUserId)) {
        // You can see your own choice
        sanitizedChoices[uid] = choice;
      } else {
        // Opponent's choice is masked
        sanitizedChoices[uid] = 'HIDDEN';
      }
    }
    cloned.gameState.choices = sanitizedChoices;
  }

  return cloned;
}

// Initialize Game State based on game type
function initializeGameState(gameType, firstPlayerId) {
  switch (gameType) {
    case 'tictactoe':
      return {
        board: Array(9).fill(null),
        currentTurn: firstPlayerId,
        winner: null,
        winningLine: null,
        isDraw: false,
      };

    case 'rps':
      return {
        choices: {}, // { [userId]: 'rock' | 'paper' | 'scissors' }
        scores: {}, // { [userId]: number }
        round: 1,
        result: null, // { winnerId: number | 'tie', p1Choice, p2Choice, message }
      };

    case 'connect4':
      // 6 rows x 7 cols grid (null for empty)
      return {
        board: Array.from({ length: 6 }, () => Array(7).fill(null)),
        currentTurn: firstPlayerId,
        winner: null,
        winningCells: null,
        isDraw: false,
      };

    default:
      return {};
  }
}

// ==========================================
// AI BOT PLAYER ENGINE (RoboCat AI)
// ==========================================
const BOT_ID = 999999;
const BOT_USER = {
  id: BOT_ID,
  username: 'robocat_ai',
  display_name: 'RoboCat (AI)',
  avatar: '🤖',
  isBot: true,
};

function sendBotChatMessage(room, text) {
  if (!room) return;
  const msg = {
    id: 'g_bot_' + Date.now(),
    sender: BOT_USER,
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    offsetX: Math.floor(Math.random() * 20) - 10,
  };
  room.chatHistory.push(msg);
  if (room.chatHistory.length > 40) room.chatHistory.shift();
  io.to(`room_${room.code}`).emit('game_chat_message', msg);
}

function triggerBotTicTacToeMove(room) {
  if (!room || room.state !== 'PLAYING' || !room.isBotGame) return;
  const { gameState } = room;
  if (!gameState || gameState.winner || gameState.isDraw || String(gameState.currentTurn) !== String(BOT_ID)) return;

  const botPlayer = room.players.find((p) => String(p.id) === String(BOT_ID));
  const humanPlayer = room.players.find((p) => String(p.id) !== String(BOT_ID));
  if (!botPlayer || !humanPlayer) return;

  const b = gameState.board;
  const botSym = botPlayer.symbol;
  const humanSym = humanPlayer.symbol;

  const winLines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  let moveIdx = -1;

  // 1. Can Bot win this turn?
  for (const line of winLines) {
    const symbols = line.map((i) => b[i]);
    if (symbols.filter((s) => s === botSym).length === 2 && symbols.includes(null)) {
      moveIdx = line[symbols.indexOf(null)];
      break;
    }
  }

  // 2. Must Bot block human win?
  if (moveIdx === -1) {
    for (const line of winLines) {
      const symbols = line.map((i) => b[i]);
      if (symbols.filter((s) => s === humanSym).length === 2 && symbols.includes(null)) {
        moveIdx = line[symbols.indexOf(null)];
        break;
      }
    }
  }

  // 3. Take Center if available (index 4)
  if (moveIdx === -1 && b[4] === null) {
    moveIdx = 4;
  }

  // 4. Take available corner
  if (moveIdx === -1) {
    const corners = [0, 2, 6, 8].filter((i) => b[i] === null);
    if (corners.length > 0) {
      moveIdx = corners[Math.floor(Math.random() * corners.length)];
    }
  }

  // 5. Take any remaining empty cell
  if (moveIdx === -1) {
    const emptyCells = b.map((val, idx) => (val === null ? idx : null)).filter((val) => val !== null);
    if (emptyCells.length > 0) {
      moveIdx = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    }
  }

  if (moveIdx !== -1) {
    const delay = 500 + Math.floor(Math.random() * 350);
    setTimeout(() => {
      if (room.state === 'PLAYING' && room.isBotGame && room.players.some((p) => String(p.id) === String(BOT_ID)) && String(room.gameState?.currentTurn) === String(BOT_ID)) {
        handleTicTacToeMove(room, BOT_ID, { index: moveIdx });
      }
    }, delay);
  }
}

function triggerBotConnect4Move(room) {
  if (!room || room.state !== 'PLAYING' || !room.isBotGame) return;
  const { gameState } = room;
  if (!gameState || gameState.winner || gameState.isDraw || String(gameState.currentTurn) !== String(BOT_ID)) return;

  const botPlayer = room.players.find((p) => String(p.id) === String(BOT_ID));
  const humanPlayer = room.players.find((p) => String(p.id) !== String(BOT_ID));
  if (!botPlayer || !humanPlayer) return;

  const board = gameState.board;
  const botSym = botPlayer.symbol;
  const humanSym = humanPlayer.symbol;

  function getDropRow(b, col) {
    for (let r = 5; r >= 0; r--) {
      if (b[r][col] === null) return r;
    }
    return -1;
  }

  const validCols = [];
  for (let c = 0; c < 7; c++) {
    if (getDropRow(board, c) !== -1) validCols.push(c);
  }
  if (validCols.length === 0) return;

  let chosenCol = -1;

  // 1. Can Bot win with 1 drop?
  for (const c of validCols) {
    const r = getDropRow(board, c);
    board[r][c] = botSym;
    const isWin = checkConnectFourWin(board, r, c, botSym);
    board[r][c] = null;
    if (isWin) {
      chosenCol = c;
      break;
    }
  }

  // 2. Block human 4-in-a-row?
  if (chosenCol === -1) {
    for (const c of validCols) {
      const r = getDropRow(board, c);
      board[r][c] = humanSym;
      const isWin = checkConnectFourWin(board, r, c, humanSym);
      board[r][c] = null;
      if (isWin) {
        chosenCol = c;
        break;
      }
    }
  }

  // 3. Avoid giving opponent a win right above us
  if (chosenCol === -1) {
    const safeCols = validCols.filter((c) => {
      const r = getDropRow(board, c);
      if (r > 0) {
        board[r][c] = botSym;
        board[r - 1][c] = humanSym;
        const opponentWins = checkConnectFourWin(board, r - 1, c, humanSym);
        board[r - 1][c] = null;
        board[r][c] = null;
        return !opponentWins;
      }
      return true;
    });

    const candidates = safeCols.length > 0 ? safeCols : validCols;
    const priority = [3, 2, 4, 1, 5, 0, 6];
    for (const p of priority) {
      if (candidates.includes(p)) {
        chosenCol = p;
        break;
      }
    }
    if (chosenCol === -1) {
      chosenCol = candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  const delay = 650 + Math.floor(Math.random() * 350);
  setTimeout(() => {
    if (room.state === 'PLAYING' && room.isBotGame && room.players.some((p) => String(p.id) === String(BOT_ID)) && String(room.gameState?.currentTurn) === String(BOT_ID)) {
      handleConnect4Move(room, BOT_ID, { col: chosenCol });
    }
  }, delay);
}

function triggerBotRpsMove(room) {
  if (!room || room.state !== 'PLAYING' || !room.isBotGame) return;
  const options = ['rock', 'paper', 'scissors'];
  const choice = options[Math.floor(Math.random() * options.length)];
  const delay = 350 + Math.floor(Math.random() * 300);
  setTimeout(() => {
    if (room.state === 'PLAYING' && room.isBotGame && room.players.some((p) => String(p.id) === String(BOT_ID))) {
      handleRpsMove(room, BOT_ID, { choice });
    }
  }, delay);
}

// ==========================================
// GAME 1: TIC-TAC-TOE LOGIC
// ==========================================
async function handleTicTacToeMove(room, userId, { index }) {
  const { gameState } = room;

  if (gameState.winner || gameState.isDraw) return;
  if (String(gameState.currentTurn) !== String(userId)) return;
  if (index < 0 || index > 8 || gameState.board[index] !== null) return;

  const player = room.players.find((p) => String(p.id) === String(userId));
  const opponent = room.players.find((p) => String(p.id) !== String(userId));
  if (!player || !opponent) return;

  // Make move
  gameState.board[index] = player.symbol;

  // Check win lines
  const winLines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // Rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // Columns
    [0, 4, 8],
    [2, 4, 6], // Diagonals
  ];

  let winningLine = null;
  for (const line of winLines) {
    const [a, b, c] = line;
    if (gameState.board[a] && gameState.board[a] === gameState.board[b] && gameState.board[a] === gameState.board[c]) {
      winningLine = line;
      break;
    }
  }

  if (winningLine) {
    gameState.winner = userId;
    gameState.winningLine = winningLine;
    room.state = 'FINISHED';

    player.score = (player.score || 0) + 1;

    // Update SQLite database stats
    await recordGameResult('tictactoe', player.id, opponent.id, player.id, 'win');

    const sanitized = sanitizeRoomForClient(room, null);
    io.to(`room_${room.code}`).emit('game_state', {
      room: sanitized,
      winner: player,
      winningLine,
    });
    io.to(`room_${room.code}`).emit('game_update', {
      room: sanitized,
    });
    io.to(`room_${room.code}`).emit('game_over', {
      room: sanitized,
      winner: player,
      isDraw: false,
      reason: `${player.display_name} won the match!`,
    });
  } else if (gameState.board.every((cell) => cell !== null)) {
    // Draw
    gameState.isDraw = true;
    room.state = 'FINISHED';

    await recordGameResult('tictactoe', player.id, opponent.id, null, 'draw');

    const sanitized = sanitizeRoomForClient(room, null);
    io.to(`room_${room.code}`).emit('game_state', {
      room: sanitized,
      isDraw: true,
    });
    io.to(`room_${room.code}`).emit('game_update', {
      room: sanitized,
    });
    io.to(`room_${room.code}`).emit('game_over', {
      room: sanitized,
      winner: null,
      isDraw: true,
      reason: "It's a draw!",
    });
  } else {
    // Pass turn to opponent
    gameState.currentTurn = opponent.id;
    const sanitized = sanitizeRoomForClient(room, null);
    io.to(`room_${room.code}`).emit('game_state', {
      room: sanitized,
    });
    io.to(`room_${room.code}`).emit('game_update', {
      room: sanitized,
    });

    if (room.isBotGame && String(opponent.id) === String(BOT_ID)) {
      triggerBotTicTacToeMove(room);
    }
  }
}

// ==========================================
// GAME 2: ROCK PAPER SCISSORS LOGIC
// ==========================================
async function handleRpsMove(room, userId, moveData = {}) {
  const { gameState } = room;
  const choice = moveData?.choice || moveData?.action?.choice || (typeof moveData === 'string' ? moveData : null);
  const validChoices = ['rock', 'paper', 'scissors'];
  if (!validChoices.includes(choice)) return;

  if (!gameState.choices) gameState.choices = {};
  if (!gameState.scores) gameState.scores = {};

  // Store player choice (both key variants)
  gameState.choices[userId] = choice;
  gameState.choices[String(userId)] = choice;

  // If playing vs Bot, trigger the bot choice immediately
  if (room.isBotGame && String(userId) !== String(BOT_ID) && !gameState.choices[BOT_ID] && !gameState.choices[String(BOT_ID)]) {
    triggerBotRpsMove(room);
  }

  // Notify both players that a selection occurred (without revealing opponent's choice)
  for (const p of room.players) {
    if (!p.socketId) continue;
    const isMe = String(userId) === String(p.id);
    io.to(p.socketId).emit('game_state', {
      room: sanitizeRoomForClient(room, p.id),
      message: `${isMe ? 'You' : 'Opponent'} selected!`,
    });
    io.to(p.socketId).emit('game_update', {
      room: sanitizeRoomForClient(room, p.id),
      payload: { choices: room.gameState.choices },
    });
  }

  // Check if both players have submitted
  const [p1, p2] = room.players;
  if (!p1 || !p2) return;
  const c1 = gameState.choices[p1.id] || gameState.choices[String(p1.id)];
  const c2 = gameState.choices[p2.id] || gameState.choices[String(p2.id)];

  if (c1 && c2) {
    let winnerId = null;
    let outcome = 'tie';

    if (c1 === c2) {
      outcome = 'tie';
    } else if (
      (c1 === 'rock' && c2 === 'scissors') ||
      (c1 === 'paper' && c2 === 'rock') ||
      (c1 === 'scissors' && c2 === 'paper')
    ) {
      winnerId = p1.id;
      outcome = 'p1';
      p1.score = (p1.score || 0) + 1;
      gameState.scores[p1.id] = (gameState.scores[p1.id] || 0) + 1;
      gameState.scores[String(p1.id)] = gameState.scores[p1.id];
    } else {
      winnerId = p2.id;
      outcome = 'p2';
      p2.score = (p2.score || 0) + 1;
      gameState.scores[p2.id] = (gameState.scores[p2.id] || 0) + 1;
      gameState.scores[String(p2.id)] = gameState.scores[p2.id];
    }

    gameState.result = {
      winnerId,
      outcome,
      p1Choice: c1,
      p2Choice: c2,
      round: gameState.round || 1,
    };

    // Update database stats
    if (winnerId) {
      const loserId = String(winnerId) === String(p1.id) ? p2.id : p1.id;
      await recordGameResult('rps', p1.id, p2.id, winnerId, 'win');
    } else {
      await recordGameResult('rps', p1.id, p2.id, null, 'draw');
    }

    // Broadcast full revealed results
    const sanitized = sanitizeRoomForClient(room, null);
    io.to(`room_${room.code}`).emit('game_state', {
      room: sanitized,
      result: gameState.result,
    });
    io.to(`room_${room.code}`).emit('game_update', {
      room: sanitized,
      payload: { result: gameState.result },
    });

    // Check if match won (first to 3 points in Best of 5)
    const TARGET_WINS = 3;
    const isMatchOver = ((p1.score || 0) >= TARGET_WINS || (p2.score || 0) >= TARGET_WINS);

    // Reset choices for next round after 3.5 seconds
    setTimeout(() => {
      const currentRoom = rooms.get(room.code);
      if (currentRoom && currentRoom.gameType === 'rps' && currentRoom.state === 'PLAYING') {
        if (isMatchOver) {
          currentRoom.state = 'FINISHED';
          const matchWinner = (p1.score || 0) >= TARGET_WINS ? p1 : p2;
          currentRoom.gameState.winner = matchWinner.id;
          const finalSanitized = sanitizeRoomForClient(currentRoom, null);
          io.to(`room_${currentRoom.code}`).emit('game_over', {
            room: finalSanitized,
            winner: matchWinner,
            reason: `${matchWinner.display_name} won the match (${matchWinner.score} - ${String(matchWinner.id) === String(p1.id) ? p2.score || 0 : p1.score || 0})!`,
          });
          return;
        }

        currentRoom.gameState.choices = {};
        currentRoom.gameState.result = null;
        currentRoom.gameState.round = (currentRoom.gameState.round || 1) + 1;

        const nextSanitized = sanitizeRoomForClient(currentRoom, null);
        io.to(`room_${currentRoom.code}`).emit('game_state', {
          room: nextSanitized,
          message: `Round ${currentRoom.gameState.round} - Make your choice!`,
        });
        io.to(`room_${currentRoom.code}`).emit('game_update', {
          room: nextSanitized,
        });
      }
    }, 3500);
  }
}

// ==========================================
// GAME 3: CONNECT FOUR LOGIC
// ==========================================
async function handleConnect4Move(room, userId, { col }) {
  const { gameState } = room;

  if (gameState.winner || gameState.isDraw) return;
  if (String(gameState.currentTurn) !== String(userId)) return;
  if (col < 0 || col > 6) return;

  const player = room.players.find((p) => String(p.id) === String(userId));
  const opponent = room.players.find((p) => String(p.id) !== String(userId));
  if (!player || !opponent) return;

  // Find lowest available row in this column (row 5 is bottom, row 0 is top)
  let targetRow = -1;
  for (let r = 5; r >= 0; r--) {
    if (gameState.board[r][col] === null) {
      targetRow = r;
      break;
    }
  }

  // Column is full
  if (targetRow === -1) return;

  // Place token
  gameState.board[targetRow][col] = player.symbol;

  // Check Connect Four win condition
  const winningCells = checkConnectFourWin(gameState.board, targetRow, col, player.symbol);

  if (winningCells) {
    gameState.winner = userId;
    gameState.winningCells = winningCells;
    room.state = 'FINISHED';

    player.score = (player.score || 0) + 1;

    await recordGameResult('connect4', player.id, opponent.id, player.id, 'win');

    const sanitized = sanitizeRoomForClient(room, null);
    io.to(`room_${room.code}`).emit('game_state', {
      room: sanitized,
      winner: player,
      winningCells,
      lastMove: { row: targetRow, col },
    });
    io.to(`room_${room.code}`).emit('game_update', {
      room: sanitized,
      lastMove: { row: targetRow, col },
    });
    io.to(`room_${room.code}`).emit('game_over', {
      room: sanitized,
      winner: player,
      isDraw: false,
      reason: `${player.display_name} connected 4 in a row!`,
    });
  } else if (gameState.board[0].every((cell) => cell !== null)) {
    // Board is completely full -> Draw
    gameState.isDraw = true;
    room.state = 'FINISHED';

    await recordGameResult('connect4', player.id, opponent.id, null, 'draw');

    const sanitized = sanitizeRoomForClient(room, null);
    io.to(`room_${room.code}`).emit('game_state', {
      room: sanitized,
      isDraw: true,
      lastMove: { row: targetRow, col },
    });
    io.to(`room_${room.code}`).emit('game_update', {
      room: sanitized,
      lastMove: { row: targetRow, col },
    });
    io.to(`room_${room.code}`).emit('game_over', {
      room: sanitized,
      winner: null,
      isDraw: true,
      reason: "It's a draw!",
    });
  } else {
    // Alternate turn
    gameState.currentTurn = opponent.id;
    const sanitized = sanitizeRoomForClient(room, null);
    io.to(`room_${room.code}`).emit('game_state', {
      room: sanitized,
      lastMove: { row: targetRow, col },
    });
    io.to(`room_${room.code}`).emit('game_update', {
      room: sanitized,
      lastMove: { row: targetRow, col },
    });

    if (room.isBotGame && String(opponent.id) === String(BOT_ID)) {
      triggerBotConnect4Move(room);
    }
  }
}

// Connect Four 4-in-a-row checker
function checkConnectFourWin(board, r, c, symbol) {
  const directions = [
    [0, 1], // Horizontal
    [1, 0], // Vertical
    [1, 1], // Diagonal \
    [1, -1], // Diagonal /
  ];

  for (const [dr, dc] of directions) {
    const cells = [[r, c]];

    // Check forward
    let step = 1;
    while (true) {
      const nr = r + dr * step;
      const nc = c + dc * step;
      if (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr][nc] === symbol) {
        cells.push([nr, nc]);
        step++;
      } else {
        break;
      }
    }

    // Check backward
    step = 1;
    while (true) {
      const nr = r - dr * step;
      const nc = c - dc * step;
      if (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr][nc] === symbol) {
        cells.push([nr, nc]);
        step++;
      } else {
        break;
      }
    }

    if (cells.length >= 4) {
      return cells;
    }
  }

  return null;
}

// Database stats and match history helper
async function recordGameResult(gameType, p1Id, p2Id, winnerId, result) {
  try {
    const numP1 = !isNaN(Number(p1Id)) ? Number(p1Id) : null;
    const numP2 = !isNaN(Number(p2Id)) ? Number(p2Id) : null;
    const isP1User = numP1 !== null && numP1 !== BOT_ID && numP1 > 0;
    const isP2User = numP2 !== null && numP2 !== BOT_ID && numP2 > 0;

    // At least one participant must be a registered user to record history
    if (!isP1User && !isP2User) return;

    const finalP1 = isP1User ? numP1 : (numP1 === BOT_ID ? BOT_ID : p1Id);
    const finalP2 = isP2User ? numP2 : (numP2 === BOT_ID ? BOT_ID : p2Id);
    let finalWinner = null;
    if (winnerId !== null && winnerId !== undefined) {
      finalWinner = !isNaN(Number(winnerId)) ? Number(winnerId) : winnerId;
    }

    // Insert game history record into database (preserves real matches vs bot, friend, or guest)
    await dbRun(
      'INSERT INTO game_history (game_type, player1_id, player2_id, winner_id, result) VALUES (?, ?, ?, ?, ?)',
      [gameType, finalP1, finalP2, finalWinner, result]
    );

    // Update stats for registered user 1
    if (isP1User) {
      if (result === 'win' && String(finalWinner) === String(finalP1)) {
        await dbRun('UPDATE stats SET games_played = games_played + 1, wins = wins + 1 WHERE user_id = ?', [numP1]);
      } else if (result === 'win' && String(finalWinner) !== String(finalP1)) {
        await dbRun('UPDATE stats SET games_played = games_played + 1, losses = losses + 1 WHERE user_id = ?', [numP1]);
      } else if (result === 'draw') {
        await dbRun('UPDATE stats SET games_played = games_played + 1, draws = draws + 1 WHERE user_id = ?', [numP1]);
      }
    }

    // Update stats for registered user 2 (if player 2 is also a registered user)
    if (isP2User) {
      if (result === 'win' && String(finalWinner) === String(finalP2)) {
        await dbRun('UPDATE stats SET games_played = games_played + 1, wins = wins + 1 WHERE user_id = ?', [numP2]);
      } else if (result === 'win' && String(finalWinner) !== String(finalP2)) {
        await dbRun('UPDATE stats SET games_played = games_played + 1, losses = losses + 1 WHERE user_id = ?', [numP2]);
      } else if (result === 'draw') {
        await dbRun('UPDATE stats SET games_played = games_played + 1, draws = draws + 1 WHERE user_id = ?', [numP2]);
      }
    }
  } catch (err) {
    console.error('Failed to record game stats in DB:', err);
  }
}

// Start HTTP & WebSocket Server
async function start() {
  await initDb();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================`);
    console.log(`🎮 GameRoom Server running on port ${PORT}`);
    console.log(`🌐 Ready for GitHub & Render.com deployment`);
    console.log(`===========================================`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
});
