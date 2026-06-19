'use strict';

// ── Chart defaults (Apple-style) ──────────────────────────────────────────
Chart.defaults.font.family = '"Helvetica Neue", Helvetica, Arial, sans-serif';
Chart.defaults.font.size   = 11;
Chart.defaults.color       = '#6e6e73';

const GRID  = 'rgba(0,0,0,0.05)';
const BLUE  = '#0071e3';
const GREEN = '#34c759';
const RED   = '#ff3b30';
const ORG   = '#ff9f0a';
const PRP   = '#af52de';
const CYAN  = '#32ade6';
const PINK  = '#ff375f';

// ── State ─────────────────────────────────────────────────────────────────
let daily = [], posts = [];
let charts = {};
let currentView = 'overview';

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = n => {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
};
const fmtPct = n => (n == null || isNaN(n)) ? '—' : n.toFixed(2) + '%';
const sum    = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);
const avg    = (arr, k) => arr.length ? sum(arr, k) / arr.length : 0;
const engOf  = d => (d.likes || 0) + (d.comments || 0) + (d.shares || 0) + (d.saves || 0);
const rateOf = d => d.reach ? (engOf(d) / d.reach) * 100 : 0;
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function trendBadge(curr, prev) {
  if (!prev || prev === 0) return '';
  const pct = ((curr - prev) / prev) * 100;
  const cls = pct >= 0 ? 'trend-up' : 'trend-down';
  const arrow = pct >= 0 ? '↑' : '↓';
  return `<span class="${cls}">${arrow} ${Math.abs(pct).toFixed(1)}% vs prev</span>`;
}

function rateCls(r) {
  return r >= 5 ? 'rate-high' : r >= 2 ? 'rate-med' : 'rate-low';
}

