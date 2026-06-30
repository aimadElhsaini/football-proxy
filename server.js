const http = require('http');
const https = require('https');

const API_KEY = '8dfac4ddbc2190f11c3656f6bbcf33de';
const cache = {};
const TTL = { fixtures: 60000, standings: 300000 };

const getCache = (key) => {
  const e = cache[key];
  if (!e) return null;
  if (Date.now() - e.timestamp > e.ttl) { delete cache[key]; return null; }
  return e.data;
};
const setCache = (key, data, ttl) => {
  cache[key] = { data, timestamp: Date.now(), ttl };
};

const fetchAPI = (path) => new Promise((resolve, reject) => {
  https.get({
    hostname: 'v3.football.api-sports.io',
    path: path,
    headers: {
      'x-apisports-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io'
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
  }).on('error', reject);
});

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = req.url.split('?')[0].replace(/\/$/, '') || '/';

  try {
    if (url === '/api/fixtures') {
      const cached = getCache('fixtures');
      if (cached) {
        console.log('✅ CACHE HIT - fixtures (pas d\'appel API)');
        res.setHeader('X-Cache', 'HIT');
        res.writeHead(200); res.end(JSON.stringify(cached)); return;
      }
      console.log('🌐 CACHE MISS - fixtures → appel API réel');
      const data = await fetchAPI('/fixtures?league=1&season=2026');
      setCache('fixtures', data, TTL.fixtures);
      res.setHeader('X-Cache', 'MISS');
      res.writeHead(200); res.end(JSON.stringify(data));

    } else if (url === '/api/standings') {
      const cached = getCache('standings');
      if (cached) {
        console.log('✅ CACHE HIT - standings (pas d\'appel API)');
        res.setHeader('X-Cache', 'HIT');
        res.writeHead(200); res.end(JSON.stringify(cached)); return;
      }
      console.log('🌐 CACHE MISS - standings → appel API réel');
      const data = await fetchAPI('/standings?league=1&season=2026');
      setCache('standings', data, TTL.standings);
      res.setHeader('X-Cache', 'MISS');
      res.writeHead(200); res.end(JSON.stringify(data));

    } else if (url === '/api/cache-status') {
      const status = Object.entries(cache).map(([key, e]) => ({
        key,
        age_secondes: Math.round((Date.now() - e.timestamp) / 1000),
        expire_dans: Math.round((e.ttl - (Date.now() - e.timestamp)) / 1000),
      }));
      res.writeHead(200);
      res.end(JSON.stringify({ entrees_en_cache: status.length, details: status }, null, 2));

    } else if (url === '/api' || url === '/') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', message: 'Proxy Render actif avec cache' }));

    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Route non trouvée', url }));
    }
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Proxy démarré sur port ' + PORT));
