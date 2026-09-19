// ==========================================
// GameRoom — Authentication Module
// ==========================================

const TOKEN_KEY = 'gameroom_token';
const USER_KEY = 'gameroom_user';
const LAST_USER_KEY = 'gameroom_last_username';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export function getCurrentUser() {
  try {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

export function getLastUsername() {
  try {
    return localStorage.getItem(LAST_USER_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function setSession(user, token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (user.username) {
        localStorage.setItem(LAST_USER_KEY, user.username);
      }
    }
    document.documentElement.classList.add('has-stored-auth');
  } catch (e) {
    console.warn('LocalStorage error setting session:', e);
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    document.documentElement.classList.remove('has-stored-auth');
  } catch (e) {
    console.warn('LocalStorage error clearing session:', e);
  }
}

export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Login failed');
  }

  setSession(data.user, data.token);
  return data.user;
}

export async function register(username, password, confirmPassword) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password, confirmPassword }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Registration failed');
  }

  setSession(data.user, data.token);
  return data.user;
}

export async function resetPassword(username, newPassword, confirmPassword) {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, newPassword, confirmPassword }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Password reset failed');
  }

  setSession(data.user, data.token);
  return data.user;
}

export async function fetchPublicAccounts() {
  try {
    const res = await fetch('/api/auth/accounts');
    if (!res.ok) return [];
    const data = await res.json();
    return data.accounts || [];
  } catch (e) {
    return [];
  }
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (e) {
    // Ignore network error on logout
  }
  clearSession();
}

export async function fetchCurrentUser() {
  const token = getToken();
  const cachedUser = getCurrentUser();

  try {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/auth/me', {
      headers,
      credentials: 'include',
    });

    if (res.status === 401 || res.status === 403) {
      // Explicit unauthorized response from server — token is definitively invalid
      clearSession();
      return null;
    }

    if (!res.ok) {
      // Temporary server error or rate limit: do NOT wipe user session on refresh!
      console.warn('Non-200 response checking session status:', res.status);
      return cachedUser ? { user: cachedUser } : null;
    }

    const data = await res.json();
    if (data && data.user) {
      setSession(data.user, data.token || token);
      return data;
    }

    return cachedUser ? { user: cachedUser } : null;
  } catch (e) {
    console.warn('Network issue fetching current session:', e);
    // Network glitch or offline: preserve existing login session
    return cachedUser ? { user: cachedUser } : null;
  }
}

// ==========================================
// Guest / Public Lobby Session Helpers
// ==========================================
const GUEST_ID_KEY = 'gameroom_guest_id';
const GUEST_NAME_KEY = 'gameroom_guest_name';
const GUEST_AVATAR_KEY = 'gameroom_guest_avatar';

export function getGuestInfo() {
  try {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = 'guest_' + Math.random().toString(36).substr(2, 7);
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    let name = localStorage.getItem(GUEST_NAME_KEY);
    if (!name) {
      name = 'Guest_' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem(GUEST_NAME_KEY, name);
    }
    let avatar = localStorage.getItem(GUEST_AVATAR_KEY);
    if (!avatar) {
      const avatars = ['🐱', '😺', '🐾', '🎮', '🐯', '😸', '🦊', '⚡'];
      avatar = avatars[Math.floor(Math.random() * avatars.length)];
      localStorage.setItem(GUEST_AVATAR_KEY, avatar);
    }
    return { id, name, avatar, isGuest: true };
  } catch (e) {
    return { id: 'guest_' + Math.random().toString(36).substr(2, 6), name: 'Guest_1234', avatar: '🐱', isGuest: true };
  }
}

export function setGuestInfo(name, avatar) {
  try {
    if (name) localStorage.setItem(GUEST_NAME_KEY, String(name).trim().slice(0, 20));
    if (avatar) localStorage.setItem(GUEST_AVATAR_KEY, String(avatar));
  } catch (e) {}
}

export function isGuestUser(user) {
  if (!user) return true;
  return !!user.isGuest || String(user.id).startsWith('guest_');
}


