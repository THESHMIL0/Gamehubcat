// ==========================================
// GameRoom — Friends System Module (Instagram DM Style)
// ==========================================

import { getToken, getCurrentUser } from './auth.js';
import { getSocket } from './socket.js';

let friendsList = [];
let pendingReceived = [];
let pendingSent = [];
let selectedFriendForInvite = null;
let searchDebounceTimer = null;
let currentSearchQuery = '';

export function initFriends() {
  // Navigation between Instagram DM Inbox and Requests sub-page
  const btnGotoRequests = document.getElementById('btn-goto-requests');
  const btnBackToDmInbox = document.getElementById('btn-back-to-dm-inbox');

  if (btnGotoRequests) {
    btnGotoRequests.onclick = () => openRequestsPage();
  }

  if (btnBackToDmInbox) {
    btnBackToDmInbox.onclick = () => openInboxPage();
  }

  // Refresh messages button
  const btnRefresh = document.getElementById('btn-refresh-friends');
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      btnRefresh.style.transform = 'rotate(180deg)';
      btnRefresh.style.transition = 'transform 0.3s ease';
      setTimeout(() => {
        btnRefresh.style.transform = 'none';
      }, 300);
      loadFriendsData();
    };
  }

  // Live real-time user search input
  const inputSearch = document.getElementById('input-friends-search');
  const btnClearSearch = document.getElementById('btn-clear-friends-search');

  if (inputSearch) {
    inputSearch.oninput = () => {
      const query = inputSearch.value.trim();
      currentSearchQuery = query;

      if (btnClearSearch) {
        btnClearSearch.classList.toggle('hidden', query.length === 0);
      }

      clearTimeout(searchDebounceTimer);
      if (query.length === 0) {
        closeSearchResultsView();
      } else {
        searchDebounceTimer = setTimeout(() => {
          handleUserSearch(query);
        }, 220);
      }
    };

    inputSearch.onkeydown = (e) => {
      if (e.key === 'Escape') {
        inputSearch.value = '';
        currentSearchQuery = '';
        if (btnClearSearch) btnClearSearch.classList.add('hidden');
        closeSearchResultsView();
        inputSearch.blur();
      }
    };
  }

  if (btnClearSearch) {
    btnClearSearch.onclick = () => {
      if (inputSearch) {
        inputSearch.value = '';
        inputSearch.focus();
      }
      currentSearchQuery = '';
      btnClearSearch.classList.add('hidden');
      closeSearchResultsView();
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
        window.GameApp.showToast(data.message || 'You received a new friend request!', 'info');
      }
      loadFriendsData();

      // If user is currently in the Friends section, open the Instagram requests sub-page
      const friendsView = document.getElementById('view-friends');
      if (friendsView && friendsView.classList.contains('active')) {
        openRequestsPage();
      }
    });

    socket.off('friend_request_accepted');
    socket.on('friend_request_accepted', (data) => {
      if (window.GameApp?.showToast) {
        window.GameApp.showToast(data.message || 'Friend request accepted!', 'success');
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
  }  );
}

// Open Instagram DM Requests sub-page
export function openRequestsPage() {
  const inbox = document.getElementById('insta-dm-inbox');
  const requestsPage = document.getElementById('insta-dm-requests-page');
  if (inbox && requestsPage) {
    inbox.classList.remove('active');
    inbox.classList.add('hidden');
    requestsPage.classList.remove('hidden');
    requestsPage.classList.add('active');
  }
}

// Return to Instagram DM Inbox
export function openInboxPage() {
  const inbox = document.getElementById('insta-dm-inbox');
  const requestsPage = document.getElementById('insta-dm-requests-page');
  if (inbox && requestsPage) {
    requestsPage.classList.remove('active');
    requestsPage.classList.add('hidden');
    inbox.classList.remove('hidden');
    inbox.classList.add('active');
  }
}

// Show/Hide search results view in inbox
function showSearchResultsView() {
  const searchResults = document.getElementById('insta-dm-search-results');
  const friendsFeed = document.getElementById('friends-list-container');
  if (searchResults) searchResults.classList.remove('hidden');
  if (friendsFeed) friendsFeed.classList.add('hidden');
}

function closeSearchResultsView() {
  const searchResults = document.getElementById('insta-dm-search-results');
  const friendsFeed = document.getElementById('friends-list-container');
  if (searchResults) {
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '<div class="empty-state-hint">Type a username to search players...</div>';
  }
  if (friendsFeed) friendsFeed.classList.remove('hidden');
}

