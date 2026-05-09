// api/discounts.js — handles GET (read) and POST (write) for discounts via Upstash Redis
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
  if (!url || !token) return res.status(200).json({ pkg_discounts: {}, promo_codes: {} });

  // GET — read discounts
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const r = await fetch(`${url}/get/site_discounts`, {
        headers: { Authorization: `Bearer ${token}` }
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
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const payload = JSON.stringify({
        pkg_discounts: body.pkg_discounts || {},
        promo_codes:   body.promo_codes   || {}
      });
      const r = await fetch(`${url}/set/site_discounts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([payload])
      });
      if (!r.ok) throw new Error(await r.text());
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
