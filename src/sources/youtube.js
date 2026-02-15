const Parser = require('rss-parser');

const MAX_AGE_HOURS = 24;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

function createYouTubeSource(channelId, sourceName, country) {
  const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  async function fetchFeed() {
    console.log(`[${sourceName}] Fetching YouTube feed...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(FEED_URL, {
        headers: BROWSER_HEADERS,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const xml = await res.text();
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

      console.log(
        `[${sourceName}] Parsed ${articles.length} videos (last 24h)`
      );
      return articles;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  return { fetch: fetchFeed, SOURCE_NAME: sourceName, FEED_URL, COUNTRY: country };
}

module.exports = { createYouTubeSource };
