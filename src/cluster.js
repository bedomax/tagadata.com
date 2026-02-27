const fuzz = require('fuzzball');
const { getAllRecent, updateClusters } = require('./db');

// Both scores must pass to avoid false positives
const SORT_THRESHOLD = 60;  // token_sort_ratio minimum
const SET_THRESHOLD = 65;   // token_set_ratio minimum
const HOURS_BACK = 72;

// Points per unique source covering the same story
const POINTS_PER_SOURCE = 30;

/**
 * Normalize a title for better fuzzy matching.
 * Strips common prefixes, lowercases, removes extra whitespace.
 */
function normalizeTitle(title) {
  return title
    .replace(/^(BREAKING|WATCH|LIVE|UPDATE|EXCLUSIVE|OPINION|ANALYSIS):\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Cluster recent articles by title similarity and score them.
 *
 * Score formula:
 *   base = uniqueSources * POINTS_PER_SOURCE  (30 per source)
 *   recencyMultiplier = e^(-ageHours / 24)
 *   score = base * recencyMultiplier
 *
 * Articles in a single-source cluster get score 0 (no cross-coverage signal).
 */
async function clusterAndScore() {
  const articles = await getAllRecent(HOURS_BACK);
  if (!articles.length) return { clusters: 0, scored: 0 };

  // Step 1: deduplicate within the same source by title similarity
  // Keeps only the most recent article when two from the same source are near-identical
  const dedupedWithinSource = [];
  const skipIds = new Set();

  for (let i = 0; i < articles.length; i++) {
    if (skipIds.has(articles[i].id)) continue;
    dedupedWithinSource.push(articles[i]);
    const normI = normalizeTitle(articles[i].title);
    for (let j = i + 1; j < articles.length; j++) {
      if (skipIds.has(articles[j].id)) continue;
      if (articles[j].source !== articles[i].source) continue;
      const normJ = normalizeTitle(articles[j].title);
      const sort = fuzz.token_sort_ratio(normI, normJ);
      const set = fuzz.token_set_ratio(normI, normJ);
      if (sort >= SORT_THRESHOLD && set >= SET_THRESHOLD) {
        // Keep the more recent one (articles are already sorted by published_at DESC)
        skipIds.add(articles[j].id);
      }
    }
  }

  const normalized = dedupedWithinSource.map((a) => ({
    ...a,
    _norm: normalizeTitle(a.title),
  }));

  const assigned = new Set();
  const clusters = [];

  for (let i = 0; i < normalized.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = [normalized[i]];
    assigned.add(i);

    for (let j = i + 1; j < normalized.length; j++) {
      if (assigned.has(j)) continue;

      // Compare against all current cluster members, not just the pivot
      const matchesCluster = cluster.some((member) => {
        if (member.source === normalized[j].source) return false;
        const sort = fuzz.token_sort_ratio(member._norm, normalized[j]._norm);
        const set = fuzz.token_set_ratio(member._norm, normalized[j]._norm);
        return sort >= SORT_THRESHOLD && set >= SET_THRESHOLD;
      });

      if (matchesCluster) {
        cluster.push(normalized[j]);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  // Assign cluster IDs and compute scores
  const updates = [];
  let clusterId = Date.now(); // Simple unique cluster ID base

  for (const cluster of clusters) {
    const uniqueSources = new Set(cluster.map((a) => a.source)).size;
    const base = uniqueSources * POINTS_PER_SOURCE;

    // Oldest article in cluster determines age
    const now = Date.now();
    const oldestMs = cluster.reduce((min, a) => {
      const t = a.published_at ? new Date(a.published_at).getTime() : now;
      return Math.min(min, t);
    }, now);
    const ageHours = (now - oldestMs) / (1000 * 60 * 60);
    const recencyMultiplier = Math.exp(-ageHours / 24);

    // Single-source clusters get score 0
    const score = uniqueSources > 1
      ? Math.round(base * recencyMultiplier * 100) / 100
      : 0;

    for (const article of cluster) {
      updates.push({
        id: article.id,
        cluster_id: clusterId,
        score,
      });
    }

    clusterId++;
  }

  await updateClusters(updates);

  const multiSource = clusters.filter(
    (c) => new Set(c.map((a) => a.source)).size > 1
  ).length;

  console.log(
    `[Cluster] ${clusters.length} clusters found, ${multiSource} cross-source — ${updates.length} articles scored`
  );

  return { clusters: clusters.length, multiSource, scored: updates.length };
}

module.exports = { clusterAndScore };
