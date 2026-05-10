// api/payment-reminders.js — Vercel Cron Function
// Runs daily at 9:00 AM MYT (1:00 AM UTC)
// Sends payment reminders 7 days & 1 day before event, cancellation if unpaid on event day.

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

async function sendEmail(to, subject, message) {
  const web3Key = process.env.WEB3FORMS_KEY;
  if (!web3Key) return;
  await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: web3Key,
      to, subject, message,
      from_name: 'Nizar Naseer Studio',
    }),
  });
}

module.exports = async (req, res) => {
  const siteUrl           = process.env.SITE_URL || 'https://weddingclicks.us';
  const photographerEmail = process.env.PHOTOGRAPHER_EMAIL || 'muhd.nizar1999@gmail.com';
  const photographerPhone = process.env.PHOTOGRAPHER_PHONE || '601118736810';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const ids = await redis('SMEMBERS', 'booking-ids');
    if (!ids || ids.length === 0) return res.status(200).json({ sent: 0 });

    let sent = 0;
    const log = [];

    for (const id of ids) {
      const raw = await redis('GET', `booking:${id}`);
      if (!raw) continue;
      const b = JSON.parse(raw);

      // Skip already fully paid or cancelled bookings
      if (b.paymentStatus === 'full_paid' || b.paymentStatus === 'cancelled') continue;

      // Parse event date
      const evtDate = new Date(b.eventDate);
      evtDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.round((evtDate - today) / (1000 * 60 * 60 * 24));

      const firstName  = (b.couple || b.clientName || '').split(' ')[0].split('&')[0].trim() || 'Client';
      const displayName = b.couple || b.clientName || 'Client';
      const balance    = b.balance || (b.totalAmount - b.depositAmount) || 0;
      const balanceStr = `RM ${balance.toLocaleString()}`;
      const receiptUrl = `${siteUrl}/invoice.html?type=receipt&ref=${b.bookingId}&couple=${encodeURIComponent(b.couple||b.clientName)}&name=${encodeURIComponent(b.clientName)}&email=${encodeURIComponent(b.clientEmail)}&phone=${encodeURIComponent(b.clientPhone)}&pkg=${encodeURIComponent(b.packageName)}&total=${b.totalAmount}&date=${encodeURIComponent(b.eventDate)}&location=${encodeURIComponent(b.location||'')}`;

      // ── 7 DAYS BEFORE: Full payment request ──────────────────────────────
      if (daysUntil === 7 && !b.reminder7Sent) {
        const subject7 = `⏰ Balance Payment Due — ${b.packageName} (${b.bookingId})`;
        const msg7 =
`Assalamualaikum ${firstName},

We hope you are well and excited for your upcoming event! 🌟

This is a gentle reminder that your balance payment for your Nizar Naseer Studio booking is due.

📋 Booking Reference : ${b.bookingId}
📦 Package           : ${b.packageName}
📅 Event Date        : ${b.eventDate}
📍 Location          : ${b.location || 'As discussed'}
💰 Balance Due       : ${balanceStr}

Your event is in 7 days — please complete your full payment to secure your booking.

To pay, please transfer to:
Bank    : ${process.env.BANK_NAME || 'Maybank'}
Account : ${process.env.BANK_ACCOUNT || 'Please contact us'}
Name    : Nizar Naseer

After payment, kindly send proof of payment via WhatsApp to +${photographerPhone}.

If you have any questions, please don't hesitate to reach out.

Thank you for choosing Nizar Naseer Studio. We look forward to capturing your special day! 📷

Warm regards,
Nizar Naseer
weddingclicks.us`;

        await sendEmail(b.clientEmail, subject7, msg7);

        // Notify photographer with WA deep-link
        const waMsg7 =
          `⏰ *Balance Payment Reminder Sent*\n━━━━━━━━━━━━━━\n` +
          `👤 Client : ${displayName}\n📦 Package: ${b.packageName}\n📅 Event  : ${b.eventDate}\n💰 Balance: ${balanceStr}\n\n` +
          `✉️ Email reminder auto-sent to ${b.clientEmail}\n\n` +
          `Tap to also send via WA:\nhttps://wa.me/${b.clientPhone}?text=${encodeURIComponent(`Assalamualaikum ${firstName}! 🌟 Gentle reminder — your balance payment of ${balanceStr} for your ${b.packageName} on ${b.eventDate} is due in 7 days. Please transfer and send proof to this number. Thank you! 🙏 — Nizar Naseer Studio`)}`;

        await sendEmail(photographerEmail, `⏰ [7 DAYS] Balance reminder sent — ${displayName}`, waMsg7);

        b.reminder7Sent = true;
        await redis('SET', `booking:${id}`, JSON.stringify(b));
        log.push(`7-day reminder → ${b.clientEmail}`);
        sent++;
      }

      // ── 1 DAY BEFORE: Last chance ────────────────────────────────────────
      else if (daysUntil === 1 && !b.reminder1Sent) {
        const subject1 = `🚨 LAST CHANCE — Balance Payment Due Tomorrow (${b.bookingId})`;
        const msg1 =
`Assalamualaikum ${firstName},

⚠️ This is your FINAL reminder — your event is TOMORROW and your balance payment has not been received.

📋 Booking Reference : ${b.bookingId}
📦 Package           : ${b.packageName}
📅 Event Date        : ${b.eventDate} (TOMORROW)
💰 Balance Due       : ${balanceStr}

Please complete your payment IMMEDIATELY to avoid cancellation of your booking.

Bank    : ${process.env.BANK_NAME || 'Maybank'}
Account : ${process.env.BANK_ACCOUNT || 'Please contact us'}
Name    : Nizar Naseer

After payment, please send proof via WhatsApp to +${photographerPhone} urgently.

Failure to complete payment by tonight may result in your booking being cancelled.

Thank you,
Nizar Naseer Studio
weddingclicks.us`;

        await sendEmail(b.clientEmail, subject1, msg1);

        const waMsg1 =
          `🚨 *LAST CHANCE — Tomorrow's Event*\n━━━━━━━━━━━━━━\n` +
          `👤 Client : ${displayName}\n📦 Package: ${b.packageName}\n📅 Event  : ${b.eventDate} (TOMORROW)\n💰 Balance: ${balanceStr}\n\n` +
          `✉️ Last-chance email sent to ${b.clientEmail}\n\n` +
          `Send WA now:\nhttps://wa.me/${b.clientPhone}?text=${encodeURIComponent(`🚨 Assalamualaikum ${firstName}! URGENT — your event is TOMORROW and your balance of ${balanceStr} has not been received. Please transfer immediately and send proof to this number. Failure to pay may result in cancellation. — Nizar Naseer Studio`)}`;

        await sendEmail(photographerEmail, `🚨 [1 DAY] Last chance — ${displayName}`, waMsg1);

        b.reminder1Sent = true;
        await redis('SET', `booking:${id}`, JSON.stringify(b));
        log.push(`1-day reminder → ${b.clientEmail}`);
        sent++;
      }

      // ── EVENT DAY (daysUntil === 0): Cancel if unpaid ────────────────────
      else if (daysUntil === 0 && !b.cancelSent) {
        const subjectC = `❌ Booking Cancelled — Unpaid Balance (${b.bookingId})`;
        const msgC =
`Assalamualaikum ${firstName},

We regret to inform you that your booking with Nizar Naseer Studio has been CANCELLED due to non-payment of the balance amount.

📋 Booking Reference : ${b.bookingId}
📦 Package           : ${b.packageName}
📅 Event Date        : ${b.eventDate}
💰 Outstanding       : ${balanceStr}

Despite our reminders, the balance payment was not received. As a result, we are unable to proceed with your booking.

We are sorry for any inconvenience this may cause. If you believe this is an error or would like to discuss, please contact us immediately via WhatsApp at +${photographerPhone}.

Nizar Naseer Studio
weddingclicks.us`;

        await sendEmail(b.clientEmail, subjectC, msgC);

        const waMsgC =
          `❌ *BOOKING CANCELLED — Unpaid*\n━━━━━━━━━━━━━━\n` +
          `👤 Client : ${displayName}\n📦 Package: ${b.packageName}\n📅 Event  : ${b.eventDate} (TODAY)\n💰 Balance: ${balanceStr}\n\n` +
          `Cancellation email sent to ${b.clientEmail}.\n\n` +
          `If paid manually, mark as paid:\n${siteUrl}/api/store-booking?ref=${b.bookingId}&action=full_paid\n\n` +
          `WA client:\nhttps://wa.me/${b.clientPhone}?text=${encodeURIComponent(`Assalamualaikum ${firstName}, unfortunately your booking (${b.bookingId}) has been cancelled due to non-payment of the balance ${balanceStr}. Please contact us if you have any questions. — Nizar Naseer Studio`)}`;

        await sendEmail(photographerEmail, `❌ [CANCELLED] ${displayName} — unpaid balance`, waMsgC);

        b.cancelSent    = true;
        b.paymentStatus = 'cancelled';
        await redis('SET', `booking:${id}`, JSON.stringify(b));
        log.push(`Cancellation → ${b.clientEmail}`);
        sent++;
      }
    }

    return res.status(200).json({ sent, log });
  } catch (err) {
    console.error('[payment-reminders] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
