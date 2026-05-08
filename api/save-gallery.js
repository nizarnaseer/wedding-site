// api/save-gallery.js — saves gallery.json data to Upstash Redis
// Called by gallery-manager.html when photographer clicks "Save to Cloud"

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return res.status(500).json({ error: 'Upstash not configured' });

  const { albums } = req.body || {};
  if (!albums) return res.status(400).json({ error: 'Missing albums' });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', 'gallery', JSON.stringify({ albums })]),
    });
    const j = await r.json();
    if (j.result === 'OK') return res.status(200).json({ ok: true });
    throw new Error(JSON.stringify(j));
  } catch (err) {
    console.error('save-gallery error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
