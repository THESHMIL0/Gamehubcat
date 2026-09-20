// ==========================================
// GameRoom — Upgraded Connect Four Game Module
// ==========================================

import { getSocket } from '../socket.js';
import { getCurrentUser } from '../auth.js';
import { playDropSound, triggerHaptic } from '../audio.js';

let currentRoom = null;
let lastRenderedBoard = null;

export function initConnect4(room) {
  currentRoom = room;
  lastRenderedBoard = null;

  // Build 42 grid cells (6 rows x 7 cols) if not already built
  buildConnect4Grid();

  // Bind column drop arrow buttons
  const arrowButtons = document.querySelectorAll('.c4-col-arrow');
  arrowButtons.forEach((btn) => {
    btn.onclick = () => {
      const col = parseInt(btn.dataset.col, 10);
      handleColumnClick(col);
    };
    btn.onmouseenter = () => highlightColumn(parseInt(btn.dataset.col, 10), true);
    btn.onmouseleave = () => highlightColumn(parseInt(btn.dataset.col, 10), false);
  });

  updateConnect4State(room);
}

export function updateConnect4State(room, payload = {}) {
  currentRoom = room;
  renderGrid(room.gameState, payload?.lastMove);
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
      cell.onmouseenter = () => highlightColumn(c, true);
      cell.onmouseleave = () => highlightColumn(c, false);
      grid.appendChild(cell);
    }
  }
}

function highlightColumn(col, isHovered) {
  const cells = document.querySelectorAll(`.c4-cell[data-col="${col}"]`);
  cells.forEach((cell) => {
    if (isHovered) {
      cell.classList.add('c4-col-hovered');
    } else {
      cell.classList.remove('c4-col-hovered');
    }
  });
  const arrow = document.querySelector(`.c4-col-arrow[data-col="${col}"]`);
  if (arrow) {
    if (isHovered) arrow.classList.add('arrow-hovered');
    else arrow.classList.remove('arrow-hovered');
  }
}

function handleColumnClick(col) {
  if (!currentRoom || currentRoom.state !== 'PLAYING') return;

  const me = getCurrentUser();
  const gameState = currentRoom.gameState;
  if (!gameState) return;

  if (String(gameState.currentTurn) !== String(me?.id)) {
    const opp = currentRoom.players?.find((p) => String(p.id) !== String(me?.id));
    window.GameApp?.showToast(opp ? `It's ${opp.display_name}'s turn!` : "It's not your turn!", 'warning');
    triggerHaptic([20, 30]);
    return;
  }

  // Check if column is already full (top cell filled)
  if (gameState.board && gameState.board[0][col] !== null) {
    window.GameApp?.showToast('That column is full!', 'warning');
    triggerHaptic(40);
    return;
  }

  playDropSound();

  const socket = getSocket();
  if (socket) {
    socket.emit('game_move', {
      roomCode: currentRoom.code,
      move: { col },
    });
  }
}

function renderGrid(gameState, lastMove) {
  if (!gameState || !gameState.board) return;

  const board = gameState.board;
  const cells = document.querySelectorAll('.c4-cell');
  const me = getCurrentUser();
  const isMyTurn = String(gameState.currentTurn) === String(me?.id) && !gameState.winner && !gameState.isDraw;

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

  let hasNewDrop = false;

  // Render each token
  cells.forEach((cell) => {
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);
    const val = board[r][c];
    const prevVal = lastRenderedBoard ? lastRenderedBoard[r][c] : null;

    cell.classList.remove('p1', 'p2', 'c4-drop-animate', 'win-highlight');

    if (val === '🔴') {
      cell.classList.add('p1');
    } else if (val === '🟡') {
      cell.classList.add('p2');
    }

    // New drop animation if token was just placed
    if (val && !prevVal) {
      hasNewDrop = true;
      cell.style.setProperty('--drop-row', r);
      cell.classList.add('c4-drop-animate');
    }

    if (winningLookup.has(`${r}_${c}`)) {
      cell.classList.add('win-highlight');
    }
  });

  if (hasNewDrop) {
    playDropSound();
  }

  lastRenderedBoard = board.map((row) => [...row]);
}
