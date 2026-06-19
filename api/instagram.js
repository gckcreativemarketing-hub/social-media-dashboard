const fetch = require('node-fetch');

const WINDSOR = 'https://connectors.windsor.ai/instagram';
const FIELDS  = 'date,account_name,reach,likes,comments,shares,saves,media_type';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { date_from, date_to } = req.query;
  if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to required' });

  try {
    const url = `${WINDSOR}?api_key=${process.env.WINDSOR_API_KEY}&date_from=${date_from}&date_to=${date_to}&fields=${FIELDS}&_renderer=json`;
    const response = await fetch(url);
    const raw = await response.json();
    if (raw.error) return res.status(400).json(raw);

    const daily = [], posts = [];
    for (const row of raw.data || []) {
      if (row.media_type && row.reach == null) posts.push({ date: row.date, media_type: row.media_type });
      else if (row.reach != null) daily.push(row);
    }
    res.json({ daily, posts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from Windsor AI' });
  }
};
