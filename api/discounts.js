// api/discounts.js — GET (read) and POST (save) discounts via Upstash Redis
// Uses same command-array format as studio-slots.js which is confirmed working
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // GET — read discounts
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    if (!url || !token) return res.status(200).json({ pkg_discounts: {}, promo_codes: {} });
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['GET', 'site_discounts']),
      });
      const j = await r.json();
      const data = j.result ? JSON.parse(j.result) : { pkg_discounts: {}, promo_codes: {} };
      return res.status(200).json(data);
    } catch (e) {
      return res.status(200).json({ pkg_discounts: {}, promo_codes: {} });
    }
  }

  // POST — save discounts
  if (req.method === 'POST') {
    if (!url || !token) return res.status(500).json({ error: 'Redis not configured' });
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const payload = JSON.stringify({
        pkg_discounts: body.pkg_discounts || {},
        promo_codes:   body.promo_codes   || {},
      });
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', 'site_discounts', payload]),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
