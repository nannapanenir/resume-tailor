// A lightweight, explainable keyword-matching "tailoring engine" used as a
// fallback when no AI provider is configured (or the AI call fails). Every
// claim traces back to a fact already present in the verified career
// profile (truthfulness rule) — this file never invents resume content.

const KNOWN_SKILLS = [
  'Angular', 'Angular 19', 'React', 'TypeScript', 'JavaScript', 'Node.js',
  'REST APIs', 'GraphQL', 'PrimeNG', 'NgRx', 'RxJs', 'Redux', 'HTML', 'CSS',
  'SCSS', 'CI/CD', 'Jenkins', 'Git', 'Agile', 'Scrum', 'AWS', 'Azure', 'GCP',
  'Docker', 'Kubernetes', 'Terraform', 'Microservices', 'SQL', 'MongoDB',
  'PostgreSQL', 'Java', 'Spring Boot', 'Python', 'Jest', 'Cypress', 'Webpack',
];

// A blank career profile shell, used only as a starting point when the
// user adds career info/projects/certifications before any resume has
// been uploaded. Contains no fabricated content.
function buildEmptyProfile() {
  return {
    personalInformation: { fullName: '', email: '', phone: '', location: '', linkedIn: '', portfolio: '' },
    summary: { text: '', status: 'user-added' },
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    awards: [],
  };
}

// --- Lightweight, explainable JD analysis + tailoring engine --------------

function extractSkillsFromText(text) {
  const found = [];
  const lower = text.toLowerCase();
  KNOWN_SKILLS.forEach((skill) => {
    const pattern = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lower)) found.push(skill);
  });
  return [...new Set(found)];
}

function analyzeJobDescription(text) {
  const preferredMarkerMatch = text.search(/preferred|nice to have|bonus/i);
  let requiredText = text;
  let preferredText = '';
  if (preferredMarkerMatch !== -1) {
    requiredText = text.slice(0, preferredMarkerMatch);
    preferredText = text.slice(preferredMarkerMatch);
  }
  const required = extractSkillsFromText(requiredText);
  const preferredOnly = extractSkillsFromText(preferredText).filter((s) => !required.includes(s));

  const titleMatch = text.match(/^(.{0,60}?(engineer|developer|architect|lead|manager)[^\n]{0,20})/i);

  return {
    jobTitle: titleMatch ? titleMatch[1].trim() : 'Untitled Role',
    requiredSkills: required,
    preferredSkills: preferredOnly,
  };
}

function profileSkillNames(profile) {
  const skillSet = new Set(profile.skills.map((s) => s.name));
  profile.experience.forEach((exp) => exp.technologies.forEach((t) => skillSet.add(t)));
  return skillSet;
}

function findBulletsForSkill(profile, skill) {
  const matches = [];
  profile.experience.forEach((exp) => {
    exp.bullets.forEach((b) => {
      if (exp.technologies.includes(skill) || b.text.toLowerCase().includes(skill.toLowerCase())) {
        matches.push({ exp, bullet: b });
      }
    });
  });
  return matches;
}

