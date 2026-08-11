// Entry point: wires the welcome flow, and implements the three
// secondary views (Career Profile, Previous Resumes, Settings).

function verificationTag(status) {
  const map = {
    extracted: 'Extracted',
    'user-confirmed': 'Confirmed',
    'user-added': 'User-added',
    unverified: 'Unverified',
  };
  return `<span class="verify-tag verify-tag--${status}">${map[status] || status}</span>`;
}

function confirmProtectedEdit({ title, warning, fields, onSave }) {
  const bodyHTML = `
    <p class="protected-warning">🔒 ${warning}</p>
    ${fields.map((f) => `
      <label class="field-label" for="pf-${f.key}">${f.label}</label>
      <input class="field-input" id="pf-${f.key}" type="text" value="${(f.value || '').replace(/"/g, '&quot;')}" />
    `).join('')}
  `;
  Modal.open({
    title,
    bodyHTML,
    buttons: [
      { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
      {
        label: 'Save (I confirm this is accurate)',
        className: 'btn btn--primary',
        onClick: (close) => {
          const values = {};
          fields.forEach((f) => { values[f.key] = document.getElementById(`pf-${f.key}`).value.trim(); });
          onSave(values);
          close();
        },
      },
    ],
  });
}

function confirmDelete(label, onConfirm) {
  Modal.open({
    title: 'Confirm Delete',
    bodyHTML: `<p>Delete <strong>${label}</strong> from your career profile? This cannot be undone.</p>`,
    buttons: [
      { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
      { label: 'Delete', className: 'btn btn--reject', onClick: (close) => { onConfirm(); close(); } },
    ],
  });
}

// ---------------------------------------------------------------- Career Profile

const CareerProfileView = (() => {
  const container = document.getElementById('view-career-profile');

  function save(profile) {
    AppState.set({ careerProfile: profile });
    render();
  }

  function render() {
    const { careerProfile } = AppState.get();
    if (!careerProfile) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No career profile yet.</p>
          <button class="btn btn--primary btn--sm" id="cp-upload-resume">📄 Upload Master Resume</button>
          <p class="muted" style="margin-top: 8px;">Or use the "+" menu in New Tailoring to add a LinkedIn PDF or paste your career information.</p>
        </div>`;
      document.getElementById('cp-upload-resume').addEventListener('click', () => UploadMenu.trigger('upload-master-resume'));
      return;
    }
    const p = careerProfile;

    container.innerHTML = `
      <div class="profile-scroll">
        <div class="profile-toolbar">
          <button class="btn btn--secondary btn--sm" id="cp-upload-resume">📄 Upload New Resume</button>
          <span class="muted" style="font-size: 12px;">Replaces your current profile with a freshly extracted one.</span>
        </div>

        <section class="profile-card">
          <div class="profile-card-header">
            <h3>Personal Information</h3>
            <button class="btn btn--ghost btn--sm" id="edit-personal">Edit</button>
          </div>
          <div class="profile-kv">
            <div><strong>${p.personalInformation.fullName}</strong></div>
            <div>${p.personalInformation.email} &bull; ${p.personalInformation.phone}</div>
            <div>${p.personalInformation.location}</div>
            <div>${p.personalInformation.linkedIn || '—'}</div>
          </div>
        </section>

        <section class="profile-card">
          <div class="profile-card-header">
            <h3>Summary ${verificationTag(p.summary.status)}</h3>
            <button class="btn btn--ghost btn--sm" id="edit-summary">Edit</button>
          </div>
          <p>${p.summary.text}</p>
        </section>

        <section class="profile-card">
          <div class="profile-card-header"><h3>Skills</h3></div>
          <div class="chip-row">
            ${p.skills.map((s, i) => `<span class="chip chip--skill">${s.name} ${verificationTag(s.status)} <button class="chip-x" data-skill-idx="${i}" aria-label="Remove ${s.name}">×</button></span>`).join('')}
          </div>
          <form class="inline-add-form" id="add-skill-form">
            <input class="field-input" id="new-skill-input" type="text" placeholder="Add a skill you have verified experience with" />
            <button class="btn btn--secondary btn--sm" type="submit">Add</button>
          </form>
        </section>

        <section class="profile-card">
          <div class="profile-card-header"><h3>Experience</h3></div>
          ${p.experience.map((exp, ei) => `
            <div class="exp-block">
              <div class="exp-protected-row">
                <div>🔒 <strong>${exp.title}</strong> — ${exp.company}<br/>
                  <span class="muted">${exp.startDate} – ${exp.endDate} &bull; ${exp.location}</span>
                  ${verificationTag(exp.status)}
                </div>
                <button class="btn btn--ghost btn--sm" data-edit-exp="${ei}">Edit</button>
              </div>
              <div class="chip-row">
                ${exp.technologies.map((t, ti) => `<span class="chip chip--skill">${t} <button class="chip-x" data-exp-tech="${ei}:${ti}" aria-label="Remove ${t}">×</button></span>`).join('')}
              </div>
              <ul class="bullet-edit-list">
                ${exp.bullets.map((b, bi) => `
                  <li>${b.text} ${verificationTag(b.status)} <button class="chip-x" data-exp-bullet="${ei}:${bi}" aria-label="Remove bullet">×</button></li>
                `).join('')}
              </ul>
              <form class="inline-add-form" data-add-bullet="${ei}">
                <input class="field-input" type="text" placeholder="Add a verified accomplishment for this role" />
                <button class="btn btn--secondary btn--sm" type="submit">Add</button>
              </form>
            </div>
          `).join('')}
        </section>

        <section class="profile-card">
          <div class="profile-card-header">
            <h3>Education</h3>
            <button class="btn btn--ghost btn--sm" id="add-education">Add</button>
          </div>
          ${p.education.length ? p.education.map((e, i) => `
            <div class="profile-kv-row">
              🔒 ${e.degree}, ${e.institution} (${e.endDate}) ${verificationTag(e.status)}
              <button class="chip-x" data-edu-idx="${i}" aria-label="Remove education">×</button>
            </div>`).join('') : '<p class="muted">None on file.</p>'}
        </section>

        <section class="profile-card">
          <div class="profile-card-header">
            <h3>Certifications</h3>
            <button class="btn btn--ghost btn--sm" id="add-certification">Add</button>
          </div>
          ${p.certifications.length ? p.certifications.map((c, i) => `
            <div class="profile-kv-row">
              🔒 ${c.name}${c.issuer ? ' — ' + c.issuer : ''}${c.year ? ' (' + c.year + ')' : ''} ${verificationTag(c.status)}
              <button class="chip-x" data-cert-idx="${i}" aria-label="Remove certification">×</button>
            </div>`).join('') : '<p class="muted">None on file.</p>'}
        </section>
      </div>
    `;

    wireEvents(p);
  }

  function wireEvents(p) {
    document.getElementById('cp-upload-resume').addEventListener('click', () => UploadMenu.trigger('upload-master-resume'));

    document.getElementById('edit-personal').addEventListener('click', () => {
      const info = p.personalInformation;
      Modal.open({
        title: 'Edit Personal Information',
        bodyHTML: `
          <label class="field-label">Full name</label><input class="field-input" id="pi-name" value="${info.fullName}"/>
          <label class="field-label">Email</label><input class="field-input" id="pi-email" value="${info.email}"/>
          <label class="field-label">Phone</label><input class="field-input" id="pi-phone" value="${info.phone}"/>
          <label class="field-label">Location</label><input class="field-input" id="pi-location" value="${info.location}"/>
          <label class="field-label">LinkedIn</label><input class="field-input" id="pi-linkedin" value="${info.linkedIn}"/>
        `,
        buttons: [
          { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
          { label: 'Save', className: 'btn btn--primary', onClick: (close) => {
            info.fullName = document.getElementById('pi-name').value.trim();
            info.email = document.getElementById('pi-email').value.trim();
            info.phone = document.getElementById('pi-phone').value.trim();
            info.location = document.getElementById('pi-location').value.trim();
            info.linkedIn = document.getElementById('pi-linkedin').value.trim();
            close(); save(p);
          }},
        ],
      });
    });

    document.getElementById('edit-summary').addEventListener('click', () => {
      Modal.open({
        title: 'Edit Summary',
        bodyHTML: `<textarea class="field-textarea" id="summary-text" rows="4">${p.summary.text}</textarea>`,
        buttons: [
          { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
          { label: 'Save', className: 'btn btn--primary', onClick: (close) => {
            p.summary.text = document.getElementById('summary-text').value.trim();
            p.summary.status = 'user-confirmed';
            close(); save(p);
          }},
        ],
      });
    });

    document.getElementById('add-skill-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('new-skill-input');
      const val = input.value.trim();
      if (!val) return;
      p.skills.push({ name: val, status: 'user-added' });
      save(p);
    });

    container.querySelectorAll('[data-skill-idx]').forEach((btn) => {
      btn.addEventListener('click', () => { p.skills.splice(Number(btn.dataset.skillIdx), 1); save(p); });
    });
    container.querySelectorAll('[data-exp-tech]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [ei, ti] = btn.dataset.expTech.split(':').map(Number);
        p.experience[ei].technologies.splice(ti, 1); save(p);
      });
    });
    container.querySelectorAll('[data-exp-bullet]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [ei, bi] = btn.dataset.expBullet.split(':').map(Number);
        p.experience[ei].bullets.splice(bi, 1); save(p);
      });
    });
    container.querySelectorAll('[data-add-bullet]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const ei = Number(form.dataset.addBullet);
        const input = form.querySelector('input');
        const val = input.value.trim();
        if (!val) return;
        p.experience[ei].bullets.push({ id: `user-${Date.now()}`, text: val, status: 'user-added' });
        save(p);
      });
    });
    container.querySelectorAll('[data-edit-exp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exp = p.experience[Number(btn.dataset.editExp)];
        confirmProtectedEdit({
          title: `Edit ${exp.company}`,
          warning: 'Company name, job title, and employment dates are protected facts. Only edit this if the extracted data was wrong.',
          fields: [
            { key: 'company', label: 'Company', value: exp.company },
            { key: 'title', label: 'Job Title', value: exp.title },
            { key: 'startDate', label: 'Start Date', value: exp.startDate },
            { key: 'endDate', label: 'End Date', value: exp.endDate },
            { key: 'location', label: 'Location', value: exp.location },
          ],
          onSave: (values) => {
            Object.assign(exp, values);
            exp.status = 'user-confirmed';
            save(p);
          },
        });
      });
    });

    document.getElementById('add-education').addEventListener('click', () => {
      Modal.open({
        title: 'Add Education',
        bodyHTML: `
          <label class="field-label">Degree</label><input class="field-input" id="edu-degree" placeholder="B.S. Computer Science"/>
          <label class="field-label">Institution</label><input class="field-input" id="edu-inst" placeholder="University name"/>
          <label class="field-label">End Year</label><input class="field-input" id="edu-year" placeholder="2020"/>
        `,
        buttons: [
          { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
          { label: 'Add', className: 'btn btn--primary', onClick: (close) => {
            const degree = document.getElementById('edu-degree').value.trim();
            const institution = document.getElementById('edu-inst').value.trim();
            const endDate = document.getElementById('edu-year').value.trim();
            if (!degree || !institution) { Toast.show('Please fill in degree and institution.', 'error'); return; }
            p.education.push({ id: `edu-${Date.now()}`, degree, institution, endDate, status: 'user-added' });
            close(); save(p);
          }},
        ],
      });
    });
    container.querySelectorAll('[data-edu-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.eduIdx);
        confirmDelete(p.education[i].degree, () => { p.education.splice(i, 1); save(p); });
      });
    });

    document.getElementById('add-certification').addEventListener('click', () => UploadMenu.trigger('add-certification'));
    container.querySelectorAll('[data-cert-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.certIdx);
        confirmDelete(p.certifications[i].name, () => { p.certifications.splice(i, 1); save(p); });
      });
    });
  }

  return { render };
})();

// ---------------------------------------------------------------- Previous Resumes

const PreviousResumesView = (() => {
  const container = document.getElementById('view-previous-resumes');
  function render() {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>No previous sessions yet</h3>
        <p>Every tailoring session (job description, resume snapshot, match report, and your accept/reject decisions) will be saved here automatically once local session persistence is added in Phase 2.</p>
      </div>`;
  }
  return { render };
})();

// ---------------------------------------------------------------- Settings

const SettingsView = (() => {
  const container = document.getElementById('view-settings');

  function aiSectionHTML(status, selectedProvider) {
    const provider = selectedProvider || status.provider || 'openrouter';
    const isLocal = provider === 'local';

    const statusLine = status.configured
      ? `<p class="ai-status ai-status--on">✅ Connected via <strong>${status.provider === 'local' ? 'local server' : 'OpenRouter'}</strong> — using <strong>${status.model}</strong>${status.provider === 'local' && status.baseUrl ? ` at <code>${status.baseUrl}</code>` : ''}.</p>`
      : `<p class="ai-status ai-status--off">Not connected — tailoring currently uses the built-in local matching engine.</p>`;

    const providerToggle = `
      <div class="provider-toggle">
        <label><input type="radio" name="ai-provider" value="openrouter" ${!isLocal ? 'checked' : ''}/> OpenRouter (cloud)</label>
        <label><input type="radio" name="ai-provider" value="local" ${isLocal ? 'checked' : ''}/> Local server (Docker/Podman, Ollama, LM Studio...)</label>
      </div>`;

    const fields = isLocal ? `
      <label class="field-label" for="ai-base-url">Local server URL</label>
      <input class="field-input" type="text" id="ai-base-url" placeholder="http://localhost:11434/v1"
        value="${status.provider === 'local' ? status.baseUrl || '' : ''}" autocomplete="off" />
      <label class="field-label" for="ai-model">Model name</label>
      <input class="field-input" type="text" id="ai-model" placeholder="e.g. llama3.2:3b"
        value="${status.provider === 'local' ? status.model || '' : ''}" autocomplete="off" />
      <p class="field-hint">Points at any OpenAI-compatible local server (Ollama, LM Studio, llama.cpp, vLLM...) reachable at this URL — e.g. an Ollama container publishing port 11434. Nothing ever leaves your machine and no key is needed.</p>
    ` : `
      <label class="field-label" for="ai-key">OpenRouter API key</label>
      <input class="field-input" type="password" id="ai-key"
        placeholder="${status.configured && status.provider === 'openrouter' ? 'Leave blank to keep your current key' : 'sk-or-...'}" autocomplete="off" />
      <label class="field-label" for="ai-model">Model name</label>
      <input class="field-input" type="text" id="ai-model" placeholder="e.g. openai/gpt-4o-mini"
        value="${status.provider === 'openrouter' ? status.model || '' : ''}" autocomplete="off" />
      <p class="field-hint">Sent once to this app's local server and written to a local file — never through chat, never into generated resumes or logs. When you tailor a job description, its text and your career profile are sent to OpenRouter to generate suggestions; you'll see a notice each time that happens.</p>
    `;

    return `
      ${statusLine}
      ${providerToggle}
      ${fields}
      <div class="settings-actions-row">
        <button class="btn btn--primary btn--sm" id="ai-save-btn" type="button">${status.configured ? 'Update' : 'Connect'}</button>
        ${status.configured ? '<button class="btn btn--reject btn--sm" id="ai-clear-btn" type="button">Disconnect</button>' : ''}
      </div>
    `;
  }

  async function render() {
    const { tailoringMode, hasProfile } = AppState.get();
    container.innerHTML = `
      <div class="profile-scroll">
        ${hasProfile ? '' : '<button class="btn btn--ghost btn--sm settings-back-btn" id="settings-back-btn" type="button">← Back to resume setup</button>'}
        <section class="profile-card">
          <h3>Tailoring Mode</h3>
          <p class="muted">Applies to the next job description you paste or upload. All modes remain truthful — only verified facts are ever used.</p>
          <div class="mode-options">
            <label><input type="radio" name="mode" value="conservative" ${tailoringMode === 'conservative' ? 'checked' : ''}/> Conservative — minimal rewording, required skills only</label>
            <label><input type="radio" name="mode" value="balanced" ${tailoringMode === 'balanced' ? 'checked' : ''}/> Balanced (default) — required + preferred skills</label>
            <label><input type="radio" name="mode" value="strong" ${tailoringMode === 'strong' ? 'checked' : ''}/> Strong Targeting — also strengthens the summary</label>
          </div>
        </section>

        <section class="profile-card">
          <h3>AI Provider</h3>
          <div id="ai-section">Checking connection…</div>
        </section>
      </div>
    `;
    const backButton = container.querySelector('#settings-back-btn');
    if (backButton) backButton.addEventListener('click', App.showWelcome);

    container.querySelectorAll('input[name="mode"]').forEach((input) => {
      input.addEventListener('change', () => {
        AppState.set({ tailoringMode: input.value });
        Toast.show(`Tailoring mode set to ${input.value}.`, 'success');
      });
    });

    const status = await AIClient.getStatus(true);
    const aiSection = document.getElementById('ai-section');
    if (!aiSection) return; // user navigated away before this resolved

    function wireAiSection(selectedProvider) {
      aiSection.innerHTML = aiSectionHTML(status, selectedProvider);

      aiSection.querySelectorAll('input[name="ai-provider"]').forEach((radio) => {
        radio.addEventListener('change', () => wireAiSection(radio.value));
      });

      const saveBtn = document.getElementById('ai-save-btn');
      saveBtn.addEventListener('click', async () => {
        const provider = aiSection.querySelector('input[name="ai-provider"]:checked').value;
        const model = document.getElementById('ai-model').value.trim();
        const isLocal = provider === 'local';
        const apiKey = isLocal ? '' : document.getElementById('ai-key').value.trim();
        const baseUrl = isLocal ? document.getElementById('ai-base-url').value.trim() : '';

        if (!model) {
          Toast.show('Enter a model name.', 'error');
          return;
        }
        if (isLocal && !baseUrl) {
          Toast.show('Enter the local server URL.', 'error');
          return;
        }
        if (!isLocal && !apiKey && !(status.configured && status.provider === 'openrouter')) {
          Toast.show('Enter an API key.', 'error');
          return;
        }

        const originalLabel = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = status.configured ? 'Updating…' : 'Connecting…';
        try {
          await AIClient.saveSettings({ provider, apiKey, model, baseUrl });
          Toast.show(status.configured ? 'Settings updated.' : 'Connected.', 'success');
          render();
        } catch (e) {
          Toast.show(e.message, 'error');
          saveBtn.disabled = false;
          saveBtn.textContent = originalLabel;
        }
      });

      const clearBtn = document.getElementById('ai-clear-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
          await AIClient.clearSettings();
          Toast.show('Disconnected. Your key has been deleted from disk.', 'info');
          render();
        });
      }
    }

    wireAiSection(status.provider);
  }
  return { render };
})();