function dateRange(days) {
  const to = new Date(), from = new Date();
  from.setDate(to.getDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function setDates(from, to) {
  document.getElementById('dateFrom').value = from;
  document.getElementById('dateTo').value   = to;
}

function destroyChart(k) {
  if (charts[k]) { charts[k].destroy(); delete charts[k]; }
}

function movingAvg(arr, window) {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

// ── Fetch ─────────────────────────────────────────────────────────────────
async function fetchData(from, to) {
  sheetsData = null; // invalidate sheets cache on every date change
  showState('loading');
  try {
    const res = await fetch(`/api/instagram?date_from=${from}&date_to=${to}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);

    daily = (json.daily || []).sort((a, b) => a.date.localeCompare(b.date));
    posts = json.posts || [];

    document.getElementById('pageRange').textContent = `${from} → ${to}  ·  ${daily.length} days`;
    renderCurrentView();
    showState('dashboard');
  } catch (err) {
    document.getElementById('errorMsg').textContent = 'Error: ' + err.message;
    showState('error');
  }
}

function showState(s) {
  document.getElementById('loadingState').classList.toggle('hidden', s !== 'loading');
  document.getElementById('errorState').classList.toggle('hidden', s !== 'error');
  ALL_VIEWS.forEach(v =>
    document.getElementById('view' + cap(v)).classList.toggle('hidden', s !== 'dashboard' || currentView !== v)
  );
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function renderCurrentView() {
  if (currentView === 'overview')    renderOverview();
  if (currentView === 'performance') renderPerformance();
  if (currentView === 'audience')    renderAudience();
  if (currentView === 'content')     renderContent();
  if (currentView === 'leads')       renderLeads();
  if (currentView === 'sales')       renderSales();
  if (currentView === 'finance')     renderFinance();
}

// ── OVERVIEW ──────────────────────────────────────────────────────────────
function renderOverview() {
  const mid = Math.floor(daily.length / 2);
  const A   = daily.slice(0, mid), B = daily.slice(mid);

  const setKpi = (id, val, sub) => {
    const el = document.getElementById(id);
    el.querySelector('.kpi-val').textContent = val;
    el.querySelector('.kpi-sub').innerHTML   = sub;
  };

  const totalReach    = sum(daily, 'reach');
  const totalLikes    = sum(daily, 'likes');
  const totalComments = sum(daily, 'comments');
  const totalShares   = sum(daily, 'shares');
  const totalSaves    = sum(daily, 'saves');
  const avgEngRate    = daily.length ? daily.reduce((s, d) => s + rateOf(d), 0) / daily.length : 0;

  const reelsCount    = posts.filter(p => p.media_type === 'REELS').length;
  const carouselCount = posts.filter(p => p.media_type === 'CAROUSEL_ALBUM').length;
  const postSub = posts.length
    ? [reelsCount && `${reelsCount} Reels`, carouselCount && `${carouselCount} Carousel`].filter(Boolean).join(' · ')
    : 'No posts recorded';

  setKpi('kpiReach',    fmt(totalReach),    trendBadge(sum(B,'reach'), sum(A,'reach')));
  setKpi('kpiLikes',    fmt(totalLikes),    trendBadge(sum(B,'likes'), sum(A,'likes')));
  setKpi('kpiComments', fmt(totalComments), trendBadge(sum(B,'comments'), sum(A,'comments')));
  setKpi('kpiShares',   fmt(totalShares),   trendBadge(sum(B,'shares'), sum(A,'shares')));
  setKpi('kpiSaves',    fmt(totalSaves),    trendBadge(sum(B,'saves'), sum(A,'saves')));
  setKpi('kpiEngRate',  fmtPct(avgEngRate), 'Period average');
  setKpi('kpiPosts',    posts.length.toString(), postSub);

  const labels = daily.map(d => d.date.slice(5));

  destroyChart('ovReach');
  charts.ovReach = new Chart(document.getElementById('ovReachChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: daily.map(d => d.reach || 0),
        borderColor: BLUE, backgroundColor: BLUE + '12',
        borderWidth: 1.8, pointRadius: labels.length > 30 ? 0 : 2.5,
        pointHoverRadius: 4, fill: true, tension: 0.4,
      }]
    },
    options: chartOpts({ yFmt: v => fmt(v) })
  });

  destroyChart('ovDonut');
  charts.ovDonut = new Chart(document.getElementById('ovDonut'), {
    type: 'doughnut',
    data: {
      labels: ['Likes','Comments','Shares','Saves'],
      datasets: [{
        data: [sum(daily,'likes'), sum(daily,'comments'), sum(daily,'shares'), sum(daily,'saves')],
        backgroundColor: [PINK, ORG, CYAN, GREEN],
        borderColor: '#fff', borderWidth: 3, hoverOffset: 5,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 14, boxWidth: 9, usePointStyle: true } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } }
      }
    }
  });

  destroyChart('ovEngRate');
  const rates = daily.map(d => rateOf(d));
  charts.ovEngRate = new Chart(document.getElementById('ovEngRate'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: rates,
        backgroundColor: rates.map(r => r >= 5 ? GREEN + '33' : r >= 2 ? ORG + '33' : RED + '33'),
        borderColor:     rates.map(r => r >= 5 ? GREEN : r >= 2 ? ORG : RED),
        borderWidth: 1, borderRadius: 3,
      }]
    },
    options: chartOpts({ yFmt: v => v.toFixed(1) + '%', legend: false })
  });

  destroyChart('ovStacked');
  charts.ovStacked = new Chart(document.getElementById('ovStacked'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Likes',    data: daily.map(d => d.likes    || 0), backgroundColor: PINK + '80', borderRadius: 2 },
        { label: 'Comments', data: daily.map(d => d.comments || 0), backgroundColor: ORG  + '80', borderRadius: 2 },
        { label: 'Shares',   data: daily.map(d => d.shares   || 0), backgroundColor: CYAN + '80', borderRadius: 2 },
        { label: 'Saves',    data: daily.map(d => d.saves    || 0), backgroundColor: GREEN+ '80', borderRadius: 2 },
      ]
    },
    options: {
      ...chartOpts({ yFmt: v => fmt(v), stacked: true }),
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, boxWidth: 9, usePointStyle: true } },
        tooltip: { mode: 'index' }
      }
    }
  });
}

// ── PERFORMANCE ───────────────────────────────────────────────────────────
function renderPerformance() {
  const setKpi = (id, val, sub) => {
    const el = document.getElementById(id);
    el.querySelector('.kpi-val').textContent = val;
    el.querySelector('.kpi-sub').innerHTML   = sub;
  };

  const sorted  = [...daily].sort((a, b) => engOf(b) - engOf(a));
  const peak    = daily.reduce((m, d) => d.reach > (m.reach || 0) ? d : m, {});
  const avgReach = avg(daily, 'reach');
  const totalEng = daily.reduce((s, d) => s + engOf(d), 0);
  const peakRate  = Math.max(...daily.map(rateOf));

  // Best day of week
  const dowReach = Array(7).fill(0), dowCount = Array(7).fill(0);
  daily.forEach(d => {
    const dow = new Date(d.date).getDay();
    dowReach[dow] += d.reach || 0;
    dowCount[dow]++;
  });
  const dowAvg = dowReach.map((r, i) => dowCount[i] ? r / dowCount[i] : 0);
  const bestDowIdx = dowAvg.indexOf(Math.max(...dowAvg));

  setKpi('pfBestReach',   fmt(peak.reach), peak.date || '—');
  setKpi('pfAvgReach',    fmt(avgReach), 'per day');
  setKpi('pfTotalEng',    fmt(totalEng), 'total interactions');
  setKpi('pfBestDay',     DAYS[bestDowIdx], fmt(dowAvg[bestDowIdx]) + ' avg reach');
  setKpi('pfPeakEngRate', fmtPct(peakRate), 'single-day peak');

  const labels = daily.map(d => d.date.slice(5));
  const reaches = daily.map(d => d.reach || 0);
  const ma7 = movingAvg(reaches, 7);

  destroyChart('pfTrend');
  charts.pfTrend = new Chart(document.getElementById('pfTrendChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Daily Reach', data: reaches, borderColor: BLUE + '60', backgroundColor: BLUE + '08', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.3 },
        { label: '7-Day Avg',   data: ma7,     borderColor: BLUE, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4, borderDash: [] },
      ]
    },
    options: {
      ...chartOpts({ yFmt: v => fmt(v) }),
      plugins: { legend: { position: 'bottom', labels: { padding: 14, boxWidth: 9, usePointStyle: true } }, tooltip: { mode: 'index' } }
    }
  });

  destroyChart('pfDow');
  charts.pfDow = new Chart(document.getElementById('pfDowChart'), {
    type: 'bar',
    data: {
      labels: DAYS,
      datasets: [{
        data: dowAvg,
        backgroundColor: dowAvg.map((v, i) => i === bestDowIdx ? BLUE + 'cc' : BLUE + '30'),
        borderRadius: 6, borderSkipped: false,
      }]
    },
    options: chartOpts({ yFmt: v => fmt(v), legend: false })
  });

  // Top 10 table
  const tbody = document.getElementById('pfTable');
  tbody.innerHTML = '';
  sorted.slice(0, 10).forEach((d, i) => {
    const eng  = engOf(d);
    const rate = rateOf(d);
    const dow  = DAYS[new Date(d.date).getDay()];
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td class="rank-num">${i + 1}</td>
        <td>${d.date}</td>
        <td>${dow}</td>
        <td>${fmt(d.reach)}</td>
        <td>${fmt(d.likes)}</td>
        <td>${fmt(d.comments)}</td>
        <td>${fmt(d.shares)}</td>
        <td>${fmt(d.saves)}</td>
        <td><strong>${fmt(eng)}</strong></td>
        <td class="${rateCls(rate)}">${fmtPct(rate)}</td>
      </tr>`);
  });
}

// ── AUDIENCE ──────────────────────────────────────────────────────────────
function renderAudience() {
  const setKpi = (id, val, sub) => {
    const el = document.getElementById(id);
    el.querySelector('.kpi-val').textContent = val;
    el.querySelector('.kpi-sub').innerHTML   = sub;
  };

  const mid     = Math.floor(daily.length / 2);
  const firstH  = daily.slice(0, mid), secondH = daily.slice(mid);
  const total   = sum(daily, 'reach');
  const avgD    = avg(daily, 'reach');
  const peakDay = daily.reduce((m, d) => d.reach > (m.reach || 0) ? d : m, {});
  const growthPct = firstH.length && sum(firstH,'reach') ?
    ((sum(secondH,'reach') - sum(firstH,'reach')) / sum(firstH,'reach')) * 100 : 0;

  // Quality = (saves + shares) / reach
  const qualityRate = daily.length ?
    daily.reduce((s, d) => s + (d.reach ? ((d.saves || 0) + (d.shares || 0)) / d.reach * 100 : 0), 0) / daily.length : 0;

  setKpi('auTotalReach', fmt(total), trendBadge(sum(secondH,'reach'), sum(firstH,'reach')));
  setKpi('auAvgDaily',   fmt(avgD),  'per day');
  setKpi('auGrowth',     (growthPct >= 0 ? '+' : '') + growthPct.toFixed(1) + '%',
    `<span class="${growthPct >= 0 ? 'trend-up' : 'trend-down'}">${growthPct >= 0 ? 'Growing' : 'Declining'}</span>`);
  setKpi('auPeakDay',    peakDay.date || '—', fmt(peakDay.reach) + ' reached');
  setKpi('auEngQuality', fmtPct(qualityRate), 'avg saves+shares rate');

  const labels  = daily.map(d => d.date.slice(5));
  const reaches = daily.map(d => d.reach || 0);

  destroyChart('auReach');
  charts.auReach = new Chart(document.getElementById('auReachLine'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Reach',
        data: reaches,
        borderColor: BLUE, backgroundColor: BLUE + '10',
        borderWidth: 2, pointRadius: labels.length > 30 ? 0 : 3,
        pointBackgroundColor: BLUE, fill: true, tension: 0.4,
      }]
    },
    options: chartOpts({ yFmt: v => fmt(v), legend: false })
  });

  // Distribution: bucket reaches into bins
  const maxR = Math.max(...reaches);
  const bins = 6;
  const binSize = maxR / bins;
  const buckets = Array(bins).fill(0);
  const bucketLabels = [];
  for (let i = 0; i < bins; i++) {
    bucketLabels.push(fmt(i * binSize) + '–' + fmt((i + 1) * binSize));
    reaches.forEach(r => { if (r >= i * binSize && r < (i + 1) * binSize) buckets[i]++; });
  }
  buckets[bins - 1] += reaches.filter(r => r >= bins * binSize).length;

  destroyChart('auDist');
  charts.auDist = new Chart(document.getElementById('auDistChart'), {
    type: 'bar',
    data: {
      labels: bucketLabels,
      datasets: [{ label: 'Days', data: buckets, backgroundColor: BLUE + '40', borderColor: BLUE, borderWidth: 1, borderRadius: 6 }]
    },
    options: chartOpts({ yFmt: v => v + ' days', legend: false })
  });

  // Reach by day of week
  const dowR = Array(7).fill(0), dowC = Array(7).fill(0);
  daily.forEach(d => { const dow = new Date(d.date).getDay(); dowR[dow] += d.reach || 0; dowC[dow]++; });
  const dowAvg = dowR.map((r, i) => dowC[i] ? r / dowC[i] : 0);

  destroyChart('auDow');
  charts.auDow = new Chart(document.getElementById('auDowReach'), {
    type: 'bar',
    data: {
      labels: DAYS,
      datasets: [{ data: dowAvg, backgroundColor: BLUE + '33', borderColor: BLUE, borderWidth: 1, borderRadius: 5 }]
    },
    options: chartOpts({ yFmt: v => fmt(v), legend: false })
  });

  // Quality score
  const quality = daily.map(d => d.reach ? ((d.saves || 0) + (d.shares || 0)) / d.reach * 100 : 0);
  destroyChart('auQuality');
  charts.auQuality = new Chart(document.getElementById('auQualityChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: quality,
        borderColor: PRP, backgroundColor: PRP + '12',
        borderWidth: 1.8, pointRadius: 0, fill: true, tension: 0.4,
      }]
    },
    options: chartOpts({ yFmt: v => v.toFixed(2) + '%', legend: false })
  });
}

