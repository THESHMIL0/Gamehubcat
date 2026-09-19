// ==========================================
// GameRoom — Real-Time Floating Chat Module
// ==========================================

import { getSocket } from './socket.js';
import { getCurrentUser } from './auth.js';

let activeRoomCode = null;

export function setActiveRoomCode(code) {
  activeRoomCode = code;
}

export function initChat() {
  const socket = getSocket();
  if (!socket) return;

  // 1. Lobby Chat Submission
  const formLobby = document.getElementById('form-lobby-chat');
  const inputLobby = document.getElementById('input-lobby-chat');

  if (formLobby && inputLobby) {
    formLobby.onsubmit = (e) => {
      e.preventDefault();
      const text = inputLobby.value.trim();
      if (!text) return;
      socket.emit('lobby_message', { text });
      inputLobby.value = '';
    };
  }

  // 2. In-Game Match Chat Submission
  const formGame = document.getElementById('form-game-chat');
  const inputGame = document.getElementById('input-game-chat');

  if (formGame && inputGame) {
    formGame.onsubmit = (e) => {
      e.preventDefault();
      const text = inputGame.value.trim();
      if (!text || !activeRoomCode) return;
      socket.emit('game_chat', { roomCode: activeRoomCode, text });
      inputGame.value = '';
    };
  }

  // Socket Listeners
  socket.off('lobby_message');
  socket.on('lobby_message', (msg) => {
    spawnFloatingBubble('lobby-floating-bubbles', msg);
    appendChatMessage('lobby-messages-log', msg);
  });

  socket.off('lobby_history');
  socket.on('lobby_history', (history) => {
    const log = document.getElementById('lobby-messages-log');
    if (log) log.innerHTML = '';
    history.forEach((m) => appendChatMessage('lobby-messages-log', m));
  });

  socket.off('game_chat_message');
  socket.on('game_chat_message', (msg) => {
    spawnFloatingBubble('game-floating-bubbles', msg);
  });

  socket.off('chat_error');
  socket.on('chat_error', (data) => {
    if (window.GameApp?.showToast) {
      window.GameApp.showToast(data.message, 'warning');
    }
  });
}

// Spawns smooth floating bubble that floats upwards and disappears automatically
function spawnFloatingBubble(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble-floating';

  // Apply randomized horizontal offset (Section 33)
  const leftPercent = 20 + Math.floor(Math.random() * 50);
  bubble.style.left = `${leftPercent}%`;

  const sender = message.sender || {};
  const isMe = sender.id === getCurrentUser()?.id;

  bubble.innerHTML = `
    <span class="chat-bubble-author" style="color: ${isMe ? '#10b981' : '#38bdf8'}">
      ${escapeHtml(sender.avatar || '🎮')} ${escapeHtml(sender.display_name || 'Player')}:
    </span>
    <span class="chat-bubble-text">${escapeHtml(message.text)}</span>
  `;

  container.appendChild(bubble);

  // Remove element after animation finishes
  setTimeout(() => {
    if (bubble.parentNode) {
      bubble.parentNode.removeChild(bubble);
    }
  }, 4200);
}

// Appends message to chat log list
function appendChatMessage(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const item = document.createElement('div');
  item.className = 'chat-log-item';

  const sender = message.sender || {};
  const isMe = sender.id === getCurrentUser()?.id;

  item.innerHTML = `
    <span class="chat-time">${escapeHtml(message.timestamp || '')}</span>
    <span class="chat-author" style="color: ${isMe ? '#10b981' : '#38bdf8'}" onclick="window.GameApp?.showPlayerProfile(${sender.id})">
      ${escapeHtml(sender.avatar || '🎮')} ${escapeHtml(sender.display_name || 'Player')}:
    </span>
    <span class="chat-text">${escapeHtml(message.text)}</span>
  `;

  container.appendChild(item);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
