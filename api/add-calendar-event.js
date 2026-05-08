// api/add-calendar-event.js
// Auto-adds booking events to Google Calendar using a Service Account
// No OAuth, no user interaction — fully automatic
//
// SETUP (one-time, ~5 minutes):
//   1. Go to console.cloud.google.com → IAM & Admin → Service Accounts
//   2. Create Service Account → Download JSON key
//   3. Copy the JSON content → add as GOOGLE_SA_JSON in Vercel Environment Variables
//   4. Copy the service account email (e.g. name@project.iam.gserviceaccount.com)
//   5. Open Google Calendar → Settings → Share with specific people
//      → paste the service account email → give "Make changes to events" permission
//   6. Add GOOGLE_CALENDAR_ID to Vercel env vars (usually your Gmail, e.g. muhd.nizar1999@gmail.com)

const crypto = require('crypto');

function b64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getGoogleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + payload);
  const sig = sign.sign(sa.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${header}.${payload}.${sig}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Token error: ' + JSON.stringify(j));
  return j.access_token;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const saJson   = process.env.GOOGLE_SA_JSON;
  const calId    = process.env.GOOGLE_CALENDAR_ID;
  if (!saJson || !calId) {
    return res.status(200).json({ ok: false, reason: 'GOOGLE_SA_JSON or GOOGLE_CALENDAR_ID not set — calendar skipped' });
  }

  const { title, date, startTime, endTime, description, location, ref } = req.body || {};
  if (!title || !date) return res.status(400).json({ error: 'Missing title or date' });

  try {
    const sa    = JSON.parse(saJson);
    const token = await getGoogleToken(sa);

    // Build event dates — use timed event if startTime provided, otherwise all-day
    let start, end;
    if (startTime) {
      // startTime format: "06:30" or "9:00 AM"
      const parseTime = (t) => {
        t = t.trim();
        const ampm = /([ap]m)/i.exec(t);
        const parts = t.replace(/[apm\s]/gi, '').split(':');
        let h = parseInt(parts[0]), m = parseInt(parts[1] || '0');
        if (ampm) {
          if (/pm/i.test(ampm[1]) && h !== 12) h += 12;
          if (/am/i.test(ampm[1]) && h === 12) h = 0;
        }
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
      };
      const tz = 'Asia/Kuala_Lumpur';
      start = { dateTime: `${date}T${parseTime(startTime)}`, timeZone: tz };
      // End: use endTime if given, else start + 8h (full day shoot)
      const endT = endTime ? parseTime(endTime) : (() => {
        const [h, m] = parseTime(startTime).split(':').map(Number);
        return `${String(h + 8 > 23 ? 23 : h + 8).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
      })();
      end = { dateTime: `${date}T${endT}`, timeZone: tz };
    } else {
      // All-day event
      const nextDay = new Date(date + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      start = { date };
      end   = { date: nextDay.toISOString().split('T')[0] };
    }

    const event = {
      summary:     title,
      description: description || '',
      location:    location || '',
      start,
      end,
      colorId:     '5', // banana yellow
    };

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    );
    const calJ = await calRes.json();
    if (calRes.ok) {
      return res.status(200).json({ ok: true, eventId: calJ.id, link: calJ.htmlLink });
    }
    return res.status(calRes.status).json({ error: calJ.error?.message || 'Calendar error', detail: calJ });
  } catch (err) {
    console.error('add-calendar-event error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
