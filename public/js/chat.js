// ==========================================
// GameRoom — Real-Time Public Lobby Chat Module
// ==========================================

import { getSocket } from './socket.js';
import { getCurrentUser, getGuestInfo } from './auth.js';

let activeRoomCode = null;

export function setActiveRoomCode(code) {
  activeRoomCode = code;
}

export function initChat() {
  const socket = getSocket();
  if (!socket) return;

  // 1. Public Lobby Chat Form Submission
  const formLobby = document.getElementById('form-lobby-chat');
  const inputLobby = document.getElementById('input-lobby-chat');

  if (formLobby && inputLobby) {
    formLobby.onsubmit = (e) => {
      e.preventDefault();
      const text = inputLobby.value.trim();
      if (!text) return;
      socket.emit('lobby_message', { text });
      inputLobby.value = '';
      inputLobby.focus();
    };
  }

  // Quick Reaction Buttons (Pills)
  const reactionPills = document.querySelectorAll('.reaction-pill');
  reactionPills.forEach((pill) => {
    pill.onclick = () => {
      const msg = pill.getAttribute('data-msg');
      if (msg && socket.connected) {
        socket.emit('lobby_message', { text: msg });
      }
    };
  });

  // Clear Local Chat Log button
  const btnClearChat = document.getElementById('btn-clear-local-chat');
  if (btnClearChat) {
    btnClearChat.onclick = () => {
      const log = document.getElementById('lobby-messages-log');
      if (log) {
        log.innerHTML = '<div class="chat-system-notice">Chat history cleared locally.</div>';
      }
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

  // Socket Listeners for Lobby Chat
  socket.off('lobby_message');
  socket.on('lobby_message', (msg) => {
    spawnFloatingBubble('lobby-floating-bubbles', msg);
    appendChatMessage('lobby-messages-log', msg);
  });

  socket.off('lobby_history');
  socket.on('lobby_history', (history) => {
    const log = document.getElementById('lobby-messages-log');
    if (log) log.innerHTML = '';
    if (Array.isArray(history)) {
      history.forEach((m) => appendChatMessage('lobby-messages-log', m));
    }
  });

  // Online Players Count in Lobby
  socket.off('lobby_online_count');
  socket.on('lobby_online_count', ({ count }) => {
    const countEl = document.getElementById('lobby-online-count-text');
    if (countEl) {
      countEl.textContent = `${count} Online in Lobby`;
    }
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

  // Apply randomized horizontal offset
  const leftPercent = 15 + Math.floor(Math.random() * 60);
  bubble.style.left = `${leftPercent}%`;

  const sender = message.sender || {};
  const current = getCurrentUser() || getGuestInfo();
  const isMe = String(sender.id) === String(current?.id);

  bubble.innerHTML = `
    <span class="chat-bubble-author" style="color: ${isMe ? '#10b981' : sender.isGuest ? '#f59e0b' : '#38bdf8'}">
      ${escapeHtml(sender.avatar || '🐱')} ${escapeHtml(sender.display_name || sender.username || 'Player')}:
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

// Appends message to public chat log list
function appendChatMessage(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const item = document.createElement('div');
  item.className = 'chat-log-item';

  const sender = message.sender || {};
  const current = getCurrentUser() || getGuestInfo();
  const isMe = String(sender.id) === String(current?.id);
  const isGuest = !!sender.isGuest || String(sender.id).startsWith('guest_');

  const roleBadge = isGuest
    ? `<span class="badge-tag badge-guest">Guest</span>`
    : `<span class="badge-tag badge-member">Member</span>`;

  const challengeBtn = (!isMe && !isGuest && sender.id)
    ? `<button type="button" class="btn-chat-challenge" title="Challenge to a game" onclick="window.GameApp?.openInviteModal ? window.GameApp.openInviteModal(${sender.id}) : null">⚔️</button>`
    : '';

  item.innerHTML = `
    <span class="chat-avatar">${escapeHtml(sender.avatar || '🐱')}</span>
    <div class="chat-content-wrap">
      <div class="chat-meta-row">
        <span class="chat-author ${isMe ? 'chat-me' : isGuest ? 'chat-guest' : 'chat-member'}" onclick="window.GameApp?.showPlayerProfile && !${isGuest} ? window.GameApp.showPlayerProfile(${sender.id}) : null">
          ${escapeHtml(sender.display_name || sender.username || 'Player')}
        </span>
        ${roleBadge}
        <span class="chat-time">${escapeHtml(message.timestamp || '')}</span>
        ${challengeBtn}
      </div>
      <div class="chat-text">${escapeHtml(message.text)}</div>
    </div>
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

