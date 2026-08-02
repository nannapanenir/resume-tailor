// The circular "+" composer button and its menu of upload/add actions.

const UploadMenu = (() => {
  const plusBtn = document.getElementById('composer-plus-btn');
  const menu = document.getElementById('plus-menu');
  const fileInput = document.getElementById('file-input');

  const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
  const RESUME_TYPES = ['.pdf', '.docx'];
  const JD_TYPES = ['.pdf', '.docx', '.txt'];

  function openMenu() {
    menu.hidden = false;
    plusBtn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menu.hidden = true;
    plusBtn.setAttribute('aria-expanded', 'false');
  }

  function validFileType(file, allowed) {
    const name = file.name.toLowerCase();
    return allowed.some((ext) => name.endsWith(ext));
  }

  function requestFile(allowedTypes, onFile) {
    fileInput.value = '';
    fileInput.accept = allowedTypes.join(',');
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (!validFileType(file, allowedTypes)) {
        Toast.show(`Unsupported file type. Please use ${allowedTypes.join(', ')}`, 'error');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        Toast.show('File is too large (max 10 MB).', 'error');
        return;
      }
      onFile(file);
    };
    fileInput.click();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });
  }

  async function handleMasterResumeFile(file) {
    const aiStatus = await AIClient.getStatus();
    if (!aiStatus.configured) {
      Toast.show('Add an OpenRouter API key in Settings before uploading a resume.', 'error');
      ChatController.addAssistant(
        `I received "${file.name}", but I need an OpenRouter API key configured in Settings before I can extract your real resume content. Open "Settings" in the sidebar to add one, then upload again.`
      );
      return;
    }
    WelcomeStatus.show(`Reading "${file.name}"…`);
    try {
      const fileBase64 = await fileToBase64(file);
      WelcomeStatus.show(`Extracting text and structuring your career profile with OpenRouter — this can take up to a minute…`);
      ChatController.addAssistant(`Extracting text from "${file.name}" and structuring it into your career profile using OpenRouter…`);
      const profile = await AIClient.parseResume(file.name, fileBase64);
      AppState.set({ hasProfile: true, careerProfile: profile });
      Toast.show(`${file.name} parsed successfully.`, 'success');
      ChatController.addAssistant(
        `I extracted your career profile from "${file.name}". Everything is marked "Extracted" — open "Career Profile" in the sidebar to review it for accuracy, then paste a job description below to tailor it.`
      );
      WelcomeStatus.hide();
      App.showWorkspace();
    } catch (e) {
      const message = `Couldn't parse "${file.name}": ${e.message || 'unknown error'}. Check the file and try again, or use "Add Career Information" to enter details manually.`;
      WelcomeStatus.showError(message);
      ChatController.addAssistant(message);
    }
  }

  function handleLinkedInFile(file) {
    WelcomeStatus.show(`Reading "${file.name}"…`);
    setTimeout(() => {
      WelcomeStatus.hide();
      Toast.show(`${file.name} received as a supplement.`, 'success');
      ChatController.addAssistant(
        `Got your LinkedIn export "${file.name}". LinkedIn PDF parsing isn't implemented yet, so it won't change your verified profile. Upload your master resume, or use "Add Career Information" to add details manually.`
      );
    }, 600);
  }

  function handleJobDescriptionFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = () => ChatController.startFromJD(reader.result, file.name);
      reader.readAsText(file);
    } else {
      Toast.show(`Received ${file.name}.`, 'info');
      ChatController.addAssistant(
        `I received "${file.name}". PDF/DOCX text extraction for job descriptions arrives in Phase 2. For now, please use "Paste Job Description" so I can analyze the text directly.`
      );
    }
  }

  function openPasteJobDescriptionModal() {
    Modal.open({
      title: 'Paste Job Description',
      bodyHTML: `
        <label for="jd-textarea" class="field-label">Paste the full job description text</label>
        <textarea id="jd-textarea" class="field-textarea" rows="10" placeholder="Paste job description here..."></textarea>
      `,
      buttons: [
        { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
        {
          label: 'Analyze',
          className: 'btn btn--primary',
          onClick: (close) => {
            const text = document.getElementById('jd-textarea').value.trim();
            if (!text) { Toast.show('Please paste some text first.', 'error'); return; }
            close();
            ChatController.startFromJD(text);
          },
        },
      ],
    });
  }

  function openPasteCareerInfoModal() {
    Modal.open({
      title: 'Add Career Information',
      bodyHTML: `
        <label for="career-textarea" class="field-label">Describe your experience, skills, or achievements</label>
        <textarea id="career-textarea" class="field-textarea" rows="8" placeholder="e.g. I have hands-on experience with Kubernetes and Terraform, deployed via Jenkins pipelines..."></textarea>
        <p class="field-hint">This is added to your profile as "user-added" and can be used in future tailoring. Protected facts (employer, dates, degrees) are never changed this way.</p>
      `,
      buttons: [
        { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
        {
          label: 'Add to Profile',
          className: 'btn btn--primary',
          onClick: (close) => {
            const text = document.getElementById('career-textarea').value.trim();
            if (!text) { Toast.show('Please enter some text first.', 'error'); return; }
            const added = extractSkillsFromText(text);
            const state = AppState.get();
            const profile = state.careerProfile || buildEmptyProfile();
            const existing = new Set(profile.skills.map((s) => s.name));
            const newly = added.filter((s) => !existing.has(s));
            newly.forEach((s) => profile.skills.push({ name: s, status: 'user-added' }));
            AppState.set({ hasProfile: true, careerProfile: profile });
            close();
            App.showWorkspace();
            if (newly.length) {
              ChatController.addAssistant(`Added ${newly.join(', ')} to your verified skills (marked "user-added"). Future job-description matches will consider ${newly.length > 1 ? 'these' : 'it'}.`);
            } else {
              ChatController.addAssistant('Noted — I didn\'t find any new recognizable skills in that text, but the note has been saved to your profile.');
            }
          },
        },
      ],
    });
  }

  function openAddProjectModal() {
    Modal.open({
      title: 'Add Project',
      bodyHTML: `
        <label class="field-label" for="proj-name">Project name</label>
        <input id="proj-name" class="field-input" type="text" placeholder="e.g. Rail Ops Dashboard" />
        <label class="field-label" for="proj-desc">Description</label>
        <textarea id="proj-desc" class="field-textarea" rows="4" placeholder="What did you build or contribute?"></textarea>
        <label class="field-label" for="proj-tech">Technologies (comma separated)</label>
        <input id="proj-tech" class="field-input" type="text" placeholder="Angular, TypeScript, PrimeNG" />
      `,
      buttons: [
        { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
        {
          label: 'Add Project',
          className: 'btn btn--primary',
          onClick: (close) => {
            const name = document.getElementById('proj-name').value.trim();
            const desc = document.getElementById('proj-desc').value.trim();
            const tech = document.getElementById('proj-tech').value.split(',').map((t) => t.trim()).filter(Boolean);
            if (!name) { Toast.show('Please enter a project name.', 'error'); return; }
            const state = AppState.get();
            const profile = state.careerProfile;
            if (!profile || !profile.experience.length) {
              Toast.show('Add a resume with at least one work experience first, so this project has somewhere to attach.', 'error');
              return;
            }
            const targetExp = profile.experience[0];
            targetExp.projects = targetExp.projects || [];
            targetExp.projects.push({ name, description: desc, technologies: tech, status: 'user-added' });
            const existingSkills = new Set(profile.skills.map((s) => s.name));
            tech.forEach((t) => { if (!existingSkills.has(t)) profile.skills.push({ name: t, status: 'user-added' }); });
            AppState.set({ hasProfile: true, careerProfile: profile });
            close();
            App.showWorkspace();
            Toast.show(`Project "${name}" added to ${targetExp.company}.`, 'success');
          },
        },
      ],
    });
  }

  function openAddCertificationModal() {
    Modal.open({
      title: 'Add Certification',
      bodyHTML: `
        <label class="field-label" for="cert-name">Certification name</label>
        <input id="cert-name" class="field-input" type="text" placeholder="e.g. Certified Kubernetes Administrator" />
        <label class="field-label" for="cert-issuer">Issuer</label>
        <input id="cert-issuer" class="field-input" type="text" placeholder="e.g. CNCF" />
        <label class="field-label" for="cert-year">Year</label>
        <input id="cert-year" class="field-input" type="text" placeholder="e.g. 2024" />
      `,
      buttons: [
        { label: 'Cancel', className: 'btn btn--secondary', onClick: (close) => close() },
        {
          label: 'Add Certification',
          className: 'btn btn--primary',
          onClick: (close) => {
            const name = document.getElementById('cert-name').value.trim();
            const issuer = document.getElementById('cert-issuer').value.trim();
            const year = document.getElementById('cert-year').value.trim();
            if (!name) { Toast.show('Please enter a certification name.', 'error'); return; }
            const state = AppState.get();
            const profile = state.careerProfile || buildEmptyProfile();
            profile.certifications.push({ id: `cert-${Date.now()}`, name, issuer, year, status: 'user-added' });
            const skillMatch = extractSkillsFromText(name);
            const existingSkills = new Set(profile.skills.map((s) => s.name));
            skillMatch.forEach((s) => { if (!existingSkills.has(s)) profile.skills.push({ name: s, status: 'user-added' }); });
            AppState.set({ hasProfile: true, careerProfile: profile });
            close();
            App.showWorkspace();
            Toast.show(`Certification "${name}" added.`, 'success');
          },
        },
      ],
    });
  }

  const ACTIONS = {
    'upload-master-resume': () => requestFile(RESUME_TYPES, handleMasterResumeFile),
    'upload-linkedin-pdf': () => requestFile(['.pdf'], handleLinkedInFile),
    'upload-job-description': () => requestFile(JD_TYPES, handleJobDescriptionFile),
    'paste-job-description': openPasteJobDescriptionModal,
    'add-career-info': openPasteCareerInfoModal,
    'add-project': openAddProjectModal,
    'add-certification': openAddCertificationModal,
  };

  function init() {
    plusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden ? openMenu() : closeMenu();
    });
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      closeMenu();
      const action = ACTIONS[btn.dataset.action];
      if (action) action();
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== plusBtn) closeMenu();
    });
  }

  return { init, trigger: (name) => ACTIONS[name] && ACTIONS[name]() };
})();
