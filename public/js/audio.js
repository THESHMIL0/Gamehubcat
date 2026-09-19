// ==========================================
// GameRoom — Synthesized Web Audio & Haptics Engine
// Pure Web Audio API — Zero external audio files
// ==========================================

let audioCtx = null;
let isAudioMuted = localStorage.getItem('gameroom_audio_muted') === 'true';

function getAudioContext() {
  if (isAudioMuted) return null;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    return null;
  }
}

// User interaction unlocks audio on mobile/desktop
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
}

export function isMuted() {
  return isAudioMuted;
}

export function toggleMute() {
  isAudioMuted = !isAudioMuted;
  localStorage.setItem('gameroom_audio_muted', isAudioMuted ? 'true' : 'false');
  return isAudioMuted;
}

// Subtle mobile vibration
export function triggerHaptic(duration = 15) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  } catch (e) {
    /* ignore unsupported haptics */
  }
}

// Play a crisp pop / piece placement sound
export function playMoveSound(symbol = 'X') {
  const ctx = getAudioContext();
  if (!ctx) return;
  triggerHaptic(12);

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freq = symbol === 'X' || symbol === '🔴' ? 440 : 520;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.11);
  } catch (e) {}
}

// Connect Four coin dropping into the slot with double click/clink
export function playDropSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  triggerHaptic([10, 30, 15]);

  try {
    // High clink
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(650, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.12);
    gain1.gain.setValueAtTime(0.2, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.15);

    // Settle thud
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(220, ctx.currentTime + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.18);
    gain2.gain.setValueAtTime(0.18, ctx.currentTime + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.06);
    osc2.stop(ctx.currentTime + 0.21);
  } catch (e) {}
}

// Countdown tick for RPS
export function playCountdownTick(pitch = 1) {
  const ctx = getAudioContext();
  if (!ctx) return;
  triggerHaptic(8);

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580 * pitch, ctx.currentTime);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {}
}

// RPS Clash/Shoot sound
export function playRpsClash() {
  const ctx = getAudioContext();
  if (!ctx) return;
  triggerHaptic([20, 20, 30]);

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(840, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
  } catch (e) {}
}

// Victory Fanfare (Happy 4-note ascending chord arpeggio)
export function playVictorySound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  triggerHaptic([40, 30, 60, 30, 80]);

  try {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.11;
      const duration = idx === notes.length - 1 ? 0.45 : 0.18;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    });
  } catch (e) {}
}

// Defeat sound (Gentle 3-note descending tone)
export function playDefeatSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  triggerHaptic([30, 20, 30]);

  try {
    const notes = [440, 392, 329.63]; // A4, G4, E4
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.13;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.24);
    });
  } catch (e) {}
}

// Draw sound
export function playDrawSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [440, 440];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.15;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });
  } catch (e) {}
}

// Emote pop sound
export function playEmoteSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  triggerHaptic(10);

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(350, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  } catch (e) {}
}
