// "Keywords" tab: table of every job-description keyword with
// before/after counts, resume location, and verification status.
// Clicking a row expands to show which resume lines mention it.

const KeywordsTab = (() => {
  const panel = document.getElementById('panel-keywords');
  let expandedKeyword = null;

  function changesForKeyword(session, keyword) {
    return session.changes.filter((c) =>
      c.keywordsAdded.some((k) => k.toLowerCase() === keyword.toLowerCase()) ||
      c.original.toLowerCase().includes(keyword.toLowerCase()) ||
      ChangeReview.displayedUpdatedText(c).toLowerCase().includes(keyword.toLowerCase())
    );
  }

  function effectiveAfterCount(session, row) {
    const owningChanges = session.changes.filter((c) => c.keywordsAdded.some((k) => k.toLowerCase() === row.keyword.toLowerCase()));
    if (!owningChanges.length) return row.after;
    const anyApplied = owningChanges.some((c) => c.status === 'accepted' || c.status === 'edited');
    return anyApplied ? row.after : row.before;
  }

  function render() {
    const { session } = AppState.get();
    if (!session) { panel.innerHTML = ''; return; }

    const rows = session.keywords.map((row) => {
      const after = effectiveAfterCount(session, row);
      const related = changesForKeyword(session, row.keyword);
      const isOpen = expandedKeyword === row.keyword;
      return `
        <tr class="kw-row ${isOpen ? 'is-open' : ''}" data-keyword="${row.keyword}">
          <td>${row.keyword}</td>
          <td><span class="pill pill--${row.importance.toLowerCase()}">${row.importance}</span></td>
          <td>${row.before}</td>
          <td>${after}</td>
          <td>${row.location}</td>
          <td><span class="pill pill--status-${row.status.toLowerCase().replace(/\s+/g, '-')}">${row.status}</span></td>
        </tr>
        ${isOpen ? `
        <tr class="kw-detail-row">
          <td colspan="6">
            ${related.length ? `
              <div class="kw-detail">
                <strong>Appears in:</strong>
                <ul>${related.map((c) => `<li>${c.section}${c.company ? ' — ' + c.company : ''}${c.bulletLabel ? ' | ' + c.bulletLabel : ''}: "${ChangeReview.displayedUpdatedText(c)}"</li>`).join('')}</ul>
              </div>` : `<div class="kw-detail">Not yet present in the resume. ${row.status === 'Not found' ? 'No verified profile entry supports adding it truthfully.' : ''}</div>`}
          </td>
        </tr>` : ''}
      `;
    }).join('');

    panel.innerHTML = `
      <div class="keywords-header">
        <h3>Keyword Coverage</h3>
        <p class="muted">Click a keyword to see where it appears in the resume.</p>
      </div>
      <div class="table-scroll">
        <table class="keywords-table">
          <thead>
            <tr>
              <th>Keyword</th><th>Importance</th><th>Before</th><th>After</th><th>Resume Location</th><th>Verification</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    panel.querySelectorAll('.kw-row').forEach((row) => {
      row.addEventListener('click', () => {
        const kw = row.dataset.keyword;
        expandedKeyword = expandedKeyword === kw ? null : kw;
        render();
      });
    });
  }

  function refreshIfActive() {
    if (AppState.get().activeTab === 'keywords') render();
  }

  return { render, refreshIfActive };
})();