// ── CONTENT ───────────────────────────────────────────────────────────────
function renderContent() {
  const setKpi = (id, val, sub) => {
    const el = document.getElementById(id);
    el.querySelector('.kpi-val').textContent = val;
    el.querySelector('.kpi-sub').innerHTML   = sub;
  };

  const reels    = posts.filter(p => p.media_type === 'REELS');
  const carousel = posts.filter(p => p.media_type === 'CAROUSEL_ALBUM');
  const totalPosts = posts.length;
  const days = daily.length || 1;
  const weeks = days / 7;
  const freq = weeks > 0 ? (totalPosts / weeks).toFixed(1) : '—';

  // Avg reach on post days vs non-post days
  const postDates = new Set(posts.map(p => p.date));
  const postDays    = daily.filter(d => postDates.has(d.date));
  const nonPostDays = daily.filter(d => !postDates.has(d.date));
  const avgPostReach    = postDays.length ? avg(postDays, 'reach') : 0;
  const avgNonPostReach = nonPostDays.length ? avg(nonPostDays, 'reach') : 0;
  const liftPct = avgNonPostReach ? ((avgPostReach - avgNonPostReach) / avgNonPostReach * 100).toFixed(1) : '—';

  setKpi('ctTotalPosts',       totalPosts.toString(), 'total posts');
  setKpi('ctReels',            reels.length.toString(), reels.length ? ((reels.length/totalPosts*100).toFixed(0) + '% of posts') : '—');
  setKpi('ctCarousel',         carousel.length.toString(), carousel.length ? ((carousel.length/totalPosts*100).toFixed(0) + '% of posts') : '—');
  setKpi('ctPostFreq',         freq, 'per week average');
  setKpi('ctAvgReachOnPostDay', fmt(avgPostReach), liftPct !== '—' ? `<span class="${+liftPct >= 0 ? 'trend-up':'trend-down'}">${+liftPct >= 0 ? '+' : ''}${liftPct}% vs no-post days</span>` : '—');

  // Donut
  destroyChart('ctDonut');
  charts.ctDonut = new Chart(document.getElementById('ctTypeDonut'), {
    type: 'doughnut',
    data: {
      labels: ['Reels', 'Carousel'],
      datasets: [{
        data: [reels.length, carousel.length],
        backgroundColor: [PRP + 'cc', BLUE + 'cc'],
        borderColor: '#fff', borderWidth: 3, hoverOffset: 5,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, boxWidth: 9, usePointStyle: true } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} posts` } }
      }
    }
  });

  // Post vs Reach chart
  const labels = daily.map(d => d.date.slice(5));
  const reaches = daily.map(d => d.reach || 0);
  const postFlags = daily.map(d => postDates.has(d.date) ? (Math.max(...reaches) * 0.15) : 0);

  destroyChart('ctPostReach');
  charts.ctPostReach = new Chart(document.getElementById('ctPostVsReach'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Reach', data: reaches, backgroundColor: BLUE + '25', borderColor: BLUE, borderWidth: 1, borderRadius: 3, type: 'line', fill: true, tension: 0.4, pointRadius: 0 },
        { label: 'Post Published', data: postFlags, backgroundColor: PRP + 'aa', borderRadius: 4, barPercentage: 0.4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { padding: 14, boxWidth: 9, usePointStyle: true } }, tooltip: { mode: 'index' } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 12, color: '#6e6e73' } },
        y: { grid: { color: GRID }, ticks: { callback: v => fmt(v), color: '#6e6e73' } }
      }
    }
  });

  // Table
  const tbody = document.getElementById('ctTable');
  tbody.innerHTML = '';
  const sortedPosts = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  sortedPosts.forEach(p => {
    const matchDay = daily.find(d => d.date === p.date);
    const reach = matchDay ? matchDay.reach : null;
    const likes = matchDay ? matchDay.likes : null;
    const shares = matchDay ? matchDay.shares : null;
    const saves = matchDay ? matchDay.saves : null;
    const rate = matchDay ? rateOf(matchDay) : null;
    const typeBadge = p.media_type === 'REELS'
      ? `<span class="badge badge-reels">Reels</span>`
      : `<span class="badge badge-carousel">Carousel</span>`;
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${p.date}</td>
        <td>${DAYS[new Date(p.date).getDay()]}</td>
        <td>${typeBadge}</td>
        <td>${fmt(reach)}</td>
        <td>${fmt(likes)}</td>
        <td>${fmt(shares)}</td>
        <td>${fmt(saves)}</td>
        <td class="${rate != null ? rateCls(rate) : ''}">${rate != null ? fmtPct(rate) : '—'}</td>
      </tr>`);
  });
}

