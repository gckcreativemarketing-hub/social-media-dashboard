const fetch = require('node-fetch');

const WINDSOR = 'https://connectors.windsor.ai/instagram';
const FIELDS  = 'date,account_name,reach,likes,comments,shares,saves,media_type';
// Per-media fields (media_info + media_insights tables) — used for Top Performing Content
const MEDIA_FIELDS = 'timestamp,media_type,media_permalink,media_caption,media_url,media_thumbnail_url,media_reach,media_engagement,media_like_count,media_comments_count,media_saved,media_shares';

async function windsor(params) {
  const url = `${WINDSOR}?api_key=${process.env.WINDSOR_API_KEY}&${params}&_renderer=json`;
  const res = await fetch(url);
  return res.json();
}

// Build top-N posts ranked by engagement within the date range (filter by post timestamp)
function buildTopContent(rows, date_from, date_to, limit) {
  const from = date_from ? new Date(date_from + 'T00:00:00Z') : null;
  const to   = date_to   ? new Date(date_to   + 'T23:59:59Z') : null;

  return (rows || [])
    .filter(r => r.media_permalink)
    .map(r => {
      const reach    = Number(r.media_reach)          || 0;
      const likes    = Number(r.media_like_count)     || 0;
      const comments = Number(r.media_comments_count) || 0;
      const saves    = Number(r.media_saved)          || 0;
      const shares   = Number(r.media_shares)         || 0;
      const eng      = Number(r.media_engagement)     || (likes + comments + saves + shares);
      // Cover: video/reels expose a thumbnail; image/carousel expose media_url directly
      const cover = r.media_thumbnail_url || r.media_url || '';
      return {
        date:       (r.timestamp || '').slice(0, 10),
        ts:         r.timestamp || '',
        media_type: r.media_type || '',
        permalink:  r.media_permalink,
        caption:    (r.media_caption || '').trim(),
        cover,
        reach, likes, comments, saves, shares,
        engagement: eng,
        engRate:    reach ? (eng / reach) * 100 : 0,
      };
    })
    .filter(p => {
      if (!p.ts) return false;
      const d = new Date(p.ts);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    })
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, limit);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { date_from, date_to } = req.query;
  if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to required' });
  const topLimit = Math.min(Number(req.query.top) || 3, 10);

  try {
    const [insights, media] = await Promise.all([
      windsor(`date_from=${date_from}&date_to=${date_to}&fields=${FIELDS}`),
      // Media fetch is non-fatal — if it fails, topContent is just empty, core data still loads
      windsor(`date_from=${date_from}&date_to=${date_to}&fields=${MEDIA_FIELDS}`).catch(() => ({})),
    ]);
    if (insights.error) return res.status(400).json(insights);

    const daily = [], posts = [];
    for (const row of insights.data || []) {
      if (row.media_type && row.reach == null) posts.push({ date: row.date, media_type: row.media_type });
      else if (row.reach != null) daily.push(row);
    }

    const topContent = buildTopContent(media.data, date_from, date_to, topLimit);

    res.json({ daily, posts, topContent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from Windsor AI' });
  }
};