// ---------------------------------------------------------------- Global status banner
// Long-running work (resume upload -> extraction -> AI call) can now be
// triggered from more than one screen (welcome screen, Career Profile tab,
// "+" menu while chatting) — this banner is a fixed-position element
// outside both #welcome-screen and #app-shell so it's visible no matter
// which one is showing or which sidebar tab is active.

const GlobalStatus = (() => {
  const el = document.getElementById('global-status');
  const textEl = document.getElementById('global-status-text');
  const actionBtn = document.getElementById('global-status-action');

  function show(message) {
    el.hidden = false;
    el.className = 'global-status';
    textEl.textContent = message;
    actionBtn.hidden = true;
  }

  function showError(message, action) {
    el.hidden = false;
    el.className = 'global-status global-status--error';
    textEl.textContent = message;
    if (action) {
      actionBtn.hidden = false;
      actionBtn.textContent = action.label;
      actionBtn.onclick = action.onClick;
    } else {
      actionBtn.hidden = true;
    }
  }

  function hide() {
    el.hidden = true;
    actionBtn.hidden = true;
  }

  return { show, showError, hide };
})();

// ---------------------------------------------------------------- App bootstrap

const App = (() => {
  function showWorkspace() {
    document.getElementById('welcome-screen').hidden = true;
    document.getElementById('app-shell').hidden = false;
    ChatController.render();
    Workflow.render();
    JobMatchPanel.render();
  }

  function showWelcome() {
    // Reset the workspace back to its default tab so that finishing
    // onboarding later (e.g. after using the Settings "back" button) opens
    // New Tailoring instead of wherever the user last navigated to (e.g.
    // Settings) before returning here.
    AppState.set({ activeView: 'new-tailoring' });
    Sidebar.render('new-tailoring');
    document.getElementById('welcome-screen').hidden = false;
    document.getElementById('app-shell').hidden = true;
  }

  // Lets a first-time user (no career profile yet) reach Settings to
  // configure their OpenRouter key — Settings doesn't depend on a profile
  // existing, so it's safe to enter the workspace without one.
  function showSettings() {
    showWorkspace();
    AppState.set({ activeView: 'settings' });
    Sidebar.render('settings');
  }

  function init() {
    Sidebar.init();
    UploadMenu.init();
    ChatController.initComposer();
    Workflow.init();

    document.getElementById('welcome-add-resume').addEventListener('click', () => UploadMenu.trigger('upload-master-resume'));
    document.getElementById('welcome-add-linkedin').addEventListener('click', () => UploadMenu.trigger('upload-linkedin-pdf'));
    document.getElementById('welcome-paste-career').addEventListener('click', () => UploadMenu.trigger('add-career-info'));
    document.getElementById('welcome-open-settings').addEventListener('click', showSettings);

    if (AppState.get().hasProfile) {
      showWorkspace();
    } else {
      showWelcome();
    }
  }

  return { init, showWorkspace, showWelcome, showSettings };
})();

document.addEventListener('DOMContentLoaded', App.init);
