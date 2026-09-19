// ==========================================
// GameRoom — Friends System Module
// ==========================================

import { getToken, getCurrentUser } from './auth.js';
import { getSocket } from './socket.js';

let friendsList = [];
let pendingReceived = [];
let pendingSent = [];
let selectedFriendForInvite = null;

export function initFriends() {
  // Subtab switching inside Friends view
  const subtabs = document.querySelectorAll('.friends-subtab');
  subtabs.forEach((tab) => {
    tab.onclick = () => {
      subtabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.subtab;
      document.querySelectorAll('.subtab-content').forEach((c) => c.classList.remove('active'));
      document.getElementById(`subtab-friends-${target}`)?.classList.add('active');

      if (target === 'list' || target === 'requests') {
        loadFriendsData();
      }
    };
  });

  // User search button and enter key
  const btnSearch = document.getElementById('btn-search-users');
  const inputSearch = document.getElementById('input-search-users');

  if (btnSearch && inputSearch) {
    btnSearch.onclick = () => handleUserSearch();
    inputSearch.onkeydown = (e) => {
      if (e.key === 'Enter') handleUserSearch();
    };
  }

  // Socket presence and friendship listeners
  const socket = getSocket();
  if (socket) {
    socket.off('presence_update');
    socket.on('presence_update', (data) => {
      updateFriendPresenceLocally(data.userId, data.isOnline, data.status);
    });

    socket.off('friend_request');
    socket.on('friend_request', (data) => {
      if (window.GameApp?.showToast) {
        window.GameApp.showToast(data.message, 'info');
      }
      loadFriendsData();
    });

    socket.off('friend_request_accepted');
    socket.on('friend_request_accepted', (data) => {
      if (window.GameApp?.showToast) {
        window.GameApp.showToast(data.message, 'success');
      }
      loadFriendsData();
    });

    socket.off('friend_removed');
    socket.on('friend_removed', () => {
      loadFriendsData();
    });
  }

  // Select Game to Invite Modal Buttons
  document.querySelectorAll('.btn-select-game').forEach((btn) => {
    btn.onclick = () => {
      const gameType = btn.dataset.game;
      if (selectedFriendForInvite && gameType) {
        sendDirectGameInvite(selectedFriendForInvite.id, gameType);
        window.GameApp?.closeModal('modal-select-game-invite');
      }
    };
  });
}

// Load friends and pending requests from backend
export async function loadFriendsData() {
  const token = getToken();
  if (!token) {
    const container = document.getElementById('friends-list-container');
    if (container) {
      container.innerHTML = `
        <div class="empty-state-hint" style="padding: 2rem 1rem; text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 0.6rem;">👥</div>
          <h3 style="color: #f3f4f6; margin-bottom: 0.4rem; font-size: 1.1rem; font-weight: 700;">Friends & Requests</h3>
          <p style="color: #9ca3af; font-size: 0.85rem; margin-bottom: 1.2rem; line-height: 1.45;">Log in or create an account to add friends, send game challenge invites, and see who is online!</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="window.GameApp?.openAuthModal ? window.GameApp.openAuthModal() : null">Log In / Sign Up</button>
        </div>
      `;
    }
    return;
  }

  try {
    const res = await fetch('/api/friends', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });

    if (!res.ok) return;
    const data = await res.json();

    friendsList = data.friends || [];
    pendingReceived = data.requestsReceived || [];
    pendingSent = data.requestsSent || [];

    updateFriendsBadges();
    renderFriendsList();
    renderRequestsList();
    renderHomeOnlineFriends();
  } catch (err) {
    console.warn('Friends data sync deferred (offline or reconnecting):', err.message || err);
  }
}

