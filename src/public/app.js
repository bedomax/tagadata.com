let currentTag = null;
let currentSort = 'date';
let currentCountry = localStorage.getItem('country') || 'cl';

// Countries config — add new countries here
const COUNTRIES = [
  { code: 'cl', flag: '\u{1F1E8}\u{1F1F1}', name: 'Chile' },
  { code: 'ec', flag: '\u{1F1EA}\u{1F1E8}', name: 'Ecuador' },
];

const SOURCE_COLORS_BY_COUNTRY = {
  cl: {
    'BioBioChile': 'biobio', 'Cooperativa': 'coop', 'La Tercera': 'tercera',
    'CIPER Chile': 'ciper', 'The Clinic': 'clinic', 'Interferencia': 'interf',
    'El Desconcierto': 'descon',
    'T13': 't13', 'CNN Chile': 'cnncl', 'CHV Noticias': 'chv', 'Meganoticias': 'mega',
  },
  ec: {
    'El Comercio': 'comercio', 'El Universo': 'universo', 'Metro Ecuador': 'metro',
    'GK': 'gk', 'La Barra Espaciadora': 'barra', 'Plan V': 'planv',
    'Confirmado': 'confirm',
    'Ecuavisa': 'ecuavisa', 'Teleamazonas': 'teleamaz',
  },
};

// Render country select from config
const countrySelect = document.getElementById('country-select');
countrySelect.innerHTML = COUNTRIES.map(c =>
  `<option value="${c.code}" ${currentCountry === c.code ? 'selected' : ''}>${c.flag} ${c.name}</option>`
).join('');
countrySelect.addEventListener('change', () => setCountry(countrySelect.value));

// Logo click → reset to home
document.querySelector('.logo').addEventListener('click', () => {
  currentTag = null;
  currentSort = 'date';
  document.querySelectorAll('.sort-pill').forEach(b => b.classList.remove('active'));
  document.querySelector('.sort-pill[data-sort="date"]').classList.add('active');
  loadNews();
});

function setCountry(cc) {
  currentCountry = cc;
  currentTag = null;
  localStorage.setItem('country', cc);
  countrySelect.value = cc;
  const country = COUNTRIES.find(c => c.code === cc);
  const name = country ? country.name : cc.toUpperCase();
  document.title = `tagadata - noticias de ${name} en vivo`;
  const desc = `Noticias de ${name} en tiempo real. Titulares de medios independientes y mainstream.`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', `tagadata - noticias de ${name}`);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);
  document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', `tagadata - noticias de ${name}`);
  document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', desc);
  loadNews();
}

// Auto-detect country on first visit
if (!localStorage.getItem('country')) {
  fetch('/api/geo').then(r => r.json()).then(d => {
    if (d.country && d.country !== currentCountry) {
      setCountry(d.country);
    }
  }).catch(() => {});
} else {
  setCountry(currentCountry);
}

// Theme — auto by time of day (6am-6pm = light, 6pm-6am = dark)
function getAutoTheme() {
  const h = new Date().getHours();
  return (h >= 6 && h < 18) ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

const autoTheme = getAutoTheme();
applyTheme(autoTheme);

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  loadNews();
});

function updateThemeIcon(theme) {
  document.getElementById('theme-toggle').innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;';
}

