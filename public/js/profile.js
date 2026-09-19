// ==========================================
// GameRoom — Profile & Player Details Module
// ==========================================

import { getToken, getCurrentUser, setSession, logout, isGuestUser } from './auth.js';

const AVAILABLE_AVATARS = ['🎮', '⚡', '🔥', '👾', '🚀', '👑', '🎯', '🐱', '🐺', '🦊', '🐉', '🏆'];
let selectedAvatar = '🎮';

export function initProfile() {
  // Open Match History Modal (Reference style, matching Edit Profile and Settings)
  const btnOpenHistory = document.getElementById('btn-open-match-history');
  if (btnOpenHistory) {
    btnOpenHistory.onclick = () => {
      const user = getCurrentUser();
      if (user?.id) {
        loadMatchHistory(user.id);
      }
      window.GameApp?.openModal('modal-match-history');
    };
  }

  // Open Edit Profile Modal
  const btnOpenEdit = document.getElementById('btn-open-edit-profile');
  if (btnOpenEdit) {
    btnOpenEdit.onclick = () => {
      const user = getCurrentUser();
      if (user) {
        const nameInput = document.getElementById('input-edit-name');
        const bioInput = document.getElementById('input-edit-bio');
        if (nameInput) nameInput.value = user.display_name || '';
        if (bioInput) bioInput.value = user.bio || '';
      }
      const msgEl = document.getElementById('profile-save-message');
      if (msgEl) msgEl.classList.add('hidden');
      window.GameApp?.openModal('modal-edit-profile');
    };
  }

  // Open Account Settings Modal (Reference style)
  const btnOpenSettings = document.getElementById('btn-open-account-settings');
  if (btnOpenSettings) {
    btnOpenSettings.onclick = () => {
      const msgEl = document.getElementById('password-save-message');
      if (msgEl) msgEl.classList.add('hidden');
      window.GameApp?.openModal('modal-account-settings');
    };
  }

  // Edit Profile Form Submission (Display Name, Bio)
  const formEdit = document.getElementById('form-edit-profile');
  if (formEdit) {
    formEdit.onsubmit = async (e) => {
      e.preventDefault();
      await saveProfileChanges();
    };
  }

  // Change Password Form Submission
  const formPass = document.getElementById('form-change-password');
  if (formPass) {
    formPass.onsubmit = async (e) => {
      e.preventDefault();
      await changePassword();
    };
  }

  // Preferences Toggles
  initPreferences();

  // Auth & Logout Buttons
  const btnAuth = document.getElementById('btn-profile-auth');
  if (btnAuth) {
    btnAuth.onclick = () => {
      window.GameApp?.openModal('modal-auth');
    };
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.onclick = async () => {
      if (confirm('Are you sure you want to log out?')) {
        await logout();
        window.location.reload();
      }
    };
  }
}

// User Preferences setup
function initPreferences() {
  const soundToggle = document.getElementById('pref-sound');
  const bubblesToggle = document.getElementById('pref-bubbles');
  const invitesToggle = document.getElementById('pref-invites');

  if (soundToggle) {
    soundToggle.checked = localStorage.getItem('gameroom_pref_sound') !== 'false';
    soundToggle.onchange = () => {
      localStorage.setItem('gameroom_pref_sound', soundToggle.checked);
      window.GameApp?.showToast(`Sound effects ${soundToggle.checked ? 'enabled' : 'disabled'}`);
    };
  }

  if (bubblesToggle) {
    bubblesToggle.checked = localStorage.getItem('gameroom_pref_bubbles') !== 'false';
    bubblesToggle.onchange = () => {
      localStorage.setItem('gameroom_pref_bubbles', bubblesToggle.checked);
      window.GameApp?.showToast(`Chat bubbles ${bubblesToggle.checked ? 'enabled' : 'disabled'}`);
    };
  }

  if (invitesToggle) {
    invitesToggle.checked = localStorage.getItem('gameroom_pref_invites') !== 'false';
    invitesToggle.onchange = () => {
      localStorage.setItem('gameroom_pref_invites', invitesToggle.checked);
      window.GameApp?.showToast(`Game challenges ${invitesToggle.checked ? 'allowed' : 'muted'}`);
    };
  }
}

