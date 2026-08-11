// Some models — especially "reasoning" ones — wrap their JSON answer in a
// <think>...</think> block, markdown code fences, or stray prose, even
// when explicitly told to respond with ONLY JSON. This extracts the JSON
// object robustly instead of assuming the whole response is clean JSON,
// and reports enough of the raw text on failure to actually debug it.

function extractJsonObject(raw) {
  let text = String(raw).trim();

  // Strip a leading reasoning/thinking block some models emit regardless
  // of instructions.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences.
  text = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

  // If prose still surrounds the JSON, take the substring from the first
  // "{" to the matching last "}" rather than requiring the whole string
  // to be valid JSON on its own.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    const snippet = String(raw).slice(0, 300);
    throw new Error(`No JSON object found in the AI response. Response started with: ${snippet}`);
  }
  const candidate = text.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch (e) {
    const snippet = candidate.slice(0, 300);
    throw new Error(`The AI response looked like JSON but failed to parse (${e.message}). Response started with: ${snippet}`);
  }
}

module.exports = { extractJsonObject };