// ── Chart option factory ──────────────────────────────────────────────────
function chartOpts({ yFmt = v => v, legend = false, stacked = false } = {}) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: legend === false ? { display: false } : legend,
      tooltip: { mode: 'index', intersect: false, callbacks: { label: c => ` ${c.dataset.label || ''}: ${yFmt(c.raw)}` } }
    },
    scales: {
      x: { stacked, grid: { display: false }, ticks: { maxTicksLimit: 12, color: '#6e6e73' } },
      y: { stacked, grid: { color: GRID }, ticks: { callback: yFmt, color: '#6e6e73' } }
    }
  };
}

// ── Sheets data ───────────────────────────────────────────────────────────
let sheetsData    = null;
let sheetsDateKey = '';

async function fetchSheets() {
  const from = document.getElementById('dateFrom').value;
  const to   = document.getElementById('dateTo').value;
  const key  = `${from}|${to}`;
  if (sheetsData && sheetsDateKey === key) return sheetsData;
  const res  = await fetch(`/api/sheets?date_from=${from}&date_to=${to}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  sheetsData    = json;
  sheetsDateKey = key;
  return sheetsData;
}

const fmtRp = n => {
  if (!n) return 'Rp 0';
  if (n >= 1_000_000_000) return 'Rp ' + (n / 1_000_000_000).toFixed(1) + 'M';
  if (n >= 1_000_000)     return 'Rp ' + (n / 1_000_000).toFixed(1) + ' jt';
  if (n >= 1_000)         return 'Rp ' + (n / 1_000).toFixed(0) + 'K';
  return 'Rp ' + n;
};

// ── LEADS render ─────────────────────────────────────────────────────────
async function renderLeads() {
  const setKpi = (id, val, sub) => { const el = document.getElementById(id); el.querySelector('.kpi-val').textContent = val; el.querySelector('.kpi-sub').innerHTML = sub; };
  try {
    const d = await fetchSheets();
    const { leads } = d;

    setKpi('ldTotal', leads.total.toLocaleString(), 'all time');
    setKpi('ldWon',   leads.won.toLocaleString(),   leads.won + ' closed deals');
    setKpi('ldLost',  leads.lost.toLocaleString(),  leads.lost + ' not converted');
    setKpi('ldConv',  leads.convRate.toFixed(1) + '%', 'win rate');

    const months  = Object.keys(leads.byMonth).sort().slice(-18);
    const totals  = months.map(m => leads.byMonth[m].total);
    const wons    = months.map(m => leads.byMonth[m].won);

    destroyChart('ldMonth');
    charts.ldMonth = new Chart(document.getElementById('ldMonthChart'), {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Total Leads', data: totals, backgroundColor: BLUE + '30', borderColor: BLUE, borderWidth: 1, borderRadius: 3 },
          { label: 'Won',         data: wons,   backgroundColor: GREEN + '80', borderColor: GREEN, borderWidth: 1, borderRadius: 3 },
        ]
      },
      options: { ...chartOpts({ yFmt: v => v }), plugins: { legend: { position: 'bottom', labels: { padding: 12, boxWidth: 9, usePointStyle: true } }, tooltip: { mode: 'index' } } }
    });

    const chLabels = Object.keys(leads.byChannel).sort((a,b) => leads.byChannel[b] - leads.byChannel[a]);
    const chVals   = chLabels.map(k => leads.byChannel[k]);
    const COLORS   = [BLUE, GREEN, PRP, ORG, PINK, CYAN, RED];

    destroyChart('ldChannel');
    charts.ldChannel = new Chart(document.getElementById('ldChannelChart'), {
      type: 'doughnut',
      data: { labels: chLabels, datasets: [{ data: chVals, backgroundColor: COLORS, borderColor: '#fff', borderWidth: 3, hoverOffset: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 12, boxWidth: 9, usePointStyle: true } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} leads` } } } }
    });

    const tbody = document.getElementById('ldTable');
    tbody.innerHTML = '';
    leads.recent.forEach(l => {
      const badge = l.deal
        ? `<span class="badge" style="background:#34c75918;color:#34c759">Won</span>`
        : `<span class="badge" style="background:#ff3b3018;color:#ff3b30">Open</span>`;
      tbody.insertAdjacentHTML('beforeend', `<tr><td>${l.id}</td><td>${l.date||'—'}</td><td>${l.client||'—'}</td><td>${l.channel||'—'}</td><td>${l.type||'—'}</td><td>${badge}</td></tr>`);
    });
  } catch(e) { console.error(e); }
}

