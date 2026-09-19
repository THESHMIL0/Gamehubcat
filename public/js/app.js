// ==========================================
// GameRoom — Main Application Orchestrator
// ==========================================

import { getToken, getCurrentUser, login, register, fetchCurrentUser } from './auth.js';
import { initSocket, getSocket, disconnectSocket } from './socket.js';
import { initLobby, setActiveRoom, getActiveRoom, leaveCurrentGameRoom } from './lobby.js';
import { initFriends, loadFriendsData } from './friends.js';
import { initProfile, loadProfileData, showPlayerProfileModal } from './profile.js';
import { initInvitations } from './invitations.js';
import { initChat } from './chat.js';
import { initTicTacToe, updateTicTacToeState } from './games/tictactoe.js';
import { initRps, updateRpsState } from './games/rps.js';
import { initConnect4, updateConnect4State } from './games/connect4.js';

class GameRoomApp {
  constructor() {
    this.currentUser = null;
    this.currentView = 'auth';
    this.activeMatchRoom = null;
  }

  async init() {
    this.bindAuthEvents();
    this.bindNavigationEvents();
    this.bindModalEvents();
    this.bindGameControlEvents();

    // Check if user has active session
    const token = getToken();
    if (token) {
      try {
        const data = await fetchCurrentUser();
        if (data && data.user) {
          this.onAuthenticated(data.user);
        } else {
          this.switchView('auth');
        }
      } catch (e) {
        this.switchView('auth');
      }
    } else {
      this.switchView('auth');
    }
  }

  // ==========================================
  // Authentication UI Flow
  // ==========================================
  bindAuthEvents() {
    const tabLogin = document.getElementById('tab-login') || document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-register') || document.getElementById('tab-btn-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const linkGoRegister = document.getElementById('link-go-register');
    const linkGoLogin = document.getElementById('link-go-login');

    const showLogin = () => {
      tabLogin?.classList.add('active');
      tabRegister?.classList.remove('active');
      formLogin?.classList.remove('hidden');
      formRegister?.classList.add('hidden');
      this.clearAuthErrors();
    };

    const showRegister = () => {
      tabRegister?.classList.add('active');
      tabLogin?.classList.remove('active');
      formRegister?.classList.remove('hidden');
      formLogin?.classList.add('hidden');
      this.clearAuthErrors();
    };

    if (tabLogin) tabLogin.onclick = showLogin;
    if (tabRegister) tabRegister.onclick = showRegister;
    if (linkGoRegister) linkGoRegister.onclick = (e) => { e.preventDefault(); showRegister(); };
    if (linkGoLogin) linkGoLogin.onclick = (e) => { e.preventDefault(); showLogin(); };

    // Login Form Submit
    if (formLogin) {
      formLogin.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');

        try {
          this.clearAuthErrors();
          const user = await login(username, password);
          this.onAuthenticated(user);
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
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
          const user = await register(username, password, confirm);
          this.onAuthenticated(user);
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        }
      };
    }
  }

  clearAuthErrors() {
    document.getElementById('login-error')?.classList.add('hidden');
    document.getElementById('register-error')?.classList.add('hidden');
  }

  onAuthenticated(user) {
    this.currentUser = user;

    // Update Header
    const nameEl = document.getElementById('header-username') || document.getElementById('header-display-name');
    if (nameEl) nameEl.textContent = user.display_name || user.username;
    
    const avatarEl = document.getElementById('header-avatar');
    if (avatarEl) avatarEl.textContent = user.avatar || '🎮';

    // Show Main Interface
    document.getElementById('main-interface')?.classList.remove('hidden');
    document.getElementById('view-auth')?.classList.add('hidden');

    // Switch to Home View
    this.switchView('home');

    // Initialize Real-time modules
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

    initProfile();
    loadProfileData();
    loadFriendsData();
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
    this.currentView = viewName;

    const isAuth = viewName === 'auth';
    document.getElementById('view-auth')?.classList.toggle('hidden', !isAuth);
    document.getElementById('main-interface')?.classList.toggle('hidden', isAuth);

    // Hide all content views, activate target view
    document.querySelectorAll('.content-view').forEach((v) => v.classList.remove('active'));
    const targetEl = document.getElementById(`view-${viewName}`);
    if (targetEl) {
      targetEl.classList.add('active');
    }

    // Mobile nav visibility (hidden during active game or auth)
    document.getElementById('mobile-bottom-nav')?.classList.toggle('hidden', isAuth || viewName === 'game');

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
        const winPlayer = winner || (room.gameState?.winner ? room.players?.find((p) => Number(p.id) === Number(room.gameState.winner)) : null);
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

    const isMeP1 = Number(p1.id) === Number(me?.id);
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
    const myId = Number(me?.id);
    const turnId = Number(gameState.currentTurn);
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
      btnRematch.textContent = 'Play Again / Rematch';
      btnRematch.className = 'btn btn-primary';
      btnRematch.disabled = false;
    }

    if (isDraw) {
      if (iconEl) iconEl.textContent = '🤝';
      if (titleEl) {
        titleEl.textContent = "IT'S A DRAW!";
        titleEl.style.color = '#facc15';
      }
      if (descEl) descEl.textContent = reason || 'Well fought! Both players played exceptionally.';
    } else if (winner?.id === me?.id) {
      if (iconEl) iconEl.textContent = '🏆';
      if (titleEl) {
        titleEl.textContent = 'YOU WON!';
        titleEl.style.color = '#10b981';
      }
      if (descEl) descEl.textContent = reason ? `Victory! ${reason}` : 'Congratulations! Great moves!';
    } else {
      if (iconEl) iconEl.textContent = '💀';
      if (titleEl) {
        titleEl.textContent = 'YOU LOST!';
        titleEl.style.color = '#ef4444';
      }
      if (descEl) descEl.textContent = reason ? `${winner?.display_name || 'Opponent'} won. ${reason}` : 'Good game! Practice makes perfect.';
    }

    setTimeout(() => {
      this.openModal('modal-game-result');
      this.openModal('modal-game-over');
    }, 400);
  }

  // ==========================================
  // Controls & Dialogs
  // ==========================================
  bindGameControlEvents() {
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

    const toast = document.createElement('div');
    toast.className = 'toast';

    const colors = {
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#38bdf8',
    };

    toast.style.borderColor = colors[type] || '#38bdf8';
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3800);
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
