// ==========================================
// GameRoom — Main Application Orchestrator
// ==========================================

import { getToken, getCurrentUser, getLastUsername, login, register, resetPassword, fetchCurrentUser, fetchPublicAccounts, getGuestInfo, setGuestInfo, isGuestUser } from './auth.js';
import { initSocket, getSocket, disconnectSocket, updateGuestSocketProfile, reconnectSocketWithAuth } from './socket.js';
import { initLobby, setActiveRoom, getActiveRoom, leaveCurrentGameRoom } from './lobby.js';
import { initFriends, loadFriendsData } from './friends.js';
import { initProfile, loadProfileData, showPlayerProfileModal } from './profile.js';
import { initTheme } from './theme.js';
import { initInvitations } from './invitations.js';
import { initChat, scrollLobbyToBottom } from './chat.js';
import { initTicTacToe, updateTicTacToeState } from './games/tictactoe.js';
import { initRps, updateRpsState } from './games/rps.js';
import { initConnect4, updateConnect4State } from './games/connect4.js';
import { isMuted, toggleMute, playVictorySound, playDefeatSound, playDrawSound, playEmoteSound } from './audio.js';
import { launchConfetti } from './confetti.js';

class GameRoomApp {
  constructor() {
    this.currentUser = null;
    this.currentView = 'home';
    this.activeMatchRoom = null;
  }

  async init() {
    initTheme();
    this.bindAuthEvents();
    this.bindNavigationEvents();
    this.bindModalEvents();
    this.bindGameControlEvents();
    this.bindGuestProfileEvents();

    // Check if user has active session in localStorage
    const token = getToken();
    const cachedUser = getCurrentUser();

    if (token && cachedUser) {
      // Immediately authenticate using cached user so UI never flickers
      this.onAuthenticated(cachedUser);

      // Verify in background without disrupting the active user session
      fetchCurrentUser().then((data) => {
        if (data && data.user) {
          this.currentUser = data.user;
          this.updateHeaderUserInfo(data.user);
          this.updateLobbyIdentityUI();
        }
      }).catch((e) => {
        console.warn('Session background sync notice:', e);
      });
    } else {
      // Check if server session exists via cookie or fall back to Public Guest Lobby
      try {
        const data = await fetchCurrentUser();
        if (data && data.user) {
          this.onAuthenticated(data.user);
        } else {
          this.initGuestSession();
        }
      } catch (e) {
        this.initGuestSession();
      }
    }
  }

  initGuestSession() {
    const guest = getGuestInfo();
    this.currentUser = {
      id: guest.id,
      username: guest.name,
      display_name: guest.name,
      avatar: guest.avatar,
      isGuest: true,
    };

    this.updateHeaderUserInfo(this.currentUser);
    this.updateLobbyIdentityUI();

    // Ensure Main Interface is shown and auth modal is closed
    document.getElementById('main-interface')?.classList.remove('hidden');
    document.getElementById('modal-auth')?.classList.add('hidden');

    this.switchView('home');

    // Connect socket as Public Lobby Guest
    initSocket(
      (socket) => {
        this.setupSocketGameListeners(socket);
        initChat();
        initInvitations();
        initFriends();
        initLobby();
      },
      () => {
        // Disconnected
      }
    );
  }

