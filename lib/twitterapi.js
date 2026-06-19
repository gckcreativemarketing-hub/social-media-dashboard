// twitterapi.io advanced-search client + topic/language query set + candidate normalization.
// Docs: GET https://api.twitterapi.io/twitter/tweet/advanced_search
//   headers: { "X-API-Key": <key> }
//   params:  query, queryType ("Top"|"Latest"), cursor
const fetch = require('node-fetch');

const BASE = 'https://api.twitterapi.io/twitter/tweet/advanced_search';

// Topic × language query set — high-signal, engagement-gated, mixes ID + international.
// NOTE on twitterapi.io quirks (verified empirically):
//   - `lang:id` returns STALE (2013-era) data → omitted for ID; Indonesian keywords are language-specific enough.
//   - `-filter:replies` makes the endpoint return 0 results → never use it.
//   - `since_time/until_time` are flaky → recency is enforced in JS (see fetchCandidates).
//   - queryType "Latest" (chronological) + min_faves floor reliably returns fresh, high-engagement tweets.
// 5 ID queries vs 4 Global — deliberately weighted toward Indonesia so the curated
// mix can hit ~55% ID. Lower min_faves on ID (Indonesian volume per term is smaller).
const QUERIES = [
  { key: 'id_tax',     region: 'ID',     q: '(pajak OR DJP OR PPN OR PPh OR coretax OR "bea cukai" OR SPT) min_faves:8' },
  { key: 'id_macro',   region: 'ID',     q: '(ekonomi OR inflasi OR rupiah OR APBN OR resesi OR "Bank Indonesia") min_faves:12' },
  { key: 'id_markets', region: 'ID',     q: '(IHSG OR saham OR emiten OR reksadana OR obligasi OR "bursa efek") min_faves:10' },
  { key: 'id_edu',     region: 'ID',     q: '("keuangan pribadi" OR nabung OR "dana darurat" OR "financial planning" OR "atur keuangan") min_faves:10' },
  { key: 'id_biz',     region: 'ID',     q: '(UMKM OR "dunia usaha" OR "pelaku usaha" OR ekspor OR impor) min_faves:12' },
  { key: 'gl_macro',   region: 'Global', q: '(inflation OR "interest rates" OR "Federal Reserve" OR recession OR economy) lang:en min_faves:120' },
  { key: 'gl_tax',     region: 'Global', q: '("tax policy" OR taxation OR IRS OR tariff) lang:en min_faves:100' },
  { key: 'gl_markets', region: 'Global', q: '("stock market" OR "S&P 500" OR bonds OR "central bank") lang:en min_faves:120' },
  { key: 'gl_edu',     region: 'Global', q: '("personal finance" OR investing OR "financial literacy") lang:en min_faves:120' },
];

const num = (v) => (v == null || isNaN(Number(v)) ? 0 : Number(v));

// Map a raw twitterapi.io tweet to our candidate shape (defensive about field names).
function normalize(t, regionHint) {
  if (!t || typeof t !== 'object') return null;
  const author = t.author || t.user || {};
  const handle = author.userName || author.screen_name || author.username || '';
  const url = t.url || t.twitterUrl || (handle && t.id ? `https://x.com/${handle}/status/${t.id}` : '');
  const text = (t.text || t.full_text || t.content || '').trim();
  if (!t.id || !text) return null;
  return {
    id:        String(t.id),
    url,
    text,
    handle,
    author:    author.name || handle,
    likes:     num(t.likeCount ?? t.favorite_count ?? t.favoriteCount),
    retweets:  num(t.retweetCount ?? t.retweet_count),
    replies:   num(t.replyCount ?? t.reply_count),
    quotes:    num(t.quoteCount ?? t.quote_count),
    views:     num(t.viewCount ?? t.view_count),
    lang:      t.lang || '',
    createdAt: t.createdAt || t.created_at || '',
    region:    regionHint || '',
  };
}

async function advancedSearch(query, { queryType = 'Top', cursor = '' } = {}) {
  const key = process.env.TWITTERAPI_IO_KEY;
  if (!key) throw new Error('TWITTERAPI_IO_KEY not set');
  const params = new URLSearchParams({ query, queryType });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${BASE}?${params.toString()}`, { headers: { 'X-API-Key': key } });
  if (!res.ok) throw new Error(`twitterapi.io ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  // Response shape: { tweets: [...], has_next_page, next_cursor }
  const tweets = data.tweets || data.data || [];
  return {
    tweets,
    hasNext: Boolean(data.has_next_page ?? data.hasNextPage),
    nextCursor: data.next_cursor || data.nextCursor || '',
  };
}

// Fetch candidates across all queries (chronological + min_faves), recency-filtered in JS, deduped.
async function fetchCandidates({ maxAgeHours = 72, maxPagesPerQuery = 2 } = {}) {
  const tooOld = (createdAt) => {
    const t = new Date(createdAt).getTime();
    if (isNaN(t)) return false; // keep if unparseable rather than drop
    return (Date.now() - t) > maxAgeHours * 3600 * 1000;
  };

  const byId = new Map();
  const byText = new Map(); // normalized text -> id (near-dup collapse)
  const norm = (s) => s.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);

  const perQuery = {};
  for (const { key, region, q } of QUERIES) {
    let cursor = '', pages = 0, got = 0;
    try {
      do {
        const { tweets, hasNext, nextCursor } = await advancedSearch(q, { queryType: 'Latest', cursor });
        for (const raw of tweets) {
          const c = normalize(raw, region);
          if (!c) continue;
          if (tooOld(c.createdAt)) continue;
          const eng = c.likes + c.retweets + c.replies + c.quotes;
          // dedupe by id
          if (byId.has(c.id)) continue;
          // near-dup by text: keep the higher-engagement copy
          const tk = norm(c.text);
          if (tk && byText.has(tk)) {
            const prev = byId.get(byText.get(tk));
            if (prev && (prev.likes + prev.retweets + prev.replies + prev.quotes) >= eng) continue;
            if (prev) byId.delete(prev.id);
          }
          byId.set(c.id, c);
          if (tk) byText.set(tk, c.id);
          got++;
        }
        cursor = nextCursor;
        pages++;
        if (!hasNext) break;
      } while (pages < maxPagesPerQuery);
    } catch (e) {
      perQuery[key] = `error: ${e.message}`;
      continue;
    }
    perQuery[key] = got;
  }

  return { candidates: [...byId.values()], perQuery };
}

module.exports = { advancedSearch, fetchCandidates, normalize, QUERIES };