// Populate profile DOM elements defensively
function populateProfileUI(user, stats = null) {
  if (!user) return;

  const headerAvatar = document.getElementById('header-avatar');
  if (headerAvatar) headerAvatar.textContent = user.avatar || '🎮';

  const avatarEl = document.getElementById('profile-display-avatar');
  if (avatarEl) avatarEl.textContent = user.avatar || '🎮';

  const nameEl = document.getElementById('profile-display-name');
  if (nameEl) nameEl.textContent = user.display_name || user.username || 'Player';

  const userEl = document.getElementById('profile-display-username');
  if (userEl) userEl.textContent = `@${user.username || 'player'}`;

  const bioEl = document.getElementById('profile-display-bio');
  if (bioEl) bioEl.textContent = user.bio || "Let's play!";

  const dateEl = document.getElementById('profile-display-date');
  if (dateEl) {
    const dateStr = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Recent';
    dateEl.textContent = dateStr;
  }

  if (stats) {
    const played = stats.games_played || 0;
    const wins = stats.wins || 0;
    const losses = stats.losses || 0;
    const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

    const elPlayed = document.getElementById('stat-played');
    if (elPlayed) elPlayed.textContent = played;
    const elWins = document.getElementById('stat-wins');
    if (elWins) elWins.textContent = wins;
    const elLosses = document.getElementById('stat-losses');
    if (elLosses) elLosses.textContent = losses;
    const elWinrate = document.getElementById('stat-winrate');
    if (elWinrate) elWinrate.textContent = `${winRate}%`;
  }

  selectedAvatar = user.avatar || '🎮';
  const inputName = document.getElementById('input-edit-name');
  const inputBio = document.getElementById('input-edit-bio');
  if (inputName && !inputName.value) inputName.value = user.display_name || '';
  if (inputBio && !inputBio.value) inputBio.value = user.bio || '';

  const isGuest = isGuestUser(user);
  const btnAuthEl = document.getElementById('btn-profile-auth');
  const btnLogoutEl = document.getElementById('btn-logout');
  if (btnAuthEl) btnAuthEl.classList.toggle('hidden', !isGuest);
  if (btnLogoutEl) btnLogoutEl.classList.toggle('hidden', isGuest);
}

// Load and populate User's Profile
export async function loadProfileData() {
  const cachedUser = getCurrentUser();
  const token = getToken();

  // Instant render from local session if present
  if (cachedUser) {
    populateProfileUI(cachedUser);
  }

  if (!token && !cachedUser) return;

  try {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/auth/me', {
      headers,
      credentials: 'include',
    });

    if (res.status === 401 || res.status === 403) {
      return;
    }

    if (!res.ok) {
      return;
    }

    const data = await res.json();
    if (data && data.user) {
      setSession(data.user, data.token || token);
      populateProfileUI(data.user, data.stats);
      await loadMatchHistory(data.user.id);
    }
  } catch (err) {
    // Network offline or reconnecting; cached session is already displayed
    console.warn('Profile sync deferred (network offline or reconnecting):', err.message || err);
  }
}

