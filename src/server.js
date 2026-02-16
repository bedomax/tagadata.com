const express = require('express');
const path = require('path');
const db = require('./db');
const { getNews, getCount } = db;
const { fetchAll } = require('./aggregator');
const { extractTags, getArticleIdsByTag } = require('./tags');

const app = express();
const PORT = process.env.PORT || 3000;
const FETCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const VALID_COUNTRIES = ['cl', 'ec'];

// Track last successful fetch timestamp
let lastFetchAt = null;

// ---- In-memory cache ----
// Data only changes every 5 min, so we pre-build responses after each fetch.
// API serves from memory — zero DB queries on page load.
const newsCache = {};

async function rebuildCache() {
  for (const cc of VALID_COUNTRIES) {
    try {
      const [articlesByDate, articlesByScore, tags, count] = await Promise.all([
        getNews({ country: cc, limit: 200, sort: 'date' }),
        getNews({ country: cc, limit: 200, sort: 'score' }),
        extractTags(72, 15, cc),
        getCount({ country: cc }),
      ]);
      newsCache[cc] = { articlesByDate, articlesByScore, tags, count };
    } catch (err) {
      console.error(`[Cache] Error building cache for ${cc}:`, err.message);
    }
  }
  console.log('[Cache] Rebuilt for:', Object.keys(newsCache).join(', '));
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: Detect country from IP
app.get('/api/geo', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket.remoteAddress;

    // Localhost/dev → default to Chile
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168')) {
      return res.json({ country: 'cl' });
    }

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    const data = await response.json();
    const code = (data.countryCode || '').toLowerCase();

    res.json({ country: VALID_COUNTRIES.includes(code) ? code : 'cl' });
  } catch {
    res.json({ country: 'cl' });
  }
});

// API: Get news articles (country-filtered)
app.get('/api/news', async (req, res) => {
  try {
    const { source, tag, limit, offset, sort, country } = req.query;
    const cc = VALID_COUNTRIES.includes(country) ? country : 'cl';
    const cached = newsCache[cc];

    // Tag filter requires DB lookup (uncommon, acceptable latency)
    if (tag) {
      const ids = await getArticleIdsByTag(tag, cc);
      if (ids.length === 0) {
        return res.json({
          articles: [], tags: cached?.tags || [], count: 0,
          country: cc, last_updated: lastFetchAt,
        });
      }
      const articles = await getNews({
        country: cc, ids,
        limit: limit ? parseInt(limit, 10) : 15,
        offset: offset ? parseInt(offset, 10) : 0,
        sort: sort === 'score' ? 'score' : 'date',
      });
      return res.json({
        articles, tags: cached?.tags || [], count: ids.length,
        country: cc, last_updated: lastFetchAt,
      });
    }

    // Serve from cache — instant response, no DB queries
    if (cached) {
      const articles = sort === 'score' ? cached.articlesByScore : cached.articlesByDate;
      const lim = limit ? parseInt(limit, 10) : 15;
      const off = offset ? parseInt(offset, 10) : 0;
      return res.json({
        articles: articles.slice(off, off + lim),
        tags: cached.tags, count: cached.count,
        country: cc, last_updated: lastFetchAt,
      });
    }

    // Cache miss (first load before fetch completes) — hit DB directly
    const [articles, tags, count] = await Promise.all([
      getNews({
        source: source || undefined, country: cc,
        limit: limit ? parseInt(limit, 10) : 15,
        offset: offset ? parseInt(offset, 10) : 0,
        sort: sort === 'score' ? 'score' : 'date',
      }),
      extractTags(72, 15, cc),
      getCount({ source: source || undefined, country: cc }),
    ]);

    res.json({ articles, tags, count, country: cc, last_updated: lastFetchAt });
  } catch (err) {
    console.error('[API] /api/news error:', err.message);
    res.status(500).json({ articles: [], tags: [], count: 0, error: err.message });
  }
});

// API: Trigger manual fetch
app.post('/api/fetch', async (req, res) => {
  try {
    const result = await fetchAll();
    lastFetchAt = new Date().toISOString();
    await rebuildCache();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Serve the board at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server — initialize DB first, then listen immediately
async function start() {
  await db.init();
  await rebuildCache();

  app.listen(PORT, () => {
    console.log(`tagadata.com running at http://localhost:${PORT}`);
  });

  // Initial fetch in background — server is already responding
  console.log('Running initial fetch...');
  fetchAll()
    .then(async () => {
      lastFetchAt = new Date().toISOString();
      await rebuildCache();
    })
    .catch((err) => console.error('Initial fetch error:', err));

  // Schedule recurring fetch every 5 minutes
  setInterval(() => {
    fetchAll()
      .then(async () => {
        lastFetchAt = new Date().toISOString();
        await rebuildCache();
      })
      .catch((err) => console.error('Scheduled fetch error:', err));
  }, FETCH_INTERVAL_MS);
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
