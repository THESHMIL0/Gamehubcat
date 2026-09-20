// ==========================================
// GameRoom — Theme Customization Module
// ==========================================

export const CUTE_THEMES = [
  {
    id: 'midnight',
    name: 'Midnight Arcade',
    badge: 'Classic',
    emoji: '🌌',
    desc: 'Cyber neon emerald & deep space navy',
    swatches: ['#10b981', '#8b5cf6', '#0a0d14'],
  },
  {
    id: 'sakura',
    name: 'Sakura Blossom',
    badge: 'Cute',
    emoji: '🌸',
    desc: 'Soft cherry blossom pink & sweet lilac',
    swatches: ['#f472b6', '#c084fc', '#180f18'],
  },
  {
    id: 'matcha',
    name: 'Matcha Cream',
    badge: 'Cozy',
    emoji: '🍵',
    desc: 'Fresh matcha green & sage pistachios',
    swatches: ['#4ade80', '#a3e635', '#0d1612'],
  },
  {
    id: 'cotton-candy',
    name: 'Cotton Candy',
    badge: 'Pastel',
    emoji: '🍭',
    desc: 'Sweet bubblegum pink & baby sky blue',
    swatches: ['#f472b6', '#38bdf8', '#121020'],
  },
  {
    id: 'taro',
    name: 'Boba Taro Milk',
    badge: 'Sweet',
    emoji: '🧋',
    desc: 'Creamy lavender taro & soft orchid glow',
    swatches: ['#c084fc', '#818cf8', '#141021'],
  },
  {
    id: 'peach',
    name: 'Peach Sunset',
    badge: 'Warm',
    emoji: '🍑',
    desc: 'Juicy peach coral & golden apricot cream',
    swatches: ['#fb923c', '#fb7185', '#190f0e'],
  },
  {
    id: 'caramel',
    name: 'Cozy Caramel',
    badge: 'Latte',
    emoji: '☕',
    desc: 'Warm toasted mocha & honey amber glaze',
    swatches: ['#f59e0b', '#fbbf24', '#16110b'],
  },
  {
    id: 'moonlight',
    name: 'Starry Moonlight',
    badge: 'Dreamy',
    emoji: '✨',
    desc: 'Celestial twilight blue & silver starlight',
    swatches: ['#60a5fa', '#818cf8', '#091024'],
  },
];

const THEME_STORAGE_KEY = 'gameroom_theme';

export function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && CUTE_THEMES.some((t) => t.id === saved)) {
      return saved;
    }
  } catch (e) {
    /* ignore storage errors */
  }
  return 'midnight';
}

export function applyTheme(themeId, showToastNotification = false) {
  const selectedTheme = CUTE_THEMES.find((t) => t.id === themeId) || CUTE_THEMES[0];
  const activeId = selectedTheme.id;

  // Apply data-theme attribute on root and body
  document.documentElement.setAttribute('data-theme', activeId);
  document.body.setAttribute('data-theme', activeId);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, activeId);
  } catch (e) {
    /* ignore storage errors */
  }

  // Update badge in profile menu
  const menuBadge = document.getElementById('menu-current-theme-badge');
  if (menuBadge) {
    menuBadge.textContent = `${selectedTheme.name.split(' ')[0]} ${selectedTheme.emoji}`;
  }

  // Update theme pill in modal
  const modalPill = document.getElementById('themes-current-pill');
  if (modalPill) {
    modalPill.textContent = `${selectedTheme.name} ${selectedTheme.emoji}`;
  }

  // Update active state in modal grid cards
  const allCards = document.querySelectorAll('.theme-card');
  allCards.forEach((card) => {
    const id = card.getAttribute('data-theme-id');
    const isCurrent = id === activeId;
    if (isCurrent) {
      card.classList.add('active');
      card.setAttribute('aria-checked', 'true');
    } else {
      card.classList.remove('active');
      card.setAttribute('aria-checked', 'false');
    }
  });

  if (showToastNotification && window.GameApp?.showToast) {
    window.GameApp.showToast(`${selectedTheme.emoji} ${selectedTheme.name} theme applied!`, 'success');
  }
}

export function renderThemesGrid() {
  const container = document.getElementById('themes-grid');
  if (!container) return;

  const currentThemeId = getSavedTheme();

  container.innerHTML = CUTE_THEMES.map((theme) => {
    const isActive = theme.id === currentThemeId;
    const activeClass = isActive ? 'active' : '';
    const swatchesHtml = theme.swatches
      .map((color) => `<span class="theme-swatch" style="background-color: ${color};" title="${color}"></span>`)
      .join('');

    return `
      <div 
        class="theme-card ${activeClass}" 
        id="theme-card-${theme.id}" 
        data-theme-id="${theme.id}"
        role="radio"
        aria-checked="${isActive ? 'true' : 'false'}"
        tabindex="0"
        title="Apply ${theme.name} theme"
      >
        <div class="theme-card-top">
          <div class="theme-card-left">
            <span class="theme-emoji-icon">${theme.emoji}</span>
            <div class="theme-titles">
              <span class="theme-title-text">${theme.name}</span>
              <span class="theme-badge-pill">${theme.badge}</span>
            </div>
          </div>
          <div class="theme-check-indicator">
            <span class="theme-check-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
          </div>
        </div>
        <p class="theme-card-desc">${theme.desc}</p>
        <div class="theme-card-bottom">
          <div class="theme-swatches-row">
            ${swatchesHtml}
          </div>
          <span class="theme-status-label">${isActive ? 'Active' : 'Tap to apply'}</span>
        </div>
      </div>
    `;
  }).join('');

  // Wire click handlers on theme cards
  container.querySelectorAll('.theme-card').forEach((card) => {
    card.onclick = () => {
      const themeId = card.getAttribute('data-theme-id');
      if (themeId) {
        applyTheme(themeId, true);
      }
    };

    card.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const themeId = card.getAttribute('data-theme-id');
        if (themeId) {
          applyTheme(themeId, true);
        }
      }
    };
  });
}

export function initTheme() {
  const currentThemeId = getSavedTheme();
  applyTheme(currentThemeId, false);
  renderThemesGrid();
}
