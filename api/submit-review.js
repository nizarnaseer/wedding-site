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

async function sendWhatsApp(msg) {
  let phone = process.env.PHOTOGRAPHER_PHONE;
  let openwaUrl = process.env.OPENWA_API_URL;
  let openwaKey = process.env.OPENWA_API_KEY;
  let openwaSession = process.env.OPENWA_SESSION_ID || 'default';
  let callmebotKey = process.env.CALLMEBOT_API_KEY;

  // Try to load settings from Upstash Redis first
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['GET', 'whatsapp_settings']),
      });
      const j = await r.json();
      if (j.result) {
        const dbSettings = JSON.parse(j.result);
        if (dbSettings.phone) phone = dbSettings.phone;
        if (dbSettings.openwaUrl) openwaUrl = dbSettings.openwaUrl;
        if (dbSettings.openwaKey) openwaKey = dbSettings.openwaKey;
        if (dbSettings.openwaSession) openwaSession = dbSettings.openwaSession;
        if (dbSettings.callmebotKey) callmebotKey = dbSettings.callmebotKey;
      }
    } catch (e) {
      console.warn("Failed to load whatsapp_settings from Redis:", e.message);
    }
  }

  if (!phone) return false;

  // --- Option A: OpenWA Integration ---
  if (openwaUrl && openwaKey) {
    try {
      const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
      const endpoint = `${openwaUrl.replace(/\/$/, '')}/api/sessions/${openwaSession}/messages/send-text`;
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-API-Key': openwaKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chatId, text: msg })
      });
      if (r.ok) return true;
    } catch (e) {
      console.error("OpenWA send error:", e.message);
    }
  }

  // --- Option B: CallMeBot Fallback ---
  if (callmebotKey) {
    try {
      const cleanPhone = phone.split('@')[0];
      const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(msg)}&apikey=${callmebotKey}`;
      const r = await fetch(url);
      if (r.ok) return true;
    } catch (e) {
      console.error("CallMeBot send error:", e.message);
    }
  }
  return false;
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

    // Trigger WhatsApp notification for new review
    const starsStr = '⭐'.repeat(review.stars);
    const waMsg = `✍️ *New Client Review Received!*\n` +
      `━━━━━━━━━━━━━━\n` +
      `👤 Name: *${review.name}*\n` +
      `📦 Package: *${review.pkg || '—'}*\n` +
      `✨ Rating: *${starsStr}*\n` +
      `💬 Feedback: ${review.text}`;
    await sendWhatsApp(waMsg);

    return res.status(200).json({ ok: true, id: review.id });
  } catch (err) {
    console.error('submit-review error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
