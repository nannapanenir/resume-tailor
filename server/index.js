// Local server for Resume Tailor: serves the static UI and a small JSON
// API for settings + AI-driven tailoring. Kept dependency-free (Node
// built-ins only).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { readSettings, writeSettings } = require('./dataStore');
const { tailorWithAI } = require('./tailorEngine');
const { extractResumeText } = require('./resumeParser');
const { extractProfileFromResumeText } = require('./profileExtractor');
const { buildResumeDocx } = require('./docxGenerator');
const { buildResumePdf } = require('./pdfGenerator');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PREFERRED_PORT = 4173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function safeJoin(base, requestPath) {
  const resolved = path.normalize(path.join(base, requestPath));
  if (!resolved.startsWith(base)) return null; // block path traversal
  return resolved;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const requestPath = urlPath === '/' ? '/index.html' : urlPath;

  const filePath = safeJoin(PUBLIC_DIR, requestPath);
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      serveFile(res, filePath);
    } else {
      // SPA-style fallback for unknown routes.
      serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, urlPath) {
  // GET /api/settings -> never returns the raw key, only whether one is set.
  if (urlPath === '/api/settings' && req.method === 'GET') {
    const settings = readSettings();
    sendJson(res, 200, { configured: Boolean(settings.apiKey), model: settings.model || null });
    return true;
  }

  if (urlPath === '/api/settings' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      if (!apiKey || !model) {
        sendJson(res, 400, { error: 'Both an API key and a model name are required.' });
        return true;
      }
      writeSettings({ apiKey, model });
      sendJson(res, 200, { configured: true, model });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return true;
  }

  if (urlPath === '/api/settings' && req.method === 'DELETE') {
    writeSettings({ apiKey: null, model: null });
    sendJson(res, 200, { configured: false, model: null });
    return true;
  }

  if (urlPath === '/api/parse-resume' && req.method === 'POST') {
    try {
      const settings = readSettings();
      if (!settings.apiKey) {
        sendJson(res, 400, { error: 'AI provider is not configured yet. Add an OpenRouter API key in Settings.' });
        return true;
      }
      // Base64 inflates size by ~33%, so allow headroom over the 10 MB client-side file limit.
      const body = await readJsonBody(req, 15 * 1024 * 1024);
      const filename = typeof body.filename === 'string' ? body.filename : '';
      const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';
      if (!filename || !fileBase64) {
        sendJson(res, 400, { error: 'filename and fileBase64 are required.' });
        return true;
      }
      const buffer = Buffer.from(fileBase64, 'base64');
      const resumeText = await extractResumeText(buffer, filename);
      if (!resumeText || !resumeText.trim()) {
        sendJson(res, 400, { error: 'Could not extract any text from this file. If it is a scanned/image-based PDF, try a text-based PDF or DOCX instead.' });
        return true;
      }
      const profile = await extractProfileFromResumeText({ apiKey: settings.apiKey, model: settings.model, resumeText });
      sendJson(res, 200, { profile });
    } catch (e) {
      sendJson(res, 502, { error: e.message || 'Resume parsing failed.' });
    }
    return true;
  }

  if (urlPath === '/api/generate-resume' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 5 * 1024 * 1024);
      if (!body.profile || typeof body.profile !== 'object') {
        sendJson(res, 400, { error: 'profile is required.' });
        return true;
      }
      const format = body.format === 'pdf' ? 'pdf' : 'docx';
      if (format === 'pdf') {
        const buffer = await buildResumePdf(body.profile);
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="tailored-resume.pdf"',
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      } else {
        const buffer = await buildResumeDocx(body.profile);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="tailored-resume.docx"',
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      }
    } catch (e) {
      sendJson(res, 500, { error: e.message || 'Resume generation failed.' });
    }
    return true;
  }

  if (urlPath === '/api/tailor' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const settings = readSettings();
      if (!settings.apiKey) {
        sendJson(res, 400, { error: 'AI provider is not configured yet. Add an OpenRouter API key in Settings.' });
        return true;
      }
      if (!body.careerProfile || typeof body.jobDescriptionText !== 'string' || !body.jobDescriptionText.trim()) {
        sendJson(res, 400, { error: 'careerProfile and jobDescriptionText are required.' });
        return true;
      }
      const mode = ['conservative', 'balanced', 'strong'].includes(body.mode) ? body.mode : 'balanced';
      const result = await tailorWithAI({
        apiKey: settings.apiKey,
        model: settings.model,
        profile: body.careerProfile,
        jobDescriptionText: body.jobDescriptionText,
        mode,
      });
      result.jobDescriptionText = body.jobDescriptionText;
      sendJson(res, 200, result);
    } catch (e) {
      sendJson(res, 502, { error: e.message || 'AI tailoring failed.' });
    }
    return true;
  }

  return false;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath.startsWith('/api/')) {
    handleApi(req, res, urlPath).then((handled) => {
      if (!handled) sendJson(res, 404, { error: 'Not found' });
    }).catch((e) => {
      sendJson(res, 500, { error: e.message || 'Internal error' });
    });
    return;
  }

  serveStatic(req, res);
});

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? `open "${url}"`
    : platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log(`Could not auto-open a browser. Please open ${url} manually.`);
    }
  });
}

function start(port) {
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`Resume Tailor is running at ${url}`);
    openBrowser(url);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PREFERRED_PORT} is in use, picking an available port...`);
    start(0); // let the OS choose a free port
  } else {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
});

start(PREFERRED_PORT);
