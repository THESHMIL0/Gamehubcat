// ==========================================
// GameRoom — Victory Confetti Particle Engine
// Pure Canvas — Lightweight & zero external dependencies
// ==========================================

let canvas = null;
let ctx = null;
let animationFrame = null;
let particles = [];

function initConfettiCanvas() {
  if (canvas) return;

  canvas = document.createElement('canvas');
  canvas.id = 'gameroom-confetti-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  document.body.appendChild(canvas);

  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

const COLORS = [
  '#10b981', // Emerald
  '#38bdf8', // Sky Cyan
  '#f59e0b', // Amber Gold
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#ffffff', // White
];

export function launchConfetti(durationMs = 3500) {
  initConfettiCanvas();
  if (!canvas || !ctx) return;

  // Generate 120 vibrant particles
  const count = Math.min(130, Math.floor(window.innerWidth / 5));
  particles = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      x: window.innerWidth * 0.5 + (Math.random() - 0.5) * 160,
      y: window.innerHeight * 0.45,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      size: Math.random() * 8 + 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 12,
      opacity: 1,
      shape: Math.random() > 0.4 ? 'rect' : 'circle',
    });
  }

  const startTime = Date.now();

  function render() {
    const elapsed = Date.now() - startTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let activeParticles = 0;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.vx *= 0.985; // drag
      p.rotation += p.vRotation;

      if (elapsed > durationMs * 0.5) {
        p.opacity = Math.max(0, 1 - (elapsed - durationMs * 0.5) / (durationMs * 0.5));
      }

      if (p.y < canvas.height && p.opacity > 0) {
        activeParticles++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    if (activeParticles > 0 && elapsed < durationMs) {
      animationFrame = requestAnimationFrame(render);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animationFrame);
    }
  }

  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(render);
}
