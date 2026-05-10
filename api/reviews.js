// api/reviews.js — GET=load all, POST=delete one (merged from get-reviews + delete-review)
// Saves 1 serverless function slot on Vercel Hobby plan

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const STARTER_REVIEWS = [
  { id:'s1', stars:5, name:'Farhana & Aidil',  pkg:'Nikah / Sanding Package',  text:'"Nizar captured our nikah so beautifully. Every shot felt natural, not posed. We still cry looking at the photos. Best decision we made."' },
  { id:'s2', stars:5, name:'Siti Norzahra',    pkg:'Studio Raya Session',       text:'"Professional, patient, and so creative. Our family raya studio session was so fun. The kids loved it and the photos turned out amazing!"' },
  { id:'s3', stars:5, name:'Azri & Maisarah',  pkg:'Full Day Wedding Package',  text:'"From the booking process to delivery — everything was smooth. Got our full gallery in 3 weeks. Highly recommend to all couples!"' },
];

async function redis(...args) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
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

  // GET — load all reviews
  if (req.method === 'GET') {
    try {
      const ids = await redis('SMEMBERS', 'review-ids');
      if (!ids || ids.length === 0) return res.status(200).json({ reviews: STARTER_REVIEWS });

      const url   = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      const pipeline = ids.map(id => ['GET', `review:${id}`]);
      const r = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pipeline),
      });
      const results = await r.json();
      const reviews = results
        .map(x => { try { return JSON.parse(x.result); } catch { return null; } })
        .filter(Boolean)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      return res.status(200).json({ reviews: reviews.length ? reviews : STARTER_REVIEWS });
    } catch (err) {
      return res.status(200).json({ reviews: STARTER_REVIEWS });
    }
  }

  // POST — delete a review  { action: 'delete', id: '...' }
  if (req.method === 'POST') {
    const { action, id } = req.body || {};
    if (action === 'delete') {
      if (!id) return res.status(400).json({ error: 'Missing id' });
      try {
        await redis('DEL', `review:${id}`);
        await redis('SREM', 'review-ids', id);
        return res.status(200).json({ ok: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
