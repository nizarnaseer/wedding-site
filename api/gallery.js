// api/gallery.js — GET=load, POST=save, DELETE=remove from Cloudinary
// Saves function slots on Vercel Hobby plan (all gallery ops in one)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

  // GET — load gallery OR banner config
  if (req.method === 'GET') {
    try {
      if (req.query?.action === 'banner-config') {
        const cfg = await redis(url, token, 'GET', 'banner_config');
        return res.status(200).json(cfg ? JSON.parse(cfg) : { studioVisible: true });
      }
      const result = await redis(url, token, 'GET', 'gallery');
      if (result) return res.status(200).json(JSON.parse(result));
      return res.status(200).json({ albums: [] });
    } catch (err) {
      return res.status(200).json({ albums: [] });
    }
  }

  // POST — save gallery OR banner config
  if (req.method === 'POST') {
    const { albums, action, studioVisible } = req.body || {};
    if (action === 'banner-config') {
      await redis(url, token, 'SET', 'banner_config', JSON.stringify({ studioVisible }));
      return res.status(200).json({ ok: true });
    }
    if (!albums) return res.status(400).json({ error: 'Missing albums' });
    try {
      const result = await redis(url, token, 'SET', 'gallery', JSON.stringify({ albums }));
      if (result === 'OK') return res.status(200).json({ ok: true });
      throw new Error(JSON.stringify(result));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE — remove image from Cloudinary
  if (req.method === 'DELETE') {
    const { publicId } = req.body || {};
    if (!publicId) return res.status(400).json({ error: 'Missing publicId' });
    const cldName   = process.env.CLOUDINARY_CLOUD_NAME;
    const cldKey    = process.env.CLOUDINARY_API_KEY;
    const cldSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cldName || !cldKey || !cldSecret) {
      return res.status(200).json({ ok: false, reason: 'Cloudinary env vars not set — skipped' });
    }
    try {
      const auth = Buffer.from(`${cldKey}:${cldSecret}`).toString('base64');
      const r = await fetch(
        `https://api.cloudinary.com/v1_1/${cldName}/resources/image/upload?public_ids[]=${encodeURIComponent(publicId)}`,
        { method: 'DELETE', headers: { 'Authorization': `Basic ${auth}` } }
      );
      const j = await r.json();
      return res.status(200).json({ ok: true, deleted: j.deleted });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