// Load and render Recent Match History (last 5 completed games)
export async function loadMatchHistory(currentUserId) {
  const container = document.getElementById('profile-match-history-list');
  const countBadge = document.getElementById('history-count-badge');
  const menuBadge = document.getElementById('menu-history-badge');
  const modalBadge = document.getElementById('history-modal-count-badge');
  if (!container && !menuBadge) return;

  const token = getToken();
  const me = currentUserId ? { id: currentUserId } : getCurrentUser();
  const myId = me?.id ? Number(me.id) : null;
  if (!myId) return;

  try {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/history', {
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      if (container) {
        container.innerHTML = `
          <div class="match-history-empty">
            <span class="match-empty-icon">🎮</span>
            <div class="match-empty-title">History unavailable</div>
            <div class="match-empty-desc">Could not load recent matches right now. Please try again in a moment.</div>
          </div>
        `;
      }
      return;
    }

    const data = await res.json();
    const allGames = Array.isArray(data?.history) ? data.history : [];
    // Last 5 completed games
    const recentGames = allGames.slice(0, 5);

    const countText = recentGames.length === 0 ? '0 games' : `${recentGames.length} ${recentGames.length === 1 ? 'game' : 'games'}`;
    if (countBadge) countBadge.textContent = countText;
    if (menuBadge) menuBadge.textContent = countText;
    if (modalBadge) modalBadge.textContent = countText;

    if (!container) return;

    if (recentGames.length === 0) {
      container.innerHTML = `
        <div class="match-history-empty">
          <span class="match-empty-icon">🎮</span>
          <div class="match-empty-title">No completed games yet</div>
          <div class="match-empty-desc">Play Tic-Tac-Toe, Rock Paper Scissors, or Connect Four to see your match history here!</div>
        </div>
      `;
      return;
    }

    const GAME_META = {
      tictactoe: { name: 'Tic-Tac-Toe', icon: '⭕' },
      rps: { name: 'Rock Paper Scissors', icon: '✂️' },
      connect4: { name: 'Connect Four', icon: '🔴' },
    };

    container.innerHTML = recentGames.map((game) => {
      const isP1 = Number(game.player1_id) === myId;
      const oppName = isP1 ? (game.p2_name || 'Opponent') : (game.p1_name || 'Opponent');
      const oppAvatar = isP1 ? (game.p2_avatar || '🎮') : (game.p1_avatar || '🎮');
      const oppId = isP1 ? game.player2_id : game.player1_id;

      let resultText = 'LOSS';
      let resultClass = 'badge-loss';

      if (game.result === 'draw' || game.winner_id === null || game.winner_id === undefined) {
        resultText = 'DRAW';
        resultClass = 'badge-draw';
      } else if (Number(game.winner_id) === myId) {
        resultText = 'WIN';
        resultClass = 'badge-win';
      }

      const meta = GAME_META[game.game_type] || {
        name: game.game_type ? game.game_type.toUpperCase() : 'Game',
        icon: '🎮',
      };

      const timeAgo = formatTimeAgo(game.created_at);

      return `
        <div class="match-history-card" data-opp-id="${oppId}">
          <div class="match-card-left">
            <div class="match-game-icon-chip" title="${escapeHtml(meta.name)}">
              ${meta.icon}
            </div>
            <div class="match-details">
              <div class="match-opp-row">
                <span class="match-vs-label">vs</span>
                <span class="match-opp-avatar">${escapeHtml(oppAvatar)}</span>
                <strong class="match-opp-name" title="${escapeHtml(oppName)}">${escapeHtml(oppName)}</strong>
              </div>
              <div class="match-meta-row">
                <span class="match-game-type">${escapeHtml(meta.name)}</span>
                <span class="match-dot-separator">•</span>
                <span class="match-time" title="${new Date(game.created_at).toLocaleString()}">${escapeHtml(timeAgo)}</span>
              </div>
            </div>
          </div>
          <div class="match-card-right">
            <span class="match-result-badge ${resultClass}">${resultText}</span>
          </div>
        </div>
      `;
    }).join('');

    // Clicking a match card opens the opponent's public profile
    container.querySelectorAll('.match-history-card').forEach((card) => {
      const oppId = card.getAttribute('data-opp-id');
      if (oppId && oppId !== 'null' && oppId !== 'undefined') {
        card.style.cursor = 'pointer';
        card.title = 'Click to view opponent details';
        card.onclick = () => {
          showPlayerProfileModal(oppId);
        };
      }
    });
  } catch (err) {
    console.warn('Match history sync deferred:', err.message || err);
    if (container) {
      container.innerHTML = `
        <div class="match-history-empty">
          <span class="match-empty-icon">⚠️</span>
          <div class="match-empty-desc">Match history temporarily unavailable. Please check connection.</div>
        </div>
      `;
    }
  }
}

