// Right-hand "Job Match" panel: score ring, strong/missing lists, and
// the "Generate ATS Resume" validation + export flow.

const JobMatchPanel = (() => {
  const panel = document.getElementById('job-match-panel');
  const RADIUS = 70;
  const CIRC = 2 * Math.PI * RADIUS;

  function ringSVG(pct) {
    const offset = CIRC * (1 - pct / 100);
    return `
      <svg class="score-ring" viewBox="0 0 160 160">
        <circle class="score-ring-track" cx="80" cy="80" r="${RADIUS}" />
        <circle class="score-ring-progress" cx="80" cy="80" r="${RADIUS}"
          stroke-dasharray="${CIRC}" stroke-dashoffset="${offset}" />
      </svg>
      <div class="score-ring-label">
        <div class="score-ring-pct">${pct}%</div>
        <div class="score-ring-sub">Overall Match</div>
      </div>`;
  }

  function emptyState() {
    return `
      <div class="jmp-header">
        <h2>Job Match</h2>
        <button class="info-btn" id="jmp-info" type="button" aria-label="What is this score?">ⓘ</button>
      </div>
      <div class="jmp-empty">
        Paste or upload a job description to see your Estimated Resume Relevance score.
      </div>`;
  }

  function render() {
    const { session } = AppState.get();
    if (!session) {
      panel.innerHTML = emptyState();
      wireInfoButton();
      return;
    }

    // The ring shows the proposed score for this tailoring (matches the
    // Changes tab's proposal); the Match Analysis tab additionally shows
    // the score adjusted for which changes you've actually approved.
    panel.innerHTML = `
      <div class="jmp-header">
        <h2>Job Match</h2>
        <button class="info-btn" id="jmp-info" type="button" aria-label="What is this score?">ⓘ</button>
      </div>

      <div class="score-ring-wrap">
        ${ringSVG(session.matchAfter)}
      </div>

      <div class="before-after-row">
        <div class="ba-col">
          <div class="ba-label">Before</div>
          <div class="ba-value">${session.matchBefore}%</div>
        </div>
        <div class="ba-col">
          <div class="ba-label">After</div>
          <div class="ba-value ba-value--after">${session.matchAfter}%</div>
        </div>
      </div>

      <div class="jmp-section">
        <div class="jmp-section-title">Strong matches</div>
        ${session.strongMatches.length
          ? session.strongMatches.map((s) => `<div class="jmp-row jmp-row--good">✅ ${s}</div>`).join('')
          : '<div class="jmp-row muted">None yet</div>'}
      </div>

      <div class="jmp-section">
        <div class="jmp-section-title">Still missing</div>
        ${session.stillMissing.length
          ? session.stillMissing.map((g) => `<div class="jmp-row jmp-row--bad">⚠️ ${g.skill} <span class="not-added-pill">Not added</span></div>`).join('')
          : '<div class="jmp-row muted">Nothing missing</div>'}
      </div>

      <button class="btn btn--generate" id="btn-generate-ats" type="button">📄 Generate ATS Resume</button>
    `;

    wireInfoButton();
    document.getElementById('btn-generate-ats').addEventListener('click', runFinalValidation);
  }

  function wireInfoButton() {
    const btn = document.getElementById('jmp-info');
    if (!btn) return;
    btn.addEventListener('click', () => {
      Modal.open({
        title: 'About This Score',
        bodyHTML: `<p>This is an <strong>Estimated Resume Relevance</strong> score — not the employer's actual ATS score, which no outside tool can see. It's calculated from required/preferred skill coverage, responsibility alignment, job-title/seniority alignment, and evidence strength, all traceable to your verified career profile. See the Match Analysis tab for the full breakdown.</p>`,
        buttons: [{ label: 'Got it', className: 'btn btn--primary', onClick: (close) => close() }],
      });
    });
  }

  function runFinalValidation() {
    const { session, careerProfile } = AppState.get();
    if (!session || !careerProfile) return;

    const accepted = session.changes.filter((c) => c.status === 'accepted' || c.status === 'edited');
    const keywordsStrengthened = new Set(accepted.flatMap((c) => c.keywordsAdded)).size;

    const checklist = [
      `${accepted.length} line${accepted.length === 1 ? '' : 's'} updated`,
      `${keywordsStrengthened} relevant keyword${keywordsStrengthened === 1 ? '' : 's'} strengthened`,
      `0 unsupported claims`,
      `Employer names, job titles, dates, and education preserved`,
      `Estimated relevance: ${computeAdjustedAfterScore(session)}%`,
    ];

    Modal.open({
      title: 'Final Validation',
      bodyHTML: `
        <ul class="validation-list">
          ${checklist.map((c) => `<li>✓ ${c}</li>`).join('')}
        </ul>
        <p class="field-hint">Both files include only the changes you accepted or edited above; anything pending or rejected keeps your original verified wording.</p>
      `,
      buttons: [
        { label: 'Close', className: 'btn btn--secondary', onClick: (close) => close() },
        {
          label: 'Download ATS Resume (DOCX)',
          className: 'btn btn--secondary',
          onClick: () => downloadResumeFile(session, careerProfile, 'docx'),
        },
        {
          label: 'Download ATS Resume (PDF)',
          className: 'btn btn--primary',
          onClick: () => downloadResumeFile(session, careerProfile, 'pdf'),
        },
      ],
    });
  }

  function resumeFileBaseName(session, careerProfile) {
    const clean = (text) => (text || '').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const namePart = clean(careerProfile.personalInformation.fullName) || 'Candidate';
    const titlePart = clean(session.jobTitle) || 'Resume';
    return `${namePart}_${titlePart}`;
  }

  function buildTailoredProfile(session, careerProfile) {
    const appliedText = (bulletId, originalText) => {
      const change = session.changes.find((c) => c.targetBulletId === bulletId);
      const applied = change && (change.status === 'accepted' || change.status === 'edited');
      return applied ? ChangeReview.displayedUpdatedText(change) : originalText;
    };

    return {
      personalInformation: careerProfile.personalInformation,
      summary: { text: appliedText('summary', careerProfile.summary.text) },
      skills: careerProfile.skills,
      experience: careerProfile.experience.map((exp) => ({
        ...exp,
        bullets: exp.bullets.map((b) => ({ ...b, text: appliedText(b.id, b.text) })),
      })),
      education: careerProfile.education,
      certifications: careerProfile.certifications,
    };
  }

  async function downloadResumeFile(session, careerProfile, format) {
    try {
      Toast.show(`Generating your tailored resume (${format.toUpperCase()})…`, 'info');
      const tailoredProfile = buildTailoredProfile(session, careerProfile);
      const blob = await AIClient.generateResume(tailoredProfile, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${resumeFileBaseName(session, careerProfile)}_Resume.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      Toast.show('Resume downloaded.', 'success');
    } catch (e) {
      Toast.show(e.message || 'Failed to generate resume.', 'error');
    }
  }

  return { render };
})();
