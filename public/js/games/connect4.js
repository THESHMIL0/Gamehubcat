// ==========================================
// GameRoom — Connect Four Game Module
// ==========================================

import { getSocket } from '../socket.js';
import { getCurrentUser } from '../auth.js';

let currentRoom = null;

export function initConnect4(room) {
  currentRoom = room;

  // Build 42 grid cells (6 rows x 7 cols) if not already built
  buildConnect4Grid();

  // Bind column drop arrow buttons
  const arrowButtons = document.querySelectorAll('.c4-col-arrow');
  arrowButtons.forEach((btn) => {
    btn.onclick = () => {
      const col = parseInt(btn.dataset.col, 10);
      handleColumnClick(col);
    };
  });

  updateConnect4State(room);
}

export function updateConnect4State(room, payload = {}) {
  currentRoom = room;
  renderGrid(room.gameState);
}

function buildConnect4Grid() {
  const grid = document.getElementById('c4-grid');
  if (!grid || grid.children.length === 42) return;

  grid.innerHTML = '';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const cell = document.createElement('div');
      cell.className = 'c4-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.onclick = () => handleColumnClick(c);
      grid.appendChild(cell);
    }
  }
}

function handleColumnClick(col) {
  if (!currentRoom || currentRoom.state !== 'PLAYING') return;

  const me = getCurrentUser();
  const gameState = currentRoom.gameState;
  if (!gameState) return;

  if (Number(gameState.currentTurn) !== Number(me?.id)) {
    const opp = currentRoom.players?.find((p) => Number(p.id) !== Number(me?.id));
    window.GameApp?.showToast(opp ? `It's ${opp.display_name}'s turn!` : "It's not your turn!", 'warning');
    return;
  }

  // Check if column is already full (top cell filled)
  if (gameState.board && gameState.board[0][col] !== null) {
    window.GameApp?.showToast('That column is full!', 'warning');
    return;
  }

  const socket = getSocket();
  if (socket) {
    socket.emit('game_move', {
      roomCode: currentRoom.code,
      move: { col },
    });
  }
}

function renderGrid(gameState) {
  if (!gameState || !gameState.board) return;

  const board = gameState.board;
  const cells = document.querySelectorAll('.c4-cell');
  const me = getCurrentUser();
  const isMyTurn = Number(gameState.currentTurn) === Number(me?.id) && !gameState.winner && !gameState.isDraw;

  // Update hover drop arrows
  const arrowButtons = document.querySelectorAll('.c4-col-arrow');
  arrowButtons.forEach((btn, col) => {
    btn.disabled = !isMyTurn || board[0][col] !== null;
  });

  // Winning cells set for fast lookup
  const winningLookup = new Set();
  if (gameState.winningCells) {
    gameState.winningCells.forEach(([r, c]) => winningLookup.add(`${r}_${c}`));
  }

  // Render each token
  cells.forEach((cell) => {
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);
    const val = board[r][c];

    cell.className = 'c4-cell';
    if (val === '🔴') {
      cell.classList.add('p1');
    } else if (val === '🟡') {
      cell.classList.add('p2');
    }

    if (winningLookup.has(`${r}_${c}`)) {
      cell.classList.add('win-highlight');
    }
  });
}
