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

export function initRps(room) {
  currentRoom = room;
  lastRevealedResultRound = null;
  isAnimatingShoot = false;

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
  const opponent = room.players.find((p) => String(p.id) !== String(me?.id));

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

  const p1SlotIcon = document.getElementById('rps-p1-choice');
  const p2SlotIcon = document.getElementById('rps-p2-choice');
  const announceEl = document.getElementById('rps-result-announcement');

  const emojiMap = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️',
  };

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
        p1SlotIcon.textContent = emojiMap[myChoice] || '❓';
      } else {
        p1SlotIcon.textContent = '❓';
      }

      if (oppChoice) {
        p2SlotIcon.textContent = '🔒';
        announceEl.textContent = myChoice
          ? 'Both chosen! Revealing hands...'
          : 'Opponent is ready! Make your choice!';
        announceEl.style.color = '#38bdf8';
      } else {
        p2SlotIcon.textContent = '❓';
        announceEl.textContent = myChoice
          ? 'Waiting for opponent to choose...'
          : 'Choose Rock, Paper, or Scissors!';
        announceEl.style.color = '#9ca3af';
      }
    }
  }
}

function handleRpsSelection(choice) {
  if (!currentRoom || currentRoom.state !== 'PLAYING') return;

  const gameState = currentRoom.gameState;
  const me = getCurrentUser();
  if (gameState?.choices && gameState.choices[me?.id]) return;

  playMoveSound(choice === 'rock' ? 'X' : 'O');
  triggerHaptic(15);

  const socket = getSocket();
  if (socket) {
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

  const emojiMap = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️',
  };

  const steps = [
    { text: '✊ Rock...', icon: '✊', pitch: 0.9 },
    { text: '✋ Paper...', icon: '✋', pitch: 1.1 },
    { text: '✌️ Scissors...', icon: '✌️', pitch: 1.3 },
  ];

  let stepIdx = 0;

  function nextCountdownStep() {
    if (stepIdx < steps.length) {
      const s = steps[stepIdx];
      if (roundEl) roundEl.textContent = s.text;
      if (p1SlotIcon) {
        p1SlotIcon.textContent = s.icon;
        p1SlotIcon.classList.add('rps-shake');
      }
      if (p2SlotIcon) {
        p2SlotIcon.textContent = s.icon;
        p2SlotIcon.classList.add('rps-shake');
      }
      playCountdownTick(s.pitch);
      stepIdx++;
      setTimeout(nextCountdownStep, 380);
    } else {
      // 💥 SHOOT!
      if (roundEl) roundEl.textContent = '💥 SHOOT!';
      if (p1SlotIcon) p1SlotIcon.classList.remove('rps-shake');
      if (p2SlotIcon) p2SlotIcon.classList.remove('rps-shake');

      playRpsClash();

      // Show actual hands
      const isMeP1 = String(room?.players?.[0]?.id) === String(me?.id);
      const myRevealedChoice = isMeP1 ? res.p1Choice : res.p2Choice;
      const oppRevealedChoice = isMeP1 ? res.p2Choice : res.p1Choice;

      if (p1SlotIcon) {
        p1SlotIcon.textContent = emojiMap[myRevealedChoice] || '❓';
        p1SlotIcon.classList.add('rps-reveal-impact');
      }
      if (p2SlotIcon) {
        p2SlotIcon.textContent = emojiMap[oppRevealedChoice] || '❓';
        p2SlotIcon.classList.add('rps-reveal-impact');
      }

      setTimeout(() => {
        if (p1SlotIcon) p1SlotIcon.classList.remove('rps-reveal-impact');
        if (p2SlotIcon) p2SlotIcon.classList.remove('rps-reveal-impact');
      }, 500);

      // Announce round outcome
      if (res.outcome === 'tie') {
        announceEl.textContent = "🤝 It's a Tie! Both chose the same hand.";
        announceEl.style.color = '#facc15';
        playDrawSound();
      } else if (String(res.winnerId) === String(me?.id)) {
        announceEl.textContent = '🎉 You won this round!';
        announceEl.style.color = '#10b981';
        playVictorySound();
      } else {
        const opp = room?.players?.find((p) => String(p.id) !== String(me?.id));
        announceEl.textContent = `${opp?.display_name || 'Opponent'} won this round!`;
        announceEl.style.color = '#ef4444';
        playDefeatSound();
      }

      isAnimatingShoot = false;
    }
  }

  nextCountdownStep();
}
