// ==========================================
// GameRoom — Real-Time Game Invitations Module
// ==========================================

import { getSocket } from './socket.js';

// Map of active invitation elements: inviteId -> { element, timerInterval }
const activeInvites = new Map();

export function initInvitations() {
  const socket = getSocket();
  if (!socket) return;

  socket.off('game_invitation');
  socket.on('game_invitation', (invite) => {
    handleIncomingInvitation(invite);
  });

  socket.off('invitation_declined');
  socket.on('invitation_declined', (data) => {
    if (window.GameApp?.showToast) {
      window.GameApp.showToast(data.message || `${data.userName} declined the invitation.`, 'info');
    }
  });

  socket.off('invitation_expired');
  socket.on('invitation_expired', ({ inviteId }) => {
    removeInvitationCard(inviteId);
  });
}

// Handles incoming invitation popup with 60s countdown
function handleIncomingInvitation(invite) {
  const container = document.getElementById('invitation-container');
  if (!container) return;

  // Avoid duplicate popups
  if (activeInvites.has(invite.id)) return;

  const card = document.createElement('div');
  card.className = 'invite-popup-card';
  card.id = `invite-card-${invite.id}`;

  let timeLeft = Math.max(1, Math.round((invite.expiresAt - Date.now()) / 1000));

  const senderName = invite.sender?.display_name || invite.sender?.username || 'A friend';
  const senderAvatar = invite.sender?.avatar || '🎮';
  const gameName = invite.gameName || 'a game';

  card.innerHTML = `
    <div class="invite-header">
      <span>✉️ GAME INVITE</span>
      <span class="invite-timer" id="timer-${invite.id}">(${timeLeft}s)</span>
    </div>
    <div class="invite-text">
      <strong>${escapeHtml(senderAvatar)} ${escapeHtml(senderName)}</strong> invited you to play <strong>${escapeHtml(gameName)}</strong>!
      <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 2px;">Room: ${escapeHtml(invite.roomCode)}</div>
    </div>
    <div class="invite-actions">
      <button type="button" class="btn btn-sm btn-primary btn-accept-invite" style="flex: 1;">
        Accept
      </button>
      <button type="button" class="btn btn-sm btn-secondary btn-decline-invite">
        Decline
      </button>
    </div>
  `;

  // Accept button handler
  card.querySelector('.btn-accept-invite').onclick = () => {
    acceptInvitation(invite.id);
  };

  // Decline button handler
  card.querySelector('.btn-decline-invite').onclick = () => {
    declineInvitation(invite.id);
  };

  container.appendChild(card);

  // Sound/Vibrate notification if supported
  try {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  } catch (e) {}

  // 60-second countdown interval
  const timerInterval = setInterval(() => {
    timeLeft--;
    const timerLabel = document.getElementById(`timer-${invite.id}`);
    if (timerLabel) {
      timerLabel.textContent = `(${timeLeft}s)`;
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      removeInvitationCard(invite.id);
    }
  }, 1000);

  activeInvites.set(invite.id, { element: card, timerInterval });
}

export function acceptInvitation(inviteId) {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('accept_invitation', { inviteId });
  removeInvitationCard(inviteId);
}

export function declineInvitation(inviteId) {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('decline_invitation', { inviteId });
  removeInvitationCard(inviteId);
}

function removeInvitationCard(inviteId) {
  const data = activeInvites.get(inviteId);
  if (data) {
    clearInterval(data.timerInterval);
    if (data.element && data.element.parentNode) {
      data.element.parentNode.removeChild(data.element);
    }
    activeInvites.delete(inviteId);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