// Load friends and pending requests from backend
export async function loadFriendsData() {
  // Sync top handle with current user
  const handleEl = document.getElementById('insta-dm-user-handle');
  const currentUser = getCurrentUser();
  if (handleEl) {
    if (currentUser && (currentUser.display_name || currentUser.username)) {
      handleEl.textContent = currentUser.display_name || currentUser.username;
    } else {
      handleEl.textContent = 'Messages';
    }
  }

  const token = getToken();
  if (!token) {
    const container = document.getElementById('friends-list-container');
    if (container) {
      container.innerHTML = `
        <div class="insta-dm-empty">
          <div class="insta-dm-empty-icon">💬</div>
          <h4>Instagram Direct Messages</h4>
          <p>Sign in or create an account to search players, send message requests, and challenge friends to live duels.</p>
          <button type="button" class="btn-insta-req-confirm" style="margin-top: 1.25rem; padding: 8px 20px; font-size: 0.9rem;" onclick="window.GameApp?.openAuthModal ? window.GameApp.openAuthModal() : null">
            Log In / Sign Up
          </button>
        </div>
      `;
    }
    updateFriendsBadges();
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

// Update Badges on navbar and inside DM layout
function updateFriendsBadges() {
  const countSpan = document.getElementById('friends-count-num');
  if (countSpan) countSpan.textContent = friendsList.length;

  const instaReqBadge = document.getElementById('insta-requests-badge');
  const dBadge = document.getElementById('friends-badge-desktop');
  const mBadge = document.getElementById('friends-badge-mobile');
  const recCount = document.getElementById('requests-received-count');
  const sentCount = document.getElementById('requests-sent-count');

  const pendingCount = pendingReceived.length;
  const sentPendingCount = pendingSent.length;

  if (recCount) recCount.textContent = pendingCount;
  if (sentCount) sentCount.textContent = sentPendingCount;

  // Instagram Requests Pill Badge on DM subbar
  if (instaReqBadge) {
    if (pendingCount > 0) {
      instaReqBadge.textContent = pendingCount;
      instaReqBadge.classList.remove('hidden');
    } else {
      instaReqBadge.classList.add('hidden');
    }
  }

  // Main Desktop & Mobile Nav Badges
  [dBadge, mBadge].forEach((badge) => {
    if (!badge) return;
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
}

// Render Friends as Instagram DM Rows
function renderFriendsList() {
  const container = document.getElementById('friends-list-container');
  if (!container) return;

  if (friendsList.length === 0) {
    container.innerHTML = `
      <div class="insta-dm-empty">
        <div class="insta-dm-empty-icon">💬</div>
        <h4>Your Messages</h4>
        <p>Send invites and challenge friends to live duels right from your inbox. Search for players above to get started!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = friendsList
    .map((friend) => {
      const isOnline = friend.isOnline;
      const statusText = friend.presence || (isOnline ? 'Active now' : 'Offline');

      return `
      <div class="insta-dm-row" onclick="window.FriendsModule?.promptInviteGame(${friend.id}, '${escapeHtml(friend.display_name)}')">
        <div class="insta-dm-avatar-wrap">
          <span class="insta-dm-avatar">${escapeHtml(friend.avatar || '🎮')}</span>
          ${isOnline ? '<span class="insta-dm-online-dot" title="Active now"></span>' : ''}
        </div>
        <div class="insta-dm-content">
          <div class="insta-dm-name-row">
            <span class="insta-dm-name">${escapeHtml(friend.display_name)}</span>
            <span class="insta-dm-handle">@${escapeHtml(friend.username)}</span>
          </div>
          <div class="insta-dm-snippet-row">
            <span class="insta-dm-snippet ${isOnline ? 'active-now' : ''}">${escapeHtml(statusText)}</span>
            <span class="insta-dm-dot-sep">•</span>
            <span class="insta-dm-tap-hint">Tap to duel</span>
          </div>
        </div>
        <div class="insta-dm-actions" onclick="event.stopPropagation()">
          <button type="button" class="btn-insta-duel" title="Challenge to live duel" onclick="window.FriendsModule?.promptInviteGame(${friend.id}, '${escapeHtml(friend.display_name)}')">
            ⚔️ Duel
          </button>
          <button type="button" class="btn-insta-more" title="Remove Friend" onclick="window.FriendsModule?.removeFriend(${friend.id})">
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

// Render Received and Sent Friend Requests (Instagram Style)
function renderRequestsList() {
  const receivedContainer = document.getElementById('requests-received-list');
  const sentContainer = document.getElementById('requests-sent-list');

  if (receivedContainer) {
    if (pendingReceived.length === 0) {
      receivedContainer.innerHTML = `
        <div class="empty-state-hint" style="padding: 2rem 1rem; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 0.4rem;">📬</div>
          <p style="color: #8e8e8e; font-size: 0.85rem;">No pending message requests</p>
        </div>
      `;
    } else {
      receivedContainer.innerHTML = pendingReceived
        .map(
          (req) => `
        <div class="insta-request-row">
          <div class="insta-request-avatar-wrap" onclick="window.GameApp?.showPlayerProfile(${req.user_id || req.sender_id || req.id})" title="View Profile">
            <span>${escapeHtml(req.avatar || '🎮')}</span>
          </div>
          <div class="insta-request-info">
            <div class="insta-request-name">${escapeHtml(req.display_name)}</div>
            <div class="insta-request-sub">@${escapeHtml(req.username)} • Wants to connect</div>
          </div>
          <div class="insta-request-actions">
            <button type="button" class="btn-insta-req-confirm" onclick="window.FriendsModule?.respondFriendRequest(${req.request_id}, 'accept')">
              Confirm
            </button>
            <button type="button" class="btn-insta-req-delete" onclick="window.FriendsModule?.respondFriendRequest(${req.request_id}, 'reject')">
              Delete
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
      sentContainer.innerHTML = `
        <div class="empty-state-hint" style="padding: 1.5rem 1rem; text-align: center;">
          <p style="color: #737373; font-size: 0.82rem;">No outgoing pending requests</p>
        </div>
      `;
    } else {
      sentContainer.innerHTML = pendingSent
        .map(
          (req) => `
        <div class="insta-request-row">
          <div class="insta-request-avatar-wrap" onclick="window.GameApp?.showPlayerProfile(${req.user_id || req.id})" title="View Profile">
            <span>${escapeHtml(req.avatar || '🎮')}</span>
          </div>
          <div class="insta-request-info">
            <div class="insta-request-name">${escapeHtml(req.display_name)}</div>
            <div class="insta-request-sub">@${escapeHtml(req.username)} • Request pending</div>
          </div>
          <div class="insta-request-actions">
            <button type="button" class="btn-insta-req-cancel" onclick="window.FriendsModule?.respondFriendRequest(${req.request_id}, 'reject')">
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

// Real-time Search Users (Instagram Style)
async function handleUserSearch(query) {
  const container = document.getElementById('insta-dm-search-results');
  if (!container) return;

  showSearchResultsView();

  if (!query) {
    container.innerHTML = '<div class="empty-state-hint">Type a username to search players...</div>';
    return;
  }

  container.innerHTML = '<div class="empty-state-hint">Searching players...</div>';

  try {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { headers });
    if (!res.ok) throw new Error('Search failed');

    const data = await res.json();
    const users = data.users || [];

    if (users.length === 0) {
      container.innerHTML = `
        <div class="empty-state-hint" style="padding: 2.5rem 1rem; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
          <p style="color: #8e8e8e; font-size: 0.88rem;">No players found matching "<strong>${escapeHtml(query)}</strong>"</p>
        </div>
      `;
      return;
    }

    container.innerHTML = users
      .map((u) => {
        let actionBtn = '';
        if (u.friendStatus === 'friends') {
          actionBtn = '<span class="insta-status-pill">Friends</span>';
        } else if (u.friendStatus === 'pending_sent') {
          actionBtn = '<span class="insta-status-pill">Requested</span>';
        } else if (u.friendStatus === 'pending_received') {
          actionBtn = `<button type="button" class="btn-insta-req-confirm" onclick="window.FriendsModule?.respondFriendRequest(${u.friendRequestId}, 'accept')">Confirm</button>`;
        } else {
          actionBtn = `<button type="button" class="btn-insta-req-confirm" onclick="window.FriendsModule?.sendFriendRequest(${u.id})">+ Follow / Add</button>`;
        }

        const isOnline = u.isOnline;
        const statusSnippet = isOnline ? 'Active now' : `@${escapeHtml(u.username)}`;

        return `
        <div class="insta-dm-row">
          <div class="insta-dm-avatar-wrap" onclick="window.GameApp?.showPlayerProfile(${u.id})" title="View Profile" style="cursor: pointer;">
            <span class="insta-dm-avatar">${escapeHtml(u.avatar || '🎮')}</span>
            ${isOnline ? '<span class="insta-dm-online-dot" title="Active now"></span>' : ''}
          </div>
          <div class="insta-dm-content" onclick="window.GameApp?.showPlayerProfile(${u.id})" style="cursor: pointer;">
            <div class="insta-dm-name-row">
              <span class="insta-dm-name">${escapeHtml(u.display_name)}</span>
            </div>
            <div class="insta-dm-snippet-row">
              <span class="insta-dm-snippet ${isOnline ? 'active-now' : ''}">${statusSnippet}</span>
            </div>
          </div>
          <div class="insta-dm-actions" onclick="event.stopPropagation()">
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
    if (currentSearchQuery) {
      handleUserSearch(currentSearchQuery);
    }
    loadFriendsData();
  } catch (err) {
    window.GameApp?.showToast(err.message, 'error');
  }
}

// Respond to request (accept or reject)
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
    if (currentSearchQuery) {
      handleUserSearch(currentSearchQuery);
    }
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

// Prompt game selection modal when clicking Invite / Duel on a friend
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
  openRequestsPage,
  openInboxPage,
};

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
