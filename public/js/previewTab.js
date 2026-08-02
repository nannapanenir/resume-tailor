// "Resume Preview" tab: full tailored resume with toggles for
// highlighting changed lines/keywords, page boundaries, and viewing
// the original (untailored) version.

const PreviewTab = (() => {
  const panel = document.getElementById('panel-preview');
  let toggles = { highlightChanges: true, highlightKeywords: false, pageBoundaries: false, showOriginal: false };
  let expandedBulletId = null;

  function changeForBullet(session, bulletId) {
    return session.changes.find((c) => c.targetBulletId === bulletId);
  }

  function applyKeywordHighlight(text) {
    if (!toggles.highlightKeywords) return text;
    let out = text;
    KNOWN_SKILLS.slice().sort((a, b) => b.length - a.length).forEach((skill) => {
      const re = new RegExp(`\\b(${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
      out = out.replace(re, '<mark class="kw-mark">$1</mark>');
    });
    return out;
  }

  function bulletLine(session, bulletId, originalText) {
    const change = changeForBullet(session, bulletId);
    const applied = change && (change.status === 'accepted' || change.status === 'edited');
    const effectiveText = toggles.showOriginal
      ? originalText
      : (applied ? ChangeReview.displayedUpdatedText(change) : originalText);

    const isHighlighted = toggles.highlightChanges && applied && !toggles.showOriginal;
    const clickable = Boolean(change) && !toggles.showOriginal;
    const isOpen = expandedBulletId === bulletId;

    return `
      <li class="resume-line ${isHighlighted ? 'resume-line--changed' : ''} ${clickable ? 'resume-line--clickable' : ''}"
          ${clickable ? `data-bullet-id="${bulletId}"` : ''}>
        ${applyKeywordHighlight(effectiveText)}
        ${isOpen && change ? `
          <div class="resume-line-detail">
            <strong>Original:</strong> ${change.original}<br/>
            <strong>Why changed:</strong> ${change.reason}
          </div>` : ''}
      </li>`;
  }

  function render() {
    const { session, careerProfile } = AppState.get();
    if (!session || !careerProfile) { panel.innerHTML = ''; return; }
    const profile = careerProfile;

    const summaryChange = changeForBullet(session, 'summary');
    const summaryApplied = summaryChange && (summaryChange.status === 'accepted' || summaryChange.status === 'edited');
    const summaryText = toggles.showOriginal
      ? profile.summary.text
      : (summaryApplied ? ChangeReview.displayedUpdatedText(summaryChange) : profile.summary.text);

    const experienceHTML = profile.experience.map((exp) => `
      <div class="resume-exp-block ${toggles.pageBoundaries ? 'page-aware' : ''}">
        <div class="resume-exp-header">
          <strong>${exp.title}</strong> — ${exp.company}
          <span class="resume-exp-dates">${exp.startDate} – ${exp.endDate} &bull; ${exp.location}</span>
        </div>
        <ul class="resume-bullets">
          ${exp.bullets.map((b) => bulletLine(session, b.id, b.text)).join('')}
        </ul>
      </div>
    `).join(toggles.pageBoundaries ? '<div class="page-boundary">— Page break —</div>' : '');

    panel.innerHTML = `
      <div class="preview-toggles">
        <label><input type="checkbox" id="tg-changes" ${toggles.highlightChanges ? 'checked' : ''}/> Highlight changed lines</label>
        <label><input type="checkbox" id="tg-keywords" ${toggles.highlightKeywords ? 'checked' : ''}/> Highlight keywords</label>
        <label><input type="checkbox" id="tg-pages" ${toggles.pageBoundaries ? 'checked' : ''}/> Show page boundaries</label>
        <label><input type="checkbox" id="tg-original" ${toggles.showOriginal ? 'checked' : ''}/> Show original version</label>
      </div>

      <div class="resume-preview-doc">
        <div class="resume-header">
          <h2>${profile.personalInformation.fullName}</h2>
          <div class="resume-contact">${profile.personalInformation.email} &bull; ${profile.personalInformation.phone} &bull; ${profile.personalInformation.location} &bull; ${profile.personalInformation.linkedIn}</div>
        </div>
        <div class="resume-section">
          <h3>Summary</h3>
          <p>${applyKeywordHighlight(summaryText)}</p>
        </div>
        <div class="resume-section">
          <h3>Skills</h3>
          <p>${profile.skills.map((s) => s.name).join(', ')}</p>
        </div>
        <div class="resume-section">
          <h3>Experience</h3>
          ${experienceHTML}
        </div>
        <div class="resume-section">
          <h3>Education</h3>
          <p>${profile.education.map((e) => `${e.degree}, ${e.institution} (${e.endDate})`).join('; ') || 'None on file.'}</p>
        </div>
        ${profile.certifications.length ? `
        <div class="resume-section">
          <h3>Certifications</h3>
          <p>${profile.certifications.map((c) => `${c.name}${c.issuer ? ' — ' + c.issuer : ''}${c.year ? ' (' + c.year + ')' : ''}`).join('; ')}</p>
        </div>` : ''}
      </div>
    `;

    document.getElementById('tg-changes').addEventListener('change', (e) => { toggles.highlightChanges = e.target.checked; render(); });
    document.getElementById('tg-keywords').addEventListener('change', (e) => { toggles.highlightKeywords = e.target.checked; render(); });
    document.getElementById('tg-pages').addEventListener('change', (e) => { toggles.pageBoundaries = e.target.checked; render(); });
    document.getElementById('tg-original').addEventListener('change', (e) => { toggles.showOriginal = e.target.checked; render(); });

    panel.querySelectorAll('.resume-line--clickable').forEach((li) => {
      li.addEventListener('click', () => {
        const id = li.dataset.bulletId;
        expandedBulletId = expandedBulletId === id ? null : id;
        render();
      });
    });
  }

  function refreshIfActive() {
    if (AppState.get().activeTab === 'preview') render();
  }

  return { render, refreshIfActive };
})();
