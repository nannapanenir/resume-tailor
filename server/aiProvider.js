// Thin OpenRouter client. Uses Node's built-in `https` module rather than
// global fetch so it works on older Node versions too (fetch is only
// built-in/stable from Node 18+). This is the only file that talks to the
// network on behalf of the AI provider — swap it out to support a
// different provider later.

const https = require('https');

function callOpenRouter({ apiKey, model, messages, temperature = 0.3 }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages, temperature });

    const req = https.request(
      {
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'Resume Tailor',
        },
        timeout: 45000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            let message = data.slice(0, 300);
            try { message = JSON.parse(data).error?.message || message; } catch {}
            return reject(new Error(`OpenRouter error (${res.statusCode}): ${message}`));
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.message?.content;
            if (!content) return reject(new Error('OpenRouter response had no message content.'));
            resolve(content);
          } catch (e) {
            reject(new Error('Failed to parse OpenRouter response: ' + e.message));
          }
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('OpenRouter request timed out.')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { callOpenRouter };