// ── SALES render ──────────────────────────────────────────────────────────
async function renderSales() {
  const setKpi = (id, val, sub) => { const el = document.getElementById(id); el.querySelector('.kpi-val').textContent = val; el.querySelector('.kpi-sub').innerHTML = sub; };
  try {
    const d = await fetchSheets();
    const { sales } = d;

    setKpi('slTotal',    sales.total.toLocaleString(), 'closed deals');
    setKpi('slRevenue',  fmtRp(sales.totalRevenue), 'total all time');
    setKpi('slRetainer', sales.retainerCount.toLocaleString(), 'retainer clients');
    setKpi('slProject',  sales.projectCount.toLocaleString(), 'project deals');
    setKpi('slAvg',      fmtRp(Math.round(sales.avgDeal)), 'per deal');

    const months   = Object.keys(sales.byMonth).sort().slice(-18);
    const revenues = months.map(m => sales.byMonth[m].revenue);

    destroyChart('slMonth');
    charts.slMonth = new Chart(document.getElementById('slMonthChart'), {
      type: 'bar',
      data: { labels: months, datasets: [{ label: 'Revenue', data: revenues, backgroundColor: BLUE + '40', borderColor: BLUE, borderWidth: 1, borderRadius: 4 }] },
      options: { ...chartOpts({ yFmt: v => fmtRp(v) }), plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtRp(c.raw)}` } } } }
    });

    destroyChart('slType');
    charts.slType = new Chart(document.getElementById('slTypeDonut'), {
      type: 'doughnut',
      data: { labels: ['Retainer','Project'], datasets: [{ data: [sales.retainerCount, sales.projectCount], backgroundColor: [GREEN+'cc', BLUE+'cc'], borderColor:'#fff', borderWidth:3, hoverOffset:5 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins: { legend:{position:'bottom',labels:{padding:14,boxWidth:9,usePointStyle:true}}, tooltip:{callbacks:{label:c=>` ${c.label}: ${c.raw}`}} } }
    });

    const svKeys = Object.keys(sales.byService).sort((a,b) => sales.byService[b]-sales.byService[a]);
    const svVals = svKeys.map(k => sales.byService[k]);
    const COLORS = [BLUE,GREEN,PRP,ORG,PINK,CYAN,RED,'#8e8ea0'];

    destroyChart('slService');
    charts.slService = new Chart(document.getElementById('slServiceChart'), {
      type: 'bar',
      data: { labels: svKeys, datasets: [{ data: svVals, backgroundColor: COLORS.slice(0,svKeys.length), borderRadius: 5 }] },
      options: { ...chartOpts({ yFmt: v => fmtRp(v) }), indexAxis:'y', plugins: { legend:{display:false}, tooltip:{callbacks:{label:c=>` ${fmtRp(c.raw)}`}} } }
    });

    const tbody = document.getElementById('slClientTable');
    tbody.innerHTML = '';
    sales.topClients.forEach((c,i) => {
      tbody.insertAdjacentHTML('beforeend', `<tr><td class="rank-num">${i+1}</td><td>${c.client}</td><td>${c.deals}</td><td><strong>${fmtRp(c.revenue)}</strong></td></tr>`);
    });
  } catch(e) { console.error(e); }
}

// ── FINANCE render ────────────────────────────────────────────────────────
async function renderFinance() {
  const setKpi = (id, val, sub) => { const el = document.getElementById(id); el.querySelector('.kpi-val').textContent = val; el.querySelector('.kpi-sub').innerHTML = sub; };
  try {
    const d = await fetchSheets();
    const { sales } = d;

    const rev2025 = sales.byYear[2025] || 0;
    const rev2026 = sales.byYear[2026] || 0;
    const growth  = rev2025 ? ((rev2026 - rev2025) / rev2025 * 100) : 0;

    setKpi('fnTotal',  fmtRp(sales.totalRevenue), 'all deals');
    setKpi('fn2025',   fmtRp(rev2025), sales.byYear[2025] ? (Object.values(sales.byMonth).filter((_,i)=>Object.keys(sales.byMonth).sort()[i]?.startsWith('2025')).length + ' months') : '—');
    setKpi('fn2026',   fmtRp(rev2026), 'YTD 2026');
    setKpi('fnGrowth', (growth>=0?'+':'') + growth.toFixed(1)+'%', `<span class="${growth>=0?'trend-up':'trend-down'}">${growth>=0?'Growing':'Declining'}</span>`);

    const allMonths = Object.keys(sales.byMonth).sort();
    const revenues  = allMonths.map(m => sales.byMonth[m].revenue);

    destroyChart('fnTrend');
    charts.fnTrend = new Chart(document.getElementById('fnTrendChart'), {
      type: 'line',
      data: { labels: allMonths, datasets: [{ label:'Revenue', data:revenues, borderColor:BLUE, backgroundColor:BLUE+'12', borderWidth:2, pointRadius:3, fill:true, tension:0.4 }] },
      options: { ...chartOpts({ yFmt: v => fmtRp(v) }), plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>` ${fmtRp(c.raw)}`}} } }
    });

    const svKeys = Object.keys(sales.byService).sort((a,b) => sales.byService[b]-sales.byService[a]);
    const svVals = svKeys.map(k => sales.byService[k]);
    const COLORS = [BLUE,GREEN,PRP,ORG,PINK,CYAN,RED,'#8e8ea0'];

    destroyChart('fnServiceDonut');
    charts.fnServiceDonut = new Chart(document.getElementById('fnServiceDonut'), {
      type: 'doughnut',
      data: { labels: svKeys, datasets: [{ data:svVals, backgroundColor:COLORS, borderColor:'#fff', borderWidth:3, hoverOffset:5 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{position:'bottom',labels:{padding:10,boxWidth:9,usePointStyle:true}}, tooltip:{callbacks:{label:c=>` ${c.label}: ${fmtRp(c.raw)}`}} } }
    });

    const months25 = Array.from({length:12},(_,i)=>`2025-${String(i+1).padStart(2,'0')}`);
    const months26 = Array.from({length:12},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`);
    const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    destroyChart('fnYearCompare');
    charts.fnYearCompare = new Chart(document.getElementById('fnYearCompare'), {
      type: 'bar',
      data: {
        labels: MONTH_LABELS,
        datasets: [
          { label:'2025', data: months25.map(m => (sales.byMonth[m]||{}).revenue||0), backgroundColor: BLUE+'50', borderColor:BLUE, borderWidth:1, borderRadius:3 },
          { label:'2026', data: months26.map(m => (sales.byMonth[m]||{}).revenue||0), backgroundColor: GREEN+'50', borderColor:GREEN, borderWidth:1, borderRadius:3 },
        ]
      },
      options: { ...chartOpts({ yFmt: v=>fmtRp(v) }), plugins:{ legend:{position:'bottom',labels:{padding:12,boxWidth:9,usePointStyle:true}}, tooltip:{mode:'index',callbacks:{label:c=>` ${c.dataset.label}: ${fmtRp(c.raw)}`}} } }
    });
  } catch(e) { console.error(e); }
}

// ── Navigation ────────────────────────────────────────────────────────────
const ALL_VIEWS = ['overview','performance','audience','content','leads','sales','finance'];

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    document.getElementById('pageTitle').textContent = cap(currentView);
    ALL_VIEWS.forEach(v =>
      document.getElementById('view' + cap(v)).classList.toggle('hidden', v !== currentView)
    );
    renderCurrentView();
  });
});

