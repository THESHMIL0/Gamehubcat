// ==========================================
// GameRoom — Lobby & Waiting Room Module
// ==========================================

import { getSocket } from './socket.js';
import { getCurrentUser } from './auth.js';
import { getOnlineFriends, promptInviteGame } from './friends.js';
import { setActiveRoomCode } from './chat.js';

let activeRoom = null;

export function getActiveRoom() {
  return activeRoom;
}

export function setActiveRoom(room) {
  activeRoom = room;
  setActiveRoomCode(room ? room.code : null);
}

export function initLobby() {
  const socket = getSocket();

  // "PLAY" buttons and cards on Home & Games Catalog
  document.querySelectorAll('.btn-game-play').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const gameType = btn.dataset.game;
      createGameRoom(gameType);
    };
  });

  document.querySelectorAll('.game-card-mini').forEach((card) => {
    card.onclick = () => {
      const gameType = card.dataset.game;
      if (gameType) createGameRoom(gameType);
    };
  });

  // Quick Join by Code (Home & Games Catalog)
  const btnQuickJoin = document.getElementById('btn-quick-join');
  const inputQuickJoin = document.getElementById('input-quick-room-code');

  if (btnQuickJoin && inputQuickJoin) {
    btnQuickJoin.onclick = () => handleJoinByCode();
    inputQuickJoin.onkeydown = (e) => {
      if (e.key === 'Enter') handleJoinByCode();
    };
  }

  const btnCatalogJoin = document.getElementById('btn-games-catalog-join');
  const inputCatalogJoin = document.getElementById('input-games-catalog-code');
  if (btnCatalogJoin && inputCatalogJoin) {
    btnCatalogJoin.onclick = () => {
      joinRoomByCode(inputCatalogJoin.value);
      inputCatalogJoin.value = '';
    };
    inputCatalogJoin.onkeydown = (e) => {
      if (e.key === 'Enter') {
        joinRoomByCode(inputCatalogJoin.value);
        inputCatalogJoin.value = '';
      }
    };
  }

  // Copy Room Code Button (Clipboard API + Fallback)
  const btnCopyCode = document.getElementById('btn-copy-code');
  if (btnCopyCode) {
    btnCopyCode.onclick = () => {
      if (!activeRoom) return;
      copyRoomCodeToClipboard(activeRoom.code);
    };
  }

  // Waiting Room Action Buttons
  const btnWaitingInvite = document.getElementById('btn-waiting-invite');
  if (btnWaitingInvite) {
    btnWaitingInvite.onclick = () => openWaitingFriendsInviteModal();
  }

  const btnWaitingLeave = document.getElementById('btn-waiting-leave');
  if (btnWaitingLeave) {
    btnWaitingLeave.onclick = () => leaveCurrentGameRoom();
  }

  // Socket Room Events
  if (socket) {
    socket.off('room_created');
    socket.on('room_created', ({ room }) => {
      setActiveRoom(room);
      showWaitingRoom(room);
      window.GameApp?.showToast(`Room ${room.code} created! Waiting for opponent.`, 'info');
    });

    socket.off('room_joined');
    socket.on('room_joined', ({ room }) => {
      setActiveRoom(room);
      if (room.state === 'WAITING') {
        showWaitingRoom(room);
      } else {
        window.GameApp?.startGameMatch(room);
      }
    });

    socket.off('invitation_sent');
    socket.on('invitation_sent', ({ room, message }) => {
      setActiveRoom(room);
      showWaitingRoom(room);
      window.GameApp?.showToast(message, 'info');
    });

    socket.off('player_joined');
    socket.on('player_joined', ({ user, message }) => {
      window.GameApp?.showToast(message || `${user.display_name} joined the game!`, 'success');
    });

    socket.off('player_left');
    socket.on('player_left', ({ user, message }) => {
      window.GameApp?.showToast(message || `${user?.display_name || 'Opponent'} left the game.`, 'warning');
      const disconnectBanner = document.getElementById('opponent-disconnect-banner');
      if (disconnectBanner) disconnectBanner.classList.add('hidden');
    });

    socket.off('player_disconnected');
    socket.on('player_disconnected', ({ userName, message }) => {
      const disconnectBanner = document.getElementById('opponent-disconnect-banner');
      const bannerText = document.getElementById('disconnect-banner-text');
      if (disconnectBanner && bannerText) {
        bannerText.textContent = message || `${userName} disconnected. Waiting for opponent to reconnect...`;
        disconnectBanner.classList.remove('hidden');
      }
    });

    socket.off('player_reconnected');
    socket.on('player_reconnected', ({ user, room }) => {
      setActiveRoom(room);
      const disconnectBanner = document.getElementById('opponent-disconnect-banner');
      if (disconnectBanner) disconnectBanner.classList.add('hidden');
      window.GameApp?.showToast(`${user.display_name} reconnected!`, 'success');
    });
  }
}

