// Simple toast notifications for success/error/info feedback.

const Toast = (() => {
  let hideTimer = null;

  function show(message, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast toast--${type}`;
    el.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  return { show };
})();
