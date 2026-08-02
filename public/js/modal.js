// Generic modal dialog helper. Used for paste-JD, paste-career-info,
// add-project, add-certification, and edit-change flows.

const Modal = (() => {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const footerEl = document.getElementById('modal-footer');
  const closeBtn = document.getElementById('modal-close-btn');

  function open({ title, bodyHTML, buttons = [] }) {
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHTML;
    footerEl.innerHTML = '';
    buttons.forEach((btn) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = btn.label;
      el.className = btn.className || 'btn btn--secondary';
      el.addEventListener('click', () => btn.onClick(close));
      footerEl.appendChild(el);
    });
    overlay.hidden = false;
    const firstInput = bodyEl.querySelector('input, textarea');
    if (firstInput) firstInput.focus();
  }

  function close() {
    overlay.hidden = true;
    bodyEl.innerHTML = '';
    footerEl.innerHTML = '';
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return { open, close };
})();