// Update Badges on navbar
function updateFriendsBadges() {
  const countSpan = document.getElementById('friends-count-num');
  if (countSpan) countSpan.textContent = friendsList.length;

  const reqBadge = document.getElementById('requests-badge');
  const dBadge = document.getElementById('friends-badge-desktop');
  const mBadge = document.getElementById('friends-badge-mobile');

  const pendingCount = pendingReceived.length;

  [reqBadge, dBadge, mBadge].forEach((badge) => {
    if (!badge) return;
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
}

// Render Friends Grid
function renderFriendsList() {
  const container = document.getElementById('friends-list-container');
  if (!container) return;

  if (friendsList.length === 0) {
    container.innerHTML = `
      <div class="empty-state-hint">
        <p>You haven't added any friends yet!</p>
        <button type="button" class="btn btn-sm btn-secondary mt-3" onclick="document.getElementById('subtab-btn-search').click()">
          Search & Add Players
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = friendsList
    .map((friend) => {
      const isOnline = friend.isOnline;
      const statusText = friend.presence || (isOnline ? 'Online' : 'Offline');
      const dotClass = isOnline ? (statusText === 'Online' ? 'online' : 'busy') : 'offline';

      return `
      <div class="friend-card glass-card">
        <div class="friend-info" style="cursor: pointer;" onclick="window.GameApp?.showPlayerProfile(${friend.id})">
          <span class="avatar-circle">${escapeHtml(friend.avatar || '🎮')}</span>
          <div class="friend-text">
            <h4>${escapeHtml(friend.display_name)}</h4>
            <div class="status-line">
              <span class="status-dot ${dotClass}"></span>
              <span>${escapeHtml(statusText)}</span>
            </div>
          </div>
        </div>
        <div class="friend-actions">
          ${
            isOnline
              ? `<button type="button" class="btn btn-sm btn-primary btn-invite-friend" onclick="window.FriendsModule?.promptInviteGame(${friend.id}, '${escapeHtml(friend.display_name)}')">
                  Invite
                </button>`
              : `<button type="button" class="btn btn-sm btn-secondary" disabled title="Friend is offline">
                  Offline
                </button>`
          }
          <button type="button" class="btn btn-sm btn-ghost" title="Remove Friend" onclick="window.FriendsModule?.removeFriend(${friend.id})">
            ✕
          </button>
        </div>
      </div>
    `;
    })
    .join('');
}

// Render Horizontal Online Friends on Home Screen
export function renderHomeOnlineFriends() {
  const container = document.getElementById('home-online-friends-list');
  if (!container) return;

  const onlineFriends = friendsList.filter((f) => f.isOnline);

  if (onlineFriends.length === 0) {
    container.innerHTML = `
      <div class="empty-state-hint compact">
        No friends online
      </div>
    `;
    return;
  }

  container.innerHTML = onlineFriends
    .map(
      (f) => `
      <div class="online-friend-chip glass-card">
        <span class="status-dot ${f.presence === 'Online' ? 'online' : 'busy'}"></span>
        <span class="avatar-circle" style="width: 28px; height: 28px; font-size: 0.9rem;">${escapeHtml(f.avatar || '🎮')}</span>
        <div>
          <div class="friend-chip-name">${escapeHtml(f.display_name)}</div>
          <div class="friend-chip-status">${escapeHtml(f.presence || 'Online')}</div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" style="padding: 0.2rem 0.6rem; font-size: 0.75rem; min-height: 28px;" onclick="window.FriendsModule?.promptInviteGame(${f.id}, '${escapeHtml(f.display_name)}')">
          Invite
        </button>
      </div>
    `
    )
    .join('');
}

// Render Received and Sent Friend Requests
function renderRequestsList() {
  const receivedContainer = document.getElementById('requests-received-list');
  const sentContainer = document.getElementById('requests-sent-list');

  if (receivedContainer) {
    if (pendingReceived.length === 0) {
      receivedContainer.innerHTML = '<div class="empty-state-hint">No incoming requests.</div>';
    } else {
      receivedContainer.innerHTML = pendingReceived
        .map(
          (req) => `
        <div class="friend-card glass-card">
          <div class="friend-info">
            <span class="avatar-circle">${escapeHtml(req.avatar || '🎮')}</span>
            <div class="friend-text">
              <h4>${escapeHtml(req.display_name)}</h4>
              <div class="handle">@${escapeHtml(req.username)}</div>
            </div>
          </div>
          <div class="friend-actions">
            <button type="button" class="btn btn-sm btn-primary" onclick="window.FriendsModule?.respondFriendRequest(${req.request_id}, 'accept')">
              Accept
            </button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.FriendsModule?.respondFriendRequest(${req.request_id}, 'reject')">
              Decline
            </button>
          </div>
        </div>
      `
        )
        .join('');
    }
  }

  if (sentContainer) {
    if (pendingSent.length === 0) {
      sentContainer.innerHTML = '<div class="empty-state-hint">No outgoing pending requests.</div>';
    } else {
      sentContainer.innerHTML = pendingSent
        .map(
          (req) => `
        <div class="friend-card glass-card">
          <div class="friend-info">
            <span class="avatar-circle">${escapeHtml(req.avatar || '🎮')}</span>
            <div class="friend-text">
              <h4>${escapeHtml(req.display_name)}</h4>
              <div class="handle">@${escapeHtml(req.username)}</div>
            </div>
          </div>
          <div class="friend-actions">
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.FriendsModule?.respondFriendRequest(${req.request_id}, 'reject')">
              Cancel
            </button>
          </div>
        </div>
      `
        )
        .join('');
    }
  }
}

// Search users
async function handleUserSearch() {
  const query = document.getElementById('input-search-users')?.value.trim();
  const container = document.getElementById('search-results-list');
  if (!container) return;

  if (!query) {
    container.innerHTML = '<div class="empty-state-hint">Please enter a username to search.</div>';
    return;
  }

  container.innerHTML = '<div class="empty-state-hint">Searching users...</div>';

  try {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { headers });
    if (!res.ok) throw new Error('Search failed');

    const data = await res.json();
    const users = data.users || [];

    if (users.length === 0) {
      container.innerHTML = `<div class="empty-state-hint">No players found matching "${escapeHtml(query)}".</div>`;
      return;
    }

    container.innerHTML = users
      .map((u) => {
        let actionBtn = '';
        if (u.friendStatus === 'friends') {
          actionBtn = '<span class="status-pill">Friends</span>';
        } else if (u.friendStatus === 'pending_sent') {
          actionBtn = '<span class="tag">Request Sent</span>';
        } else if (u.friendStatus === 'pending_received') {
          actionBtn = `<button type="button" class="btn btn-sm btn-primary" onclick="window.FriendsModule?.respondFriendRequest(${u.friendRequestId}, 'accept')">Accept</button>`;
        } else {
          actionBtn = `<button type="button" class="btn btn-sm btn-primary" onclick="window.FriendsModule?.sendFriendRequest(${u.id})">+ Add Friend</button>`;
        }

        return `
        <div class="friend-card glass-card">
          <div class="friend-info" style="cursor: pointer;" onclick="window.GameApp?.showPlayerProfile(${u.id})">
            <span class="avatar-circle">${escapeHtml(u.avatar || '🎮')}</span>
            <div class="friend-text">
              <h4>${escapeHtml(u.display_name)}</h4>
              <div class="handle">@${escapeHtml(u.username)}</div>
            </div>
          </div>
          <div class="friend-actions">
            ${actionBtn}
          </div>
        </div>
      `;
      })
      .join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state-hint">Failed to perform search.</div>';
  }
}

// Send Friend Request
export async function sendFriendRequest(targetUserId) {
  const token = getToken();
  if (!token) {
    if (window.GameApp?.showToast) {
      window.GameApp.showToast('Please log in or sign up to add friends!', 'warning');
    }
    if (window.GameApp?.openAuthModal) {
      window.GameApp.openAuthModal();
    }
    return;
  }

  try {
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetUserId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send request');

    window.GameApp?.showToast('Friend request sent!', 'success');
    handleUserSearch();
    loadFriendsData();
  } catch (err) {
    window.GameApp?.showToast(err.message, 'error');
  }
}

// Respond to request
export async function respondFriendRequest(requestId, action) {
  const token = getToken();
  try {
    const res = await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId, action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    window.GameApp?.showToast(action === 'accept' ? 'Friend request accepted!' : 'Request removed.', 'info');
    loadFriendsData();
  } catch (err) {
    window.GameApp?.showToast(err.message, 'error');
  }
}

// Remove Friend
export async function removeFriend(friendId) {
  if (!confirm('Are you sure you want to remove this friend?')) return;

  const token = getToken();
  try {
    const res = await fetch(`/api/friends/${friendId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to remove friend');

    window.GameApp?.showToast('Friend removed.', 'info');
    loadFriendsData();
  } catch (err) {
    window.GameApp?.showToast(err.message, 'error');
  }
}

// Prompt game selection modal when clicking Invite on a friend
export function promptInviteGame(friendId, friendName) {
  selectedFriendForInvite = { id: friendId, name: friendName };
  const label = document.getElementById('select-game-friend-name');
  if (label) {
    label.textContent = `Invite ${friendName} to play:`;
  }
  window.GameApp?.openModal('modal-select-game-invite');
}

// Send direct real-time invitation via Socket
export function sendDirectGameInvite(friendId, gameType) {
  const socket = getSocket();
  if (!socket) return;
  socket.emit('send_invitation', { friendId, gameType });
}

// Updates presence in client memory and re-renders lists
function updateFriendPresenceLocally(userId, isOnline, status) {
  let changed = false;
  friendsList = friendsList.map((f) => {
    if (f.id === userId) {
      changed = true;
      return { ...f, isOnline, presence: status };
    }
    return f;
  });

  if (changed) {
    renderFriendsList();
    renderHomeOnlineFriends();
  }
}

export function getOnlineFriends() {
  return friendsList.filter((f) => f.isOnline);
}

// Expose on window for easy inline event handlers
window.FriendsModule = {
  promptInviteGame,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
};

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
