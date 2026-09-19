// ==========================================
// GameRoom — Profile & Player Details Module
// ==========================================

import { getToken, getCurrentUser, setSession, logout } from './auth.js';

const AVAILABLE_AVATARS = ['🎮', '⚡', '🔥', '👾', '🚀', '👑', '🎯', '🐱', '🐺', '🦊', '🐉', '🏆'];
let selectedAvatar = '🎮';

export function initProfile() {
  renderAvatarPicker();

  // Edit Profile Form Submission
  const formEdit = document.getElementById('form-edit-profile');
  if (formEdit) {
    formEdit.onsubmit = async (e) => {
      e.preventDefault();
      await saveProfileChanges();
    };
  }

  // Logout Button
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

// Render Avatar Selection Grid
function renderAvatarPicker() {
  const container = document.getElementById('avatar-picker-options');
  if (!container) return;

  container.innerHTML = AVAILABLE_AVATARS.map(
    (emoji) => `
    <button type="button" class="avatar-opt-btn ${emoji === selectedAvatar ? 'active' : ''}" data-avatar="${emoji}">
      ${emoji}
    </button>
  `
  ).join('');

  container.querySelectorAll('.avatar-opt-btn').forEach((btn) => {
    btn.onclick = () => {
      container.querySelectorAll('.avatar-opt-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAvatar = btn.dataset.avatar;
    };
  });
}

// Load and populate User's Profile
export async function loadProfileData() {
  const token = getToken();
  if (!token) return;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const data = await res.json();
    const user = data.user;
    const stats = data.stats || { games_played: 0, wins: 0, losses: 0, draws: 0 };

    // Update Header Avatar
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) headerAvatar.textContent = user.avatar || '🎮';

    // Populate Overview
    document.getElementById('profile-display-avatar').textContent = user.avatar || '🎮';
    document.getElementById('profile-display-name').textContent = user.display_name;
    document.getElementById('profile-display-username').textContent = `@${user.username}`;
    document.getElementById('profile-display-bio').textContent = user.bio || "Let's play!";

    const dateStr = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Recent';
    document.getElementById('profile-display-date').textContent = dateStr;

    // Populate Stats
    const played = stats.games_played || 0;
    const wins = stats.wins || 0;
    const losses = stats.losses || 0;
    const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

    document.getElementById('stat-played').textContent = played;
    document.getElementById('stat-wins').textContent = wins;
    document.getElementById('stat-losses').textContent = losses;
    document.getElementById('stat-winrate').textContent = `${winRate}%`;

    // Populate Edit Inputs
    selectedAvatar = user.avatar || '🎮';
    renderAvatarPicker();

    document.getElementById('input-edit-name').value = user.display_name;
    document.getElementById('input-edit-bio').value = user.bio || '';
    document.getElementById('input-curr-pass').value = '';
    document.getElementById('input-new-pass').value = '';
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

// Save profile changes
async function saveProfileChanges() {
  const token = getToken();
  const msgEl = document.getElementById('profile-save-message');
  msgEl.classList.add('hidden');

  const displayName = document.getElementById('input-edit-name').value.trim();
  const bio = document.getElementById('input-edit-bio').value.trim();
  const currentPassword = document.getElementById('input-curr-pass').value;
  const newPassword = document.getElementById('input-new-pass').value;

  const payload = {
    display_name: displayName,
    avatar: selectedAvatar,
    bio,
  };

  if (newPassword) {
    payload.current_password = currentPassword;
    payload.new_password = newPassword;
  }

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
    loadProfileData();

    // Clear password inputs
    document.getElementById('input-curr-pass').value = '';
    document.getElementById('input-new-pass').value = '';
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.classList.remove('hidden');
  }
}

// Show Public Player Profile Popup (Section 67)
export async function showPlayerProfileModal(userId) {
  const token = getToken();
  try {
    const res = await fetch(`/api/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
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
