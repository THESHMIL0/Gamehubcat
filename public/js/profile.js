// ==========================================
// GameRoom — Profile & Player Details Module
// ==========================================

import { getToken, getCurrentUser, setSession, logout } from './auth.js';

const AVAILABLE_AVATARS = ['🎮', '⚡', '🔥', '👾', '🚀', '👑', '🎯', '🐱', '🐺', '🦊', '🐉', '🏆'];
let selectedAvatar = '🎮';

export function initProfile() {
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
    const inputName = document.getElementById('input-edit-name');
    const inputBio = document.getElementById('input-edit-bio');
    if (inputName) inputName.value = user.display_name || '';
    if (inputBio) inputBio.value = user.bio || '';
  } catch (err) {
    console.error('Failed to load profile:', err);
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
