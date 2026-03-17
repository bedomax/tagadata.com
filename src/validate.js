/**
 * Input validation helpers for API endpoints.
 * All functions return sanitized values or throw/return null for invalid input.
 */

const MAX_TAG_LENGTH    = 50;
const MAX_SOURCE_LENGTH = 100;
const MAX_LIMIT         = 100;
const MAX_OFFSET        = 10000;

/**
 * Parse and clamp an integer query param.
 * Returns `defaultVal` if the value is missing or not a finite number.
 */
function parseIntParam(val, defaultVal, min, max) {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.max(min, Math.min(max, n));
}

/**
 * Sanitize a string query param.
 * Returns null if the value contains characters outside safe alphanumeric/accent set.
 * This prevents tag/source values from being used as injection vectors.
 */
function sanitizeString(val, maxLen) {
  if (typeof val !== 'string' || !val.trim()) return null;
  const trimmed = val.trim().slice(0, maxLen);
  // Allow letters (including accented), digits, spaces, hyphens — nothing else
  return /^[\w\s\-áéíóúüñÁÉÍÓÚÜÑ]+$/u.test(trimmed) ? trimmed : null;
}

/**
 * Parse and validate all query params for GET /api/news.
 * Returns { cc, sort, lim, off, tag, source } or throws with a message.
 */
function parseNewsParams(query, validCountries) {
  const cc   = validCountries.includes(query.country) ? query.country : 'cl';
  const sort = query.sort === 'score' ? 'score' : 'date';
  const lim  = parseIntParam(query.limit,  15, 1, MAX_LIMIT);
  const off  = parseIntParam(query.offset,  0, 0, MAX_OFFSET);

  let tag = null;
  if (query.tag != null) {
    tag = sanitizeString(query.tag, MAX_TAG_LENGTH);
    if (tag === null) throw Object.assign(new Error('Invalid tag'), { statusCode: 400 });
  }

  let source = null;
  if (query.source != null) {
    source = sanitizeString(query.source, MAX_SOURCE_LENGTH);
    if (source === null) throw Object.assign(new Error('Invalid source'), { statusCode: 400 });
  }

  return { cc, sort, lim, off, tag, source };
}

module.exports = { parseNewsParams };
