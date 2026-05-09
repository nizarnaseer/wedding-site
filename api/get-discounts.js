// api/get-discounts.js — reads discounts from Upstash Redis
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
  if (!url || !token) return res.status(200).json({ pkg_discounts: {}, promo_codes: {} });

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
