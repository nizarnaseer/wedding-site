// api/book-studio-slot.js — atomically checks and books a concept+time+date slot
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(500).json({ error: 'Upstash not configured' });

  const { date, time, concept, ref, name } = req.body || {};
  if (!date || !time || !concept) return res.status(400).json({ error: 'Missing date, time or concept' });

  const slotKey = `${date}|${time}|${concept}`;

  try {
    // Get existing slots
    const getRes = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'studio_slots']),
    });
    const getJson = await getRes.json();
    const slots = getJson.result ? JSON.parse(getJson.result) : [];

    // Check if slot already taken
    const taken = slots.find(s => s.key === slotKey);
    if (taken) {
      return res.status(409).json({
        error: `Slot already booked`,
        takenBy: taken.name || 'Another client',
      });
    }

    // Book it
    slots.push({ key: slotKey, date, time, concept, ref, name, bookedAt: new Date().toISOString() });
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', 'studio_slots', JSON.stringify(slots)]),
    });

    return res.status(200).json({ ok: true, slot: slotKey });
  } catch (err) {
    console.error('book-studio-slot error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
