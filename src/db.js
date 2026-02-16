const { Pool } = require('pg');
const path = require('path');

// Load .env file in development
if (process.env.NODE_ENV !== 'production') {
  try {
    const fs = require('fs');
    const envPath = path.join(__dirname, '..', '.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {}
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('  Dev: create a .env file with DATABASE_URL=postgresql://user@localhost:5432/tagadata_dev');
  console.error('  Prod: set DATABASE_URL in Cloud Run env vars');
  process.exit(1);
}

// Enable SSL only for remote databases (Neon, Cloud SQL, etc.)
const isRemote = process.env.DATABASE_URL.includes('neon.tech')
  || process.env.DATABASE_URL.includes('sslmode=require');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemote ? { rejectUnauthorized: false } : false,
  max: 10,
});

/**
 * Initialize database schema (tables + indexes).
 * Call once on server startup.
 */
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'cl',
      published_at TIMESTAMPTZ,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cluster_id BIGINT,
      score REAL DEFAULT 0
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_news_source ON news(source)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_news_cluster_id ON news(cluster_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_news_score ON news(score DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_news_country ON news(country)`);

  console.log('[DB] PostgreSQL initialized');
}

/**
 * Batch insert articles. Skips duplicates (by URL).
 * Returns the number of newly inserted rows.
 */
async function insertMany(articles) {
  if (!articles.length) return 0;

  const values = [];
  const params = [];
  let idx = 1;

  for (const a of articles) {
    values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
    params.push(a.title, a.url, a.source, a.country, a.published_at);
    idx += 5;
  }

  const result = await pool.query(`
    INSERT INTO news (title, url, source, country, published_at)
    VALUES ${values.join(', ')}
    ON CONFLICT (url) DO NOTHING
  `, params);

  return result.rowCount;
}

/**
 * Query news articles with optional filters and sorting.
 */
async function getNews({ source, country, ids, limit = 200, offset = 0, sort = 'date' } = {}) {
  let query = 'SELECT * FROM news';
  const conditions = [];
  const params = [];
  let idx = 1;

  if (country) {
    conditions.push(`country = $${idx++}`);
    params.push(country);
  }
  if (source) {
    conditions.push(`source = $${idx++}`);
    params.push(source);
  }
  if (ids && ids.length > 0) {
    conditions.push(`id = ANY($${idx++})`);
    params.push(ids);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  if (sort === 'score') {
    query += ' ORDER BY score DESC, published_at DESC NULLS LAST';
  } else {
    query += ' ORDER BY published_at DESC NULLS LAST, fetched_at DESC';
  }

  query += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

async function getSources() {
  const result = await pool.query('SELECT DISTINCT source FROM news ORDER BY source');
  return result.rows.map(r => r.source);
}

async function getCount({ source, country } = {}) {
  let query = 'SELECT COUNT(*) as count FROM news';
  const conditions = [];
  const params = [];
  let idx = 1;

  if (country) {
    conditions.push(`country = $${idx++}`);
    params.push(country);
  }
  if (source) {
    conditions.push(`source = $${idx++}`);
    params.push(source);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const result = await pool.query(query, params);
  return parseInt(result.rows[0].count, 10);
}

async function getAllRecent(hoursBack = 72, country = null) {
  let query = `
    SELECT id, title, source, country, published_at
    FROM news
    WHERE (published_at > NOW() - $1 * INTERVAL '1 hour'
       OR published_at IS NULL)`;
  const params = [hoursBack];
  let idx = 2;

  if (country) {
    query += ` AND country = $${idx++}`;
    params.push(country);
  }

  query += ' ORDER BY published_at DESC NULLS LAST';
  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Batch update cluster_id and score for articles using unnest.
 */
async function updateClusters(updates) {
  if (!updates.length) return;

  const ids = updates.map(u => u.id);
  const clusterIds = updates.map(u => u.cluster_id);
  const scores = updates.map(u => u.score);

  await pool.query(`
    UPDATE news AS n SET
      cluster_id = d.cluster_id,
      score = d.score
    FROM (
      SELECT unnest($1::int[]) AS id,
             unnest($2::bigint[]) AS cluster_id,
             unnest($3::real[]) AS score
    ) AS d
    WHERE n.id = d.id
  `, [ids, clusterIds, scores]);
}

async function getClusterSources(clusterId) {
  const result = await pool.query(
    'SELECT DISTINCT source FROM news WHERE cluster_id = $1',
    [clusterId]
  );
  return result.rows.map(r => r.source);
}

async function cleanupOld(hoursKeep = 48) {
  const result = await pool.query(
    `DELETE FROM news WHERE published_at < NOW() - $1 * INTERVAL '1 hour'`,
    [hoursKeep]
  );
  if (result.rowCount > 0) {
    console.log(`[DB] Cleaned up ${result.rowCount} articles older than ${hoursKeep}h`);
  }
  return result.rowCount;
}

async function getLastFetchAt() {
  const result = await pool.query('SELECT MAX(fetched_at) as last_fetch FROM news');
  return result.rows[0]?.last_fetch || null;
}

async function close() {
  await pool.end();
}

module.exports = {
  init, insertMany, getNews, getSources, getCount,
  getAllRecent, updateClusters, getClusterSources, cleanupOld,
  getLastFetchAt, close,
};
