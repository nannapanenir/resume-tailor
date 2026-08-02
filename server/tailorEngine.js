// Turns (career profile + job description) into a tailoring session using
// the AI provider, then validates the response so the truthfulness rules
// are enforced in code, not just by asking the model nicely.

const { callOpenRouter } = require('./aiProvider');

const SYSTEM_PROMPT = `You are a resume-tailoring engine. You are given a candidate's VERIFIED career profile as JSON and a job description. Produce truthful, evidence-based resume tailoring suggestions.

STRICT RULES (never violate):
- Never invent skills, projects, certifications, achievements, or measurements that are not present in the profile JSON.
- Never propose changing company names, job titles, employment dates, or education/degrees.
- Every "original" field in a change must be copied verbatim (exact text) from the profile: either a bullet's "text" or the summary's "text", identified by targetBulletId ("summary" for the summary).
- Every "evidence" field must cite the specific fact in the profile that justifies the change.
- Do not keyword-stuff. Only add a keyword to a bullet if the underlying work already verifiably involved it per the profile's technologies/skills lists.
- matchBefore and matchAfter are integers 0-100 describing an "Estimated Resume Relevance", not a real ATS score. Be conservative and explainable.
- If there is no truthful way to strengthen a bullet for this job description, return an empty changes array rather than fabricating one.

Respond with ONLY a single JSON object, no markdown code fences, no prose before or after, matching exactly this shape:
{
  "jobTitle": string,
  "matchBefore": number,
  "matchAfter": number,
  "strongMatches": string[],
  "stillMissing": [{"skill": string, "note": string}],
  "changes": [{
    "id": string, "section": string, "company": string, "bulletLabel": string,
    "targetBulletId": string, "original": string, "updated": string,
    "keywordsAdded": string[], "keywordsRemoved": string[], "reason": string, "evidence": string
  }],
  "keywords": [{"keyword": string, "importance": "Required" or "Preferred", "before": number, "after": number, "location": string, "status": "Verified" or "Unverified" or "Not found"}]
}`;

const MODE_INSTRUCTIONS = {
  conservative: 'Conservative mode: propose the fewest possible changes, touching only bullets that map to explicitly REQUIRED job skills already verified in the profile.',
  balanced: 'Balanced mode: strengthen bullets for both required and preferred skills that are verified in the profile.',
  strong: 'Strong Targeting mode: also strengthen the professional summary using verified specialties, in addition to required and preferred skills.',
};

function buildUserPrompt(profile, jobDescriptionText, mode) {
  return `CAREER PROFILE (verified facts only):\n${JSON.stringify(profile)}\n\nJOB DESCRIPTION:\n${jobDescriptionText}\n\nTAILORING MODE: ${mode}. ${MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.balanced}\n\nRespond with only the JSON object described in the system prompt.`;
}

function collectBulletIndex(profile) {
  const index = new Map();
  if (profile.summary) index.set('summary', profile.summary.text);
  (profile.experience || []).forEach((exp) => {
    (exp.bullets || []).forEach((b) => index.set(b.id, b.text));
  });
  return index;
}

function stripCodeFence(text) {
  return text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
}

// This is the enforcement layer: the model is asked nicely to follow the
// truthfulness rules, but every change is re-checked here against the
// actual profile before it's allowed through. A change whose "original"
// doesn't exactly match a real bullet is silently dropped rather than
// trusted.
function validateAndSanitize(raw, profile) {
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch (e) {
    throw new Error('The AI response was not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The AI response was not a JSON object.');
  }

  const bulletIndex = collectBulletIndex(profile);
  const rawChanges = Array.isArray(parsed.changes) ? parsed.changes : [];

  const safeChanges = rawChanges
    .filter((c) => {
      if (!c || typeof c !== 'object') return false;
      if (!c.targetBulletId || !bulletIndex.has(c.targetBulletId)) return false;
      const realOriginal = bulletIndex.get(c.targetBulletId);
      if (typeof c.original !== 'string' || c.original.trim() !== realOriginal.trim()) return false;
      if (typeof c.updated !== 'string' || !c.updated.trim()) return false;
      return true;
    })
    .map((c, i) => ({
      id: typeof c.id === 'string' && c.id ? c.id : `ai-${i}-${c.targetBulletId}`,
      section: typeof c.section === 'string' ? c.section : 'Experience',
      company: typeof c.company === 'string' ? c.company : '',
      bulletLabel: typeof c.bulletLabel === 'string' ? c.bulletLabel : '',
      targetBulletId: c.targetBulletId,
      original: c.original,
      updated: c.updated,
      keywordsAdded: Array.isArray(c.keywordsAdded) ? c.keywordsAdded.filter((k) => typeof k === 'string') : [],
      keywordsRemoved: Array.isArray(c.keywordsRemoved) ? c.keywordsRemoved.filter((k) => typeof k === 'string') : [],
      reason: typeof c.reason === 'string' ? c.reason : '',
      evidence: typeof c.evidence === 'string' ? c.evidence : '',
      status: 'pending',
    }));

  const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

  return {
    jobTitle: typeof parsed.jobTitle === 'string' && parsed.jobTitle ? parsed.jobTitle : 'Untitled Role',
    matchBefore: clampPct(parsed.matchBefore),
    matchAfter: clampPct(parsed.matchAfter),
    strongMatches: Array.isArray(parsed.strongMatches) ? parsed.strongMatches.filter((s) => typeof s === 'string') : [],
    stillMissing: Array.isArray(parsed.stillMissing)
      ? parsed.stillMissing.filter((g) => g && typeof g.skill === 'string').map((g) => ({ skill: g.skill, note: typeof g.note === 'string' ? g.note : '' }))
      : [],
    changes: safeChanges,
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k) => k && typeof k.keyword === 'string').map((k) => ({
          keyword: k.keyword,
          importance: k.importance === 'Preferred' ? 'Preferred' : 'Required',
          before: Number.isFinite(Number(k.before)) ? Number(k.before) : 0,
          after: Number.isFinite(Number(k.after)) ? Number(k.after) : 0,
          location: typeof k.location === 'string' ? k.location : 'Not added',
          status: ['Verified', 'Unverified', 'Not found'].includes(k.status) ? k.status : 'Not found',
        }))
      : [],
    source: 'ai',
  };
}

async function tailorWithAI({ apiKey, model, profile, jobDescriptionText, mode }) {
  const content = await callOpenRouter({
    apiKey,
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(profile, jobDescriptionText, mode) },
    ],
  });
  return validateAndSanitize(content, profile);
}

module.exports = { tailorWithAI };
