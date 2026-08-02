// Chat log rendering + the composer form. Also owns the small
// "tailoring session controller" that turns a job description into a
// session (matches Workflow/ChangeReview/JobMatchPanel to it).

const ChatController = (() => {
  const log = document.getElementById('chat-log');

  function render() {
    const { chatLog } = AppState.get();
    log.innerHTML = '';
    chatLog.forEach((msg) => {
      const row = document.createElement('div');
      row.className = `chat-row chat-row--${msg.role}`;
      if (msg.role === 'assistant') {
        row.innerHTML = `
          <div class="chat-avatar" aria-hidden="true">🤖</div>
          <div class="chat-bubble-wrap">
            <div class="chat-bubble chat-bubble--assistant">${msg.text}</div>
            <div class="chat-time">${msg.time}</div>
          </div>`;
      } else {
        row.innerHTML = `
          <div class="chat-bubble-wrap">
            <div class="chat-bubble chat-bubble--user">${msg.text}</div>
            <div class="chat-time">${msg.time}</div>
          </div>`;
      }
      log.appendChild(row);
    });
    log.scrollTop = log.scrollHeight;
  }

  function addAssistant(text) {
    AppState.addChatMessage('assistant', text);
    render();
  }
  function addUser(text) {
    AppState.addChatMessage('user', text);
    render();
  }

  function truncate(text, n) {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > n ? clean.slice(0, n) + '…' : clean;
  }

  function summarizeResult(session) {
    if (session.changes.length === 0) {
      addAssistant(`I compared this job description to your verified profile. Estimated relevance is ${session.matchBefore}%. I couldn't find a truthful way to strengthen any bullet without adding unverified claims — try "Add Career Information" if you have relevant experience not yet in your profile.`);
    } else {
      addAssistant(`Done. Estimated relevance moved from <strong>${session.matchBefore}%</strong> to <strong>${session.matchAfter}%</strong> based on ${session.changes.length} proposed change${session.changes.length > 1 ? 's' : ''}. Review each one in the Changes tab below.`);
    }
    Workflow.render();
    JobMatchPanel.render();
  }

  async function startFromJD(text, sourceLabel) {
    const state = AppState.get();
    addUser(sourceLabel ? `📥 Uploaded job description: ${sourceLabel}` : truncate(text, 220));

    const profile = state.careerProfile;
    if (!profile) {
      addAssistant('I don\'t have a verified career profile for you yet, so I can\'t tailor anything truthfully. Use the "+" menu to upload your master resume (or add career info manually) first, then paste the job description again.');
      return;
    }
    const mode = AppState.get().tailoringMode;

    const aiStatus = await AIClient.getStatus();
    if (aiStatus.configured) {
      addAssistant(`Analyzing this job description against your verified career profile using <strong>${aiStatus.model}</strong> via OpenRouter. Your resume and this job description text are being sent to OpenRouter now…`);
      try {
        const session = await AIClient.tailor(profile, text, mode);
        AppState.set({ session, activeChangeIndex: 0, activeTab: 'changes' });
        summarizeResult(session);
      } catch (e) {
        addAssistant(`OpenRouter tailoring failed (${e.message}). Falling back to the built-in local matching engine so you're not blocked.`);
        const session = buildSessionFromJD(text, profile, mode);
        AppState.set({ session, activeChangeIndex: 0, activeTab: 'changes' });
        summarizeResult(session);
      }
      return;
    }

    addAssistant('Analyzing this job description against your verified career profile…');
    setTimeout(() => {
      const session = buildSessionFromJD(text, profile, mode);
      AppState.set({ session, activeChangeIndex: 0, activeTab: 'changes' });
      summarizeResult(session);
    }, 700);
  }

  function answerQuestion(text) {
    const lower = text.toLowerCase();
    if (lower.includes('score') || lower.includes('match') || lower.includes('percent')) {
      return 'The match percentage is an "Estimated Resume Relevance" score — it\'s not the employer\'s actual ATS score. It\'s calculated from required/preferred skill coverage, responsibility alignment, and evidence strength, all traceable to your verified profile. See the Match Analysis tab for the full breakdown.';
    }
    if (lower.includes('keyword')) {
      return 'Check the Keywords tab — it lists every job-description keyword, whether it\'s required or preferred, how many times it appears before/after tailoring, and whether it\'s verified in your profile.';
    }
    if (lower.includes('export') || lower.includes('docx') || lower.includes('download')) {
      return 'Once you\'ve reviewed the proposed changes, use "Generate ATS Resume" in the Job Match panel on the right.';
    }
    if (lower.includes('truth') || lower.includes('lie') || lower.includes('invent') || lower.includes('fake')) {
      return 'I never invent skills, projects, certifications, achievements, or metrics, and I never change employer names, job titles, dates, or degrees without your explicit approval. Every proposed change lists the exact evidence from your verified profile that supports it.';
    }
    return 'You can paste a job description here (or use the "+" menu) and I\'ll compare it to your verified career profile, propose truthful resume changes, and show you an explainable relevance score.';
  }

  function initComposer() {
    const form = document.getElementById('composer-form');
    const input = document.getElementById('composer-input');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';

      const looksLikeJD = text.length > 200 || /responsibilit|requirement|qualification|years of experience/i.test(text);
      if (looksLikeJD) {
        startFromJD(text);
      } else {
        addUser(text);
        setTimeout(() => addAssistant(answerQuestion(text)), 300);
      }
    });
  }

  return { render, addAssistant, addUser, startFromJD, initComposer };
})();
