
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const API_KEY = 'db66ff785a404933bd09c65af2bf52a4';
const BASE = 'https://api.football-data.org/v4';
const headers = { 'X-Auth-Token': API_KEY };

// ═══ SYSTÈME DE CACHE ═══
const cache = {};
const CACHE_TTL = {
  matches:      60 * 1000,   // 60 secondes (matchs en cours)
  standings:    5 * 60 * 1000, // 5 minutes (classements)
  competitions: 60 * 60 * 1000, // 1 heure (liste compétitions)
};

const getCache = (key) => {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    delete cache[key];
    return null;
  }
  return entry.data;
};

const setCache = (key, data, ttl) => {
  cache[key] = { data, timestamp: Date.now(), ttl };
};

// Fonction générique avec cache
const fetchWithCache = async (cacheKey, url, ttl, res) => {
  try {
    // Vérifie le cache d'abord
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`✅ Cache HIT : ${cacheKey}`);
      return res.json({ ...cached, _cache: true });
    }

    // Sinon appel API réel
    console.log(`🌐 Cache MISS : ${cacheKey} → appel API`);
    const response = await fetch(url, { headers });
    const data = await response.json();
    setCache(cacheKey, data, ttl);
    res.json({ ...data, _cache: false });

  } catch (err) {
    // Si l'API échoue mais qu'on a un cache expiré → on le renvoie quand même
    const stale = cache[cacheKey];
    if (stale) {
      console.log(`⚠️ API down, cache périmé utilisé : ${cacheKey}`);
      return res.json({ ...stale.data, _cache: true, _stale: true });
    }
    res.status(500).json({ error: err.message });
  }
};

// ═══ ROUTES ═══

// Matchs WC — cache 60s
app.get('/api/matches/WC', (req, res) => {
  fetchWithCache(
    'matches_WC',
    `${BASE}/competitions/WC/matches`,
    CACHE_TTL.matches,
    res
  );
});

// Classements WC — cache 5min
app.get('/api/standings/WC', (req, res) => {
  fetchWithCache(
    'standings_WC',
    `${BASE}/competitions/WC/standings`,
    CACHE_TTL.standings,
    res
  );
});

// Liste compétitions — cache 1h
app.get('/api/competitions', (req, res) => {
  fetchWithCache(
    'competitions',
    `${BASE}/competitions`,
    CACHE_TTL.competitions,
    res
  );
});

// Statut du cache (utile pour déboguer)
app.get('/api/cache-status', (req, res) => {
  const status = Object.entries(cache).map(([key, entry]) => ({
    key,
    age_seconds: Math.round((Date.now() - entry.timestamp) / 1000),
    ttl_seconds: Math.round(entry.ttl / 1000),
    expires_in: Math.round((entry.ttl - (Date.now() - entry.timestamp)) / 1000),
    from_cache: true,
  }));
  res.json({ cache_entries: status.length, entries: status });
});

app.listen(4000, () => {
  console.log('🚀 Proxy démarré sur http://localhost:4000');
  console.log('📦 Cache activé : matchs 60s | classements 5min | compétitions 1h');
});