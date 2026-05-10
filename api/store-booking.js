// api/store-booking.js — Vercel Serverless Function
// Called by approve.html when photographer approves a booking.
// Stores booking in Upstash Redis for review-request AND payment-reminder cron jobs.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

  // GET — mark full payment received
  if (req.method === 'GET') {
    const { ref, action } = req.query || {};
    if (!ref) return res.status(400).json({ error: 'Missing ref' });
    const raw = await redis('GET', `booking:${ref}`);
    if (!raw) return res.status(404).json({ error: 'Booking not found' });
    const booking = JSON.parse(raw);
    if (action === 'full_paid') {
      booking.paymentStatus = 'full_paid';
      booking.fullPaidAt = new Date().toISOString();
      await redis('SET', `booking:${ref}`, JSON.stringify(booking));
      return res.status(200).json({ ok: true, booking });
    }
    return res.status(200).json({ ok: true, booking });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const {
    bookingId, clientName, couple, clientEmail, clientPhone,
    packageName, eventDate, location, notes,
    totalAmount, depositAmount,
  } = req.body || {};

  if (!bookingId || !clientEmail || !eventDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const deposit = parseFloat(depositAmount) || 100;
  const total   = parseFloat(totalAmount)   || 0;
  const balance = Math.max(0, total - deposit);

  const booking = {
    bookingId,
    clientName:    clientName || '',
    couple:        couple     || '',
    clientEmail,
    clientPhone:   clientPhone || '',
    packageName:   packageName || '',
    eventDate,
    location:      location   || '',
    notes:         notes      || '',
    totalAmount:   total,
    depositAmount: deposit,
    balance,
    paymentStatus: 'deposit_pending',   // deposit_pending | deposit_paid | full_paid | cancelled
    reviewSent:    false,
    reminder7Sent: false,
    reminder1Sent: false,
    cancelSent:    false,
    storedAt:      new Date().toISOString(),
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
