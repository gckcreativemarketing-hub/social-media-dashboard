require('dotenv').config();
const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT     || 3000;
const BASE = process.env.BASE_PATH || '/dashboard-sosmed';

// Static assets
app.use(BASE, express.static(path.join(__dirname, 'public')));

// API routes — reuse the same handlers Vercel serves as serverless functions
app.get(`${BASE}/api/instagram`,    require('./api/instagram'));
app.get(`${BASE}/api/sheets`,       require('./api/sheets'));
app.get(`${BASE}/api/twitter-feed`, require('./api/twitter-feed'));
app.get(`${BASE}/api/cron/curate-twitter`, require('./api/cron/curate-twitter'));

// Redirect root to base path
app.get('/', (req, res) => res.redirect(BASE));

app.listen(PORT, () => console.log(`Dashboard → http://localhost:${PORT}${BASE}`));
