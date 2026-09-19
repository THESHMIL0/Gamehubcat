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
  const reactionPills = document.querySelectorAll('.reaction-pill, .insta-reaction-pill');
  reactionPills.forEach((pill) => {
    pill.onclick = () => {
      const msg = pill.getAttribute('data-msg');
      if (msg && socket.connected) {
        socket.emit('lobby_message', { text: msg });
      }
    };
  });

  // Quick Meow Button in header
  const btnQuickMeow = document.getElementById('btn-gc-quick-meow');
  if (btnQuickMeow) {
    btnQuickMeow.onclick = () => {
      if (socket.connected) {
        socket.emit('lobby_message', { text: '🐱 Meow!' });
      }
    };
  }

  // Edit Name triggers from GC Intro & Pill
  const btnEditIntro = document.getElementById('btn-edit-guest-name-intro');
  if (btnEditIntro) {
    btnEditIntro.onclick = () => {
      const modal = document.getElementById('modal-guest-profile');
      if (modal) modal.classList.remove('hidden');
    };
  }

  const btnPillAvatar = document.getElementById('btn-pill-change-avatar');
  if (btnPillAvatar) {
    btnPillAvatar.onclick = () => {
      const modal = document.getElementById('modal-guest-profile');
      if (modal) modal.classList.remove('hidden');
    };
  }

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
      countEl.textContent = `${count} online`;
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
    <span class="chat-bubble-author" style="color: ${isMe ? '#a855f7' : sender.isGuest ? '#fbbf24' : '#38bdf8'}">
      ${escapeHtml(sender.avatar || '🐱')} ${escapeHtml(sender.display_name || sender.username || 'Player')}:
    </span>
    <span class="chat-bubble-text">${escapeHtml(message.text)}</span>
  `;

  container.appendChild(bubble);

  setTimeout(() => {
    if (bubble.parentNode) {
      bubble.parentNode.removeChild(bubble);
    }
  }, 4200);
}

// Appends message as an authentic Instagram Group Chat message row
function appendChatMessage(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const item = document.createElement('div');

  const sender = message.sender || {};
  const current = getCurrentUser() || getGuestInfo();
  const isMe = String(sender.id) === String(current?.id);
  const isGuest = !!sender.isGuest || String(sender.id).startsWith('guest_');

  item.className = `insta-msg-row ${isMe ? 'insta-mine' : 'insta-theirs'}`;

  const roleBadge = isGuest
    ? `<span class="insta-badge-guest">Guest</span>`
    : `<span class="insta-badge-member">Member</span>`;

  const challengeBtn = (!isMe && !isGuest && sender.id)
    ? `<button type="button" class="insta-btn-challenge" title="Challenge to duel" onclick="window.GameApp?.openInviteModal ? window.GameApp.openInviteModal(${sender.id}) : null">⚔️</button>`
    : '';

  if (isMe) {
    // Outgoing Message (Me): Aligned right with Instagram gradient bubble
    item.innerHTML = `
      <div class="insta-bubble-group">
        <div class="insta-bubble-wrap">
          <div class="insta-bubble bubble-mine" title="${escapeHtml(message.timestamp || '')}">
            ${escapeHtml(message.text)}
          </div>
        </div>
        <div class="insta-msg-meta">
          <span class="insta-msg-time">${escapeHtml(message.timestamp || '')}</span>
        </div>
      </div>
    `;
  } else {
    // Incoming Message (Others): Avatar on left, sender name above bubble, dark slate bubble
    item.innerHTML = `
      <span class="insta-msg-avatar" title="${escapeHtml(sender.display_name || 'Player')}" onclick="window.GameApp?.showPlayerProfile && !${isGuest} ? window.GameApp.showPlayerProfile(${sender.id}) : null">
        ${escapeHtml(sender.avatar || '🐱')}
      </span>
      <div class="insta-bubble-group">
        <div class="insta-sender-header">
          <span class="insta-sender-name" onclick="window.GameApp?.showPlayerProfile && !${isGuest} ? window.GameApp.showPlayerProfile(${sender.id}) : null">
            ${escapeHtml(sender.display_name || sender.username || 'Player')}
          </span>
          ${roleBadge}
        </div>
        <div class="insta-bubble-wrap">
          <div class="insta-bubble bubble-theirs" title="${escapeHtml(message.timestamp || '')}">
            ${escapeHtml(message.text)}
          </div>
          <button type="button" class="insta-heart-react-btn" title="Double tap to like">❤️</button>
        </div>
        <div class="insta-msg-meta">
          <span class="insta-msg-time">${escapeHtml(message.timestamp || '')}</span>
          ${challengeBtn}
        </div>
      </div>
    `;
  }

  // Double-tap or double-click to heart like Instagram
  const bubble = item.querySelector('.insta-bubble');
  const heartBtn = item.querySelector('.insta-heart-react-btn');

  const triggerHeartReaction = () => {
    const existingBadge = item.querySelector('.insta-heart-reaction-badge');
    if (existingBadge) {
      existingBadge.remove();
    } else {
      const badge = document.createElement('span');
      badge.className = 'insta-heart-reaction-badge';
      badge.textContent = '❤️';
      item.querySelector('.insta-bubble-wrap')?.appendChild(badge);

      // Pop floating animated heart
      const popHeart = document.createElement('span');
      popHeart.className = 'insta-pop-heart-anim';
      popHeart.textContent = '❤️';
      item.querySelector('.insta-bubble-wrap')?.appendChild(popHeart);
      setTimeout(() => popHeart.remove(), 1000);
    }
  };

  if (bubble) {
    bubble.ondblclick = triggerHeartReaction;
  }
  if (heartBtn) {
    heartBtn.onclick = triggerHeartReaction;
  }

  container.appendChild(item);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

