// ==========================================
// GameRoom — Tic-Tac-Toe Game Module
// ==========================================

import { getSocket } from '../socket.js';
import { getCurrentUser } from '../auth.js';

let currentRoom = null;

export function initTicTacToe(room) {
  currentRoom = room;
  renderBoard(room.gameState);

  const grid = document.getElementById('ttt-grid');
  if (!grid) return;

  // Bind cell clicks
  const cells = grid.querySelectorAll('.ttt-cell');
  cells.forEach((cell) => {
    cell.onclick = () => {
      const idx = parseInt(cell.dataset.idx, 10);
      handleCellClick(idx);
    };
  });
}

export function updateTicTacToeState(room, payload = {}) {
  currentRoom = room;
  renderBoard(room.gameState);

  // If winner with winning line, animate line
  if (room.gameState?.winner && room.gameState?.winningLine) {
    drawWinningLine(room.gameState.winningLine);
  } else {
    hideWinningLine();
  }
}

function handleCellClick(index) {
  if (!currentRoom || currentRoom.state !== 'PLAYING') return;

  const me = getCurrentUser();
  const gameState = currentRoom.gameState;

  // Verify turn on client before sending
  if (gameState.currentTurn !== me.id) {
    window.GameApp?.showToast("It's not your turn!", 'warning');
    return;
  }

  if (gameState.board[index] !== null) return;

  const socket = getSocket();
  if (socket) {
    socket.emit('game_move', {
      roomCode: currentRoom.code,
      move: { index },
    });
  }
}

function renderBoard(gameState) {
  if (!gameState) return;
  const cells = document.querySelectorAll('.ttt-cell');
  const board = gameState.board || Array(9).fill(null);
  const me = getCurrentUser();
  const isMyTurn = gameState.currentTurn === me?.id && !gameState.winner && !gameState.isDraw;

  cells.forEach((cell, idx) => {
    const val = board[idx];
    cell.textContent = val || '';
    cell.dataset.symbol = val || '';

    if (val !== null || !isMyTurn) {
      cell.disabled = true;
    } else {
      cell.disabled = false;
    }
  });
}

// Draw Animated SVG Line through 3 winning cells (Section 28)
function drawWinningLine(winningIndices) {
  const svg = document.getElementById('ttt-win-line');
  const line = document.getElementById('ttt-line-path');
  if (!svg || !line) return;

  // Grid coordinates (0-2 for row and col, each cell center in 300x300 viewBox)
  // Centers: col 0 = 50, col 1 = 150, col 2 = 250; rows similarly
  const centers = [
    { x: 50, y: 50 },
    { x: 150, y: 50 },
    { x: 250, y: 50 },
    { x: 50, y: 150 },
    { x: 150, y: 150 },
    { x: 250, y: 150 },
    { x: 50, y: 250 },
    { x: 150, y: 250 },
    { x: 250, y: 250 },
  ];

  const first = centers[winningIndices[0]];
  const last = centers[winningIndices[2]];

  line.setAttribute('x1', first.x);
  line.setAttribute('y1', first.y);
  line.setAttribute('x2', last.x);
  line.setAttribute('y2', last.y);

  svg.classList.remove('hidden');
}

function hideWinningLine() {
  const svg = document.getElementById('ttt-win-line');
  if (svg) svg.classList.add('hidden');
}