function buildSessionFromJD(jobText, profile, mode = 'balanced') {
  const parsed = analyzeJobDescription(jobText);
  const verifiedSkills = profileSkillNames(profile);

  const requiredMatched = parsed.requiredSkills.filter((s) => verifiedSkills.has(s));
  const requiredMissing = parsed.requiredSkills.filter((s) => !verifiedSkills.has(s));
  const preferredMatched = parsed.preferredSkills.filter((s) => verifiedSkills.has(s));
  const preferredMissing = parsed.preferredSkills.filter((s) => !verifiedSkills.has(s));

  const totalRequired = parsed.requiredSkills.length || 1;
  const totalPreferred = parsed.preferredSkills.length || 0;

  const matchBefore = Math.round(
    (requiredMatched.length / totalRequired) * 70 +
    (totalPreferred ? (preferredMatched.length / totalPreferred) * 20 : 10)
  );

  // Conservative only strengthens bullets for required skills; Balanced adds
  // preferred skills too; Strong Targeting also strengthens the summary.
  // All three only ever use skills already verified in the profile.
  const skillsForChanges = mode === 'conservative'
    ? requiredMatched
    : requiredMatched.concat(preferredMatched);

  // Build one templated change per matched skill that already appears in a
  // bullet but not prominently, so "after" reflects genuinely strengthened
  // (not invented) content.
  const changes = [];
  const usedBulletIds = new Set();
  skillsForChanges.forEach((skill, idx) => {
    const hits = findBulletsForSkill(profile, skill);
    if (!hits.length) return;
    const { exp, bullet } = hits[0];
    if (usedBulletIds.has(bullet.id)) return;
    usedBulletIds.add(bullet.id);

    const updated = `${bullet.text.replace(/\.$/, '')}, leveraging ${skill} to directly address this role's requirements.`;
    changes.push({
      id: `gen-${idx}-${bullet.id}`,
      section: 'Experience',
      company: exp.company,
      bulletLabel: `Bullet ${exp.bullets.indexOf(bullet) + 1}`,
      targetBulletId: bullet.id,
      original: bullet.text,
      updated,
      keywordsAdded: [skill],
      keywordsRemoved: [],
      reason: `The job description requires ${skill}, and this bullet already demonstrates it but did not name it explicitly.`,
      evidence: `Verified in Career Profile: ${exp.company} technologies include ${skill}.`,
      status: 'pending',
    });
  });

  if (mode === 'strong' && skillsForChanges.length && profile.summary) {
    const topSkills = skillsForChanges.slice(0, 3);
    changes.push({
      id: 'gen-summary',
      section: 'Summary',
      company: '',
      bulletLabel: '',
      targetBulletId: 'summary',
      original: profile.summary.text,
      updated: `${profile.summary.text.replace(/\.$/, '')}, specializing in ${topSkills.join(', ')} for ${parsed.jobTitle} roles.`,
      keywordsAdded: topSkills,
      keywordsRemoved: [],
      reason: 'Strong Targeting mode strengthens the summary with verified specialties that match the job title and top requirements.',
      evidence: `Verified in Career Profile: skills list includes ${topSkills.join(', ')}.`,
      status: 'pending',
    });
  }

  const modeBonus = mode === 'strong' ? 5 : mode === 'conservative' ? 0 : 3;
  const matchAfter = Math.min(
    97,
    matchBefore + changes.length * 4 + (changes.length ? modeBonus : 0)
  );

  const keywords = [
    ...requiredMatched.map((skill) => ({
      keyword: skill, importance: 'Required', before: 1, after: 2,
      location: 'Skills, Experience', status: 'Verified',
    })),
    ...requiredMissing.map((skill) => ({
      keyword: skill, importance: 'Required', before: 0, after: 0,
      location: 'Not added', status: 'Not found',
    })),
    ...preferredMatched.map((skill) => ({
      keyword: skill, importance: 'Preferred', before: 1, after: 1,
      location: 'Skills, Experience', status: 'Verified',
    })),
    ...preferredMissing.map((skill) => ({
      keyword: skill, importance: 'Preferred', before: 0, after: 0,
      location: 'Not added', status: 'Not found',
    })),
  ];

  return {
    jobTitle: parsed.jobTitle,
    jobDescriptionText: jobText,
    matchBefore: Math.max(5, Math.min(95, matchBefore)),
    matchAfter: Math.max(5, Math.min(97, matchAfter)),
    strongMatches: [...requiredMatched, ...preferredMatched],
    stillMissing: [...requiredMissing, ...preferredMissing].map((skill) => ({
      skill,
      note: 'Not present in any verified profile entry. Add it under Career Profile to include it in future tailoring.',
    })),
    changes,
    keywords,
  };
}

// The "after" score should reflect the changes the user actually approved,
// not just what was proposed. Scales linearly from matchBefore (nothing
// accepted) to the proposed matchAfter (everything accepted).
function computeAdjustedAfterScore(session) {
  if (!session.changes.length) return session.matchBefore;
  const maxDelta = session.matchAfter - session.matchBefore;
  const acceptedWeight = session.changes.filter((c) => c.status === 'accepted' || c.status === 'edited').length / session.changes.length;
  return Math.round(session.matchBefore + maxDelta * acceptedWeight);
}
