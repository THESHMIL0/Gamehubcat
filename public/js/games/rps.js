// ==========================================
// GameRoom — Upgraded Rock Paper Scissors Game Module
// ==========================================

import { getSocket } from '../socket.js';
import { getCurrentUser } from '../auth.js';
import {
  playMoveSound,
  playCountdownTick,
  playRpsClash,
  playVictorySound,
  playDefeatSound,
  playDrawSound,
  triggerHaptic,
} from '../audio.js';

let currentRoom = null;
let lastRevealedResultRound = null;
let isAnimatingShoot = false;

// Shared SVG icon generator accessible everywhere in this module
export function getRpsIconHtml(choice) {
  if (choice === 'rock') {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.45));"><polygon points="6 3 18 3 22 9 12 22 2 9 6 3"/></svg>`;
  }
  if (choice === 'paper') {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.45));"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  }
  if (choice === 'scissors') {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(236, 72, 153, 0.45));"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`;
  }
  if (choice === 'locked') {
    return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(165, 180, 252, 0.4));"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  }
  return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}

export function initRps(room) {
  currentRoom = room;
  lastRevealedResultRound = null;
  isAnimatingShoot = false;

  // Reset and bind 3 choice buttons
  const buttons = document.querySelectorAll('.btn-rps-choice');
  buttons.forEach((btn) => {
    btn.disabled = false;
    btn.classList.remove('selected');
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
  const myId = String(me?.id);
  const opponent = room.players?.find((p) => String(p.id) !== myId);
  const oppId = opponent ? String(opponent.id) : null;

  // Update Round Banner and Player Labels
  const roundEl = document.getElementById('rps-round-text');
  if (roundEl && !isAnimatingShoot) {
    const roundNum = gameState.round || 1;
    roundEl.textContent = `Round ${roundNum} — Choose your hand`;
  }
  const p1Label = document.getElementById('rps-p1-label');
  const p2Label = document.getElementById('rps-p2-label');
  if (p1Label) p1Label.textContent = me?.display_name || 'You';
  if (p2Label) p2Label.textContent = opponent?.display_name || 'Opponent';

  // Check choices
  const choices = gameState.choices || {};
  const myChoice = choices[myId] || (me?.id ? choices[me.id] : undefined);
  const oppChoice = oppId ? (choices[oppId] || choices[opponent.id]) : undefined;

  // Choice buttons state
  const buttons = document.querySelectorAll('.btn-rps-choice');
  buttons.forEach((btn) => {
    if (myChoice && btn.dataset.choice === myChoice) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
    // Disabled once player has made a choice for this round until result is cleared
    btn.disabled = !!myChoice && !gameState.result;
  });

  const p1SlotIcon = document.getElementById('rps-p1-choice');
  const p2SlotIcon = document.getElementById('rps-p2-choice');
  const announceEl = document.getElementById('rps-result-announcement');

  if (gameState.result) {
    // Has this round's reveal sequence already played?
    const roundId = `${gameState.round}_${gameState.result.p1Choice}_${gameState.result.p2Choice}`;
    if (lastRevealedResultRound !== roundId) {
      lastRevealedResultRound = roundId;
      playShootCountdownAndReveal(room, gameState.result, me);
    }
  } else {
    // Round in progress
    if (!isAnimatingShoot) {
      if (myChoice) {
        if (p1SlotIcon) p1SlotIcon.innerHTML = getRpsIconHtml(myChoice);
      } else {
        if (p1SlotIcon) p1SlotIcon.innerHTML = getRpsIconHtml('unknown');
      }

      if (oppChoice) {
        if (p2SlotIcon) p2SlotIcon.innerHTML = getRpsIconHtml('locked');
        if (announceEl) {
          announceEl.textContent = myChoice
            ? 'Both chosen! Revealing hands...'
            : 'Opponent is ready! Make your choice!';
          announceEl.style.color = '#38bdf8';
        }
      } else {
        if (p2SlotIcon) p2SlotIcon.innerHTML = getRpsIconHtml('unknown');
        if (announceEl) {
          announceEl.textContent = myChoice
            ? 'Waiting for opponent to choose...'
            : 'Choose Rock, Paper, or Scissors!';
          announceEl.style.color = '#9ca3af';
        }
      }
    }
  }
}

function handleRpsSelection(choice) {
  if (!currentRoom || currentRoom.state !== 'PLAYING') return;

  const gameState = currentRoom.gameState || {};
  const me = getCurrentUser();
  const myId = String(me?.id);
  const choices = gameState.choices || {};
  if (choices[myId] || (me?.id && choices[me.id])) return;

  playMoveSound(choice === 'rock' ? 'X' : 'O');
  triggerHaptic(15);

  // Optimistic UI updates
  const buttons = document.querySelectorAll('.btn-rps-choice');
  buttons.forEach((btn) => {
    if (btn.dataset.choice === choice) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
    btn.disabled = true;
  });

  const p1SlotIcon = document.getElementById('rps-p1-choice');
  if (p1SlotIcon) {
    p1SlotIcon.innerHTML = getRpsIconHtml(choice);
  }

  const announceEl = document.getElementById('rps-result-announcement');
  if (announceEl) {
    announceEl.textContent = 'Choice locked in! Waiting for opponent...';
    announceEl.style.color = '#38bdf8';
  }

  const socket = getSocket();
  if (socket) {
    // Send authoritative game_move
    socket.emit('game_move', {
      roomCode: currentRoom.code,
      move: { choice },
    });
  }
}

// Cinematic 3-step shoot animation before revealing hands
function playShootCountdownAndReveal(room, res, me) {
  isAnimatingShoot = true;

  const p1SlotIcon = document.getElementById('rps-p1-choice');
  const p2SlotIcon = document.getElementById('rps-p2-choice');
  const announceEl = document.getElementById('rps-result-announcement');
  const roundEl = document.getElementById('rps-round-text');

  const steps = [
    { text: 'Rock...', choice: 'rock', pitch: 0.9 },
    { text: 'Paper...', choice: 'paper', pitch: 1.1 },
    { text: 'Scissors...', choice: 'scissors', pitch: 1.3 },
  ];

  let stepIdx = 0;

  function nextCountdownStep() {
    if (stepIdx < steps.length) {
      const s = steps[stepIdx];
      if (roundEl) roundEl.textContent = s.text;
      if (p1SlotIcon) {
        p1SlotIcon.innerHTML = getRpsIconHtml(s.choice);
        p1SlotIcon.classList.add('rps-shake');
      }
      if (p2SlotIcon) {
        p2SlotIcon.innerHTML = getRpsIconHtml(s.choice);
        p2SlotIcon.classList.add('rps-shake');
      }
      playCountdownTick(s.pitch);
      stepIdx++;
      setTimeout(nextCountdownStep, 380);
    } else {
      // SHOOT!
      if (roundEl) roundEl.textContent = 'SHOOT!';
      if (p1SlotIcon) p1SlotIcon.classList.remove('rps-shake');
      if (p2SlotIcon) p2SlotIcon.classList.remove('rps-shake');

      playRpsClash();

      // Show actual hands
      const isMeP1 = String(room?.players?.[0]?.id) === String(me?.id);
      const myRevealedChoice = isMeP1 ? res.p1Choice : res.p2Choice;
      const oppRevealedChoice = isMeP1 ? res.p2Choice : res.p1Choice;

      if (p1SlotIcon) {
        p1SlotIcon.innerHTML = getRpsIconHtml(myRevealedChoice);
        p1SlotIcon.classList.add('rps-reveal-impact');
      }
      if (p2SlotIcon) {
        p2SlotIcon.innerHTML = getRpsIconHtml(oppRevealedChoice);
        p2SlotIcon.classList.add('rps-reveal-impact');
      }

      setTimeout(() => {
        if (p1SlotIcon) p1SlotIcon.classList.remove('rps-reveal-impact');
        if (p2SlotIcon) p2SlotIcon.classList.remove('rps-reveal-impact');
      }, 500);

      // Announce round outcome
      if (res.outcome === 'tie') {
        if (announceEl) {
          announceEl.textContent = "It's a Tie! Both chose the same hand.";
          announceEl.style.color = '#facc15';
        }
        playDrawSound();
      } else if (String(res.winnerId) === String(me?.id)) {
        if (announceEl) {
          announceEl.textContent = 'You won this round!';
          announceEl.style.color = '#10b981';
        }
        playVictorySound();
      } else {
        const opp = room?.players?.find((p) => String(p.id) !== String(me?.id));
        if (announceEl) {
          announceEl.textContent = `${opp?.display_name || 'Opponent'} won this round!`;
          announceEl.style.color = '#ef4444';
        }
        playDefeatSound();
      }

      isAnimatingShoot = false;
    }
  }

  nextCountdownStep();
}

