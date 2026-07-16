// api/store-booking.js — Vercel Serverless Function
// Called by approve.html (approval) and app.js (new booking notification).
// Stores booking in Upstash Redis + auto-sends WhatsApp via CallMeBot.

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

async function sendWhatsApp(msg) {
  const phone = process.env.PHOTOGRAPHER_PHONE; // e.g. 601187381984
  if (!phone) return false;

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
      if (r.ok) return true;
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
    totalAmount, depositAmount, datesBlock, approveLink,
    notify,   // true = new client booking, send WA to photographer
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
    paymentStatus: 'deposit_pending',
    reviewSent:    false,
    reminder7Sent: false,
    reminder1Sent: false,
    cancelSent:    false,
    storedAt:      new Date().toISOString(),
  };

  try {
    await redis('SET', `booking:${bookingId}`, JSON.stringify(booking));
    await redis('SADD', 'booking-ids', bookingId);

    // Auto-WhatsApp to photographer on new booking
    if (notify) {
      const coupleStr = couple ? `\n\uD83D\uDC51 Couple: *${couple}*` : '';
      const waMsg =
        `\uD83D\uDCF8 *New Booking Alert!*\n` +
        `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n` +
        `\uD83D\uDCCB Ref: *${bookingId}*\n` +
        `\uD83D\uDC64 Client: *${clientName || '—'}*${coupleStr}\n` +
        `\uD83D\uDCF1 WA: ${clientPhone || 'Not provided'}\n` +
        `\uD83D\uDCE7 Email: ${clientEmail}\n` +
        `\uD83D\uDCE6 Package: *${packageName || '—'}*\n` +
        `\uD83D\uDCB0 Price: RM ${total ? total.toLocaleString() : '—'}\n` +
        `\uD83D\uDCC5 Date: *${eventDate}*\n` +
        `\uD83D\uDCCD Location: ${location || 'Not provided'}\n` +
        `\uD83D\uDCDD Notes: ${notes || 'None'}\n` +
        `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n` +
        (approveLink ? `\u2705 Approve: ${approveLink}` : '');
      await sendWhatsApp(waMsg);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('store-booking error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
