// engine/store.js — P1 in-memory session store (ESM, ZERO imports).
// The engine module is injected via the constructor (dependency injection)
// so this file keeps zero imports and stays R-16 scan-clean. Snapshots are
// produced by the engine itself; dump() returns a STRING (no file access).

export class SessionStore {
  constructor(engine) {
    this.engine = engine || null;
    this.sessions = new Map();
  }

  bind(engine) {
    this.engine = engine;
    return this;
  }

  _needEngine() {
    if (!this.engine) throw new Error("SessionStore: engine not bound");
  }

  create(scenario, opts) {
    this._needEngine();
    const s = this.engine.createSession(scenario, opts);
    this.sessions.set(s.id, s);
    return s;
  }

  getState(id) {
    return this.sessions.get(id) || null;
  }

  applyTurn(id, npc, events, opts) {
    this._needEngine();
    const s = this.sessions.get(id);
    if (!s) throw new Error("unknown session: " + id);
    return this.engine.applyTurn(s, npc, events, opts);
  }

  getSnapshot(id, turn) {
    const s = this.sessions.get(id);
    if (!s) throw new Error("unknown session: " + id);
    return s.snapshots[turn - 1] || null;
  }

  endSession(id, reason) {
    const s = this.sessions.get(id);
    if (!s) throw new Error("unknown session: " + id);
    s.ended = true;
    s.endReason = reason || "user_ended";
    return s;
  }

  dump(id) {
    const s = this.sessions.get(id);
    if (!s) throw new Error("unknown session: " + id);
    return JSON.stringify(s);
  }
}
