// api/studio-slots.js — GET (read slots) and POST (book a slot) via Upstash Redis
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // GET — return all booked slots
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    if (!url || !token) return res.status(200).json({ slots: [] });
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['GET', 'studio_slots']),
      });
      const j = await r.json();
      const slots = j.result ? JSON.parse(j.result) : [];
      return res.status(200).json({ slots });
    } catch {
      return res.status(200).json({ slots: [] });
    }
  }

  // POST — book a slot
  if (req.method === 'POST') {
    if (!url || !token) return res.status(500).json({ error: 'Upstash not configured' });
    const { date, time, concept, ref, name } = req.body || {};
    if (!date || !time || !concept) return res.status(400).json({ error: 'Missing date, time or concept' });
    const slotKey = `${date}|${time}|${concept}`;
    try {
      const getRes = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['GET', 'studio_slots']),
      });
      const getJson = await getRes.json();
      const slots = getJson.result ? JSON.parse(getJson.result) : [];
      const taken = slots.find(s => s.key === slotKey);
      if (taken) return res.status(409).json({ error: 'Slot already booked', takenBy: taken.name || 'Another client' });
      slots.push({ key: slotKey, date, time, concept, ref, name, bookedAt: new Date().toISOString() });
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', 'studio_slots', JSON.stringify(slots)]),
      });
      return res.status(200).json({ ok: true, slot: slotKey });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
