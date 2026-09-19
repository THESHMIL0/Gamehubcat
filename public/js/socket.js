// ==========================================
// GameRoom — Real-Time Socket.IO Module
// ==========================================

import { getToken, getGuestInfo } from './auth.js';

let socket = null;
let isReconnecting = false;

export function getSocket() {
  return socket;
}

export function initSocket(onConnect, onDisconnect) {
  const token = getToken();
  const guest = getGuestInfo();

  if (socket && socket.connected) {
    if (onConnect) onConnect(socket);
    return socket;
  }

  // Connect to origin with token OR as public guest
  const authPayload = token
    ? { token }
    : {
        isGuest: true,
        guestId: guest.id,
        guestName: guest.name,
        guestAvatar: guest.avatar,
      };

  socket = window.io({
    auth: authPayload,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('Socket.IO connected. ID:', socket.id);
    updateConnectionIndicator('online', 'Connected');
    if (isReconnecting) {
      window.GameApp?.showToast('Connection restored.', 'success');
      isReconnecting = false;
    }
    if (onConnect) onConnect(socket);
  });

  socket.on('disconnect', (reason) => {
    console.warn('Socket disconnected:', reason);
    updateConnectionIndicator('offline', 'Disconnected');
    if (onDisconnect) onDisconnect(reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('Socket connection error:', err.message);
    isReconnecting = true;
    updateConnectionIndicator('offline', 'Reconnecting...');
  });

  socket.on('reconnect_attempt', () => {
    isReconnecting = true;
    updateConnectionIndicator('busy', 'Reconnecting...');
  });

  socket.on('error_message', (data) => {
    if (window.GameApp?.showToast) {
      window.GameApp.showToast(data.message || 'An error occurred', 'error');
    }
  });

  return socket;
}

export function updateGuestSocketProfile(name, avatar) {
  if (socket && socket.connected) {
    socket.emit('update_guest_profile', { name, avatar });
  }
}

export function reconnectSocketWithAuth(token, onConnect) {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  return initSocket(onConnect);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  updateConnectionIndicator('offline', 'Offline');
}

function updateConnectionIndicator(status, text) {
  const dot = document.querySelector('#connection-indicator .status-dot');
  const label = document.getElementById('connection-status-text');

  if (dot) {
    dot.className = `status-dot ${status}`;
  }
  if (label) {
    label.textContent = text;
  }
}
