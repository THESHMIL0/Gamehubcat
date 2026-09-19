// ==========================================
// GameRoom — Rock Paper Scissors Game Module
// ==========================================

import { getSocket } from '../socket.js';
import { getCurrentUser } from '../auth.js';

let currentRoom = null;
let mySelectedChoice = null;

export function initRps(room) {
  currentRoom = room;
  mySelectedChoice = null;

  // Bind 3 choice buttons
  const buttons = document.querySelectorAll('.btn-rps-choice');
  buttons.forEach((btn) => {
    btn.onclick = () => {
      const choice = btn.dataset.choice;
      handleRpsSelection(choice);
    };
  });

  updateRpsState(room);
}

export function updateRpsState(room, payload = {}) {
  currentRoom = room;
  const gameState = room.gameState || {};
  const me = getCurrentUser();
  const opponent = room.players.find((p) => p.id !== me?.id);

  // Update Round Text
  const roundEl = document.getElementById('rps-round-text');
  if (roundEl) {
    roundEl.textContent = `Round ${gameState.round || 1} — Choose your hand`;
  }

  // Check choices
  const choices = gameState.choices || {};
  const myChoice = choices[me?.id];
  const oppChoice = choices[opponent?.id];

  // Choice buttons state
  const buttons = document.querySelectorAll('.btn-rps-choice');
  buttons.forEach((btn) => {
    if (btn.dataset.choice === myChoice) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
    // Disable once selected for this round (until result reveals)
    btn.disabled = !!myChoice && !gameState.result;
  });

  // Arena Displays
  const p1SlotIcon = document.getElementById('rps-p1-choice');
  const p2SlotIcon = document.getElementById('rps-p2-choice');
  const announceEl = document.getElementById('rps-result-announcement');

  // Map choices to emojis
  const emojiMap = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️',
  };

  if (gameState.result) {
    // Both players have made their move! Reveal both hands!
    const res = gameState.result;
    const isP1 = me?.id === room.players[0]?.id;

    p1SlotIcon.textContent = emojiMap[res.p1Choice] || '❓';
    p2SlotIcon.textContent = emojiMap[res.p2Choice] || '❓';

    if (res.outcome === 'tie') {
      announceEl.textContent = "It's a Tie! Both chose the same hand.";
      announceEl.style.color = '#facc15';
    } else if (res.winnerId === me?.id) {
      announceEl.textContent = '🎉 You won this round!';
      announceEl.style.color = '#10b981';
    } else {
      announceEl.textContent = 'Opponent won this round!';
      announceEl.style.color = '#ef4444';
    }
  } else {
    // Round in progress
    if (myChoice) {
      p1SlotIcon.textContent = emojiMap[myChoice] || '❓';
    } else {
      p1SlotIcon.textContent = '❓';
    }

    if (oppChoice) {
      p2SlotIcon.textContent = '🔒'; // Opponent chose, but secret!
      announceEl.textContent = myChoice ? 'Waiting for round results...' : 'Opponent is ready! Make your choice!';
      announceEl.style.color = '#38bdf8';
    } else {
      p2SlotIcon.textContent = '❓';
      announceEl.textContent = myChoice ? 'Waiting for opponent to choose...' : 'Choose Rock, Paper, or Scissors!';
      announceEl.style.color = '#9ca3af';
    }
  }
}

function handleRpsSelection(choice) {
  if (!currentRoom || currentRoom.state !== 'PLAYING') return;

  const socket = getSocket();
  if (socket) {
    socket.emit('game_move', {
      roomCode: currentRoom.code,
      move: { choice },
    });
  }
}
