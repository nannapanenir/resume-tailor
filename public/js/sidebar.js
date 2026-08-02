// Sidebar navigation: switches between the four main views.

const Sidebar = (() => {
  const VIEWS = ['new-tailoring', 'career-profile', 'previous-resumes', 'settings'];

  function init() {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        AppState.set({ activeView: view });
        render(view);
      });
    });
  }

  function render(view) {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });
    VIEWS.forEach((v) => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.hidden = v !== view;
    });
    const showJobPanel = view === 'new-tailoring';
    document.getElementById('job-match-panel').hidden = !showJobPanel;
    document.getElementById('app-shell').classList.toggle('hide-job-panel', !showJobPanel);
    if (view === 'career-profile') CareerProfileView.render();
    if (view === 'previous-resumes') PreviousResumesView.render();
    if (view === 'settings') SettingsView.render();
  }

  return { init, render };
})();