function isDark() {
  return (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
}

function getSourceColors() {
  return SOURCE_COLORS_BY_COUNTRY[currentCountry] || SOURCE_COLORS_BY_COUNTRY.cl;
}

// About modal
const aboutOverlay = document.getElementById('about-overlay');
document.getElementById('about-btn').addEventListener('click', () => aboutOverlay.classList.add('active'));
document.getElementById('about-close').addEventListener('click', () => aboutOverlay.classList.remove('active'));
aboutOverlay.addEventListener('click', (e) => {
  if (e.target === aboutOverlay) aboutOverlay.classList.remove('active');
});

// ---- Collage layouts using 12-column grid ----
// Desktop: 12 cols, varied sizes for a true collage feel
const LAYOUT_12 = [
  { col: '1 / span 5',  row: '1 / span 3', cls: 'hero',    titleRem: 2.0,  fw: 700, clamp: 5, color: '#fff' },
  { col: '6 / span 4',  row: '1 / span 2', cls: 'feature', titleRem: 1.2,  fw: 600, clamp: 3, color: '#eee' },
  { col: '10 / span 3', row: '1 / span 1', cls: 'compact', titleRem: 0.85, fw: 500, clamp: 2, color: '#ccc' },
  { col: '10 / span 3', row: '2 / span 1', cls: 'compact', titleRem: 0.85, fw: 500, clamp: 2, color: '#ccc' },
  { col: '6 / span 3',  row: '3 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '9 / span 4',  row: '3 / span 2', cls: 'feature', titleRem: 1.1,  fw: 600, clamp: 3, color: '#ddd' },
  { col: '1 / span 3',  row: '4 / span 2', cls: 'feature', titleRem: 1.05, fw: 600, clamp: 3, color: '#ddd' },
  { col: '4 / span 2',  row: '4 / span 1', cls: 'compact', titleRem: 0.8,  fw: 400, clamp: 2, color: '#aaa' },
  { col: '6 / span 3',  row: '4 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '4 / span 5',  row: '5 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '9 / span 4',  row: '5 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '1 / span 4',  row: '6 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '5 / span 4',  row: '6 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '9 / span 4',  row: '6 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '1 / span 6',  row: '7 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
];

// Tablet: 6 cols
const LAYOUT_6 = [
  { col: '1 / span 4',  row: '1 / span 2', cls: 'hero',    titleRem: 1.5,  fw: 700, clamp: 4, color: '#fff' },
  { col: '5 / span 2',  row: '1 / span 1', cls: 'feature', titleRem: 0.95, fw: 600, clamp: 2, color: '#eee' },
  { col: '5 / span 2',  row: '2 / span 1', cls: 'compact', titleRem: 0.85, fw: 500, clamp: 2, color: '#ccc' },
  { col: '1 / span 3',  row: '3 / span 1', cls: 'feature', titleRem: 1.0,  fw: 600, clamp: 2, color: '#ddd' },
  { col: '4 / span 3',  row: '3 / span 1', cls: 'compact', titleRem: 0.9,  fw: 500, clamp: 2, color: '#ccc' },
  { col: '1 / span 2',  row: '4 / span 1', cls: 'compact', titleRem: 0.8,  fw: 400, clamp: 2, color: '#aaa' },
  { col: '3 / span 2',  row: '4 / span 1', cls: 'compact', titleRem: 0.8,  fw: 400, clamp: 2, color: '#aaa' },
  { col: '5 / span 2',  row: '4 / span 1', cls: 'compact', titleRem: 0.8,  fw: 400, clamp: 2, color: '#aaa' },
  { col: '1 / span 3',  row: '5 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '4 / span 3',  row: '5 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '1 / span 6',  row: '6 / span 1', cls: 'compact', titleRem: 0.85, fw: 400, clamp: 2, color: '#aaa' },
  { col: '1 / span 3',  row: '7 / span 1', cls: 'compact', titleRem: 0.8,  fw: 400, clamp: 2, color: '#aaa' },
  { col: '4 / span 3',  row: '7 / span 1', cls: 'compact', titleRem: 0.8,  fw: 400, clamp: 2, color: '#aaa' },
  { col: '1 / span 3',  row: '8 / span 1', cls: 'compact', titleRem: 0.8,  fw: 400, clamp: 2, color: '#aaa' },
  { col: '4 / span 3',  row: '8 / span 1', cls: 'compact', titleRem: 0.8,  fw: 400, clamp: 2, color: '#aaa' },
];

// Mobile: single column list for readability
const LAYOUT_4 = Array.from({ length: 15 }, (_, i) => ({
  col: '1 / span 4',
  row: 'auto',
  cls: i === 0 ? 'hero' : i < 3 ? 'feature' : 'compact',
  titleRem: i === 0 ? 1.2 : i < 3 ? 1.0 : 0.9,
  fw: i === 0 ? 700 : i < 3 ? 600 : 400,
  clamp: i === 0 ? 4 : 3,
  color: i === 0 ? '#fff' : i < 3 ? '#eee' : '#ccc',
}));

// Small mobile: single column
const LAYOUT_2 = Array.from({ length: 15 }, (_, i) => ({
  col: '1 / span 2',
  row: 'auto',
  cls: i === 0 ? 'hero' : i < 3 ? 'feature' : 'compact',
  titleRem: i === 0 ? 1.1 : i < 3 ? 0.95 : 0.85,
  fw: i === 0 ? 700 : i < 3 ? 600 : 400,
  clamp: i === 0 ? 4 : 3,
  color: i === 0 ? '#fff' : i < 3 ? '#eee' : '#ccc',
}));

function getLayout() {
  const w = window.innerWidth;
  if (w <= 520) return LAYOUT_2;
  if (w <= 768) return LAYOUT_4;
  if (w <= 1100) return LAYOUT_6;
  return LAYOUT_12;
}

function renderLastUpdated(iso) {
  const el = document.querySelector('.topbar-meta');
  if (!el) return;
  if (!iso) {
    el.textContent = 'actualizando…';
    return;
  }
  el.innerHTML = `actualizado <strong>${timeAgo(iso)}</strong>`;
}

async function loadNews() {
  const params = new URLSearchParams();
  params.set('country', currentCountry);
  if (currentTag) params.set('tag', currentTag);
  const apiSort = currentSort === 'video' ? 'date' : currentSort;
  params.set('sort', apiSort);
  if (currentSort === 'video') params.set('limit', '200');

  try {
    const res = await fetch(`/api/news?${params}`);
    const data = await res.json();
    renderTags(data.tags || []);
    renderLastUpdated(data.last_updated);
    let articles = data.articles;

    // If server just started and has no articles yet, retry after a few seconds
    if (!articles.length && !loadNews._retries) {
      loadNews._retries = 0;
    }
    if (!articles.length && (loadNews._retries || 0) < 5) {
      loadNews._retries = (loadNews._retries || 0) + 1;
      document.getElementById('content').innerHTML =
        '<p class="empty">Cargando noticias\u2026</p>';
      setTimeout(loadNews, 5000);
      return;
    }
    loadNews._retries = 0;

    const hasVideos = articles.some(a => a.url && a.url.includes('youtube.com'));
    const videoBtn = document.querySelector('.sort-pill[data-sort="video"]');
    if (videoBtn) videoBtn.style.display = hasVideos ? '' : 'none';
    if (currentSort === 'video') {
      articles = articles.filter(a => a.url && a.url.includes('youtube.com'));
    }
    renderBoard(articles);
  } catch {
    document.getElementById('content').innerHTML =
      '<p class="empty">Error al cargar. Intenta refrescar.</p>';
  }
}

document.querySelectorAll('.sort-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    loadNews();
  });
});

