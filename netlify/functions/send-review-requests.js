// send-review-requests.js — Netlify Scheduled Function
// Runs every day at 8:00 AM (configured in netlify.toml)
// Finds bookings where eventDate + 2 days <= today AND reviewSent = false
// Sends review request email via Web3Forms + logs WhatsApp link
//
// Required env vars (Netlify dashboard > Site settings > Environment variables):
//   NETLIFY_ACCESS_TOKEN   — User Settings > Applications > Personal access tokens
//   NETLIFY_SITE_ID        — Site Settings > Site ID
//   WEB3FORMS_KEY          — Your Web3Forms access key
//   SITE_URL               — e.g. https://nizarnaseer.netlify.app
const https = require('https');

function httpsReq(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function blobList() {
  const token  = process.env.NETLIFY_ACCESS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  const res = await httpsReq({
    hostname: 'api.netlify.com',
    path: `/api/v1/sites/${siteId}/blobs?namespace=review-queue`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  return JSON.parse(res.body);
}

async function blobGet(key) {
  const token  = process.env.NETLIFY_ACCESS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  const res = await httpsReq({
    hostname: 'api.netlify.com',
    path: `/api/v1/sites/${siteId}/blobs/${encodeURIComponent(key)}?namespace=review-queue`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  return JSON.parse(res.body);
}

async function blobPut(key, value) {
  const token  = process.env.NETLIFY_ACCESS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  const body = JSON.stringify(value);
  await httpsReq({
    hostname: 'api.netlify.com',
    path: `/api/v1/sites/${siteId}/blobs/${encodeURIComponent(key)}?namespace=review-queue`,
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
}

async function sendReviewEmail(booking, reviewUrl) {
  const web3Key  = process.env.WEB3FORMS_KEY;
  const siteUrl  = process.env.SITE_URL || 'https://nizarnaseer.netlify.app';
  const firstName = booking.clientName.split(' ')[0].split('&')[0].trim();

  // ── Email to CLIENT ──────────────────────────────────────────
  const clientMsg = `Assalamualaikum warahmatullahi wabarakatuh,

Dear ${firstName},

From the bottom of our hearts — thank you so much for choosing Nizar Naseer Studio. It was truly an honour and a privilege to be part of your special day. 🙏

We hope that every photo we captured brings back beautiful memories whenever you look at them — moments that will be treasured for a lifetime.

As a small studio built on trust and passion, your experience means everything to us. We would be deeply grateful if you could take just 2 minutes to share how your ${booking.packageName} session went. Your kind words not only encourage us, but they also help other families discover and trust us.

✨ Share your experience here:
${reviewUrl}

There are no right or wrong answers — just your honest, heartfelt thoughts. Even a few sentences would mean the world to us.

Once again, thank you so much for your trust, your time, and for allowing us to capture your precious moments. We sincerely hope to have the honour of serving you again in the future. 💛

With warm regards and gratitude,
Nizar Naseer
Nizar Naseer Studio 📷

"Every frame tells a story. Yours is one we will always remember."`.trim();

  const clientPayload = JSON.stringify({
    access_key: web3Key,
    to:          booking.clientEmail,
    subject:     `📸 How was your ${booking.packageName} experience?`,
    message:     clientMsg,
    from_name:   'Nizar Naseer Studio',
  });

  await httpsReq({
    hostname: 'api.web3forms.com',
    path: '/submit',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(clientPayload) },
  }, clientPayload);

  // ── Notification to PHOTOGRAPHER with ready-to-tap WA link ──
  const photographerEmail = process.env.PHOTOGRAPHER_EMAIL;
  if (photographerEmail && web3Key) {
    const waMsg =
      `Assalamualaikum ${firstName}! 😊\n\n` +
      `Alhamdulillah, it was truly a blessing to have been part of your ${booking.packageName} session at Nizar Naseer Studio. ` +
      `We are deeply grateful that you chose us to capture your precious moments. 🙏\n\n` +
      `We hope the photos have brought you joy and beautiful memories to cherish. 💛\n\n` +
      `If you have a spare 2 minutes, we would be truly honoured if you could share a little feedback about your experience with us. ` +
      `Your kind words mean so much and help other families find and trust us.\n\n` +
      `✨ Leave a review here:\n${reviewUrl}\n\n` +
      `Once again, thank you from the bottom of our hearts. We sincerely hope to serve you again someday! 🌟\n\n` +
      `Warm regards,\nNizar Naseer Studio 📷`;
    const waLink = `https://wa.me/${booking.clientPhone}?text=${encodeURIComponent(waMsg)}`;

    const notifPayload = JSON.stringify({
      access_key: web3Key,
      to:         photographerEmail,
      subject:    `📋 Review request sent to ${booking.clientName}`,
      message:    `Salam Nizar,\n\nJust a quick heads-up — the system has automatically sent a review request to your client:\n\n👤 Client   : ${booking.clientName}\n📦 Session  : ${booking.packageName}\n📅 Date     : ${booking.eventDate}\n📧 Email    : ${booking.clientEmail}\n\nWhat was sent:\n✅ Email — A warm review request email has been sent to the client.\n✅ WhatsApp — Use the link below to send the WhatsApp message with one tap:\n\n${waLink}\n\nNo action needed from your side unless you wish to follow up personally.\n\n— Nizar Naseer Studio System`,
      from_name:  'Nizar Naseer Studio',
    });
    await httpsReq({
      hostname: 'api.web3forms.com',
      path: '/submit',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(notifPayload) },
    }, notifPayload).catch(() => {});
  }
}


exports.handler = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const siteUrl = process.env.SITE_URL || 'https://nizarnaseer.netlify.app';

  try {
    const list = await blobList();
    const keys = list.blobs ? list.blobs.map(b => b.key) : [];
    console.log(`[review-scheduler] Checking ${keys.length} bookings...`);

    let sent = 0;
    for (const key of keys) {
      const booking = await blobGet(key);
      if (!booking || booking.reviewSent) continue;

      const eventDate = new Date(booking.eventDate);
      eventDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today - eventDate) / (1000 * 60 * 60 * 24));

      // Send review request 2 days after event date
      if (daysDiff === 2) {
        const reviewUrl = `${siteUrl}/review.html`
          + `?ref=${encodeURIComponent(booking.bookingId)}`
          + `&name=${encodeURIComponent(booking.clientName)}`
          + `&pkg=${encodeURIComponent(booking.packageName)}`;

        console.log(`[review-scheduler] Sending to ${booking.clientEmail} | WA: https://wa.me/${booking.clientPhone}`);
        await sendReviewEmail(booking, reviewUrl);

        // Mark as sent
        booking.reviewSent = true;
        booking.reviewSentAt = new Date().toISOString();
        booking.reviewUrl = reviewUrl;
        await blobPut(key, booking);

        // Log the WhatsApp link (photographer can copy from Netlify function logs)
        const waMsg = `Hi ${booking.clientName}! Thank you for your ${booking.packageName} session with Nizar Naseer Studio 📸 We'd love your feedback! Please take 2 minutes to leave a review here: ${reviewUrl}`;
        console.log(`[WA-LINK] https://wa.me/${booking.clientPhone}?text=${encodeURIComponent(waMsg)}`);

        sent++;
      }
    }

    console.log(`[review-scheduler] Done. Sent ${sent} review request(s).`);
    return { statusCode: 200, body: JSON.stringify({ sent }) };
  } catch (err) {
    console.error('[review-scheduler] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