// ── Date presets ──────────────────────────────────────────────────────────
document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const { from, to } = dateRange(+btn.dataset.days);
    setDates(from, to);
    fetchData(from, to);
  });
});

document.getElementById('applyBtn').addEventListener('click', () => {
  document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
  fetchData(document.getElementById('dateFrom').value, document.getElementById('dateTo').value);
});

// ── Refresh ───────────────────────────────────────────────────────────────
document.getElementById('refreshBtn').addEventListener('click', () => {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  fetchData(document.getElementById('dateFrom').value, document.getElementById('dateTo').value)
    .finally(() => btn.classList.remove('spinning'));
});

// ── Export CSV ────────────────────────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', () => {
  if (!daily.length) return;
  const headers = ['Date','Reach','Likes','Comments','Shares','Saves','Total Eng','Eng Rate %'];
  const rows = daily.map(d => {
    const eng  = engOf(d);
    const rate = rateOf(d).toFixed(2);
    return [d.date, d.reach||0, d.likes||0, d.comments||0, d.shares||0, d.saves||0, eng, rate];
  });
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `instagram_${document.getElementById('dateFrom').value}_to_${document.getElementById('dateTo').value}.csv`;
  a.click();
});

// ── Content Stock ─────────────────────────────────────────────────────────
const STOCK_KEY  = 'contentStock_pakarpajak';
const ALERT_THRESHOLD = 5;

