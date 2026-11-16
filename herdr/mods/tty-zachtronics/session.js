// Versioned replay envelope. UI selection is deliberately not authoritative state.
export const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function valid(engine, state) {
  try { return Boolean(state) && engine.validateState(state).length === 0; }
  catch { return false; }
}
export class Session {
  constructor(id, engine, seed, profile = {}) {
    this.id = id; this.engine = engine; this.seed = seed;
    this.initial = engine.newGame(seed, profile);
    if (!valid(engine, this.initial)) throw new Error(`Invalid initial deal: ${id}`);
    this.states = [clone(this.initial)]; this.commands = []; this.cursor = 0; this.sequence = 0; this.mirrorAvailable = false;
  }
  get state() { return this.states[this.cursor]; }
  get revision() { return this.sequence; }
  apply(action, revision = this.revision) {
    if (revision !== this.revision) return { error: "STALE_REVISION" };
    const result = this.engine.applyAction(clone(this.state), clone(action));
    if (result.error) return result;
    if (!valid(this.engine, result.state)) return { error: "INVALID_RESULT" };
    this.states = this.states.slice(0, this.cursor + 1);
    this.commands = this.commands.slice(0, this.cursor);
    this.commands.push(clone(action)); this.states.push(clone(result.state)); this.cursor++; this.sequence++; this.mirrorAvailable = true;
    return result;
  }
  undo() {
    if (!this.cursor || (this.id === "fortune" && !this.mirrorAvailable)) return false;
    this.cursor--; this.sequence++; this.mirrorAvailable = false; return true;
  }
  redo() {
    if (this.id === "fortune" || this.cursor >= this.commands.length) return false;
    this.cursor++; this.sequence++; return true;
  }
  restart() {
    this.states = [clone(this.initial)]; this.commands = []; this.cursor = 0;
    this.sequence++; this.mirrorAvailable = false;
  }
  serialize() {
    return clone({ schema: 1, gameId: this.id, seed: this.seed, prng: "engine-seeded-v1",
      policies: this.engine.policies, initial: this.initial, commands: this.commands,
      cursor: this.cursor, mirrorAvailable: this.mirrorAvailable, current: this.state });
  }
  static restore(id, engine, data) {
    try {
      if (data?.schema !== 1 || data.gameId !== id || data.prng !== "engine-seeded-v1" ||
          !equal(data.policies, engine.policies) || !(Number.isInteger(data.seed) || typeof data.seed === "string") ||
          !Array.isArray(data.commands) || !Number.isInteger(data.cursor) ||
          data.cursor < 0 || data.cursor > data.commands.length || typeof data.mirrorAvailable !== "boolean" ||
          (data.mirrorAvailable && data.cursor === 0) || !valid(engine, data.initial)) return null;
      const session = Object.create(Session.prototype);
      // Never generate another board to restore a save: the actual initial deal is authority.
      Object.assign(session, { id, engine, seed: data.seed, initial: clone(data.initial),
        states: [clone(data.initial)], commands: [], cursor: 0, sequence: 0, mirrorAvailable: false });
      for (const command of data.commands) if (session.apply(command).error) return null;
      session.cursor = data.cursor; session.mirrorAvailable = data.mirrorAvailable;
      return equal(session.state, data.current) ? session : null;
    } catch { return null; }
  }
}
