// Pure rules only. Arrays are base -> exposed; no publisher assets or runtime APIs.
const clone = value => JSON.parse(JSON.stringify(value));
const last = cards => cards[cards.length - 1];
// FNV-1a seed encoding + mulberry32-v1, Fisher-Yates. Not publisher seeds.
function shuffled(deck, seed) {
  let x = 2166136261;
  for (const c of String(seed)) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0;
  const cards = clone(deck);
  for (let i = cards.length - 1; i > 0; i--) {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = Math.imul(x ^ (x >>> 15), x | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const j = Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function metadata(game, seed, deck) {
  return {version: 1, game, seed: String(seed), rng: 'fnv1a-mulberry32-v1',
    initialPermutation: deck.map(c => c.id), revision: 0};
}
function inventoryErrors(state, deck, cards) {
  const errors = [];
  const expected = new Map(deck.map(c => [c.id, c]));
  const seen = new Set();
  for (const c of cards) {
    const e = c && expected.get(c.id);
    if (!e || Object.keys(e).some(k => c[k] !== e[k])) errors.push('Invalid card identity');
    if (c && seen.has(c.id)) errors.push('Duplicate card: ' + c.id);
    if (c) seen.add(c.id);
  }
  if (cards.length !== deck.length || seen.size !== deck.length) errors.push('Incomplete inventory');
  if (state.version !== 1 || state.game !== GAME || state.rng !== 'fnv1a-mulberry32-v1' ||
      typeof state.seed !== 'string' || !Number.isInteger(state.revision) || state.revision < 0)
    errors.push('Invalid metadata');
  if (!Array.isArray(state.initialPermutation) || state.initialPermutation.length !== deck.length ||
      new Set(state.initialPermutation).size !== deck.length ||
      state.initialPermutation.some(id => !expected.has(id))) errors.push('Invalid initial permutation');
  return errors;
}
function chosenAction(state, action) {
  if (!action || typeof action !== 'object') return null;
  return legalActions(state).find(a => {
    const keys = new Set([...Object.keys(a), ...Object.keys(action)]);
    return [...keys].every(k => k === 'label' ||
      (k === 'revision' && action[k] === undefined) || a[k] === action[k]);
  });
}
function action(state, type, from, index, to, extra = {}) {
  return {type, ...(from === undefined ? {} : {from, index}),
    ...(to === undefined ? {} : {to}), ...extra, revision: state.revision,
    label: type + (from ? ' ' + from + '[' + index + ']' : '') + (to ? ' → ' + to : '')};
}
function shown(c) { return {id: c.id, label: c.label || c.id}; }

export const title = 'Cluj Solitaire';
const GAME = 'cluj';
const RANKS = ['6','7','8','9','10','V','D','K','T'];
const SUITS = ['clubs','diamonds','hearts','spades'];
const deck = () => SUITS.flatMap(suit => RANKS.map((rank, value) => ({id: `${suit}-${rank}`, suit, rank, value})));
export const policies = ['Seeded uniform 6×6 round-robin deal; original RNG/filter unknown; no solvability guarantee.',
  'Any rank may enter an empty column (secondary evidence). Board-rooted complete runs collapse automatically, including uncovered source runs.',
  'Cheats are available alongside normal moves; multiple marked columns allowed. No column-height limit.'];
export const rules = ['Build down by one rank regardless of suit; T is highest. Move any descending suffix.',
  'Cheat with one exposed unmarked card onto an invalid nonempty destination. Nothing may cover it; recover only with a normal move.',
  'Four entire T–6 columns lock permanently and win.'];
const ordered = cards => cards.every((c, i) => !i || cards[i - 1].value === c.value + 1);
const complete = c => c.cards.length === 9 && ordered(c.cards) && !c.cheatedExposedId;
function normalize(s) { for (const c of s.columns) if (complete(c)) c.locked = true; }
export function newGame(seed = 1) {
  const cards = shuffled(deck(), seed);
  const s = {...metadata(GAME, seed, cards), profile: 'standard', moveCount: 0, cheatMovesUsed: 0,
    columns: Array.from({length: 6}, () => ({cards: [], locked: false, cheatedExposedId: null}))};
  cards.forEach((c, i) => s.columns[i % 6].cards.push(c));
  normalize(s); return s;
}
export function validateState(s) {
  try {
    const errors = inventoryErrors(s, deck(), s.columns.flatMap(c => c.cards));
    if (s.profile !== 'standard' || s.columns.length !== 6) errors.push('Invalid board/profile');
    for (const c of s.columns) {
      if (!Array.isArray(c.cards) || typeof c.locked !== 'boolean') errors.push('Invalid column');
      if (c.cheatedExposedId !== null && (c.locked || !c.cards.length || c.cheatedExposedId !== last(c.cards).id || c.cards.length < 2 || c.cards[c.cards.length-2].value === last(c.cards).value + 1)) errors.push('Invalid cheat marker');
      if (c.locked !== complete(c)) errors.push('Invalid/un-normalized lock');
    }
    if (![s.moveCount, s.cheatMovesUsed].every(n => Number.isInteger(n) && n >= 0) || s.cheatMovesUsed > s.moveCount || s.moveCount !== s.revision) errors.push('Invalid counters');
    return errors;
  } catch { return ['Malformed Cluj state']; }
}
function won(s) { return s.columns.filter(c => c.locked).length === 4; }
export function legalActions(s) {
  if (validateState(s).length || won(s)) return [];
  const out = [];
  s.columns.forEach((src, i) => {
    if (src.locked) return;
    src.cards.forEach((card, index) => {
      const run = src.cards.slice(index), single = run.length === 1;
      s.columns.forEach((dst, j) => {
        if (i === j || dst.locked || dst.cheatedExposedId) return;
        const fits = !dst.cards.length || last(dst.cards).value === card.value + 1;
        if (fits && ordered(run) && (!src.cheatedExposedId || single)) out.push(action(s, 'move', `t${i}`, index, `t${j}`));
        if (!fits && single && !src.cheatedExposedId) out.push(action(s, 'cheat', `t${i}`, index, `t${j}`));
      });
    });
  });
  return out;
}
export function applyAction(s, request) {
  const a = chosenAction(s, request);
  if (!a) return {error: 'Illegal or stale action / invalid state'};
  const n = clone(s), src = n.columns[+a.from.slice(1)], dst = n.columns[+a.to.slice(1)];
  const run = src.cards.splice(a.index);
  src.cheatedExposedId = null;
  dst.cards.push(...run);
  dst.cheatedExposedId = a.type === 'cheat' ? run[0].id : null;
  n.cheatMovesUsed += a.type === 'cheat' ? 1 : 0;
  n.moveCount++; n.revision++; normalize(n);
  const errors = validateState(n);
  return errors.length ? {error: errors.join('; ')} : {state: n, effects: []};
}
export function status(s) { return validateState(s).length ? 'lost' : won(s) ? 'won' : legalActions(s).length ? 'in-progress' : 'no-legal-actions'; }
export function view(s) {
  return {zones: s.columns.map((c, i) => ({id: `t${i}`, label: `Column ${i+1}${c.locked ? ' — locked' : ''}`,
    locked: c.locked, cards: c.cards.map(card => ({...shown(card), label: card.rank + ' ' + card.suit + (c.cheatedExposedId === card.id ? ' [CHEATED: recover normally]' : '')}))})),
    message: 'T > K > D > V > 10 > 9 > 8 > 7 > 6. Cheating marks only the moved card.'};
}
