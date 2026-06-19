// Reads the curated Twitter feed from Redis for the dashboard Content tab.
//   GET /api/twitter-feed              -> latest day's feed
//   GET /api/twitter-feed?date=YYYY-MM-DD
//   GET /api/twitter-feed?refresh=1    -> run curation now, then return the fresh feed
// The ?refresh path is gated by the dashboard's existing Vercel SSO (owner-only).
const { getFeed, getLatestDate, listDates } = require('../lib/kv');
const { runCuration } = require('../lib/curateTwitter');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    if (req.query.refresh) {
      await runCuration();
    }

    let date = req.query.date || (await getLatestDate());
    if (!date) {
      return res.json({ date: null, items: [], dates: [], generatedAt: null });
    }

    const feed = await getFeed(date);
    const dates = await listDates();
    if (!feed) {
      return res.json({ date, items: [], dates, generatedAt: null });
    }
    res.json({ date: feed.date || date, generatedAt: feed.generatedAt, items: feed.items || [], dates });
  } catch (err) {
    console.error('twitter-feed error:', err);
    res.status(500).json({ error: err.message });
  }
};
