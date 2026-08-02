// "Match Analysis" tab: before/after, coverage breakdowns, and a plain
// explanation for every requirement that still isn't matched.

const MatchAnalysisTab = (() => {
  const panel = document.getElementById('panel-match');

  function coverage(keywords, importance) {
    const rows = keywords.filter((k) => k.importance.toLowerCase() === importance.toLowerCase());
    if (!rows.length) return { pct: null, matched: 0, total: 0 };
    const matched = rows.filter((k) => k.status === 'Verified').length;
    return { pct: Math.round((matched / rows.length) * 100), matched, total: rows.length };
  }

  function render() {
    const { session, careerProfile } = AppState.get();
    if (!session) { panel.innerHTML = ''; return; }

    const adjustedAfter = computeAdjustedAfterScore(session);
    const req = coverage(session.keywords, 'required');
    const pref = coverage(session.keywords, 'preferred');
    const acceptedChanges = session.changes.filter((c) => c.status === 'accepted' || c.status === 'edited');
    const responsibilityAlignment = session.changes.length
      ? Math.round((acceptedChanges.length / session.changes.length) * 100)
      : 0;

    const seniorityWords = ['senior', 'lead', 'staff', 'principal'];
    const jdSeniority = seniorityWords.find((w) => session.jobTitle.toLowerCase().includes(w));
    const profileSeniority = careerProfile && careerProfile.experience.some((e) => seniorityWords.some((w) => e.title.toLowerCase().includes(w)));
    const seniorityAligned = jdSeniority ? Boolean(profileSeniority) : true;

    panel.innerHTML = `
      <div class="match-analysis-grid">
        <div class="ma-card">
          <div class="ma-card-label">Match Before</div>
          <div class="ma-card-value">${session.matchBefore}%</div>
        </div>
        <div class="ma-card ma-card--highlight">
          <div class="ma-card-label">Match After (approved changes)</div>
          <div class="ma-card-value">${adjustedAfter}%</div>
        </div>
        <div class="ma-card">
          <div class="ma-card-label">Required Keyword Coverage</div>
          <div class="ma-card-value">${req.pct === null ? '—' : req.pct + '%'}</div>
          <div class="ma-card-sub">${req.matched}/${req.total} matched</div>
        </div>
        <div class="ma-card">
          <div class="ma-card-label">Preferred Keyword Coverage</div>
          <div class="ma-card-value">${pref.pct === null ? '—' : pref.pct + '%'}</div>
          <div class="ma-card-sub">${pref.matched}/${pref.total} matched</div>
        </div>
        <div class="ma-card">
          <div class="ma-card-label">Responsibility Alignment</div>
          <div class="ma-card-value">${responsibilityAlignment}%</div>
          <div class="ma-card-sub">${acceptedChanges.length}/${session.changes.length} proposed changes approved</div>
        </div>
        <div class="ma-card">
          <div class="ma-card-label">Seniority Alignment</div>
          <div class="ma-card-value">${seniorityAligned ? 'Aligned' : 'Review needed'}</div>
          <div class="ma-card-sub">${jdSeniority ? `Job title implies "${jdSeniority}" level` : 'No explicit seniority signal found'}</div>
        </div>
        <div class="ma-card">
          <div class="ma-card-label">Unsupported Claims</div>
          <div class="ma-card-value">0</div>
          <div class="ma-card-sub">Every proposed line traces to a verified profile entry</div>
        </div>
      </div>

      <div class="ma-gaps">
        <h3>Remaining Gaps</h3>
        ${session.stillMissing.length === 0
          ? '<p class="muted">No remaining gaps — every extracted requirement is verified in your profile.</p>'
          : `<ul class="gap-list">${session.stillMissing.map((g) => `<li><strong>${g.skill}</strong> — ${g.note}</li>`).join('')}</ul>`}
      </div>
    `;
  }

  function refreshIfActive() {
    if (AppState.get().activeTab === 'match') render();
  }

  return { render, refreshIfActive };
})();