function renderTags(tags) {
  const el = document.getElementById('filters');
  el.innerHTML = `<button class="pill ${!currentTag ? 'active' : ''}" data-tag="">todos</button>` +
    tags.map(t =>
      `<button class="pill ${currentTag === t.tag ? 'active' : ''}"
               data-tag="${esc(t.tag)}">#${esc(t.tag)} <span style="opacity:0.5">${t.count}</span></button>`
    ).join('');

  el.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTag = btn.dataset.tag || null;
      loadNews();
    });
  });
}

function sourceDot(name) {
  return `<span class="source-dot ${getSourceColors()[name] || 'default'}"></span>`;
}

function sourceTag(name) {
  return `<span class="source-tag">${sourceDot(name)}${esc(name)}</span>`;
}

function isYouTube(url) {
  return url && url.includes('youtube.com');
}

function getYouTubeId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('v');
  } catch { return null; }
}

function openVideoModal(videoId) {
  const overlay = document.createElement('div');
  overlay.className = 'video-modal-overlay';
  overlay.innerHTML = `
    <div class="video-modal">
      <button class="video-modal-close">&times;</button>
      <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" frameborder="0"
        allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('video-modal-close')) {
      overlay.remove();
    }
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
  });
}

function renderBoard(articles) {
  const box = document.getElementById('content');

  if (!articles.length) {
    box.innerHTML = '<p class="empty">Sin noticias a\u00fan. Esperando primer fetch.</p>';
    return;
  }

  // Cluster multi-source articles into single cards
  const clusterMap = new Map();
  const solo = [];

  for (const a of articles) {
    if (a.score > 0 && a.cluster_id) {
      if (!clusterMap.has(a.cluster_id)) clusterMap.set(a.cluster_id, []);
      clusterMap.get(a.cluster_id).push(a);
    } else {
      solo.push(a);
    }
  }

  const cards = [];

  for (const [, group] of clusterMap) {
    const rep = group.reduce((best, a) => {
      if (!best.published_at) return a;
      if (!a.published_at) return best;
      return new Date(a.published_at) > new Date(best.published_at) ? a : best;
    }, group[0]);
    cards.push({
      ...rep,
      _others: group.filter(a => a.id !== rep.id).map(a => a.source),
    });
  }

  for (const a of solo) cards.push(a);

  if (currentSort === 'score') {
    cards.sort((a, b) => (b.score || 0) - (a.score || 0));
  } else {
    cards.sort((a, b) => {
      const da = a.published_at ? new Date(a.published_at) : new Date(0);
      const db_ = b.published_at ? new Date(b.published_at) : new Date(0);
      return db_ - da;
    });
  }

  const currentLayout = getLayout();
  const visible = cards.slice(0, currentLayout.length);

  box.innerHTML = `<div class="board">${visible.map((a, i) => {
    const layout = currentLayout[i] || currentLayout[currentLayout.length - 1];
    const s = a.score || 0;

    const titleRem = s >= 60 ? Math.max(layout.titleRem, 1.8) : s > 0 ? Math.max(layout.titleRem, 1.2) : layout.titleRem;
    const fw = s >= 60 ? 700 : s > 0 ? 600 : layout.fw;
    const dark = isDark();
    const tc = s >= 60 ? (dark ? '#fff' : '#1a1a1a') : s > 0 ? (dark ? '#eee' : '#222') : (dark ? layout.color : (i < 6 ? '#333' : '#555'));

    const badge = s >= 60
      ? '<div class="badge badge-hot">HOT</div>'
      : s > 0
        ? '<div class="badge badge-multi">multi-source</div>'
        : '';

    const others = a._others && a._others.length
      ? `<div class="cluster-sources">${a._others.map(src => sourceTag(src)).join('')}</div>`
      : '';

    const isVideo = isYouTube(a.url);
    const videoId = isVideo ? getYouTubeId(a.url) : null;
    const videoIcon = isVideo ? '<span class="video-icon">&#9654;</span>' : '';
    const titleClick = isVideo && videoId
      ? `onclick="event.preventDefault();openVideoModal('${videoId}')" href="${esc(a.url)}"`
      : `href="${esc(a.url)}" target="_blank" rel="noopener"`;

    return `<article class="card ${layout.cls} ${isVideo ? 'card-video' : ''}"
      style="grid-column:${layout.col};grid-row:${layout.row}">
      ${badge}
      <a class="card-title" ${titleClick}
         style="font-size:${titleRem}rem;font-weight:${fw};color:${tc};-webkit-line-clamp:${layout.clamp};line-clamp:${layout.clamp}">${videoIcon}${esc(a.title)}</a>
      <div class="card-footer">
        ${sourceTag(a.source)}
        ${a.published_at ? `<span class="card-time">${timeAgo(a.published_at)}</span>` : ''}
      </div>
      ${others}
    </article>`;
  }).join('')}</div>`;
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  if (h < 48) return 'ayer';
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('es-CL', { month: 'short', day: 'numeric' });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

loadNews();
setInterval(loadNews, 5 * 60 * 1000);

// Re-render on resize to adapt collage layout
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(loadNews, 200);
});
