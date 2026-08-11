// Local JSON-file storage for settings. Kept deliberately tiny: one file,
// one directory, no database.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'resume-tailor-data');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_SETTINGS = { provider: 'openrouter', apiKey: null, model: null, baseUrl: null };

function readSettings() {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_PATH)) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings) {
  ensureDataDir();
  // mode 0o600: readable/writable by the local user only, since this file holds an API key.
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

module.exports = { DATA_DIR, readSettings, writeSettings };