  // ==========================================
  // Authentication UI Flow
  // ==========================================
  bindAuthEvents() {
    const tabLogin = document.getElementById('tab-login') || document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-register') || document.getElementById('tab-btn-register');
    const tabReset = document.getElementById('tab-reset');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const formReset = document.getElementById('form-reset');
    const linkGoRegister = document.getElementById('link-go-register');
    const linkGoLogin = document.getElementById('link-go-login');
    const linkForgotPassword = document.getElementById('link-forgot-password');
    const linkResetToLogin = document.getElementById('link-reset-to-login');

    const showLogin = () => {
      tabLogin?.classList.add('active');
      tabRegister?.classList.remove('active');
      tabReset?.classList.remove('active');
      formLogin?.classList.remove('hidden');
      formRegister?.classList.add('hidden');
      formReset?.classList.add('hidden');
      this.clearAuthErrors();
    };

    const showRegister = () => {
      tabRegister?.classList.add('active');
      tabLogin?.classList.remove('active');
      tabReset?.classList.remove('active');
      formRegister?.classList.remove('hidden');
      formLogin?.classList.add('hidden');
      formReset?.classList.add('hidden');
      this.clearAuthErrors();
    };

    const showReset = () => {
      tabReset?.classList.add('active');
      tabLogin?.classList.remove('active');
      tabRegister?.classList.remove('active');
      formReset?.classList.remove('hidden');
      formLogin?.classList.add('hidden');
      formRegister?.classList.add('hidden');
      this.clearAuthErrors();

      // Pre-fill reset username if present in login field or last username
      const loginUser = document.getElementById('login-username')?.value.trim();
      const resetUserInput = document.getElementById('reset-username');
      if (resetUserInput) {
        if (loginUser) {
          resetUserInput.value = loginUser;
        } else if (!resetUserInput.value) {
          resetUserInput.value = getLastUsername();
        }
      }
    };

    if (tabLogin) tabLogin.onclick = showLogin;
    if (tabRegister) tabRegister.onclick = showRegister;
    if (tabReset) tabReset.onclick = showReset;
    if (linkGoRegister) linkGoRegister.onclick = (e) => { e.preventDefault(); showRegister(); };
    if (linkGoLogin) linkGoLogin.onclick = (e) => { e.preventDefault(); showLogin(); };
    if (linkForgotPassword) linkForgotPassword.onclick = (e) => { e.preventDefault(); showReset(); };
    if (linkResetToLogin) linkResetToLogin.onclick = (e) => { e.preventDefault(); showLogin(); };

    // Pre-populate last username on login field
    const lastUser = getLastUsername();
    const loginUserField = document.getElementById('login-username');
    if (loginUserField && lastUser && !loginUserField.value) {
      loginUserField.value = lastUser;
    }

    // Login Form Submit
    if (formLogin) {
      formLogin.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');

        try {
          this.clearAuthErrors();
          const submitBtn = document.getElementById('btn-login-submit');
          if (submitBtn) submitBtn.disabled = true;
          const user = await login(username, password);
          this.onAuthenticated(user);
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        } finally {
          const submitBtn = document.getElementById('btn-login-submit');
          if (submitBtn) submitBtn.disabled = false;
        }
      };
    }

