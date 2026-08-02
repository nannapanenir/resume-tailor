// Talks to this app's own local server (never directly to OpenRouter —
// the API key never reaches the browser).

const AIClient = (() => {
  let statusCache = null;

  async function getStatus(force = false) {
    if (statusCache && !force) return statusCache;
    try {
      const res = await fetch('/api/settings');
      statusCache = await res.json();
    } catch (e) {
      statusCache = { configured: false, model: null };
    }
    return statusCache;
  }

  async function saveSettings(apiKey, model) {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save settings.');
    statusCache = data;
    return data;
  }

  async function clearSettings() {
    const res = await fetch('/api/settings', { method: 'DELETE' });
    statusCache = await res.json();
    return statusCache;
  }

  async function tailor(careerProfile, jobDescriptionText, mode) {
    const res = await fetch('/api/tailor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ careerProfile, jobDescriptionText, mode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI tailoring failed.');
    return data;
  }

  async function parseResume(filename, fileBase64) {
    const res = await fetch('/api/parse-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, fileBase64 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Resume parsing failed.');
    return data.profile;
  }

  async function generateResume(profile, format = 'docx') {
    const res = await fetch('/api/generate-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, format }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Resume generation failed.');
    }
    return res.blob();
  }

  return { getStatus, saveSettings, clearSettings, tailor, parseResume, generateResume };
})();
