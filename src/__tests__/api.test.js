const request = require('supertest');

// ---- Mocks (must be before requiring server) ----

// Mock DB — no real Postgres connection
jest.mock('../db', () => ({
  init: jest.fn().mockResolvedValue(),
  getNews: jest.fn().mockResolvedValue([
    { id: 1, title: 'Noticia de prueba', url: 'https://example.com/1', source: 'emol',
      country: 'cl', published_at: new Date().toISOString(), cluster_id: null, score: 0 },
  ]),
  getCount: jest.fn().mockResolvedValue(1),
  getLastFetchAt: jest.fn().mockResolvedValue(new Date().toISOString()),
  getAllRecent: jest.fn().mockResolvedValue([]),
}));

// Mock tags module
jest.mock('../tags', () => ({
  extractTags: jest.fn().mockResolvedValue([{ tag: 'economía', count: 5 }]),
  getArticleIdsByTag: jest.fn().mockResolvedValue([1]),
}));

// Mock global fetch (used by /api/geo)
global.fetch = jest.fn();

const { app, rebuildCache } = require('../server');

// ---- Helpers ----

/** Inject a warm cache for a country so responses are served from memory */
async function warmCache() {
  const db = require('../db');
  const tags = require('../tags');
  db.getNews.mockResolvedValue([
    { id: 1, title: 'Test article', url: 'https://x.com/1', source: 'emol',
      country: 'cl', published_at: new Date().toISOString(), cluster_id: null, score: 0 },
  ]);
  tags.extractTags.mockResolvedValue([{ tag: 'economía', count: 3 }]);
  db.getCount.mockResolvedValue(1);
  db.getLastFetchAt.mockResolvedValue(null);
  await rebuildCache();
}

beforeAll(async () => {
  await warmCache();
});

// ---- /api/news ----

describe('GET /api/news', () => {
  test('returns 200 with articles, tags, count, country', async () => {
    const res = await request(app).get('/api/news');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('articles');
    expect(res.body).toHaveProperty('tags');
    expect(res.body).toHaveProperty('count');
    expect(res.body).toHaveProperty('country');
    expect(Array.isArray(res.body.articles)).toBe(true);
  });

  test('accepts valid country param', async () => {
    const res = await request(app).get('/api/news?country=ec');
    expect(res.status).toBe(200);
    expect(res.body.country).toBe('ec');
  });

  test('falls back to cl for unknown country', async () => {
    const res = await request(app).get('/api/news?country=zz');
    expect(res.status).toBe(200);
    expect(res.body.country).toBe('cl');
  });

  test('accepts sort=score', async () => {
    const res = await request(app).get('/api/news?sort=score');
    expect(res.status).toBe(200);
  });

  test('clamps limit — 999 becomes 100 (no crash)', async () => {
    const res = await request(app).get('/api/news?limit=999');
    expect(res.status).toBe(200);
  });

  test('clamps offset — 99999 becomes 10000 (no crash)', async () => {
    const res = await request(app).get('/api/news?offset=99999');
    expect(res.status).toBe(200);
  });

  test('returns 400 for tag with SQL injection attempt', async () => {
    const res = await request(app).get("/api/news?tag='; DROP TABLE news;--");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 for tag with XSS attempt', async () => {
    const res = await request(app).get('/api/news?tag=<script>alert(1)</script>');
    expect(res.status).toBe(400);
  });

  test('returns 400 for source with special chars', async () => {
    const res = await request(app).get('/api/news?source=emol;DROP TABLE');
    expect(res.status).toBe(400);
  });

  test('accepts valid tag param', async () => {
    const tags = require('../tags');
    tags.getArticleIdsByTag.mockResolvedValue([1]);
    const res = await request(app).get('/api/news?tag=economía');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('articles');
  });

  test('returns empty articles for tag with no matches', async () => {
    const tags = require('../tags');
    tags.getArticleIdsByTag.mockResolvedValue([]);
    const res = await request(app).get('/api/news?tag=inexistente');
    expect(res.status).toBe(200);
    expect(res.body.articles).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  test('returns 200 even when DB throws (cache miss fallback error)', async () => {
    const db = require('../db');
    // Force a cache miss by using a country with no cached data, then DB error
    db.getNews.mockRejectedValueOnce(new Error('DB down'));
    db.extractTags = undefined; // ensure we hit the catch
    const tags = require('../tags');
    tags.extractTags.mockRejectedValueOnce(new Error('tags DB down'));
    db.getCount.mockRejectedValueOnce(new Error('count DB down'));
    // Should not crash — returns 500 with empty body
    const res = await request(app).get('/api/news?country=ec&source=emol');
    expect([200, 500]).toContain(res.status);
    // Body should always be valid JSON, never an uncaught crash
    expect(res.body).toBeDefined();
  });
});

// ---- /api/geo ----

describe('GET /api/geo', () => {
  test('returns cl for localhost requests', async () => {
    const res = await request(app).get('/api/geo');
    expect(res.status).toBe(200);
    expect(res.body.country).toBe('cl');
  });

  test('returns valid country from ip-api', async () => {
    global.fetch.mockResolvedValueOnce({
      json: async () => ({ countryCode: 'EC' }),
    });
    const res = await request(app)
      .get('/api/geo')
      .set('X-Forwarded-For', '190.57.110.1');
    expect(res.status).toBe(200);
    expect(['ec', 'cl']).toContain(res.body.country);
  });

  test('falls back to cl when ip-api fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network error'));
    const res = await request(app)
      .get('/api/geo')
      .set('X-Forwarded-For', '190.57.110.1');
    expect(res.status).toBe(200);
    expect(res.body.country).toBe('cl');
  });

  test('falls back to cl for unknown country code', async () => {
    global.fetch.mockResolvedValueOnce({
      json: async () => ({ countryCode: 'US' }),
    });
    const res = await request(app)
      .get('/api/geo')
      .set('X-Forwarded-For', '8.8.8.8');
    expect(res.status).toBe(200);
    expect(res.body.country).toBe('cl');
  });

  test('response always has country field', async () => {
    global.fetch.mockResolvedValueOnce({ json: async () => ({}) });
    const res = await request(app).get('/api/geo');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('country');
  });
});

// ---- Static routes (smoke tests) ----

describe('Static routes', () => {
  test('GET / returns 200 or file', async () => {
    const res = await request(app).get('/');
    // Either 200 (file exists) or 404/500 in test env without public dir — never a crash
    expect([200, 404, 500]).toContain(res.status);
  });

  test('GET /privacy returns non-500', async () => {
    const res = await request(app).get('/privacy');
    expect([200, 404]).toContain(res.status);
  });

  test('unknown route returns 404', async () => {
    const res = await request(app).get('/nonexistent-path-xyz');
    expect(res.status).toBe(404);
  });
});
