// The "Changes" tab: original vs. updated diff, keyword chips, reason +
// evidence, and the accept/edit/reject/restore/regenerate controls.

const ChangeReview = (() => {
  const panel = document.getElementById('panel-changes');

  function currentChange() {
    const { session, activeChangeIndex } = AppState.get();
    if (!session || !session.changes.length) return null;
    return session.changes[Math.min(activeChangeIndex, session.changes.length - 1)];
  }

  function displayedUpdatedText(change) {
    return change.editedText != null ? change.editedText : change.updated;
  }

  function statusBadge(status) {
    const map = {
      pending: { label: 'Pending review', cls: 'badge--pending' },
      accepted: { label: '✓ Accepted', cls: 'badge--accepted' },
      rejected: { label: '✕ Rejected', cls: 'badge--rejected' },
      edited: { label: '✎ Edited', cls: 'badge--edited' },
    };
    const info = map[status] || map.pending;
    return `<span class="status-badge ${info.cls}">${info.label}</span>`;
  }

  function render() {
    const { session, activeChangeIndex } = AppState.get();
    if (!session) { panel.innerHTML = ''; return; }

    if (!session.changes.length) {
      panel.innerHTML = `<div class="empty-state">No proposed changes for this job description — your resume already reflects your verified experience well, or there wasn't enough truthful evidence to strengthen anything further.</div>`;
      return;
    }

    const idx = Math.min(activeChangeIndex, session.changes.length - 1);
    const change = session.changes[idx];
    const total = session.changes.length;
    const acceptedCount = session.changes.filter((c) => c.status === 'accepted' || c.status === 'edited').length;

    const label = change.company
      ? `${change.section} — ${change.company}${change.bulletLabel ? ' | ' + change.bulletLabel : ''}`
      : change.section;

    const chips = change.keywordsAdded.map((k) => `<span class="chip chip--added">${k} ✓</span>`).join('');
    const removedChips = change.keywordsRemoved.map((k) => `<span class="chip chip--removed">${k} ✕</span>`).join('');

    panel.innerHTML = `
      <div class="changes-toolbar">
        <div class="changes-title-group">
          <h3 class="changes-title">${label}</h3>
          ${statusBadge(change.status)}
        </div>
        <div class="changes-nav">
          <span class="changes-count">${idx + 1} of ${total} &bull; ${acceptedCount} accepted</span>
          <button class="btn btn--ghost" id="btn-prev" type="button" ${idx === 0 ? 'disabled' : ''}>&lsaquo; Previous</button>
          <button class="btn btn--ghost" id="btn-next" type="button" ${idx === total - 1 ? 'disabled' : ''}>Next &rsaquo;</button>
        </div>
      </div>

      <div class="diff-grid">
        <div class="diff-col">
          <div class="diff-label">Original</div>
          <div class="diff-box diff-box--original">${change.original}</div>
        </div>
        <div class="diff-arrow" aria-hidden="true">&rarr;</div>
        <div class="diff-col">
          <div class="diff-label">Updated</div>
          <div class="diff-box diff-box--updated">${displayedUpdatedText(change)}</div>
        </div>
      </div>

      ${chips || removedChips ? `
        <div class="chip-row">
          ${chips}
          ${removedChips}
        </div>` : ''}

      <div class="reason-block">
        <div class="reason-label">Reason</div>
        <p>${change.reason}</p>
        <div class="reason-label">Evidence</div>
        <p class="evidence-text">${change.evidence}</p>
      </div>

      <div class="changes-actions">
        <button class="btn btn--accept" id="btn-accept" type="button">&#10003; Accept</button>
        <button class="btn btn--edit" id="btn-edit" type="button">&#9998; Edit</button>
        <button class="btn btn--reject" id="btn-reject" type="button">&#10007; Reject</button>
      </div>
      <div class="changes-secondary-actions">
        <button class="link-btn" id="btn-restore" type="button">Restore Original</button>
        <button class="link-btn" id="btn-regenerate" type="button">Regenerate</button>
        <button class="link-btn" id="btn-accept-all" type="button">Accept All Safe Changes</button>
      </div>
    `;

    wireEvents(session, idx, change);
  }

  function wireEvents(session, idx, change) {
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { AppState.set({ activeChangeIndex: Math.max(0, idx - 1) }); render(); refreshDependents(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { AppState.set({ activeChangeIndex: Math.min(session.changes.length - 1, idx + 1) }); render(); refreshDependents(); });

    document.getElementById('btn-accept').addEventListener('click', () => {
      change.status = change.editedText != null ? 'edited' : 'accepted';
      Toast.show('Change accepted.', 'success');
      render(); refreshDependents();
    });
    document.getElementById('btn-reject').addEventListener('click', () => {
      change.status = 'rejected';
      Toast.show('Change rejected — original line kept.', 'info');
      render(); refreshDependents();
    });
    document.getElementById('btn-restore').addEventListener('click', () => {
      if (change.editedText == null && change.status === 'pending') {
        Toast.show('Nothing to restore.', 'info');
        return;
      }
      change.editedText = null;
      change.status = 'pending';
      Toast.show('Restored to the proposed version.', 'info');
      render(); refreshDependents();
    });
    document.getElementById('btn-regenerate').addEventListener('click', () => {
      change.variants = change.variants || [change.updated];
      if (change.variants.length < 2) {
        change.variants.push(alternatePhrasing(change));
      }
      change.variantIndex = ((change.variantIndex || 0) + 1) % change.variants.length;
      change.updated = change.variants[change.variantIndex];
      change.editedText = null;
      change.status = 'pending';
      Toast.show('Generated an alternate phrasing.', 'info');
      render(); refreshDependents();
    });
    document.getElementById('btn-accept-all').addEventListener('click', () => {
      let count = 0;
      session.changes.forEach((c) => {
        if (c.status === 'pending') { c.status = 'accepted'; count++; }
      });
      Toast.show(count ? `Accepted ${count} change(s) marked safe.` : 'No pending changes to accept.', 'success');
      render(); refreshDependents();
    });
    document.getElementById('btn-edit').addEventListener('click', () => openEditModal(change));
  }

  function alternatePhrasing(change) {
    const kw = change.keywordsAdded[0] || '';
    return `${change.original.replace(/\.$/, '')} — strengthened with ${kw ? kw + ' and ' : ''}measurable impact drawn directly from verified project work.`;
  }

  function openEditModal(change) {
    Modal.open({
      title: 'Edit Updated Line',
      bodyHTML: `
        <label class="field-label" for="edit-textarea">Updated line</label>
        <textarea id="edit-textarea" class="field-textarea" rows="5">${displayedUpdatedText(change)}</textarea>
        <p class="field-hint">Keep employer names, titles, and dates unchanged — those are protected facts.</p>
      `,
      buttons: [
        { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
        {
          label: 'Save',
          className: 'btn btn--primary',
          onClick: (close) => {
            const value = document.getElementById('edit-textarea').value.trim();
            if (!value) { Toast.show('Line cannot be empty.', 'error'); return; }
            change.editedText = value;
            change.status = 'edited';
            close();
            Toast.show('Edit saved.', 'success');
            render(); refreshDependents();
          },
        },
      ],
    });
  }

  function refreshDependents() {
    KeywordsTab.refreshIfActive();
    PreviewTab.refreshIfActive();
    MatchAnalysisTab.refreshIfActive();
    JobMatchPanel.render();
  }

  return { render, currentChange, displayedUpdatedText };
})();
