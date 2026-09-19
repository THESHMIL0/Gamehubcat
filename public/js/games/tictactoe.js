// ==========================================
// GameRoom — Upgraded Tic-Tac-Toe Game Module
// ==========================================

import { getSocket } from '../socket.js';
import { getCurrentUser } from '../auth.js';
import { playMoveSound, triggerHaptic } from '../audio.js';

let currentRoom = null;
let lastKnownBoard = Array(9).fill(null);

export function initTicTacToe(room) {
  currentRoom = room;
  lastKnownBoard = Array(9).fill(null);
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

  // If winner with winning line, animate line and highlight cells
  if (room.gameState?.winner && room.gameState?.winningLine) {
    drawWinningLine(room.gameState.winningLine);
    highlightWinningCells(room.gameState.winningLine);
  } else {
    hideWinningLine();
    clearWinningHighlights();
  }
}

function handleCellClick(index) {
  if (!currentRoom || currentRoom.state !== 'PLAYING') return;

  const me = getCurrentUser();
  const gameState = currentRoom.gameState;
  if (!gameState) return;

  if (gameState.winner || gameState.isDraw) return;

  const myId = String(me?.id);
  const turnId = String(gameState.currentTurn);

  // Verify turn on client before sending
  if (turnId !== myId) {
    const opp = currentRoom.players?.find((p) => String(p.id) !== myId);
    window.GameApp?.showToast(opp ? `It's ${opp.display_name}'s turn!` : "It's not your turn!", 'warning');
    triggerHaptic([30, 40]);
    return;
  }

  if (gameState.board && gameState.board[index] !== null) return;

  const myPlayer = currentRoom.players?.find((p) => String(p.id) === myId);
  const mySymbol = myPlayer?.symbol || 'X';

  // Sound and haptic
  playMoveSound(mySymbol);

  // Optimistic UI update: immediately show player's symbol with bounce pop
  const cell = document.querySelector(`.ttt-cell[data-idx="${index}"]`);
  if (cell) {
    cell.textContent = mySymbol;
    cell.dataset.symbol = mySymbol;
    cell.disabled = true;
    cell.classList.remove('ttt-pop');
    void cell.offsetWidth; // trigger reflow
    cell.classList.add('ttt-pop');
  }
  if (gameState.board) {
    gameState.board[index] = mySymbol;
  }
  lastKnownBoard[index] = mySymbol;

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
  const myId = String(me?.id);
  const turnId = String(gameState.currentTurn);
  const isMyTurn = turnId === myId && !gameState.winner && !gameState.isDraw;
  const myPlayer = currentRoom?.players?.find((p) => String(p.id) === myId);
  const mySymbol = myPlayer?.symbol || 'X';

  const grid = document.getElementById('ttt-grid');
  if (grid) {
    grid.dataset.myTurn = isMyTurn ? 'true' : 'false';
    grid.dataset.mySymbol = mySymbol;
  }

  cells.forEach((cell, idx) => {
    const val = board[idx];
    const prevVal = lastKnownBoard[idx];

    cell.textContent = val || '';
    cell.dataset.symbol = val || '';

    // Play sound and animate if opponent placed a piece
    if (val && !prevVal && val !== mySymbol) {
      playMoveSound(val);
      cell.classList.remove('ttt-pop');
      void cell.offsetWidth;
      cell.classList.add('ttt-pop');
    }

    // Only disable if already marked or game has concluded
    if (val !== null || gameState.winner || gameState.isDraw) {
      cell.disabled = true;
      cell.style.cursor = 'default';
    } else {
      cell.disabled = false;
      cell.style.cursor = isMyTurn ? 'pointer' : 'not-allowed';
    }
  });

  lastKnownBoard = [...board];
}

function highlightWinningCells(winningIndices) {
  clearWinningHighlights();
  winningIndices.forEach((idx) => {
    const cell = document.querySelector(`.ttt-cell[data-idx="${idx}"]`);
    if (cell) {
      cell.classList.add('ttt-win-cell');
    }
  });
}

function clearWinningHighlights() {
  document.querySelectorAll('.ttt-cell.ttt-win-cell').forEach((c) => {
    c.classList.remove('ttt-win-cell');
  });
}

// Draw Animated SVG Line through 3 winning cells
function drawWinningLine(winningIndices) {
  const svg = document.getElementById('ttt-win-line');
  const line = document.getElementById('ttt-line-path');
  if (!svg || !line) return;

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
