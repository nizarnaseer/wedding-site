// api/create-bill.js — Vercel Serverless Function
// Proxies ToyyibPay createBill API (avoids CORS issues from browser)

const https = require('https');
const querystring = require('querystring');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const params = req.body;
  if (!params) return res.status(400).json({ error: 'Invalid JSON body' });

  const postData = querystring.stringify(params);

  return new Promise((resolve) => {
    const options = {
      hostname: 'toyyibpay.com',
      path: '/index.php/api/createBill',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const request = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => { data += chunk; });
      apiRes.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(data);
        resolve();
      });
    });

    request.on('error', (err) => {
      res.status(500).json({ error: err.message });
      resolve();
    });

    request.write(postData);
    request.end();
  });
};
