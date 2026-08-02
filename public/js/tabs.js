// Owns the workflow card: tab switching + show/hide based on whether a
// tailoring session exists yet.

const Workflow = (() => {
  const card = document.getElementById('workflow-card');
  const tabs = document.querySelectorAll('.tab');
  const panels = {
    changes: document.getElementById('panel-changes'),
    keywords: document.getElementById('panel-keywords'),
    preview: document.getElementById('panel-preview'),
    match: document.getElementById('panel-match'),
  };

  function init() {
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        AppState.set({ activeTab: tab.dataset.tab });
        render();
      });
    });
  }

  function render() {
    const { session, activeTab } = AppState.get();
    card.hidden = !session;
    if (!session) return;

    tabs.forEach((tab) => {
      const active = tab.dataset.tab === activeTab;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== activeTab; });

    if (activeTab === 'changes') ChangeReview.render();
    if (activeTab === 'keywords') KeywordsTab.render();
    if (activeTab === 'preview') PreviewTab.render();
    if (activeTab === 'match') MatchAnalysisTab.render();
  }

  return { init, render };
})();