// Create a new room on the server
export function createGameRoom(gameType) {
  const socket = getSocket();
  if (!socket) return;
  socket.emit('create_room', { gameType });
}

// Join room by room code
export function joinRoomByCode(code) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode || cleanCode.length !== 6) {
    window.GameApp?.showToast('Please enter a valid 6-character room code.', 'warning');
    return;
  }

  const socket = getSocket();
  if (!socket) return;
  socket.emit('join_room', { roomCode: cleanCode });
}

function handleJoinByCode() {
  const input = document.getElementById('input-quick-room-code');
  if (input) {
    joinRoomByCode(input.value);
    input.value = '';
  }
}

// Render the Waiting Room
export function showWaitingRoom(room) {
  setActiveRoom(room);
  window.GameApp?.switchView('waiting');

  const gameNames = {
    tictactoe: 'TIC-TAC-TOE',
    rps: 'ROCK PAPER SCISSORS',
    connect4: 'CONNECT FOUR',
  };

  document.getElementById('waiting-game-badge').textContent = gameNames[room.gameType] || 'MULTIPLAYER';
  document.getElementById('waiting-room-code').textContent = room.code;

  const hostPlayer = room.players[0] || {};
  document.getElementById('waiting-player1-name').textContent = hostPlayer.display_name || 'You';
  document.getElementById('waiting-player1-avatar').textContent = hostPlayer.avatar || '🎮';
  document.getElementById('waiting-player1-symbol').textContent = hostPlayer.symbol || 'Host';
}

// Copy room code
export function copyRoomCodeToClipboard(code) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        window.GameApp?.showToast(`Room code ${code} copied to clipboard!`, 'success');
      })
      .catch(() => {
        fallbackCopy(code);
      });
  } else {
    fallbackCopy(code);
  }
}

function fallbackCopy(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
    window.GameApp?.showToast(`Room code ${text} copied to clipboard!`, 'success');
  } catch (e) {
    window.GameApp?.showToast(`Room code: ${text}`, 'info');
  }
  document.body.removeChild(textArea);
}

// Open modal to invite online friends from the waiting room
function openWaitingFriendsInviteModal() {
  const onlineFriends = getOnlineFriends();
  const container = document.getElementById('modal-invite-friends-list');
  if (!container) return;

  if (onlineFriends.length === 0) {
    container.innerHTML = '<div class="empty-state-hint">None of your friends are currently online. You can copy and send your room code!</div>';
  } else {
    container.innerHTML = onlineFriends
      .map(
        (f) => `
      <div class="friend-card glass-card" style="margin-bottom: 0.5rem;">
        <div class="friend-info">
          <span class="avatar-circle">${escapeHtml(f.avatar || '🎮')}</span>
          <div class="friend-text">
            <h4>${escapeHtml(f.display_name)}</h4>
            <div class="handle">@${escapeHtml(f.username)}</div>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" onclick="window.LobbyModule?.inviteFriendFromWaiting(${f.id})">
          Invite
        </button>
      </div>
    `
      )
      .join('');
  }

  window.GameApp?.openModal('modal-invite-friend');
}

export function inviteFriendFromWaiting(friendId) {
  if (!activeRoom) return;
  const socket = getSocket();
  if (socket) {
    socket.emit('send_invitation', { friendId, gameType: activeRoom.gameType });
    window.GameApp?.closeModal('modal-invite-friend');
    window.GameApp?.showToast('Invitation sent! Waiting for response...', 'info');
  }
}

// Leave game room
export function leaveCurrentGameRoom() {
  if (activeRoom) {
    const socket = getSocket();
    if (socket) {
      socket.emit('leave_room', { roomCode: activeRoom.code });
    }
  }
  setActiveRoom(null);
  window.GameApp?.switchView('home');
}

window.LobbyModule = {
  inviteFriendFromWaiting,
};

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
