// api/submit-review.js — Vercel Serverless Function
// Stores client review in Upstash Redis. Auto-approved, shows instantly.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

async function redis(...args) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
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
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { name, stars, text, pkg } = req.body || {};
  if (!name || !text) return res.status(400).json({ error: 'Missing name or text' });

  const review = {
    id:    Date.now().toString(),
    name:  String(name).slice(0, 80),
    stars: Math.min(5, Math.max(1, parseInt(stars) || 5)),
    text:  String(text).slice(0, 500),
    pkg:   String(pkg || '').slice(0, 80),
    date:  new Date().toISOString(),
  };

  try {
    await redis('SET', `review:${review.id}`, JSON.stringify(review));
    await redis('SADD', 'review-ids', review.id);
    return res.status(200).json({ ok: true, id: review.id });
  } catch (err) {
    console.error('submit-review error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
