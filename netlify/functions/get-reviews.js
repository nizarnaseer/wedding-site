// get-reviews.js — Reads all reviews from Netlify Blobs and returns as JSON.
// No env vars needed. Falls back to starter reviews if store is empty.

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const STARTER_REVIEWS = [
  { id:'s1', stars:5, name:'Farhana & Aidil',  pkg:'Nikah / Sanding Package',  text:'"Nizar captured our nikah so beautifully. Every shot felt natural, not posed. We still cry looking at the photos. Best decision we made."' },
  { id:'s2', stars:5, name:'Siti Norzahra',    pkg:'Studio Raya Session',       text:'"Professional, patient, and so creative. Our family raya studio session was so fun. The kids loved it and the photos turned out amazing!"' },
  { id:'s3', stars:5, name:'Azri & Maisarah',  pkg:'Full Day Wedding Package',  text:'"From the booking process to delivery — everything was smooth. Got our full gallery in 3 weeks. Highly recommend to all couples!"' },
];

exports.handler = async () => {
  try {
    const store = getStore('reviews');
    const { blobs } = await store.list();

    if (!blobs || blobs.length === 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ reviews: STARTER_REVIEWS }) };
    }

    const reviews = await Promise.all(
      blobs.map(b => store.get(b.key, { type: 'json' }))
    );

    // Sort newest first, remove nulls
    const sorted = reviews
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reviews: sorted }) };
  } catch (err) {
    console.error('get-reviews error:', err.message);
    // Return starter reviews so page never breaks
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reviews: STARTER_REVIEWS }) };
  }
};
