const express = require('express');
const path = require('path');
const db = require('./db');
const { getNews, getCount, getLastFetchAt } = db;
const { extractTags, getArticleIdsByTag } = require('./tags');

/**
 * Deduplicate articles by cluster_id, keeping one representative per cluster.
 * Articles without a cluster (score=0, cluster_id=null) are kept as-is.
 */
function deduplicateByCluster(articles) {
  const seen = new Set();
  return articles.filter((a) => {
    if (!a.cluster_id || a.score === 0) return true;
    if (seen.has(a.cluster_id)) return false;
    seen.add(a.cluster_id);
    return true;
  });
}

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_REFRESH_MS = 60 * 1000; // Refresh cache from DB every 60s

const VALID_COUNTRIES = ['cl', 'ec'];

// ---- In-memory cache ----
// Pre-built responses served from memory. Refreshed every 60s from DB.
// The fetch job writes to DB independently — server just reads.
const newsCache = {};
let lastFetchAt = null;

async function rebuildCache() {
  for (const cc of VALID_COUNTRIES) {
    try {
      const [articlesByDate, articlesByScore, tags, count] = await Promise.all([
        getNews({ country: cc, limit: 200, sort: 'date' }),
        getNews({ country: cc, limit: 200, sort: 'score' }),
        extractTags(72, 15, cc),
        getCount({ country: cc }),
      ]);
      newsCache[cc] = {
        articlesByDate: deduplicateByCluster(articlesByDate),
        articlesByScore: deduplicateByCluster(articlesByScore),
        tags,
        count,
      };
    } catch (err) {
      console.error(`[Cache] Error building cache for ${cc}:`, err.message);
    }
  }
  lastFetchAt = await getLastFetchAt();
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: Detect country from IP
app.get('/api/geo', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket.remoteAddress;

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

    // Tag filter requires DB lookup
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

    // Serve from cache — instant response
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

    // Cache miss — query DB directly
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

// Serve the board at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Privacy policy
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/privacy-en', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy-en.html'));
});

// Start server immediately — DB init and cache build in background
app.listen(PORT, () => {
  console.log(`tagadata.com running at http://localhost:${PORT}`);

  db.init()
    .then(() => rebuildCache())
    .then(() => console.log('[Server] Ready — serving from cache'))
    .catch((err) => console.error('[Server] Startup error:', err));

  // Refresh cache every 60s to pick up new articles from the fetch job
  setInterval(() => {
    rebuildCache().catch((err) => console.error('[Cache] Refresh error:', err));
  }, CACHE_REFRESH_MS);
});
