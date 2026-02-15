/**
 * Remove UTM and common tracking parameters from a URL.
 */
function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'utm_id', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid',
    ];
    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }
    // Remove trailing slash for consistency
    let normalized = url.toString();
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return rawUrl;
  }
}

const https = require('https');
const http = require('http');
const zlib = require('zlib');
const Parser = require('rss-parser');

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  Connection: 'keep-alive',
};

function httpGet(url, timeoutMs = 20000) {
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    let req;
    const timer = setTimeout(() => {
      if (req) req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      req = mod.get(url, { headers: BROWSER_HEADERS }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          clearTimeout(timer);
          // Handle relative redirects by resolving against the original URL
          let redirectUrl = res.headers.location;
          try {
            redirectUrl = new URL(res.headers.location, url).href;
          } catch {}
          return httpGet(redirectUrl, timeoutMs).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          clearTimeout(timer);
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let stream = res;
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') {
          stream = res.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          stream = res.pipe(zlib.createInflate());
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
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

async function fetchRSS(url) {
  const xml = await httpGet(url);
  const parser = new Parser();
  return parser.parseString(xml);
}

module.exports = { normalizeUrl, fetchRSS, httpGet };
