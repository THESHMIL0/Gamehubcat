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
  const gameName = invite.gameName || 'a game';
  const gameLogo = invite.gameType === 'rps'
    ? '/assets/logo-rps.svg'
    : (invite.gameType === 'connect4' ? '/assets/logo-connect4.svg' : '/assets/logo-tictactoe.svg');

  card.innerHTML = `
    <div class="invite-header" style="display: flex; align-items: center; justify-content: space-between;">
      <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #a5b4fc; font-size: 0.82rem; letter-spacing: 0.04em;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>
        GAME DUEL INVITE
      </span>
      <span class="invite-timer" id="timer-${invite.id}">(${timeLeft}s)</span>
    </div>
    <div class="invite-body" style="display: flex; align-items: center; gap: 12px; margin: 10px 0;">
      <img src="${gameLogo}" alt="${escapeHtml(gameName)}" style="width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; background: rgba(0,0,0,0.5); padding: 4px; border: 1px solid rgba(255,255,255,0.1); object-fit: contain;">
      <div class="invite-text" style="font-size: 0.88rem; line-height: 1.35; color: #f1f5f9;">
        <strong>${escapeHtml(senderName)}</strong> challenged you to <strong>${escapeHtml(gameName)}</strong>!
        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">Room: ${escapeHtml(invite.roomCode)}</div>
      </div>
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
