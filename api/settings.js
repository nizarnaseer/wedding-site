// api/settings.js — Generic GET/POST config endpoint for Upstash Redis configuration keys
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(500).json({ error: 'Redis env vars not set' });

  // Read key parameter from query (GET) or body (POST)
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {}
  }

  // Handle WhatsApp Notification requests from frontend
  const { action, message } = body || {};
  if (req.method === 'POST' && action === 'notify_whatsapp') {
    if (!message) return res.status(400).json({ error: 'Missing message parameter' });
    try {
      const sent = await sendWhatsApp(message);
      return res.status(200).json({ ok: sent });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const key = req.method === 'GET' ? req.query?.key : body?.key;
  if (!key) return res.status(400).json({ error: 'Missing config key parameter' });

  // Whitelist of allowed keys to prevent arbitrary reads/writes
  const allowedKeys = ['site_packages', 'site_discounts', 'booked_dates', 'studio_concepts'];
  if (!allowedKeys.includes(key)) {
    return res.status(400).json({ error: 'Key not allowed' });
  }

  // GET — read value
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['GET', key]),
      });
      const j = await r.json();
      const data = j.result ? JSON.parse(j.result) : null;
      
      // Return appropriate defaults if empty
      if (!data) {
        if (key === 'site_packages') return res.status(200).json([]);
        if (key === 'booked_dates') return res.status(200).json([]);
        if (key === 'studio_concepts') return res.status(200).json([]);
        if (key === 'site_discounts') return res.status(200).json({ pkg_discounts: {}, promo_codes: {}, combo_bundle_discount: 150 });
      }
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — save value
  if (req.method === 'POST') {
    const { value } = body || {};
    if (value === undefined) return res.status(400).json({ error: 'Missing value' });
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', key, JSON.stringify(value)]),
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

async function sendWhatsApp(msg) {
  const phone = process.env.PHOTOGRAPHER_PHONE; // e.g. 601187381984
  if (!phone) {
    console.warn("PHOTOGRAPHER_PHONE not set");
    return false;
  }

  // --- Option A: OpenWA Integration ---
  const openwaUrl = process.env.OPENWA_API_URL;
  const openwaKey = process.env.OPENWA_API_KEY;
  const openwaSession = process.env.OPENWA_SESSION_ID || 'default';

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
      if (r.ok) {
        console.log("WhatsApp message sent successfully via OpenWA");
        return true;
      } else {
        const txt = await r.text();
        console.error("OpenWA returned error status:", r.status, txt);
      }
    } catch (e) {
      console.error("OpenWA send error:", e.message);
    }
  }

  // --- Option B: CallMeBot Fallback ---
  const callmebotKey = process.env.CALLMEBOT_API_KEY;
  if (callmebotKey) {
    try {
      const cleanPhone = phone.split('@')[0];
      const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(msg)}&apikey=${callmebotKey}`;
      const r = await fetch(url);
      if (r.ok) {
        console.log("WhatsApp message sent successfully via CallMeBot");
        return true;
      }
    } catch (e) {
      console.error("CallMeBot send error:", e.message);
    }
  }

  console.warn("No WhatsApp provider (OpenWA or CallMeBot) succeeded or was configured");
  return false;
}
