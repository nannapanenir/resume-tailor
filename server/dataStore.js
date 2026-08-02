// Local JSON-file storage for settings. Kept deliberately tiny: one file,
// one directory, no database.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'resume-tailor-data');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readSettings() {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_PATH)) return { apiKey: null, model: null };
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return { apiKey: null, model: null };
  }
}

function writeSettings(settings) {
  ensureDataDir();
  // mode 0o600: readable/writable by the local user only, since this file holds an API key.
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

module.exports = { DATA_DIR, readSettings, writeSettings };