// Save profile changes (Display Name, Bio)
async function saveProfileChanges() {
  const token = getToken();
  const msgEl = document.getElementById('profile-save-message');
  if (msgEl) msgEl.classList.add('hidden');

  const displayName = document.getElementById('input-edit-name').value.trim();
  const bio = document.getElementById('input-edit-bio').value.trim();

  if (!displayName) {
    if (msgEl) {
      msgEl.textContent = 'Display name cannot be empty.';
      msgEl.classList.remove('hidden');
    }
    return;
  }

  const payload = {
    display_name: displayName,
    avatar: selectedAvatar,
    bio,
  };

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update profile');
    }

    setSession(data.user);
    window.GameApp?.showToast('Profile updated successfully!', 'success');
    window.GameApp?.closeModal('modal-edit-profile');
    loadProfileData();
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = err.message;
      msgEl.classList.remove('hidden');
    }
  }
}

// Change Password in Settings
async function changePassword() {
  const token = getToken();
  const msgEl = document.getElementById('password-save-message');
  if (msgEl) msgEl.classList.add('hidden');

  const currPass = document.getElementById('input-curr-pass').value;
  const newPass = document.getElementById('input-new-pass').value;
  const confirmPass = document.getElementById('input-confirm-pass').value;

  if (newPass !== confirmPass) {
    if (msgEl) {
      msgEl.textContent = 'New passwords do not match.';
      msgEl.classList.remove('hidden');
    }
    return;
  }

  if (newPass.length < 6) {
    if (msgEl) {
      msgEl.textContent = 'New password must be at least 6 characters.';
      msgEl.classList.remove('hidden');
    }
    return;
  }

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: currPass,
        new_password: newPass,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to change password');
    }

    window.GameApp?.showToast('Password changed successfully!', 'success');
    document.getElementById('input-curr-pass').value = '';
    document.getElementById('input-new-pass').value = '';
    document.getElementById('input-confirm-pass').value = '';
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = err.message;
      msgEl.classList.remove('hidden');
    }
  }
}

// Show Public Player Profile Popup (Section 67)
export async function showPlayerProfileModal(userId) {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const res = await fetch(`/api/users/${userId}`, { headers });
    if (!res.ok) throw new Error('User not found');

    const data = await res.json();
    const user = data.user;
    const stats = data.stats || {};

    document.getElementById('pop-avatar').textContent = user.avatar || '🎮';
    document.getElementById('pop-display-name').textContent = user.display_name;
    document.getElementById('pop-username').textContent = `@${user.username}`;
    document.getElementById('pop-bio').textContent = `"${user.bio || "Let's play!"}"`;

    const statusDot = document.getElementById('pop-status-dot');
    const statusText = document.getElementById('pop-status-text');

    const isOnline = data.isOnline;
    const presence = data.presence || (isOnline ? 'Online' : 'Offline');

    statusDot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
    statusText.textContent = presence;

    document.getElementById('pop-stat-played').textContent = stats.games_played || 0;
    document.getElementById('pop-stat-wins').textContent = stats.wins || 0;
    document.getElementById('pop-stat-losses').textContent = stats.losses || 0;

    const actionsContainer = document.getElementById('pop-actions');
    const me = getCurrentUser();

    if (user.id !== me?.id) {
      actionsContainer.innerHTML = `
        <button type="button" class="btn btn-sm btn-primary" onclick="window.FriendsModule?.promptInviteGame(${user.id}, '${escapeHtml(user.display_name)}'); window.GameApp?.closeModal('modal-player-profile');">
          Invite to Game
        </button>
      `;
    } else {
      actionsContainer.innerHTML = '';
    }

    window.GameApp?.openModal('modal-player-profile');
  } catch (err) {
    console.error('Failed to show player details:', err);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimeAgo(dateInput) {
  if (!dateInput) return 'Recently';
  const now = Date.now();
  const past = new Date(dateInput).getTime();
  if (isNaN(past)) return 'Recently';
  const diffSec = Math.max(0, Math.floor((now - past) / 1000));

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `${mins}m ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(dateInput).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
