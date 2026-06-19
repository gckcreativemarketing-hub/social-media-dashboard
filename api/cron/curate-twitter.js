// Scheduled curation job (Vercel Cron). Also runnable manually with the CRON_SECRET bearer token.
const { runCuration } = require('../../lib/curateTwitter');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'] || '';
  // Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron invocations.
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const result = await runCuration();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('curate-twitter cron error:', err);
    res.status(500).json({ error: err.message });
  }
};
