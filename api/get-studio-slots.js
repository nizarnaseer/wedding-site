// api/get-studio-slots.js — returns booked concept+time combinations per date
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(200).json({ slots: [] });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'studio_slots']),
    });
    const j = await r.json();
    const slots = j.result ? JSON.parse(j.result) : [];
    return res.status(200).json({ slots });
  } catch {
    return res.status(200).json({ slots: [] });
  }
};