function loadStock() {
  try { return JSON.parse(localStorage.getItem(STOCK_KEY)) || []; }
  catch { return []; }
}

function saveStock(items) {
  localStorage.setItem(STOCK_KEY, JSON.stringify(items));
}

function renderStock() {
  const items   = loadStock();
  const list    = document.getElementById('stockList');
  const count   = document.getElementById('stockCount');
  const alert   = document.getElementById('stockAlert');
  const empty   = document.getElementById('stockEmpty');
  const card    = document.getElementById('stockCard');

  count.textContent = items.length;
  const isLow = items.length < ALERT_THRESHOLD;
  count.classList.toggle('low', isLow);
  alert.classList.toggle('hidden', !isLow);
  card.classList.toggle('alert-active', isLow);

  list.innerHTML = '';
  if (!items.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  items.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'stock-item';
    li.innerHTML = `
      <div class="stock-item-num">${idx + 1}</div>
      <div class="stock-item-title">${escHtml(item.title)}</div>
      <div class="stock-item-date">${item.date}</div>
      <button class="stock-item-del" data-idx="${idx}" title="Hapus">×</button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.stock-item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const items = loadStock();
      items.splice(+btn.dataset.idx, 1);
      saveStock(items);
      renderStock();
    });
  });
}

function addStockItem(title) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const items = loadStock();
  items.push({ title: trimmed, date: new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) });
  saveStock(items);
  renderStock();
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.getElementById('stockInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    addStockItem(e.target.value);
    e.target.value = '';
  }
});

document.getElementById('stockAddBtn').addEventListener('click', () => {
  const input = document.getElementById('stockInput');
  addStockItem(input.value);
  input.value = '';
  input.focus();
});

// Render stock on load (always visible in Overview)
renderStock();

// ── Init ──────────────────────────────────────────────────────────────────
const init = dateRange(90);
setDates(init.from, init.to);
fetchData(init.from, init.to);
