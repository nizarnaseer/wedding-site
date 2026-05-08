// store-booking.js — Saves approved booking data so the scheduler can
//                    send an automated review request email after the event.
// Called from approve.html when photographer clicks "Approve".
// Uses Netlify Blobs (built-in key-value store, no extra packages needed on recent Netlify).

const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Simple Netlify Blobs helper using the REST API directly (no npm package needed)
async function blobPut(key, value) {
  const token  = process.env.NETLIFY_ACCESS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  if (!token || !siteId) throw new Error('Netlify env vars not set');

  const body = JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.netlify.com',
      path: `/api/v1/sites/${siteId}/blobs/${encodeURIComponent(key)}?namespace=review-queue`,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };

  let data;
  try { data = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const required = ['bookingId','clientName','clientEmail','clientPhone','eventDate','packageName'];
  for (const f of required) {
    if (!data[f]) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Missing: ${f}` }) };
  }

  const booking = {
    bookingId:   data.bookingId,
    clientName:  data.clientName,
    clientEmail: data.clientEmail,
    clientPhone: data.clientPhone,
    eventDate:   data.eventDate,    // ISO date string: "2025-06-14"
    packageName: data.packageName,
    reviewSent:  false,
    storedAt:    new Date().toISOString(),
  };

  try {
    await blobPut(data.bookingId, booking);
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('store-booking error:', err.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
