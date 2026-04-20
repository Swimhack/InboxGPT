const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = 9876;
const SECRET = process.env.WEBHOOK_SECRET || 'inboxgpt-deploy-secret';
const DEPLOY_SCRIPT = '/home/james/InboxGPT/deploy.sh';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    // Verify GitHub signature
    const sig = req.headers['x-hub-signature-256'];
    if (sig) {
      const hmac = crypto.createHmac('sha256', SECRET);
      hmac.update(body);
      const expected = 'sha256=' + hmac.digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        console.log('Invalid signature');
        res.writeHead(403);
        res.end('Invalid signature');
        return;
      }
    }

    // Only deploy on push to main
    let payload;
    try { payload = JSON.parse(body); } catch { payload = {}; }
    if (payload.ref && payload.ref !== 'refs/heads/main') {
      res.writeHead(200);
      res.end('Skipped: not main branch');
      return;
    }

    console.log(`Deploy triggered at ${new Date().toISOString()}`);
    res.writeHead(200);
    res.end('Deploy started');

    // Run deploy script async
    execFile('bash', [DEPLOY_SCRIPT], (err, stdout, stderr) => {
      if (err) console.error('Deploy failed:', stderr);
      else console.log('Deploy complete');
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Webhook server listening on 127.0.0.1:${PORT}`);
});
