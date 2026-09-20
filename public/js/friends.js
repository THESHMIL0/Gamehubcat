// ==========================================
// GameRoom — Friends & Instagram DM Chat Module
// ==========================================

import { getToken, getCurrentUser } from './auth.js';
import { getSocket } from './socket.js';

let friendsList = [];
let pendingReceived = [];
let pendingSent = [];
let selectedFriendForInvite = null;
let searchDebounceTimer = null;
let currentSearchQuery = '';
let activeChatFriend = null;

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

  // Navigation from 1-on-1 DM Chat back to Inbox
  const btnBackFromDmChat = document.getElementById('btn-back-from-dm-chat');
  if (btnBackFromDmChat) {
    btnBackFromDmChat.onclick = () => closeDmChat();
  }

  // 1-on-1 DM Chat Form Submission
  const formDmChat = document.getElementById('form-dm-chat');
  const inputDmChat = document.getElementById('input-dm-chat');
  if (formDmChat && inputDmChat) {
    formDmChat.onsubmit = (e) => {
      e.preventDefault();
      const text = inputDmChat.value.trim();
      if (!text) return;
      sendDmMessage(text);
      inputDmChat.value = '';
      inputDmChat.focus();
    };
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

  // Socket presence, messaging and friendship listeners
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

    // Real-time 1v1 Direct Message listener
    socket.off('dm_message');
    socket.on('dm_message', (msg) => {
      handleIncomingDmMessage(msg);
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

// Open Instagram DM Requests sub-page
export function openRequestsPage() {
  const inbox = document.getElementById('insta-dm-inbox');
  const requestsPage = document.getElementById('insta-dm-requests-page');
  const chatPage = document.getElementById('insta-dm-chat-page');

  if (inbox) {
    inbox.classList.remove('active');
    inbox.classList.add('hidden');
  }
  if (chatPage) {
    chatPage.classList.remove('active');
    chatPage.classList.add('hidden');
  }
  if (requestsPage) {
    requestsPage.classList.remove('hidden');
    requestsPage.classList.add('active');
  }
}

// Return to Instagram DM Inbox
export function openInboxPage() {
  const inbox = document.getElementById('insta-dm-inbox');
  const requestsPage = document.getElementById('insta-dm-requests-page');
  const chatPage = document.getElementById('insta-dm-chat-page');

  activeChatFriend = null;

  if (requestsPage) {
    requestsPage.classList.remove('active');
    requestsPage.classList.add('hidden');
  }
  if (chatPage) {
    chatPage.classList.remove('active');
    chatPage.classList.add('hidden');
  }
  if (inbox) {
    inbox.classList.remove('hidden');
    inbox.classList.add('active');
  }
}

// ==========================================
// 1-ON-1 DIRECT MESSAGE CHAT SCREEN LOGIC
// ==========================================

export async function openDmChat(friendId) {
  const inbox = document.getElementById('insta-dm-inbox');
  const requestsPage = document.getElementById('insta-dm-requests-page');
  const chatPage = document.getElementById('insta-dm-chat-page');

  let friend = friendsList.find((f) => String(f.id) === String(friendId));

  // If friend not found in memory (e.g. opened from search or profile), fetch from API
  if (!friend) {
    try {
      const res = await fetch(`/api/users/${friendId}`);
      if (res.ok) {
        const data = await res.json();
        friend = {
          id: data.user.id,
          username: data.user.username,
          display_name: data.user.display_name,
          avatar: data.user.avatar,
          isOnline: data.isOnline,
          presence: data.presence,
        };
      }
    } catch (e) {
      console.warn('Failed to load user info:', e);
    }
  }

  if (!friend) {
    if (window.GameApp?.showToast) {
      window.GameApp.showToast('Could not open chat with this user.', 'warning');
    }
    return;
  }

  activeChatFriend = friend;

  // Ensure friends view is active in main app
  const friendsView = document.getElementById('view-friends');
  if (friendsView && !friendsView.classList.contains('active')) {
    if (window.GameApp?.switchView) {
      window.GameApp.switchView('friends');
    }
  }

  // Switch to Chat Page
  if (inbox) {
    inbox.classList.remove('active');
    inbox.classList.add('hidden');
  }
  if (requestsPage) {
    requestsPage.classList.remove('active');
    requestsPage.classList.add('hidden');
  }
  if (chatPage) {
    chatPage.classList.remove('hidden');
    chatPage.classList.add('active');
  }

  // Instagram Experience: Hide mobile bottom navigation so DM input box is 100% visible at the bottom
  document.body.classList.add('in-dm-chat');
  document.getElementById('mobile-bottom-nav')?.classList.add('hidden');

  // Populate Header
  const headerAvatar = document.getElementById('dm-chat-header-avatar');
  const headerOnlinePip = document.getElementById('dm-chat-header-online-pip');
  const headerName = document.getElementById('dm-chat-header-name');
  const headerStatus = document.getElementById('dm-chat-header-status');

  if (headerAvatar) headerAvatar.textContent = friend.avatar || '🎮';
  if (headerName) headerName.textContent = friend.display_name || friend.username || 'Friend';
  if (headerOnlinePip) headerOnlinePip.classList.toggle('hidden', !friend.isOnline);
  if (headerStatus) {
    headerStatus.textContent = friend.isOnline ? 'Active now' : (friend.presence || 'Offline');
    headerStatus.classList.toggle('active', !!friend.isOnline);
  }

  // Populate Intro Card
  const introAvatar = document.getElementById('dm-chat-intro-avatar');
  const introName = document.getElementById('dm-chat-intro-name');
  const introHandle = document.getElementById('dm-chat-intro-handle');

  if (introAvatar) introAvatar.textContent = friend.avatar || '🎮';
  if (introName) introName.textContent = friend.display_name || friend.username || 'Friend';
  if (introHandle) introHandle.textContent = `@${friend.username || ''} • GameRoom Friend`;

  // Wire Duel and Profile action buttons inside DM
  const onDuelClick = () => {
    promptInviteGame(friend.id, friend.display_name || friend.username);
  };
  const onProfileClick = () => {
    if (window.GameApp?.showPlayerProfile) {
      window.GameApp.showPlayerProfile(friend.id);
    }
  };
  const onRemoveFriendClick = () => {
    promptRemoveFriend(friend);
  };

  const btnHeaderDuel = document.getElementById('btn-dm-chat-duel');
  const btnIntroDuel = document.getElementById('btn-dm-intro-duel');
  const btnPillDuel = document.getElementById('btn-dm-pill-duel');
  if (btnHeaderDuel) btnHeaderDuel.onclick = onDuelClick;
  if (btnIntroDuel) btnIntroDuel.onclick = onDuelClick;
  if (btnPillDuel) btnPillDuel.onclick = onDuelClick;

  const btnHeaderProfile = document.getElementById('btn-dm-chat-profile');
  const btnIntroProfile = document.getElementById('btn-dm-intro-profile');
  const headerUserClickable = document.getElementById('dm-chat-header-user-clickable');
  if (btnHeaderProfile) {
    btnHeaderProfile.title = 'Remove Friend';
    btnHeaderProfile.onclick = onRemoveFriendClick;
  }
  if (btnIntroProfile) btnIntroProfile.onclick = onProfileClick;
  if (headerUserClickable) headerUserClickable.onclick = onProfileClick;

  // Clear messages list and show loading state
  const messagesList = document.getElementById('dm-chat-messages-list');
  if (messagesList) {
    messagesList.innerHTML = '<div class="empty-state-hint compact" style="padding: 1rem; color: #737373;">Loading messages...</div>';
  }

  // Load message history from REST API
  try {
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`/api/dm/${friend.id}`, { headers });
    if (res.ok) {
      const data = await res.json();
      renderDmMessagesHistory(data.messages || []);
    } else {
      if (messagesList) messagesList.innerHTML = '';
    }
  } catch (err) {
    if (messagesList) messagesList.innerHTML = '';
  }

  // Focus input field
  const inputEl = document.getElementById('input-dm-chat');
  if (inputEl) {
    inputEl.value = '';
    setTimeout(() => inputEl.focus(), 150);
  }
}

export function closeDmChat() {
  activeChatFriend = null;
  const chatPage = document.getElementById('insta-dm-chat-page');
  const inbox = document.getElementById('insta-dm-inbox');

  if (chatPage) {
    chatPage.classList.remove('active');
    chatPage.classList.add('hidden');
  }
  if (inbox) {
    inbox.classList.remove('hidden');
    inbox.classList.add('active');
  }

  // Restore mobile bottom nav when leaving DM chat back to inbox
  document.body.classList.remove('in-dm-chat');
  document.getElementById('mobile-bottom-nav')?.classList.remove('hidden');

  loadFriendsData();
}

// Send Direct Message (Socket with REST fallback)
export async function sendDmMessage(text) {
  if (!activeChatFriend || !text) return;
  const token = getToken();
  const socket = getSocket();

  if (socket && socket.connected) {
    socket.emit('send_dm', { receiverId: activeChatFriend.id, text });
  } else if (token) {
    try {
      const res = await fetch(`/api/dm/${activeChatFriend.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.message) {
          appendDmMessage(data.message);
        }
      }
    } catch (err) {
      console.error('Failed to send DM via REST:', err);
    }
  }
}

// Handles incoming DM message from socket
function handleIncomingDmMessage(msg) {
  const currentUser = getCurrentUser();
  const myId = currentUser?.id;
  const isMine = msg.isMine !== undefined ? msg.isMine : (String(msg.senderId) === String(myId));
  const otherUserId = isMine ? msg.receiverId : msg.senderId;

  // If user is currently in this exact DM chat, append message immediately
  if (activeChatFriend && String(activeChatFriend.id) === String(otherUserId)) {
    appendDmMessage(msg);
  } else if (!isMine) {
    // Show Instagram style toast banner notification
    if (window.GameApp?.showToast) {
      const senderName = msg.sender?.display_name || 'Friend';
      window.GameApp.showToast(`${senderName}: ${msg.text}`, 'info');
    }
    // Update local memory snippet
    updateFriendLastMessageLocally(otherUserId, msg.text, msg.createdAt, false);
    renderFriendsList();
  }
}

// Render message history list
function renderDmMessagesHistory(messages) {
  const container = document.getElementById('dm-chat-messages-list');
  if (!container) return;
  container.innerHTML = '';

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state-hint compact" style="text-align: center; color: #737373; font-size: 0.8rem; padding: 1.5rem 0;">
        No messages yet. Send a greeting to start chatting!
      </div>
    `;
    return;
  }

  messages.forEach((m) => appendDmMessage(m));
  scrollDmToBottom();
}

// Appends single DM message bubble
function appendDmMessage(msg) {
  const container = document.getElementById('dm-chat-messages-list');
  if (!container) return;

  const emptyHint = container.querySelector('.empty-state-hint');
  if (emptyHint) emptyHint.remove();

  if (msg.id && container.querySelector(`[data-msg-id="${msg.id}"]`)) {
    return;
  }

  const currentUser = getCurrentUser();
  const myId = currentUser?.id;
  const isMine = msg.isMine !== undefined ? msg.isMine : (String(msg.senderId) === String(myId));

  const row = document.createElement('div');
  row.className = `dm-msg-row ${isMine ? 'dm-mine' : 'dm-theirs'}`;
  if (msg.id) row.setAttribute('data-msg-id', msg.id);

  row.innerHTML = `
    <div class="dm-bubble-wrap">
      <div class="dm-bubble" title="${escapeHtml(msg.timestamp || '')}">
        ${escapeHtml(msg.text)}
      </div>
    </div>
    <span class="dm-msg-time">${escapeHtml(msg.timestamp || '')}</span>
  `;

  // Double-click to heart reaction
  const bubble = row.querySelector('.dm-bubble');
  if (bubble) {
    bubble.ondblclick = () => {
      const existing = row.querySelector('.dm-heart-badge');
      if (existing) {
        existing.remove();
      } else {
        const badge = document.createElement('span');
        badge.className = 'dm-heart-badge';
        badge.textContent = '❤️';
        row.querySelector('.dm-bubble-wrap')?.appendChild(badge);
      }
    };
  }

  container.appendChild(row);
  scrollDmToBottom();

  // Also update last message in conversation list
  if (activeChatFriend) {
    updateFriendLastMessageLocally(activeChatFriend.id, msg.text, msg.createdAt || new Date().toISOString(), isMine);
  }
}

function scrollDmToBottom() {
  const viewport = document.getElementById('dm-chat-viewport');
  if (viewport) {
    setTimeout(() => {
      viewport.scrollTop = viewport.scrollHeight;
    }, 40);
  }
}

function updateFriendLastMessageLocally(friendId, text, createdAt, isMine) {
  friendsList = friendsList.map((f) => {
    if (String(f.id) === String(friendId)) {
      return {
        ...f,
        lastMessage: {
          text,
          createdAt,
          isMine,
        },
      };
    }
    return f;
  });
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
          <div class="insta-dm-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </div>
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

// Render Friends as Instagram DM Rows (Clicking row opens DM chat)
function renderFriendsList() {
  const container = document.getElementById('friends-list-container');
  if (!container) return;

  if (friendsList.length === 0) {
    container.innerHTML = `
      <div class="insta-dm-empty">
        <div class="insta-dm-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h4>Your Messages</h4>
        <p>Send direct messages and challenge players to live duels right from your inbox.</p>
        <button type="button" class="btn-insta-req-confirm" style="margin-top: 14px; padding: 10px 22px; font-size: 0.9rem; display: inline-flex; align-items: center; justify-content: center; gap: 8px;" onclick="const inp = document.getElementById('input-friends-search'); if (inp) { inp.focus(); }">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Search Players to Chat</span>
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = friendsList
    .map((friend) => {
      const isOnline = friend.isOnline;

      return `
      <div class="insta-dm-row" onclick="window.FriendsModule?.openDmChat(${friend.id})" title="Chat with ${escapeHtml(friend.display_name)}">
        <div class="insta-dm-avatar-wrap">
          <span class="insta-dm-avatar">${escapeHtml(friend.avatar || '🎮')}</span>
          ${isOnline ? '<span class="insta-dm-online-dot" title="Active now"></span>' : ''}
        </div>
        <div class="insta-dm-content">
          <div class="insta-dm-name-row">
            <span class="insta-dm-name">${escapeHtml(friend.display_name)}</span>
          </div>
        </div>
        <div class="insta-dm-chevron">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
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
        <div style="cursor: pointer;" onclick="window.FriendsModule?.openDmChat(${f.id})">
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
          <div style="margin-bottom: 0.5rem; display: flex; justify-content: center; color: var(--text-muted, #8e8e8e);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
          </div>
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
          <div style="margin-bottom: 0.5rem; display: flex; justify-content: center; color: var(--text-muted, #8e8e8e);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
          <p style="color: #8e8e8e; font-size: 0.88rem;">No players found matching "<strong>${escapeHtml(query)}</strong>"</p>
        </div>
      `;
      return;
    }

    container.innerHTML = users
      .map((u) => {
        let actionBtn = '';
        const rowClickAction = `window.FriendsModule?.openDmChat(${u.id})`;

        if (u.friendStatus === 'friends') {
          actionBtn = `<button type="button" class="btn-insta-req-confirm" onclick="window.FriendsModule?.openDmChat(${u.id})">Message</button>`;
        } else if (u.friendStatus === 'pending_sent') {
          actionBtn = `
            <button type="button" class="btn-insta-req-confirm" onclick="window.FriendsModule?.openDmChat(${u.id})">Message</button>
            <span class="insta-status-pill">Requested</span>
          `;
        } else if (u.friendStatus === 'pending_received') {
          actionBtn = `
            <button type="button" class="btn-insta-req-confirm" onclick="window.FriendsModule?.openDmChat(${u.id})">Message</button>
            <button type="button" class="btn-insta-req-confirm" onclick="window.FriendsModule?.respondFriendRequest(${u.friendRequestId}, 'accept')">Confirm</button>
          `;
        } else {
          actionBtn = `
            <button type="button" class="btn-insta-req-confirm" onclick="window.FriendsModule?.openDmChat(${u.id})">Message</button>
            <button type="button" class="btn-insta-req-confirm" onclick="window.FriendsModule?.sendFriendRequest(${u.id})">+ Add</button>
          `;
        }

        const isOnline = u.isOnline;
        const statusSnippet = isOnline ? 'Active now' : `@${escapeHtml(u.username)}`;

        return `
        <div class="insta-dm-row" onclick="${rowClickAction}">
          <div class="insta-dm-avatar-wrap">
            <span class="insta-dm-avatar">${escapeHtml(u.avatar || '🎮')}</span>
            ${isOnline ? '<span class="insta-dm-online-dot" title="Active now"></span>' : ''}
          </div>
          <div class="insta-dm-content">
            <div class="insta-dm-name-row">
              <span class="insta-dm-name">${escapeHtml(u.display_name)}</span>
            </div>
            <div class="insta-dm-snippet-row">
              <span class="insta-dm-snippet ${isOnline ? 'active-now' : ''}">${statusSnippet}</span>
              <span class="insta-dm-dot-sep">•</span>
              <span class="insta-dm-tap-hint">Tap to chat</span>
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

// Remove Friend with Confirmation Dialog
export function promptRemoveFriend(friend) {
  if (!friend) return;
  const modal = document.getElementById('modal-confirm-remove-friend');
  const avatarEl = document.getElementById('modal-remove-friend-avatar');
  const titleEl = document.getElementById('modal-remove-friend-title');
  const descEl = document.getElementById('modal-remove-friend-desc');
  const btnYes = document.getElementById('btn-confirm-remove-friend-yes');

  const displayName = friend.display_name || friend.username || 'this friend';

  if (modal && avatarEl && titleEl && descEl && btnYes) {
    avatarEl.textContent = friend.avatar || '🎮';
    titleEl.textContent = `Remove ${displayName}?`;
    descEl.textContent = `Are you sure you want to remove ${displayName} from your friends?`;
    btnYes.onclick = async () => {
      window.GameApp?.closeModal('modal-confirm-remove-friend');
      await executeRemoveFriend(friend.id);
    };
    window.GameApp?.openModal('modal-confirm-remove-friend');
  } else {
    if (confirm(`Are you sure you want to remove ${displayName} from your friends?`)) {
      executeRemoveFriend(friend.id);
    }
  }
}

// Execute friend deletion
export async function executeRemoveFriend(friendId) {
  const token = getToken();
  try {
    const res = await fetch(`/api/friends/${friendId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to remove friend');

    if (window.GameApp?.showToast) {
      window.GameApp.showToast('Friend removed.', 'info');
    }
    if (activeChatFriend && String(activeChatFriend.id) === String(friendId)) {
      closeDmChat();
    }
    loadFriendsData();
  } catch (err) {
    if (window.GameApp?.showToast) {
      window.GameApp.showToast(err.message, 'error');
    }
  }
}

// Remove Friend (public API)
export async function removeFriend(friendId) {
  const friend = friendsList.find((f) => String(f.id) === String(friendId)) || activeChatFriend || { id: friendId };
  promptRemoveFriend(friend);
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
    if (String(f.id) === String(userId)) {
      changed = true;
      return { ...f, isOnline, presence: status };
    }
    return f;
  });

  if (activeChatFriend && String(activeChatFriend.id) === String(userId)) {
    activeChatFriend.isOnline = isOnline;
    activeChatFriend.presence = status;
    const headerOnlinePip = document.getElementById('dm-chat-header-online-pip');
    const headerStatus = document.getElementById('dm-chat-header-status');
    if (headerOnlinePip) headerOnlinePip.classList.toggle('hidden', !isOnline);
    if (headerStatus) {
      headerStatus.textContent = isOnline ? 'Active now' : (status || 'Offline');
      headerStatus.classList.toggle('active', !!isOnline);
    }
  }

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
  promptRemoveFriend,
  openRequestsPage,
  openInboxPage,
  openDmChat,
  closeDmChat,
};

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
