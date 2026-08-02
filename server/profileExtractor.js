// Turns raw resume text into a structured career profile using the AI
// provider, then validates/sanitizes the response so nothing beyond what
// the model returned (and only well-formed fields) reaches the client.
// Truthfulness here relies on the source text itself, since there is no
// prior verified profile to check claims against yet.

const { callOpenRouter } = require('./aiProvider');

const SYSTEM_PROMPT = `You are a resume-parsing engine. You are given the raw extracted text of a candidate's resume. Extract ONLY information that is explicitly present in the text into a structured JSON career profile.

STRICT RULES (never violate):
- Never invent employers, job titles, dates, degrees, certifications, skills, or accomplishments that are not explicitly stated in the text.
- If a field is not present in the text, leave it as an empty string or empty array rather than guessing.
- Do not paraphrase or embellish bullet points; copy them close to verbatim, only cleaning up obvious extraction artifacts (stray line breaks, bullet characters).
- List each distinct technology/skill mentioned for a role in that role's "technologies" array, and also once in the top-level "skills" array.

Respond with ONLY a single JSON object, no markdown code fences, no prose before or after, matching exactly this shape:
{
  "personalInformation": {"fullName": string, "email": string, "phone": string, "location": string, "linkedIn": string, "portfolio": string},
  "summary": {"text": string},
  "skills": [{"name": string}],
  "experience": [{"company": string, "title": string, "startDate": string, "endDate": string, "location": string, "technologies": string[], "bullets": [{"text": string}]}],
  "education": [{"degree": string, "institution": string, "endDate": string}],
  "certifications": [{"name": string, "issuer": string, "year": string}]
}`;

function buildUserPrompt(resumeText) {
  return `RESUME TEXT (raw extracted, may contain formatting artifacts):\n${resumeText}\n\nRespond with only the JSON object described in the system prompt.`;
}

function stripCodeFence(text) {
  return text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeProfile(raw) {
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch (e) {
    throw new Error('The AI response was not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The AI response was not a JSON object.');
  }

  const personal = parsed.personalInformation || {};
  const experience = Array.isArray(parsed.experience) ? parsed.experience : [];
  const education = Array.isArray(parsed.education) ? parsed.education : [];
  const certifications = Array.isArray(parsed.certifications) ? parsed.certifications : [];
  const skills = Array.isArray(parsed.skills) ? parsed.skills : [];

  return {
    personalInformation: {
      fullName: str(personal.fullName),
      email: str(personal.email),
      phone: str(personal.phone),
      location: str(personal.location),
      linkedIn: str(personal.linkedIn),
      portfolio: str(personal.portfolio),
    },
    summary: { text: str(parsed.summary && parsed.summary.text), status: 'extracted' },
    skills: skills.filter((s) => s && str(s.name)).map((s) => ({ name: str(s.name), status: 'extracted' })),
    experience: experience.filter((e) => e && str(e.company)).map((e, ei) => {
      const expId = `exp-${ei}`;
      return {
        id: expId,
        company: str(e.company),
        title: str(e.title),
        startDate: str(e.startDate),
        endDate: str(e.endDate) || 'Present',
        location: str(e.location),
        status: 'extracted',
        technologies: Array.isArray(e.technologies) ? e.technologies.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()) : [],
        bullets: (Array.isArray(e.bullets) ? e.bullets : [])
          .map((b) => (typeof b === 'string' ? b : (b && b.text)))
          .filter((text) => str(text))
          .map((text, bi) => ({ id: `${expId}-b${bi}`, text: str(text), status: 'extracted' })),
      };
    }),
    education: education.filter((e) => e && (str(e.degree) || str(e.institution))).map((e, i) => ({
      id: `edu-${i}`, degree: str(e.degree), institution: str(e.institution), endDate: str(e.endDate), status: 'extracted',
    })),
    certifications: certifications.filter((c) => c && str(c.name)).map((c, i) => ({
      id: `cert-${i}`, name: str(c.name), issuer: str(c.issuer), year: str(c.year), status: 'extracted',
    })),
    awards: [],
  };
}

async function extractProfileFromResumeText({ apiKey, model, resumeText }) {
  const content = await callOpenRouter({
    apiKey,
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(resumeText) },
    ],
  });
  return sanitizeProfile(content);
}

module.exports = { extractProfileFromResumeText };
