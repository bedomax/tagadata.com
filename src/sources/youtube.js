const https = require('https');
const zlib = require('zlib');
const Parser = require('rss-parser');

const MAX_AGE_HOURS = 24;
const TIMEOUT_MS = 15000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  Connection: 'keep-alive',
};

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`YouTube timeout after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    const req = https.get(url, { headers: BROWSER_HEADERS }, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      let stream = res;
      if (res.headers['content-encoding'] === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      }

      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString());
      });
      stream.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function createYouTubeSource(channelId, sourceName, country) {
  const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  async function fetchFeed() {
    console.log(`[${sourceName}] Fetching YouTube feed...`);

    let xml;
    try {
      xml = await httpsGet(FEED_URL);
    } catch (err) {
      console.error(`[${sourceName}] Fetch failed: ${err.message}`);
      return [];
    }

    const parser = new Parser();
    const feed = await parser.parseString(xml);
    const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;

    const articles = feed.items
      .filter((item) => {
        const pub = item.pubDate ? new Date(item.pubDate).getTime() : 0;
        return pub >= cutoff;
      })
      .map((item) => ({
        title: item.title?.trim(),
        url: item.link,
        source: sourceName,
        published_at: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : null,
      }));

    console.log(`[${sourceName}] Parsed ${articles.length} videos (last 24h)`);
    return articles;
  }

  return { fetch: fetchFeed, SOURCE_NAME: sourceName, FEED_URL, COUNTRY: country };
}

module.exports = { createYouTubeSource };
