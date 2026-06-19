const fetch   = require('node-fetch');
const { JWT } = require('google-auth-library');

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1fOgS0U0xl3TwOymgvevGMRBjFlSex-0usSxElMWecu4';

async function getToken() {
  const creds  = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const client = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const token  = await client.getAccessToken();
  return token.token;
}

async function readRange(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.values || [];
}

function parseRp(str) {
  if (!str) return 0;
  const n = parseInt(str.toString().replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str.trim());
  return isNaN(d.getTime()) ? null : d;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { date_from, date_to } = req.query;
    const from = date_from ? new Date(date_from) : null;
    const to   = date_to   ? new Date(date_to + 'T23:59:59') : null;

    const inRange = (d) => {
      if (!d) return false;
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    };

    const token = await getToken();

    // ── Read raw data ──────────────────────────────────────────────
    const [leadRows, salesRows] = await Promise.all([
      readRange(token, 'Lead!A7:Z3000'),
      readRange(token, 'Sales!A7:Z2000'),
    ]);

    // ── LEADS processing ──────────────────────────────────────────
    const leads = leadRows
      .filter(r => r[0] && r[0].toString().startsWith('L'))
      .map(r => ({
        id:       r[0]  || '',
        date:     parseDate(r[1]),
        client:   (r[4] || r[3] || '').trim(),
        services: (r[6] || '').trim(),
        channel:  (r[7] || '').trim(),
        deal:     (r[21] || '').toString().trim().toUpperCase() === 'TRUE',
        dealDate: parseDate(r[22]),
        type:     (r[25] || '').trim(),
      }));

    // Filter by date range using lead date or deal date
    const filteredLeads = (from || to)
      ? leads.filter(l => inRange(l.date) || inRange(l.dealDate))
      : leads;

    const leadsTotal   = filteredLeads.length;
    const leadsWon     = filteredLeads.filter(l => l.deal).length;
    const leadsLost    = leadsTotal - leadsWon;
    const convRate     = leadsTotal ? (leadsWon / leadsTotal * 100) : 0;

    const byChannel = {};
    filteredLeads.forEach(l => {
      if (l.channel) byChannel[l.channel] = (byChannel[l.channel] || 0) + 1;
    });

    const leadsByMonth = {};
    filteredLeads.forEach(l => {
      const d = l.date || l.dealDate;
      if (d) {
        const k = monthKey(d);
        if (!leadsByMonth[k]) leadsByMonth[k] = { total: 0, won: 0 };
        leadsByMonth[k].total++;
        if (l.deal) leadsByMonth[k].won++;
      }
    });

    const recentLeads = filteredLeads
      .filter(l => l.date || l.dealDate)
      .sort((a, b) => (b.date || b.dealDate) - (a.date || a.dealDate))
      .slice(0, 15)
      .map(l => ({ id: l.id, date: (l.date || l.dealDate)?.toISOString().slice(0,10), client: l.client, channel: l.channel, deal: l.deal, type: l.type }));

    // ── SALES processing ───────────────────────────────────────────
    const salesRaw = salesRows
      .filter(r => r[0] && r[0].toString().startsWith('L'))
      .map(r => {
        const rates = [parseRp(r[8]), parseRp(r[10]), parseRp(r[12]), parseRp(r[14]), parseRp(r[16])];
        const types = [(r[7]||'').trim(), (r[9]||'').trim(), (r[11]||'').trim(), (r[13]||'').trim(), (r[15]||'').trim()];
        const revenue = rates.reduce((s, v) => s + v, 0);
        return {
          id:       r[0] || '',
          client:   (r[3] || r[2] || '').trim(),  // Billing Name (r[3]) preferred over Work Order (r[2])
          date:     parseDate(r[6]),
          year:     r[25] ? parseInt(r[25]) : (parseDate(r[6])?.getFullYear()),
          type:     (r[19] || '').trim(),
          proposal: (r[5] || '').trim(),
          revenue,
          services: types.filter(t => t && t !== 'N/A').map((t, i) => ({ name: t, rate: rates[i] })),
        };
      })
      .filter(s => s.revenue > 0 || s.date);

    // Deduplicate by normalized proposal number (strip trailing periods — same proposal = duplicate row)
    const seenProposals = new Set();
    const sales = salesRaw.filter(s => {
      if (!s.proposal) return true;
      const key = s.proposal.replace(/\.+\s*$/, '').trim().toUpperCase();
      if (seenProposals.has(key)) return false;
      seenProposals.add(key);
      return true;
    });

    const filteredSales = (from || to) ? sales.filter(s => inRange(s.date)) : sales;

    const totalRevenue  = filteredSales.reduce((s, d) => s + d.revenue, 0);
    const retainerCount = filteredSales.filter(s => s.type === 'Retainer').length;
    const projectCount  = filteredSales.filter(s => s.type === 'Project').length;
    const avgDeal       = filteredSales.length ? totalRevenue / filteredSales.length : 0;

    const revenueByMonth = {};
    filteredSales.forEach(s => {
      if (s.date) {
        const k = monthKey(s.date);
        if (!revenueByMonth[k]) revenueByMonth[k] = { revenue: 0, deals: 0 };
        revenueByMonth[k].revenue += s.revenue;
        revenueByMonth[k].deals++;
      }
    });

    const revenueByService = {};
    filteredSales.forEach(s => s.services.forEach(sv => {
      const k = sv.name.replace(/\s+/g, '');
      revenueByService[k] = (revenueByService[k] || 0) + sv.rate;
    }));

    // byYear always uses full unfiltered sales for Finance comparison
    const revenueByYear = {};
    sales.forEach(s => {
      if (s.year) {
        revenueByYear[s.year] = (revenueByYear[s.year] || 0) + s.revenue;
      }
    });

    const topClients = Object.values(
      filteredSales.reduce((acc, s) => {
        const k = s.client;
        if (!acc[k]) acc[k] = { client: k, revenue: 0, deals: 0 };
        acc[k].revenue += s.revenue;
        acc[k].deals++;
        return acc;
      }, {})
    ).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    res.json({
      leads: { total: leadsTotal, won: leadsWon, lost: leadsLost, convRate, byChannel, byMonth: leadsByMonth, recent: recentLeads },
      sales: { total: filteredSales.length, totalRevenue, retainerCount, projectCount, avgDeal, byMonth: revenueByMonth, byService: revenueByService, byYear: revenueByYear, topClients },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
