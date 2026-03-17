const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { getNews, getCount, getLastFetchAt } = db;
const { extractTags, getArticleIdsByTag } = require('./tags');
const { parseNewsParams } = require('./validate');

/**
 * Deduplicate articles by cluster_id, keeping the most recent per cluster.
 * Articles without a cluster (score=0 or no cluster_id) are kept as-is.
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

app.use(helmet());

// Trust only the first proxy (Cloud Run / Render set exactly one hop)
app.set('trust proxy', 1);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  // Use the real IP resolved by express after trust proxy, not raw X-Forwarded-For
  keyGenerator: (req) => req.ip,
  skip: () => false,
});
const CACHE_REFRESH_MS = 60 * 1000; // Refresh cache from DB every 60s

const VALID_COUNTRIES = ['cl', 'ec', 'ma'];

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
      const dedupedByDate = deduplicateByCluster(articlesByDate);
      const dedupedByScore = deduplicateByCluster(articlesByScore);
      newsCache[cc] = {
        articlesByDate: dedupedByDate,
        articlesByScore: dedupedByScore,
        tags,
        count: dedupedByDate.length,
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
app.get('/api/geo', apiLimiter, async (req, res) => {
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
app.get('/api/news', apiLimiter, async (req, res) => {
  let cc, sort, lim, off, tag, source;
  try {
    ({ cc, sort, lim, off, tag, source } = parseNewsParams(req.query, VALID_COUNTRIES));
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  try {
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
      const articles = await getNews({ country: cc, ids, limit: lim, offset: off, sort });
      return res.json({
        articles, tags: cached?.tags || [], count: ids.length,
        country: cc, last_updated: lastFetchAt,
      });
    }

    // Serve from cache — instant response
    if (cached && !source) {
      const articles = sort === 'score' ? cached.articlesByScore : cached.articlesByDate;
      return res.json({
        articles: articles.slice(off, off + lim),
        tags: cached.tags, count: cached.count,
        country: cc, last_updated: lastFetchAt,
      });
    }

    // Cache miss or source filter — query DB directly
    const [articles, tags, count] = await Promise.all([
      getNews({ source: source || undefined, country: cc, limit: lim, offset: off, sort }),
      extractTags(72, 15, cc),
      getCount({ source: source || undefined, country: cc }),
    ]);

    res.json({ articles, tags, count, country: cc, last_updated: lastFetchAt });
  } catch (err) {
    console.error('[API] /api/news error:', err.message);
    res.status(500).json({ articles: [], tags: [], count: 0 });
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

// Export app for testing — only start the server when run directly
module.exports = { app, rebuildCache };

if (require.main === module) {
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
}
