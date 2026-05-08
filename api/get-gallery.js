// api/get-gallery.js — reads gallery data from Upstash Redis
// Falls back to gallery.json if Redis is not set up yet

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return res.status(200).json({ albums: [] });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'gallery']),
    });
    const j = await r.json();
    if (j.result) {
      const data = JSON.parse(j.result);
      return res.status(200).json(data);
    }
    return res.status(200).json({ albums: [] });
  } catch (err) {
    console.error('get-gallery error:', err.message);
    return res.status(200).json({ albums: [] });
  }
};
