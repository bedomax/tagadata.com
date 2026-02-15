const Parser = require('rss-parser');

const parser = new Parser();
const MAX_AGE_HOURS = 24;

function createYouTubeSource(channelId, sourceName, country) {
  const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  async function fetch() {
    console.log(`[${sourceName}] Fetching YouTube feed...`);
    const feed = await parser.parseURL(FEED_URL);

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
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      }));

    console.log(`[${sourceName}] Parsed ${articles.length} videos (last 24h)`);
    return articles;
  }

  return { fetch, SOURCE_NAME: sourceName, FEED_URL, COUNTRY: country };
}

module.exports = { createYouTubeSource };
