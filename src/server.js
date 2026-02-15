const express = require('express');
const path = require('path');
const { getNews, getCount } = require('./db');
const { fetchAll } = require('./aggregator');
const { extractTags, getArticleIdsByTag } = require('./tags');

const app = express();
const PORT = process.env.PORT || 3000;
const FETCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const VALID_COUNTRIES = ['cl', 'ec'];

// In-memory cache: serves stale data while DB rebuilds after cold start
const cache = {};

// Track last successful fetch timestamp
let lastFetchAt = null;

function buildCacheKey(params) {
  return JSON.stringify(params);
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
app.get('/api/news', (req, res) => {
  const { source, tag, limit, offset, sort, country } = req.query;

  // Validate country, default to 'cl'
  const cc = VALID_COUNTRIES.includes(country) ? country : 'cl';

  let ids;
  if (tag) {
    ids = getArticleIdsByTag(tag, cc);
    if (ids.length === 0) {
      return res.json({ articles: [], tags: extractTags(72, 15, cc), count: 0, country: cc });
    }
  }

  const articles = getNews({
    source: source || undefined,
    country: cc,
    ids,
    limit: limit ? parseInt(limit, 10) : 15,
    offset: offset ? parseInt(offset, 10) : 0,
    sort: sort === 'score' ? 'score' : 'date',
  });
  const tags = extractTags(72, 15, cc);
  const count = tag ? ids.length : getCount({ source: source || undefined, country: cc });

  const result = { articles, tags, count, country: cc, last_updated: lastFetchAt };

  // Update cache with fresh data
  const cacheKey = buildCacheKey({ source, tag, limit, offset, sort, country: cc });
  if (articles.length > 0) {
    cache[cacheKey] = result;
  } else if (cache[cacheKey]) {
    // DB is empty (cold start / rebuilding) — serve cached response
    return res.json(cache[cacheKey]);
  }

  res.json(result);
});

// API: Trigger manual fetch
app.post('/api/fetch', async (req, res) => {
  try {
    const result = await fetchAll();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Serve the board at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
  console.log(`tagadata.com running at http://localhost:${PORT}`);

  // Initial fetch on startup (non-blocking — server responds immediately)
  console.log('Running initial fetch...');
  fetchAll()
    .then(() => { lastFetchAt = new Date().toISOString(); })
    .catch((err) => console.error('Initial fetch error:', err));

  // Schedule recurring fetch every 5 minutes
  setInterval(() => {
    fetchAll()
      .then(() => { lastFetchAt = new Date().toISOString(); })
      .catch((err) => console.error('Scheduled fetch error:', err));
  }, FETCH_INTERVAL_MS);
});
