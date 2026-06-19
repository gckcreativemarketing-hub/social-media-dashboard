require('dotenv').config();
const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT     || 3000;
const BASE     = process.env.BASE_PATH || '/dashboard-sosmed';
const API_KEY  = process.env.WINDSOR_API_KEY;
const WINDSOR  = 'https://connectors.windsor.ai/instagram';
const FIELDS   = 'date,account_name,reach,likes,comments,shares,saves,media_type';

// Static assets
app.use(BASE, express.static(path.join(__dirname, 'public')));

// Instagram data proxy
app.get(`${BASE}/api/instagram`, async (req, res) => {
  const { date_from, date_to } = req.query;
  if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to required' });

  try {
    const url = `${WINDSOR}?api_key=${API_KEY}&date_from=${date_from}&date_to=${date_to}&fields=${FIELDS}&_renderer=json`;
    const response = await fetch(url);
    const raw = await response.json();
    if (raw.error) return res.status(400).json(raw);

    const daily = [], posts = [];
    for (const row of raw.data || []) {
      if (row.media_type && row.reach == null) posts.push({ date: row.date, media_type: row.media_type, account_name: row.account_name });
      else if (row.reach != null) daily.push(row);
    }
    res.json({ daily, posts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from Windsor AI' });
  }
});

// Redirect root to base path
app.get('/', (req, res) => res.redirect(BASE));

app.listen(PORT, () => console.log(`Dashboard → http://localhost:${PORT}${BASE}`));
