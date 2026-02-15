const { normalizeUrl, fetchRSS } = require('../../utils');
const FEED_URL = 'https://labarraespaciadora.com/feed/';
const SOURCE_NAME = 'La Barra Espaciadora';
const COUNTRY = 'ec';

async function fetch() {
  console.log(`[${SOURCE_NAME}] Fetching RSS feed...`);
  const feed = await fetchRSS(FEED_URL);

  const articles = feed.items.map((item) => ({
    title: item.title?.trim(),
    url: normalizeUrl(item.link),
    source: SOURCE_NAME,
    published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
  }));

  console.log(`[${SOURCE_NAME}] Parsed ${articles.length} articles`);
  return articles;
}

module.exports = { fetch, SOURCE_NAME, FEED_URL, COUNTRY };
