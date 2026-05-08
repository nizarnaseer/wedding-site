// api/store-booking.js — Vercel Serverless Function
// Called by approve.html when photographer approves a booking.
// Stores booking in Upstash Redis for the review-request cron job.

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

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { bookingId, clientName, clientEmail, clientPhone, packageName, eventDate } = req.body || {};
  if (!bookingId || !clientEmail || !eventDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const booking = {
    bookingId, clientName, clientEmail,
    clientPhone: clientPhone || '',
    packageName: packageName || '',
    eventDate,
    reviewSent: false,
    storedAt: new Date().toISOString(),
  };

  try {
    await redis('SET', `booking:${bookingId}`, JSON.stringify(booking));
    await redis('SADD', 'booking-ids', bookingId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('store-booking error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
