// Golden Farm leaderboard server - zero dependencies, plain Node.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'scores.json');

// Load saved scores if the file exists (ephemeral on free hosting, fine for a friends game)
let scores = [];
try {
  scores = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(scores)) scores = [];
} catch (e) {
  scores = [];
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(scores.slice(0, 500)));
  } catch (e) { /* ignore */ }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function topScores(limit) {
  return scores
    .slice()
    .sort((a, b) => b.score - a.score || a.ts - b.ts)
    .slice(0, limit || 50);
}

const PAGE = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>المزرعة الذهبية - ترتيب اللاعبين</title>
<style>
  body { margin:0; font-family: Tahoma, Arial, sans-serif; background:#1c2b1a; color:#f5f0dc; min-height:100vh; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 22px; text-align:center; margin: 8px 0 20px; }
  .card { background:#26381f; border:1px solid #3d542f; border-radius:12px; overflow:hidden; }
  table { width:100%; border-collapse: collapse; }
  th, td { padding: 10px 14px; text-align:right; font-size: 15px; }
  th { background:#31461f; color:#ffd76e; }
  tr:nth-child(even) td { background:#2b3f22; }
  .rank { width: 44px; color:#ffd76e; font-weight:bold; }
  .empty { text-align:center; padding: 28px; color:#b9c7a5; }
  .foot { text-align:center; color:#8ba07a; font-size:12px; margin-top:16px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>🌾 المزرعة الذهبية — ترتيب اللاعبين</h1>
  <div class="card">
    <table>
      <thead><tr><th class="rank">#</th><th>اللاعب</th><th>الكوينز</th></tr></thead>
      <tbody id="rows"><tr><td colspan="3" class="empty">جاري التحميل...</td></tr></tbody>
    </table>
  </div>
  <div class="foot">النتايج بتتحدث لوحدها كل 15 ثانية</div>
</div>
<script>
async function load() {
  try {
    const r = await fetch('/scores');
    const list = await r.json();
    const rows = document.getElementById('rows');
    if (!list.length) { rows.innerHTML = '<tr><td colspan="3" class="empty">لسه مفيش نتايج. العبوا وابعتوا نتيجتكم!</td></tr>'; return; }
    rows.innerHTML = list.map((s, i) =>
      '<tr><td class="rank">' + (i+1) + '</td><td>' + escapeHtml(s.name) + '</td><td>' + s.score + '</td></tr>'
    ).join('');
  } catch (e) {
    document.getElementById('rows').innerHTML = '<tr><td colspan="3" class="empty">مشكلة في التحميل</td></tr>';
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
load();
setInterval(load, 15000);
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, count: scores.length });
  }

  if (req.method === 'GET' && url.pathname === '/scores') {
    return sendJson(res, 200, topScores(50));
  }

  if (req.method === 'GET' && url.pathname === '/top') {
    return sendJson(res, 200, topScores(10).map(s => ({ name: s.name, score: s.score })));
  }

  if (req.method === 'POST' && url.pathname === '/submit') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) req.destroy();
    });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
      const name = String(data.name || '').trim().slice(0, 30);
      const score = Math.floor(Number(data.score));
      if (!name) return sendJson(res, 400, { error: 'name required' });
      if (!isFinite(score) || score < 0 || score > 1e9) return sendJson(res, 400, { error: 'bad score' });
      const entry = { name, score, ts: Date.now() };
      scores.push(entry);
      save();
      const rank = topScores(500).findIndex(s => s.ts === entry.ts && s.name === entry.name && s.score === entry.score) + 1;
      return sendJson(res, 200, { ok: true, rank, top: topScores(10) });
    });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log('Farm leaderboard listening on port ' + PORT));
