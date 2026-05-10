// api/notify-shooter.js
// Sends a clean custom email to the assigned shooter via Resend API (no boilerplate text)
// Requires: RESEND_API_KEY in Vercel environment variables

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ error: 'RESEND_API_KEY not set in Vercel environment variables' });

  const { to, ref, clientName, phone, clientEmail, date, pkg, location, notes, mapsUrl } = req.body || {};
  if (!to || !ref) return res.status(400).json({ error: 'Missing required fields: to, ref' });

  const waLink = phone ? 'https://wa.me/60' + phone.replace(/^0/, '') : null;
  const locSection = location && location !== 'Not provided'
    ? `<tr><td style="padding:10px 20px;border-top:1px solid #f0f0f0;">
         <p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Location</p>
         <p style="margin:0;font-size:14px;color:#333;">${location}</p>
         ${mapsUrl ? `<a href="${mapsUrl}" style="display:inline-block;margin-top:8px;background:#4285F4;color:#fff;padding:6px 14px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold;">🗺️ Open Google Maps</a>` : ''}
       </td></tr>` : '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shooting Assignment</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f4f4" style="padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:96%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td bgcolor="#0a0a0b" style="padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#c9a96e;">📷 Shooting Assignment</p>
    <p style="margin:0;font-size:22px;font-weight:bold;color:#fff;font-family:Georgia,serif;">Nizar Naseer Studio</p>
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">Ref: ${ref}</p>
  </td></tr>

  <!-- Intro -->
  <tr><td style="padding:24px 32px 0;">
    <p style="margin:0;font-size:15px;color:#333;line-height:1.7;">
      Hi, <strong>you have been assigned a shooting job by Nizar Naseer Studio.</strong>
      Please review the details below and reply to confirm your availability.
    </p>
  </td></tr>

  <!-- Client block -->
  <tr><td style="padding:20px 32px 0;">
    <p style="margin:0 0 10px;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#999;">Client Information</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;border:1px solid #ececec;">
      <tr>
        <td style="padding:16px 20px;border-right:1px solid #ececec;width:50%;vertical-align:top;">
          <p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Client</p>
          <p style="margin:0;font-size:17px;font-weight:bold;color:#111;">${clientName || '—'}</p>
          ${clientEmail ? `<p style="margin:4px 0 0;font-size:12px;color:#666;">${clientEmail}</p>` : ''}
        </td>
        <td style="padding:16px 20px;vertical-align:top;">
          <p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">WhatsApp</p>
          ${waLink
            ? `<a href="${waLink}" style="font-size:18px;font-weight:bold;color:#25d366;text-decoration:none;">📲 ${phone}</a>
               <p style="margin:4px 0 0;font-size:11px;color:#999;">Tap to open WhatsApp</p>`
            : `<p style="margin:0;font-size:14px;color:#999;">Not provided</p>`}
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Job block -->
  <tr><td style="padding:20px 32px 0;">
    <p style="margin:0 0 10px;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#999;">Job Details</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;border:1px solid #ececec;">
      <tr>
        <td style="padding:14px 20px;border-right:1px solid #ececec;vertical-align:top;width:50%;">
          <p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Package</p>
          <p style="margin:0;font-size:14px;font-weight:bold;color:#111;">${pkg || '—'}</p>
        </td>
        <td style="padding:14px 20px;vertical-align:top;">
          <p style="margin:0 0 2px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Date &amp; Time</p>
          <p style="margin:0;font-size:14px;font-weight:bold;color:#c9a96e;">${date || '—'}</p>
        </td>
      </tr>
      ${locSection}
    </table>
  </td></tr>

  <!-- Notes -->
  ${notes && notes !== 'None' ? `
  <tr><td style="padding:16px 32px 0;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#999;">Notes</p>
    <p style="margin:0;padding:12px 16px;background:#fffbf0;border:1px solid #f0e0b0;border-radius:6px;font-size:13px;color:#555;line-height:1.6;">${notes}</p>
  </td></tr>` : ''}

  <!-- Reply CTA -->
  <tr><td style="padding:24px 32px;">
    <div style="background:#f0f7f0;border:1px solid #b7ddb7;border-radius:8px;padding:18px;text-align:center;">
      <p style="margin:0 0 4px;font-size:14px;color:#333;">Please <strong>reply to this email</strong> to confirm availability.</p>
      <p style="margin:6px 0 0;font-size:12px;color:#888;">Ref: ${ref} · Nizar Naseer Studio</p>
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
      from: 'Nizar Naseer Studio <studio@weddingclicks.us>',
        to: [to],
        subject: '[Assignment] ' + (pkg || '') + ' — ' + (date || '').replace(/[\n\r]+/g, ' | ') + ' (' + ref + ')',
        html,
      }),
    });
    const j = await r.json();
    if (r.ok) return res.status(200).json({ ok: true, id: j.id });
    return res.status(r.status).json({ error: j.message || 'Resend error', detail: j });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
