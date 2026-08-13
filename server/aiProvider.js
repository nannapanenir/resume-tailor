// Chat-completion client supporting two providers:
//  - 'openrouter': the cloud OpenRouter API (needs an API key).
//  - 'local': any OpenAI-compatible local server (Ollama, LM Studio,
//    llama.cpp, vLLM, ...) reachable at a user-supplied base URL — no key
//    needed, no data ever leaves the machine.
// Uses Node's built-in http/https modules rather than global fetch so it
// works on older Node versions too.

const https = require('https');
const http = require('http');

function buildRequest({ provider, apiKey, baseUrl, body, maxMs }) {
  if (provider === 'local') {
    const url = new URL(baseUrl.replace(/\/+$/, '') + '/chat/completions');
    return {
      module: url.protocol === 'https:' ? https : http,
      options: {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        timeout: maxMs,
      },
    };
  }
  return {
    module: https,
    options: {
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
      timeout: maxMs,
    },
  };
}

function callChatCompletion({ provider = 'openrouter', apiKey, baseUrl, model, messages, temperature = 0.1, maxMs = 60000 }) {
  return new Promise((resolve, reject) => {
    if (provider === 'local' && !baseUrl) {
      return reject(new Error('No local server URL configured. Add one in Settings.'));
    }

    const label = provider === 'local' ? 'Local server' : 'OpenRouter';

    // The `reasoning` controls are an OpenRouter-specific extension —
    // local OpenAI-compatible servers generally don't know about it.
    const body = JSON.stringify({
      model,
      messages,
      temperature,
      ...(provider === 'local' ? {} : { reasoning: { effort: 'low', exclude: true } }),
    });

    const { module: httpModule, options } = buildRequest({ provider, apiKey, baseUrl, body, maxMs });

    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let message = data.slice(0, 300);
          try { message = JSON.parse(data).error?.message || message; } catch {}
          return reject(new Error(`${label} error (${res.statusCode}): ${message}`));
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content;
          if (!content) return reject(new Error(`${label} returned an empty response — the model may be overloaded or unavailable right now. Try again, or switch models in Settings.`));
          resolve(content);
        } catch (e) {
          reject(new Error(`Failed to parse ${label} response: ` + e.message));
        }
      });
    });

    // Node's socket `timeout` only fires on INACTIVITY, not on total
    // request duration — a slow model that trickles bytes can dodge it
    // for minutes. The explicit deadline below is what actually caps how
    // long a single request can run.
    const deadline = setTimeout(() => {
      req.destroy(new Error(`${label} did not respond within ${Math.round(maxMs / 1000)}s. This model may be too slow/overloaded — try again, or switch models in Settings.`));
    }, maxMs);

    req.on('timeout', () => req.destroy(new Error(`${label} connection went idle and timed out.`)));
    req.on('error', (e) => {
      if (provider === 'local' && e.code === 'ECONNREFUSED') {
        return reject(new Error(`Couldn't reach the local server at ${baseUrl}. Make sure it's running (e.g. your Docker/Podman container) and the URL/port in Settings is correct.`));
      }
      reject(e);
    });
    req.on('close', () => clearTimeout(deadline));
    req.write(body);
    req.end();
  });
}

// Free/local models are prone to transient failures under load (slow
// timeouts, connection resets, empty responses) that often succeed on a
// quick retry. Failing fast per attempt and retrying beats waiting minutes
// on a single attempt that may not pan out anyway. Genuine client errors
// (bad request, bad/expired key) are not retried since retrying identical
// input won't change the outcome.
function isRetryable(error) {
  const match = /error \((\d+)\)/.exec(error.message);
  if (match) {
    const status = Number(match[1]);
    return status === 429 || status >= 500; // rate-limited or server-side — retry; 4xx client errors — don't
  }
  return true; // timeouts, ECONNRESET, ECONNREFUSED, empty content, parse failures, etc.
}

async function callChatCompletionWithRetry(opts, { attempts = 3, perAttemptMs = 45000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await callChatCompletion({ ...opts, maxMs: perAttemptMs });
    } catch (e) {
      lastError = e;
      console.log(`[aiProvider] Attempt ${attempt}/${attempts} failed: ${e.message}`);
      if (!isRetryable(e) || attempt === attempts) throw e;
    }
  }
  throw lastError;
}

module.exports = { callChatCompletion, callChatCompletionWithRetry };
