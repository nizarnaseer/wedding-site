// submit-review.js
// Called by review.html when client submits. Stores review instantly in Netlify Blobs.
// NO manual approval — shows on website immediately.

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  let data;
  try { data = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const { name, stars, text, pkg } = data;
  if (!name || !text) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing name or text' }) };
  }

  const review = {
    id:     Date.now().toString(),
    name:   String(name).slice(0, 80),
    stars:  Math.min(5, Math.max(1, parseInt(stars) || 5)),
    text:   String(text).slice(0, 500),
    pkg:    String(pkg || '').slice(0, 80),
    date:   new Date().toISOString(),
  };

  try {
    const store = getStore('reviews');
    await store.setJSON(review.id, review);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, id: review.id }) };
  } catch (err) {
    console.error('submit-review error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
