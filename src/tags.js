const db = require('./db');

// Spanish stopwords + common filler words in news titles
const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'en', 'los', 'las', 'un', 'una', 'que', 'por',
  'con', 'para', 'se', 'su', 'al', 'es', 'lo', 'como', 'más', 'mas', 'ya',
  'pero', 'sus', 'le', 'ha', 'ser', 'son', 'fue', 'han', 'sin', 'sobre',
  'entre', 'este', 'esta', 'esto', 'ese', 'esa', 'esos', 'esas', 'estos',
  'estas', 'otro', 'otra', 'otros', 'otras', 'hay', 'ante', 'tras', 'bajo',
  'desde', 'hasta', 'donde', 'cuando', 'porque', 'quien', 'cual', 'todo',
  'toda', 'todos', 'todas', 'muy', 'tan', 'también', 'tambien', 'no', 'ni',
  'sí', 'si', 'y', 'o', 'e', 'a', 'que', 'qué', 'cómo', 'cuándo', 'dónde',
  'quién', 'cuál', 'dos', 'tres', 'año', 'años', 'día', 'días', 'vez',
  'veces', 'puede', 'pueden', 'hace', 'hoy', 'nueva', 'nuevo', 'nuevos',
  'nuevas', 'gran', 'ser', 'sido', 'era', 'así', 'asi', 'cada', 'uno', 'unos',
  'unas', 'según', 'segun', 'parte', 'solo', 'sólo', 'mientras', 'durante',
  'luego', 'después', 'despues', 'aquí', 'ahí', 'allí', 'aún', 'aun',
  'además', 'ademas', 'dice', 'dijo', 'señaló', 'explicó', 'aseguró',
  'afirmó', 'indicó', 'van', 'chile', 'país', 'pais',
]);

const MIN_WORD_LENGTH = 3;
const MIN_OCCURRENCES = 2;

/**
 * Extract top tags from recent article titles.
 * Returns array of { tag, count } sorted by count desc.
 */
async function extractTags(hoursBack = 72, maxTags = 15, country = null) {
  const articles = await db.getAllRecent(hoursBack, country);
  const freq = new Map();

  for (const a of articles) {
    const words = a.title
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents for matching
      .replace(/[^a-záéíóúüñ\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= MIN_WORD_LENGTH && !STOPWORDS.has(w));

    // Count unique words per article (avoid inflating from one long title)
    const seen = new Set();
    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w);
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
  }

  return Array.from(freq.entries())
    .filter(([, count]) => count >= MIN_OCCURRENCES)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([tag, count]) => ({ tag, count }));
}

/**
 * Get article IDs whose titles contain the given tag.
 */
async function getArticleIdsByTag(tag, country = null) {
  const normalized = tag.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const all = await db.getAllRecent(72, country);
  return all
    .filter(a => {
      const title = a.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return title.includes(normalized);
    })
    .map(a => a.id);
}

module.exports = { extractTags, getArticleIdsByTag };
