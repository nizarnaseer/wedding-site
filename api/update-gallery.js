// api/update-gallery.js
// Commits gallery.json to GitHub using server-side token (never exposed to browser)
// Set GITHUB_TOKEN and GITHUB_REPO in Vercel environment variables

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO || 'nizarnaseer/wedding-site';

  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not set in Vercel env vars' });

  const { albums } = req.body || {};
  if (!albums) return res.status(400).json({ error: 'Missing albums data' });

  try {
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };

    // Get current file SHA
    const fileRes = await fetch(`https://api.github.com/repos/${repo}/contents/gallery.json`, { headers });
    const fileData = fileRes.ok ? await fileRes.json() : null;
    const sha = fileData?.sha;

    // Commit updated gallery.json
    const content = Buffer.from(JSON.stringify({ albums }, null, 2)).toString('base64');
    const body = { message: 'update gallery photos', content, ...(sha ? { sha } : {}) };

    const commitRes = await fetch(`https://api.github.com/repos/${repo}/contents/gallery.json`, {
      method: 'PUT', headers, body: JSON.stringify(body),
    });

    if (commitRes.ok) {
      return res.status(200).json({ ok: true, message: 'Gallery updated — deploying in ~30s' });
    }
    const err = await commitRes.json();
    throw new Error(err.message || 'GitHub commit failed');
  } catch (err) {
    console.error('update-gallery error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
