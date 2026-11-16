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

export const title = 'Kabufuda Solitaire';
const GAME = 'kabufuda';
const OPEN = {Easy: 4, Normal: 3, Hard: 2, Expert: 1};
const deck = () => Array.from({length: 10}, (_, i) => Array.from({length: 4}, (_, copy) => ({id: `${i+1}-${copy}`, type: i+1, copy}))).flat();
export const policies = ['Default Normal; Medium aliases Normal. Only initial upper access changes with difficulty.',
  'EMPTY_ONLY_ONE_OR_FOUR: upper cells accept one or four into an empty cell, never 3+1 into an occupied cell (secondary-supported unresolved original detail).',
  'Left-to-right unlock; round-robin seeded uniform deal, no filter or solvability guarantee; original RNG unknown.'];
export const rules = ['Move any matching exposed suffix onto its type or an empty active column.',
  'Exactly four matching cards alone on tableau seal permanently and open one unavailable upper cell.',
  'An intact four-card run can seal in an empty upper cell without unlocking another. Seal all ten types to win.'];
const matching = cards => cards.length > 0 && cards.every(c => c.type === cards[0].type);
const active = cards => ({kind: 'active', cards});
function normalize(s) {
  for (const slot of s.tableau) if (slot.kind === 'active' && slot.cards.length === 4 && matching(slot.cards)) {
    slot.kind = 'sealed';
    const cell = s.upper.find(c => c.kind === 'unavailable');
    if (cell) cell.kind = 'empty';
  }
}
export function newGame(seed = 1, profile = {}) {
  let difficulty = typeof profile === 'string' ? profile : profile.difficulty || 'Normal';
  difficulty = String(difficulty).toLowerCase();
  difficulty = difficulty === 'medium' ? 'Normal' : Object.keys(OPEN).find(d => d.toLowerCase() === difficulty);
  if (!difficulty) throw new Error('Unknown Kabufuda difficulty');
  const cards = shuffled(deck(), seed);
  const s = {...metadata(GAME, seed, cards), difficulty, upperCompletionPolicy: 'EMPTY_ONLY_ONE_OR_FOUR',
    tableau: Array.from({length: 8}, () => active([])),
    upper: Array.from({length: 4}, (_, i) => ({kind: i < OPEN[difficulty] ? 'empty' : 'unavailable', cards: []}))};
  cards.forEach((c, i) => s.tableau[i % 8].cards.push(c)); return s;
}
export function validateState(s) {
  try {
    const slots = [...s.tableau, ...s.upper];
    const errors = inventoryErrors(s, deck(), slots.flatMap(c => c.cards));
    if (s.tableau.length !== 8 || s.upper.length !== 4 || !OPEN[s.difficulty] || s.upperCompletionPolicy !== 'EMPTY_ONLY_ONE_OR_FOUR') errors.push('Invalid board/profile');
    slots.forEach((slot, i) => {
      const cs = slot.cards;
      if (!Array.isArray(cs)) errors.push('Invalid cards');
      if (slot.kind === 'sealed') { if (cs.length !== 4 || !matching(cs)) errors.push('Invalid seal'); }
      else if (i < 8) {
        if (slot.kind !== 'active' || cs.length === 4 && matching(cs)) errors.push('Invalid/un-normalized tableau');
      } else if (!['empty','unavailable','single'].includes(slot.kind) || cs.length !== (slot.kind === 'single' ? 1 : 0)) errors.push('Invalid upper cell');
    });
    const rewards = s.tableau.filter(c => c.kind === 'sealed').length;
    const unavailable = Math.max(0, 4 - OPEN[s.difficulty] - rewards);
    if (s.upper.filter(c => c.kind === 'unavailable').length !== unavailable || s.upper.some((c, i) => (c.kind === 'unavailable') !== (i >= 4 - unavailable))) errors.push('Invalid unlock history');
    return errors;
  } catch { return ['Malformed Kabufuda state']; }
}
function won(s) { return [...s.tableau, ...s.upper].filter(c => c.kind === 'sealed').length === 10; }
function zones(s) { return [...s.tableau.map((slot, i) => ({id: `t${i}`, slot})), ...s.upper.map((slot, i) => ({id: `u${i}`, slot}))]; }
export function legalActions(s) {
  if (validateState(s).length || won(s)) return [];
  const out = [], zs = zones(s);
  for (const src of zs) {
    if (!['active', 'single'].includes(src.slot.kind)) continue;
    src.slot.cards.forEach((card, index) => {
      const run = src.slot.cards.slice(index);
      if (!matching(run)) return;
      for (const dst of zs) {
        if (src.id === dst.id) continue;
        const d = dst.slot;
        if (d.kind === 'active' && (!d.cards.length || last(d.cards).type === card.type) ||
            d.kind === 'empty' && [1,4].includes(run.length)) out.push(action(s, 'move', src.id, index, dst.id));
      }
    });
  }
  return out;
}
export function applyAction(s, request) {
  const a = chosenAction(s, request);
  if (!a) return {error: 'Illegal or stale action / invalid state'};
  const n = clone(s), zs = zones(n), src = zs.find(z => z.id === a.from).slot, dst = zs.find(z => z.id === a.to).slot;
  const run = src.cards.splice(a.index); dst.cards.push(...run);
  if (src.kind === 'single') src.kind = 'empty';
  if (dst.kind === 'empty') dst.kind = run.length === 4 ? 'sealed' : 'single';
  normalize(n); n.revision++;
  const errors = validateState(n);
  return errors.length ? {error: errors.join('; ')} : {state: n, effects: []};
}
export function status(s) { return validateState(s).length ? 'lost' : won(s) ? 'won' : legalActions(s).length ? 'in-progress' : 'no-legal-actions'; }
export function view(s) {
  return {zones: zones(s).map(({id, slot}) => ({id, label: `${id}: ${slot.kind}`, locked: ['sealed','unavailable'].includes(slot.kind),
    cards: slot.cards.map(c => ({...shown(c), label: `Type ${c.type}${slot.kind === 'sealed' ? ' [SEALED]' : ''}`}))})),
    message: `${s.difficulty} — upper cells: empty only, one or four. Seals retain all four cards and their occupied slot.`};
}
