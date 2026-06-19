// Thin Upstash Redis wrapper for the curated Twitter feed.
// Works with either the Vercel Upstash integration vars (KV_REST_API_URL/KV_REST_API_TOKEN)
// or the native Upstash vars (UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN).
const { Redis } = require('@upstash/redis');

const URL_   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

let redis = null;
function client() {
  if (!URL_ || !TOKEN_) throw new Error('Upstash Redis env not set (KV_REST_API_URL / KV_REST_API_TOKEN)');
  if (!redis) redis = new Redis({ url: URL_, token: TOKEN_ });
  return redis;
}

const DAY_KEY   = (date) => `twfeed:day:${date}`;
const DATES_KEY = 'twfeed:dates';
const KEEP_DAYS = 30;

// Save a day's curated feed. `payload` = { generatedAt, items: [...] }
async function saveFeed(date, payload) {
  const r = client();
  await r.set(DAY_KEY(date), JSON.stringify(payload));
  // Maintain a sorted set of available dates (score = numeric YYYYMMDD), trimmed to KEEP_DAYS.
  await r.zadd(DATES_KEY, { score: Number(date.replace(/-/g, '')), member: date });
  const all = await r.zrange(DATES_KEY, 0, -1); // ascending
  if (all.length > KEEP_DAYS) {
    const drop = all.slice(0, all.length - KEEP_DAYS);
    for (const d of drop) {
      await r.del(DAY_KEY(d));
      await r.zrem(DATES_KEY, d);
    }
  }
}

async function getFeed(date) {
  const raw = await client().get(DAY_KEY(date));
  if (!raw) return null;
  // Upstash may return an already-parsed object or a JSON string depending on how it was stored.
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function listDates() {
  const all = await client().zrange(DATES_KEY, 0, -1);
  return all.slice().reverse(); // newest first
}

async function getLatestDate() {
  const dates = await listDates();
  return dates[0] || null;
}

module.exports = { saveFeed, getFeed, listDates, getLatestDate };
