// Central in-memory application state with a minimal pub/sub layer.
// Phase 1 keeps this purely in-memory (resets on reload). Phase 2 will
// mirror this shape into resume-tailor-data/*.json via the server.

const AppState = (() => {
  let data = {
    hasProfile: false,
    careerProfile: null,
    session: null,        // current tailoring session (job match + changes)
    activeChangeIndex: 0,
    activeTab: 'changes',
    activeView: 'new-tailoring',
    chatLog: [],
    tailoringMode: 'balanced', // 'conservative' | 'balanced' | 'strong'
  };

  const listeners = new Set();

  function get() {
    return data;
  }

  function set(patch) {
    data = { ...data, ...patch };
    listeners.forEach((fn) => fn(data));
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function addChatMessage(role, text) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    set({ chatLog: [...data.chatLog, { role, text, time }] });
  }

  return { get, set, subscribe, addChatMessage };
})();
