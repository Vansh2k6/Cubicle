// llm/fakeProvider.js — Deterministic scriptable fake for offline tests/evals.
// Each script entry is consumed per call:
//   {json} | {text} | {malformed:true} | {timeout:true} | {delayMs, json/text}.
// calls[] records {role, temperature} only — never full prompt text (R-66).

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cannedClassifier(events, clarify) {
  return { json: { events, clarify: clarify || [] } };
}

export function cannedText(s) {
  return { text: s };
}

export class FakeProvider {
  constructor(script = []) {
    this.script = Array.isArray(script) ? script.slice() : [];
    this.calls = [];
  }

  get callCount() {
    return this.calls.length;
  }

  async call({ role, system, messages, temperature } = {}) {
    void system;
    void messages;
    this.calls.push({ role, temperature });
    const entry = this.script.length > 0 ? this.script.shift() : { json: { events: [] } };
    if (entry.timeout) throw { code: "TIMEOUT" };
    if (entry.providerError) throw { code: "PROVIDER_ERROR" };
    if (entry.malformed) return { text: "{not-json", tokens: { in: 0, out: 0 } };
    if (entry.delayMs) await sleep(entry.delayMs);
    if (entry.json !== undefined) {
      return { text: JSON.stringify(entry.json), tokens: { in: 0, out: 0 } };
    }
    if (entry.text !== undefined) {
      return { text: entry.text, tokens: { in: 0, out: 0 } };
    }
    return { text: '{"events":[]}', tokens: { in: 0, out: 0 } };
  }

  fn() {
    return (args) => this.call(args);
  }
}