    // Register Form Submit
    if (formRegister) {
      formRegister.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm-password').value;
        const errEl = document.getElementById('register-error');

        try {
          this.clearAuthErrors();
          const submitBtn = document.getElementById('btn-register-submit');
          if (submitBtn) submitBtn.disabled = true;
          const user = await register(username, password, confirm);
          this.onAuthenticated(user);
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        } finally {
          const submitBtn = document.getElementById('btn-register-submit');
          if (submitBtn) submitBtn.disabled = false;
        }
      };
    }

    // Reset Password Form Submit
    if (formReset) {
      formReset.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('reset-username').value.trim();
        const newPassword = document.getElementById('reset-password').value;
        const confirmPassword = document.getElementById('reset-confirm-password').value;
        const errEl = document.getElementById('reset-error');

        try {
          this.clearAuthErrors();
          const submitBtn = document.getElementById('btn-reset-submit');
          if (submitBtn) submitBtn.disabled = true;
          const user = await resetPassword(username, newPassword, confirmPassword);
          this.onAuthenticated(user);
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        } finally {
          const submitBtn = document.getElementById('btn-reset-submit');
          if (submitBtn) submitBtn.disabled = false;
        }
      };
    }

    // Load registered accounts list for easy selection
    this.loadKnownAccountsHelper();

    // Password visibility toggles
    document.querySelectorAll('.btn-password-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;
        const isVisible = input.type === 'text';
        input.type = isVisible ? 'password' : 'text';
        // Swap icon between eye and eye-off
        btn.innerHTML = isVisible
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
          : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      });
    });
  }

  async loadKnownAccountsHelper() {
    try {
      const accounts = await fetchPublicAccounts();
      const container = document.getElementById('auth-known-accounts');
      const list = document.getElementById('known-accounts-list');
      if (!container || !list) return;

      if (!accounts || accounts.length === 0) {
        container.classList.add('hidden');
        return;
      }

      list.innerHTML = '';
      accounts.forEach((acc) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'known-acc-chip';
        btn.innerHTML = `<span class="acc-chip-avatar">${acc.avatar || '🎮'}</span> <span class="acc-chip-name">${acc.display_name || acc.username}</span>`;
        btn.onclick = () => {
          const loginInput = document.getElementById('login-username');
          const resetInput = document.getElementById('reset-username');
          if (loginInput) loginInput.value = acc.username;
          if (resetInput) resetInput.value = acc.username;

          // Focus the password input
          const pwd = document.getElementById('login-password');
          if (pwd && !pwd.closest('.auth-form')?.classList.contains('hidden')) {
            pwd.focus();
          }
        };
        list.appendChild(btn);
      });

      container.classList.remove('hidden');
    } catch (e) {
      console.warn('Error loading public accounts:', e);
    }
  }

  clearAuthErrors() {
    document.getElementById('login-error')?.classList.add('hidden');
    document.getElementById('register-error')?.classList.add('hidden');
    document.getElementById('reset-error')?.classList.add('hidden');
  }

  updateHeaderUserInfo(user) {
    if (!user) return;
    const nameEl = document.getElementById('header-username') || document.getElementById('header-display-name');
    if (nameEl) nameEl.textContent = user.display_name || user.username;
    const avatarEl = document.getElementById('header-avatar');
    if (avatarEl) avatarEl.textContent = user.avatar || '🐱';

    const isGuest = isGuestUser(user);
    const authBtn = document.getElementById('btn-header-auth');
    if (authBtn) {
      authBtn.classList.toggle('hidden', !isGuest);
    }
  }

  updateLobbyIdentityUI() {
    const user = this.currentUser || getGuestInfo();
    const avatarEl = document.getElementById('lobby-identity-avatar');
    const nameEl = document.getElementById('lobby-identity-name');
    const introNameEl = document.getElementById('lobby-intro-guest-name');
    const tagEl = document.getElementById('lobby-identity-tag');
    const chatAvatarEl = document.getElementById('chat-sender-avatar');

    if (avatarEl) avatarEl.textContent = user.avatar || '🐱';
    if (nameEl) nameEl.textContent = user.display_name || user.username || 'Guest';
    if (introNameEl) introNameEl.textContent = `${user.avatar || '🐱'} ${user.display_name || user.username || 'Guest'}`;
    if (chatAvatarEl) chatAvatarEl.textContent = user.avatar || '🐱';

    const isGuest = isGuestUser(user);
    if (tagEl) {
      tagEl.textContent = isGuest ? 'Guest' : 'Member';
      tagEl.className = isGuest ? 'identity-tag badge-guest' : 'identity-tag badge-member';
    }

    const editNameBtn = document.getElementById('btn-edit-guest-name');
    if (editNameBtn) {
      editNameBtn.style.display = isGuest ? 'inline-flex' : 'none';
    }

    const editIntroBtn = document.getElementById('btn-edit-guest-name-intro');
    if (editIntroBtn) {
      editIntroBtn.style.display = isGuest ? 'inline-flex' : 'none';
    }

    const lobbyAuthBtn = document.getElementById('btn-lobby-auth');
    if (lobbyAuthBtn) {
      lobbyAuthBtn.style.display = isGuest ? 'inline-flex' : 'none';
    }
  }

  bindGuestProfileEvents() {
    const openGuestModal = () => {
      const modal = document.getElementById('modal-guest-profile');
      const input = document.getElementById('input-guest-nickname');
      if (input) input.value = this.currentUser?.display_name || '';
      if (modal) modal.classList.remove('hidden');
    };

    const btnEdit = document.getElementById('btn-edit-guest-name');
    if (btnEdit) btnEdit.onclick = openGuestModal;

    const btnEditIntro = document.getElementById('btn-edit-guest-name-intro');
    if (btnEditIntro) btnEditIntro.onclick = openGuestModal;

    const btnPillAvatar = document.getElementById('btn-pill-change-avatar');
    if (btnPillAvatar) btnPillAvatar.onclick = openGuestModal;

    const avatarBtns = document.querySelectorAll('#guest-avatar-picker .avatar-pick-btn');
    avatarBtns.forEach((btn) => {
      btn.onclick = () => {
        avatarBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    const btnSave = document.getElementById('btn-save-guest-profile');
    if (btnSave) {
      btnSave.onclick = () => {
        const input = document.getElementById('input-guest-nickname');
        const activeAvatarBtn = document.querySelector('#guest-avatar-picker .avatar-pick-btn.active');
        const name = (input?.value || '').trim();
        const avatar = activeAvatarBtn?.getAttribute('data-avatar') || '🐱';

        if (!name || name.length < 2) {
          this.showToast('Please enter at least 2 characters for your name.', 'warning');
          return;
        }

        setGuestInfo(name, avatar);
        if (this.currentUser && isGuestUser(this.currentUser)) {
          this.currentUser.display_name = name;
          this.currentUser.username = name;
          this.currentUser.avatar = avatar;
        }
        updateGuestSocketProfile(name, avatar);
        this.updateHeaderUserInfo(this.currentUser);
        this.updateLobbyIdentityUI();
        this.closeModal('modal-guest-profile');
        this.showToast(`Updated name to ${name}!`, 'success');
      };
    }

    // Header and Lobby Auth button triggers
    const btnHeaderAuth = document.getElementById('btn-header-auth');
    if (btnHeaderAuth) {
      btnHeaderAuth.onclick = () => this.openAuthModal();
    }

    const btnLobbyAuth = document.getElementById('btn-lobby-auth');
    if (btnLobbyAuth) {
      btnLobbyAuth.onclick = () => this.openAuthModal();
    }
  }

  openAuthModal() {
    this.openModal('modal-auth');
    this.clearAuthErrors();
    this.loadKnownAccountsHelper();
  }

  onAuthenticated(user) {
    this.currentUser = user;

    // Close auth modal
    this.closeModal('modal-auth');

    // Update Header and Lobby
    this.updateHeaderUserInfo(user);
    this.updateLobbyIdentityUI();

    // Show Main Interface
    document.getElementById('main-interface')?.classList.remove('hidden');
    document.getElementById('view-auth')?.classList.add('hidden');

    // Switch to Home View
    this.switchView('home');

    // Reconnect Socket with token
    const token = getToken();
    reconnectSocketWithAuth(token, (socket) => {
      this.setupSocketGameListeners(socket);
      initChat();
      initInvitations();
      initFriends();
      initLobby();
    });

    initProfile();
    loadProfileData();
    loadFriendsData();
    this.showToast(`Welcome back, ${user.display_name || user.username}!`, 'success');
  }

  // ==========================================
  // Navigation & View Routing
  // ==========================================
  bindNavigationEvents() {
    // Desktop & Mobile Nav Tabs
    const allNavButtons = document.querySelectorAll('.nav-tab, .mobile-nav-item');
    allNavButtons.forEach((btn) => {
      btn.onclick = () => {
        const view = btn.dataset.view;
        if (view) {
          if (this.activeMatchRoom && this.currentView === 'game') {
            this.openModal('modal-confirm-leave');
            return;
          }
          this.switchView(view);
        }
      };
    });

    // Profile Click in Header
    const avatarBtn = document.getElementById('header-avatar-btn') || document.getElementById('btn-header-profile');
    if (avatarBtn) {
      avatarBtn.onclick = () => this.switchView('profile');
    }

    // Logo Click in Header
    const brandLogo = document.getElementById('logo-home-link') || document.querySelector('.header-brand');
    if (brandLogo) {
      brandLogo.onclick = (e) => {
        e.preventDefault();
        this.switchView('home');
      };
    }

    // View All Friends button on Home
    const btnAllFriends = document.getElementById('btn-view-all-friends');
    if (btnAllFriends) {
      btnAllFriends.onclick = () => this.switchView('friends');
    }
  }

  switchView(viewName) {
    if (viewName === 'auth') {
      this.openAuthModal();
      return;
    }

    this.currentView = viewName;
    document.getElementById('main-interface')?.classList.remove('hidden');

    // Hide all content views, activate target view
    document.querySelectorAll('.content-view').forEach((v) => v.classList.remove('active'));
    const targetEl = document.getElementById(`view-${viewName}`);
    if (targetEl) {
      targetEl.classList.add('active');
    }

    // Mark current active view on container for specialized zero-scroll layouts
    const viewContainer = document.getElementById('view-container') || document.querySelector('.view-container');
    if (viewContainer) {
      viewContainer.setAttribute('data-active-view', viewName);
      viewContainer.className = `view-container active-view-${viewName}`;
    }

    // If navigating away from friends view, close active DM chat
    if (viewName !== 'friends') {
      document.body.classList.remove('in-dm-chat');
      window.FriendsModule?.closeDmChat?.();
    }

    // Mobile nav visibility (hidden during active game, auth, or active 1v1 DM chat)
    const isAuthView = viewName === 'auth';
    const isInDm = viewName === 'friends' && document.body.classList.contains('in-dm-chat');
    document.getElementById('mobile-bottom-nav')?.classList.toggle('hidden', isAuthView || viewName === 'game' || isInDm);

    // Sync active states on Navigation tabs
    document.querySelectorAll('.nav-tab, .mobile-nav-item').forEach((tab) => {
      if (tab.dataset.view === viewName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    if (viewName === 'profile') {
      loadProfileData();
    } else if (viewName === 'friends') {
      loadFriendsData();
    } else if (viewName === 'home') {
      scrollLobbyToBottom(false);
    }

    window.scrollTo(0, 0);
  }

  // ==========================================
  // Active Game Match Lifecycle
  // ==========================================
  setupSocketGameListeners(socket) {
    socket.off('game_start');
    socket.on('game_start', ({ room }) => {
      this.startGameMatch(room);
    });

    // Handle game state changes from both 'game_state' and 'game_update'
    const handleGameUpdate = ({ room, payload, winner, isDraw, reason }) => {
      if (!room) return;
      this.updateMatchState(room, payload);
      if (winner || isDraw || room.state === 'FINISHED' || room.gameState?.winner || room.gameState?.isDraw) {
        const winPlayer = winner || (room.gameState?.winner ? room.players?.find((p) => String(p.id) === String(room.gameState.winner)) : null);
        this.handleGameOver(room, winPlayer, isDraw || !!room.gameState?.isDraw, reason);
      }
    };

    socket.off('game_state');
    socket.on('game_state', handleGameUpdate);

    socket.off('game_update');
    socket.on('game_update', handleGameUpdate);

    socket.off('game_over');
    socket.on('game_over', ({ room, winner, isDraw, reason }) => {
      this.handleGameOver(room, winner, isDraw, reason);
    });

    const handleRematchPrompt = (data = {}) => {
      const hint = document.getElementById('result-rematch-status') || document.getElementById('rematch-status-hint');
      const btnRematch = document.getElementById('btn-result-rematch') || document.getElementById('btn-rematch');
      const senderName = data.user?.display_name || data.userName || 'Opponent';
      if (hint) {
        hint.textContent = `${senderName} wants a rematch!`;
        hint.classList.remove('hidden');
      }
      if (btnRematch) {
        btnRematch.textContent = 'Accept Rematch';
        btnRematch.className = 'btn btn-primary';
        btnRematch.disabled = false;
      }
    };

    socket.off('rematch_offered');
    socket.on('rematch_offered', handleRematchPrompt);

    socket.off('rematch_requested');
    socket.on('rematch_requested', handleRematchPrompt);

    const handleRematchStarted = ({ room }) => {
      this.closeModal('modal-game-result');
      this.closeModal('modal-game-over');
      this.showToast('Rematch started! New round.', 'success');
      this.startGameMatch(room);
    };

    socket.off('game_restart');
    socket.on('game_restart', handleRematchStarted);

    socket.off('rematch_started');
    socket.on('rematch_started', handleRematchStarted);
  }

  startGameMatch(room) {
    this.activeMatchRoom = room;
    setActiveRoom(room);

    this.switchView('game');

    const gameTitles = {
      tictactoe: 'Tic-Tac-Toe',
      rps: 'Rock Paper Scissors',
      connect4: 'Connect Four',
    };
    const titleEl = document.getElementById('game-active-type') || document.getElementById('active-game-title');
    if (titleEl) titleEl.textContent = gameTitles[room.gameType] || 'Game';

    const codeEl = document.getElementById('game-active-code') || document.getElementById('active-game-room-code');
    if (codeEl) codeEl.textContent = room.code;

    this.renderPlayersMatchBar(room);

    // Board visibility
    const bTtt = document.getElementById('board-tictactoe') || document.getElementById('stage-tictactoe');
    const bRps = document.getElementById('board-rps') || document.getElementById('stage-rps');
    const bC4 = document.getElementById('board-connect4') || document.getElementById('stage-connect4');

    if (bTtt) bTtt.classList.toggle('hidden', room.gameType !== 'tictactoe');
    if (bRps) bRps.classList.toggle('hidden', room.gameType !== 'rps');
    if (bC4) bC4.classList.toggle('hidden', room.gameType !== 'connect4');

    if (room.gameType === 'tictactoe') {
      initTicTacToe(room);
    } else if (room.gameType === 'rps') {
      initRps(room);
    } else if (room.gameType === 'connect4') {
      initConnect4(room);
    }

    this.updateMatchState(room);
  }

  renderPlayersMatchBar(room) {
    const me = getCurrentUser();
    const p1 = room.players[0] || {};
    const p2 = room.players[1] || {};

    const isMeP1 = String(p1.id) === String(me?.id);
    const player1 = isMeP1 ? p1 : p2;
    const player2 = isMeP1 ? p2 : p1;

    // You
    const p1Av = document.getElementById('p1-avatar') || document.getElementById('match-p1-avatar');
    if (p1Av) p1Av.textContent = player1.avatar || '🎮';
    const p1Nm = document.getElementById('p1-name') || document.getElementById('match-p1-name');
    if (p1Nm) p1Nm.textContent = player1.display_name || 'You';
    const p1Sy = document.getElementById('p1-symbol-badge') || document.getElementById('match-p1-symbol');
    if (p1Sy) p1Sy.textContent = player1.symbol || '1';
    const p1Sc = document.getElementById('p1-score');
    if (p1Sc) p1Sc.textContent = `Score: ${player1.score || 0}`;

    // Opponent
    const p2Av = document.getElementById('p2-avatar') || document.getElementById('match-p2-avatar');
    if (p2Av) p2Av.textContent = player2.avatar || '👾';
    const p2Nm = document.getElementById('p2-name') || document.getElementById('match-p2-name');
    if (p2Nm) p2Nm.textContent = player2.display_name || 'Opponent';
    const p2Sy = document.getElementById('p2-symbol-badge') || document.getElementById('match-p2-symbol');
    if (p2Sy) p2Sy.textContent = player2.symbol || '2';
    const p2Sc = document.getElementById('p2-score');
    if (p2Sc) p2Sc.textContent = `Score: ${player2.score || 0}`;
  }

  updateMatchState(room, payload = {}) {
    this.activeMatchRoom = room;
    setActiveRoom(room);
    this.renderPlayersMatchBar(room);

    const me = getCurrentUser();
    const gameState = room.gameState || {};
    const myId = String(me?.id);
    const turnId = String(gameState.currentTurn);
    const isMyTurn = turnId === myId && !gameState.winner && !gameState.isDraw;

    const turnBadge = document.getElementById('turn-indicator-badge') || document.getElementById('game-turn-badge');
    const turnText = document.getElementById('turn-indicator-text') || turnBadge;

    if (turnBadge && turnText) {
      if (gameState.winner || gameState.isDraw) {
        turnText.textContent = 'Round Complete';
        turnBadge.className = 'turn-badge';
      } else if (room.gameType === 'rps') {
        turnText.textContent = 'MAKE YOUR CHOICE';
        turnBadge.className = 'turn-badge your-turn';
      } else if (isMyTurn) {
        turnText.textContent = 'YOUR TURN';
        turnBadge.className = 'turn-badge your-turn';
      } else {
        turnText.textContent = "OPPONENT'S TURN";
        turnBadge.className = 'turn-badge opp-turn';
      }
    }

    if (room.gameType === 'tictactoe') {
      updateTicTacToeState(room, payload);
    } else if (room.gameType === 'rps') {
      updateRpsState(room, payload);
    } else if (room.gameType === 'connect4') {
      updateConnect4State(room, payload);
    }
  }

  handleGameOver(room, winner, isDraw, reason) {
    this.activeMatchRoom = room;
    const me = getCurrentUser();

    const iconEl = document.getElementById('result-icon-huge') || document.getElementById('game-result-icon');
    const titleEl = document.getElementById('result-title') || document.getElementById('game-result-title');
    const descEl = document.getElementById('result-desc') || document.getElementById('game-result-desc');
    const hintEl = document.getElementById('result-rematch-status') || document.getElementById('rematch-status-hint');
    const btnRematch = document.getElementById('btn-result-rematch') || document.getElementById('btn-rematch');

    if (hintEl) {
      hintEl.textContent = '';
      hintEl.classList.add('hidden');
    }
    if (btnRematch) {
      btnRematch.textContent = 'Play Again';
      btnRematch.className = 'btn btn-primary';
      btnRematch.disabled = false;
    }

    if (isDraw) {
      playDrawSound();
      if (iconEl) {
        iconEl.innerHTML = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path></svg>`;
      }
      if (titleEl) {
        titleEl.textContent = "IT'S A DRAW!";
        titleEl.style.color = '#facc15';
      }
      if (descEl) descEl.textContent = reason || 'Well fought! Both players played exceptionally.';
    } else if (String(winner?.id) === String(me?.id)) {
      launchConfetti(4500);
      playVictorySound();
      if (iconEl) {
        iconEl.innerHTML = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>`;
      }
      if (titleEl) {
        titleEl.textContent = 'YOU WON!';
        titleEl.style.color = '#10b981';
      }
      if (descEl) descEl.textContent = reason ? `Victory! ${reason}` : 'Congratulations! Great moves!';
    } else {
      playDefeatSound();
      if (iconEl) {
        iconEl.innerHTML = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
      }
      if (titleEl) {
        titleEl.textContent = 'YOU LOST!';
        titleEl.style.color = '#ef4444';
      }
      if (descEl) descEl.textContent = reason ? `${winner?.display_name || 'Opponent'} won. ${reason}` : 'Good game! Practice makes perfect.';
    }

    setTimeout(() => {
      this.openModal('modal-game-result');
      this.openModal('modal-game-over');
      // Silently refresh profile stats and match history in the background
      try {
        loadProfileData();
      } catch (e) {
        /* ignore */
      }
    }, 400);
  }

  // ==========================================
  // Controls & Dialogs
  // ==========================================
  bindGameControlEvents() {
    // Sound Mute/Unmute Toggle in Game Top Bar
    const btnAudioToggle = document.getElementById('btn-toggle-game-audio');
    const updateAudioIcon = (muted) => {
      btnAudioToggle.innerHTML = muted
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
    };
    if (btnAudioToggle) {
      updateAudioIcon(isMuted());
      btnAudioToggle.onclick = () => {
        const muted = toggleMute();
        updateAudioIcon(muted);
        this.showToast(muted ? 'Game sound muted' : 'Game sound enabled', 'info');
      };
    }

    // In-game Floating Reaction Emotes Strip
    document.querySelectorAll('.btn-game-quick-emote').forEach((btn) => {
      btn.onclick = () => {
        if (!this.activeMatchRoom) return;
        const emote = btn.dataset.emote;
        if (!emote) return;
        playEmoteSound();
        const socket = getSocket();
        if (socket) {
          socket.emit('game_chat', {
            roomCode: this.activeMatchRoom.code,
            text: emote,
          });
        }
      };
    });

    // Leave Game button in top bar
    const btnLeaveActive = document.getElementById('btn-game-back') || document.getElementById('btn-leave-active-game');
    if (btnLeaveActive) {
      btnLeaveActive.onclick = () => {
        this.openModal('modal-confirm-leave');
      };
    }

    // Disconnect banner leave
    const btnDisconnectLeave = document.getElementById('btn-disconnect-leave');
    if (btnDisconnectLeave) {
      btnDisconnectLeave.onclick = () => {
        leaveCurrentGameRoom();
        this.activeMatchRoom = null;
        this.switchView('home');
      };
    }

    // Modal Forfeit Confirmation (Leave / Stay)
    const btnConfirmLeave = document.getElementById('btn-confirm-leave-yes') || document.getElementById('btn-confirm-leave-match');
    if (btnConfirmLeave) {
      btnConfirmLeave.onclick = () => {
        this.closeModal('modal-confirm-leave');
        this.closeModal('modal-game-result');
        this.closeModal('modal-game-over');
        leaveCurrentGameRoom();
        this.activeMatchRoom = null;
        this.switchView('home');
      };
    }

    const btnStay = document.getElementById('btn-confirm-leave-no');
    if (btnStay) {
      btnStay.onclick = () => this.closeModal('modal-confirm-leave');
    }

    // Rematch Request button
    const btnRematch = document.getElementById('btn-result-rematch') || document.getElementById('btn-rematch');
    if (btnRematch) {
      btnRematch.onclick = () => {
        if (!this.activeMatchRoom) return;
        const socket = getSocket();
        if (socket) {
          socket.emit('game_rematch', { roomCode: this.activeMatchRoom.code });
          socket.emit('request_rematch', { roomCode: this.activeMatchRoom.code });
          const hint = document.getElementById('result-rematch-status') || document.getElementById('rematch-status-hint');
          if (hint) {
            hint.textContent = 'Waiting for opponent to accept...';
            hint.classList.remove('hidden');
          }
          btnRematch.disabled = true;
        }
      };
    }

    // Game Over Exit button
    const btnGameOverLeave = document.getElementById('btn-result-leave') || document.getElementById('btn-game-over-leave');
    if (btnGameOverLeave) {
      btnGameOverLeave.onclick = () => {
        this.closeModal('modal-game-result');
        this.closeModal('modal-game-over');
        leaveCurrentGameRoom();
        this.activeMatchRoom = null;
        this.switchView('home');
      };
    }
  }

  bindModalEvents() {
    document.querySelectorAll('.modal-close-btn, .btn-modal-cancel, [data-close-modal]').forEach((btn) => {
      btn.onclick = () => {
        const modalId = btn.getAttribute('data-close-modal');
        if (modalId) {
          this.closeModal(modalId);
        } else {
          const modal = btn.closest('.modal-backdrop');
          if (modal) modal.classList.add('hidden');
        }
      };
    });
  }

  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('hidden');
  }

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('hidden');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconEl = document.createElement('span');
    iconEl.className = 'toast-icon';
    iconEl.textContent = icons[type] || icons.info;

    const textEl = document.createElement('span');
    textEl.textContent = message;

    toast.appendChild(iconEl);
    toast.appendChild(textEl);
    container.appendChild(toast);

    // Auto-remove with fade-out
    const removeDelay = 3800;
    const fadeDelay = 3500;

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px) scale(0.95)';
    }, fadeDelay);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, removeDelay);
  }

  showPlayerProfile(userId) {
    showPlayerProfileModal(userId);
  }
}

const app = new GameRoomApp();
window.GameApp = app;

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
