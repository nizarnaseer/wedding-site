// api/send-review-requests.js — Vercel Cron Function
// Runs daily at 8:00 AM UTC (configured in vercel.json)
// Finds bookings where eventDate + 2 days <= today, sends review request email
// and WhatsApp notification to photographer.

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

async function sendEmail(to, subject, message, fromName) {
  const web3Key = process.env.WEB3FORMS_KEY;
  if (!web3Key) return;
  await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_key: web3Key, to, subject, message, from_name: fromName }),
  });
}

module.exports = async (req, res) => {
  // Vercel cron passes GET requests
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const siteUrl = process.env.SITE_URL || 'https://nizarnaseer.com';
  const photographerEmail = process.env.PHOTOGRAPHER_EMAIL;

  try {
    const ids = await redis('SMEMBERS', 'booking-ids');
    if (!ids || ids.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No bookings found' });
    }

    let sent = 0;
    for (const id of ids) {
      const raw = await redis('GET', `booking:${id}`);
      if (!raw) continue;
      const booking = JSON.parse(raw);
      if (!booking || booking.reviewSent) continue;

      const eventDate = new Date(booking.eventDate);
      eventDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today - eventDate) / (1000 * 60 * 60 * 24));

      if (daysDiff >= 2) {
        const firstName = booking.clientName.split(' ')[0].split('&')[0].trim();
        const reviewUrl = `${siteUrl}/review.html`
          + `?ref=${encodeURIComponent(booking.bookingId)}`
          + `&name=${encodeURIComponent(booking.clientName)}`
          + `&pkg=${encodeURIComponent(booking.packageName)}`;

        // ── Email to CLIENT ──
        const clientMsg =
`Assalamualaikum warahmatullahi wabarakatuh,

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

"Every frame tells a story. Yours is one we will always remember."`;

        await sendEmail(
          booking.clientEmail,
          `📸 How was your ${booking.packageName} experience?`,
          clientMsg,
          'Nizar Naseer Studio'
        );

        // ── Notification to PHOTOGRAPHER ──
        if (photographerEmail) {
          const waMsg =
            `Assalamualaikum ${firstName}! 😊\n\n` +
            `Alhamdulillah, it was truly a blessing to have been part of your ${booking.packageName} session at Nizar Naseer Studio. ` +
            `We are deeply grateful that you chose us to capture your precious moments. 🙏\n\n` +
            `We hope the photos have brought you joy and beautiful memories to cherish. 💛\n\n` +
            `If you have a spare 2 minutes, we would be truly honoured if you could share a little feedback:\n\n` +
            `✨ Leave a review here:\n${reviewUrl}\n\n` +
            `Once again, thank you from the bottom of our hearts. 🌟\n\n` +
            `Warm regards,\nNizar Naseer Studio 📷`;

          const waLink = `https://wa.me/${booking.clientPhone}?text=${encodeURIComponent(waMsg)}`;

          const notifMsg =
`Salam Nizar,

Just a quick heads-up — the system has automatically sent a review request to your client:

👤 Client   : ${booking.clientName}
📦 Session  : ${booking.packageName}
📅 Date     : ${booking.eventDate}
📧 Email    : ${booking.clientEmail}

What was sent:
✅ Email — A warm review request email has been sent to the client.
✅ WhatsApp — Use the link below to send the WhatsApp message with one tap:

${waLink}

No action needed from your side unless you wish to follow up personally.

— Nizar Naseer Studio System`;

          await sendEmail(
            photographerEmail,
            `📋 Review request sent to ${booking.clientName}`,
            notifMsg,
            'Nizar Naseer Studio'
          );
        }

        // Mark as sent
        booking.reviewSent = true;
        booking.reviewSentAt = new Date().toISOString();
        await redis('SET', `booking:${id}`, JSON.stringify(booking));

        console.log(`[review-scheduler] Sent to ${booking.clientEmail}`);
        sent++;
      }
    }

    return res.status(200).json({ sent, message: `Sent ${sent} review request(s)` });
  } catch (err) {
    console.error('[review-scheduler] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
