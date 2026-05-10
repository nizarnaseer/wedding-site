// api/gallery.js — GET=load, POST=save (merged from get-gallery + save-gallery)
// Saves 1 serverless function slot on Vercel Hobby plan

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function redis(url, token, ...args) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  return j.result;
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(200).json({ albums: [] });

  // GET — load gallery
  if (req.method === 'GET') {
    try {
      const result = await redis(url, token, 'GET', 'gallery');
      if (result) return res.status(200).json(JSON.parse(result));
      return res.status(200).json({ albums: [] });
    } catch (err) {
      return res.status(200).json({ albums: [] });
    }
  }

  // POST — save gallery
  if (req.method === 'POST') {
    const { albums } = req.body || {};
    if (!albums) return res.status(400).json({ error: 'Missing albums' });
    try {
      const result = await redis(url, token, 'SET', 'gallery', JSON.stringify({ albums }));
      if (result === 'OK') return res.status(200).json({ ok: true });
      throw new Error(JSON.stringify(result));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
