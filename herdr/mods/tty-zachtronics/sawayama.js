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

export const title = 'Sawayama Solitaire';
const GAME = 'sawayama';
const SUITS = ['clubs','diamonds','hearts','spades'];
const color = suit => ['hearts','diamonds'].includes(suit) ? 'red' : 'black';
const deck = () => SUITS.flatMap(suit => Array.from({length: 13}, (_, i) => ({id: `${suit}-${i+1}`, suit, rank: i+1})));
export const policies = ['Single stock pass, persistent waste, no foundation withdrawal (secondary evidence). Any rank or ordered suffix enters empty tableau.',
  'Default OPPOSITE_COLORS_CLEARED auto-foundations; OFF available. Conservative formula and scan order are implementation choices, not recovered publisher code or a proved safety guarantee.',
  'Seeded uniform triangular-row deal; unknown original generator/filter, no guaranteed solvability. Stock front is next draw.'];
export const rules = ['Build down alternating red/black; move any ordered exposed suffix without a storage-capacity limit.',
  'Draw three atomically; only newest waste card plays. No recycle. Empty stock becomes a reusable one-card cell even with waste remaining.',
  'Build each suit ace through king on foundations; manual exposed-card sends may override auto safety.'];
const fits = (a, b) => a.rank === b.rank + 1 && color(a.suit) !== color(b.suit);
const ordered = cs => cs.every((c, i) => !i || fits(cs[i-1], c));
function sources(s) {
  return [...s.tableau.map((cards, i) => ({id: `t${i}`, cards})), {id: 'waste', cards: s.waste}, {id: 'cell', cards: s.cell}];
}
function home(s, src) { const c = src.cards.pop(); s.foundationHeight[c.suit]++; }
function stabilize(s) {
  if (s.autoPolicy === 'OFF') return;
  while (true) {
    const src = sources(s).find(src => {
      const c = last(src.cards);
      return c && c.rank === s.foundationHeight[c.suit] + 1 &&
        (c.rank === 1 || SUITS.filter(suit => color(suit) !== color(c.suit)).every(suit => s.foundationHeight[suit] >= c.rank - 1));
    });
    if (!src) break;
    home(s, src);
  }
}
export function newGame(seed = 1, profile = {}) {
  let autoPolicy = typeof profile === 'string' ? profile : profile.autoPolicy || 'OPPOSITE_COLORS_CLEARED';
  if (autoPolicy.toLowerCase() === 'off') autoPolicy = 'OFF';
  if (!['OFF','OPPOSITE_COLORS_CLEARED'].includes(autoPolicy)) throw new Error('Unknown Sawayama auto policy');
  const cards = shuffled(deck(), seed);
  const s = {...metadata(GAME, seed, cards), autoPolicy, tableau: Array.from({length: 7}, () => []),
    stock: [], waste: [], cell: [], foundationHeight: Object.fromEntries(SUITS.map(suit => [suit, 0]))};
  let i = 0;
  for (let row = 0; row < 7; row++) for (let col = row; col < 7; col++) s.tableau[col].push(cards[i++]);
  s.stock = cards.slice(i); stabilize(s); return s;
}
export function validateState(s) {
  try {
    const foundations = deck().filter(c => c.rank <= s.foundationHeight[c.suit]);
    const errors = inventoryErrors(s, deck(), [...s.tableau.flat(), ...s.stock, ...s.waste, ...s.cell, ...foundations]);
    if (s.tableau.length !== 7 || !s.tableau.every(Array.isArray) || ![s.stock,s.waste,s.cell].every(Array.isArray) || s.cell.length > 1 || s.cell.length && s.stock.length) errors.push('Invalid board/cell');
    if (!['OFF','OPPOSITE_COLORS_CLEARED'].includes(s.autoPolicy)) errors.push('Invalid auto policy');
    if (Object.keys(s.foundationHeight).length !== 4 || !SUITS.every(suit => Number.isInteger(s.foundationHeight[suit]) && s.foundationHeight[suit] >= 0 && s.foundationHeight[suit] <= 13)) errors.push('Invalid foundations');
    return errors;
  } catch { return ['Malformed Sawayama state']; }
}
function won(s) { return SUITS.every(suit => s.foundationHeight[suit] === 13); }
export function legalActions(s) {
  if (validateState(s).length || won(s)) return [];
  const out = [];
  if (s.stock.length) out.push(action(s, 'draw', undefined, undefined, 'waste'));
  for (const src of sources(s)) src.cards.forEach((c, index) => {
    if (src.id[0] !== 't' && index !== src.cards.length - 1) return;
    const run = src.cards.slice(index);
    if (!ordered(run)) return;
    s.tableau.forEach((dst, i) => {
      if (src.id !== `t${i}` && (!dst.length || fits(last(dst), c))) out.push(action(s, 'move', src.id, index, `t${i}`));
    });
    if (run.length !== 1) return;
    if (src.id !== 'cell' && !s.stock.length && !s.cell.length) out.push(action(s, 'move', src.id, index, 'cell'));
    if (c.rank === s.foundationHeight[c.suit] + 1) out.push(action(s, 'foundation', src.id, index, `f-${c.suit}`));
  });
  return out;
}
export function applyAction(s, request) {
  const a = chosenAction(s, request);
  if (!a) return {error: 'Illegal or stale action / invalid state'};
  const n = clone(s);
  if (a.type === 'draw') n.waste.push(...n.stock.splice(0, 3));
  else {
    const src = sources(n).find(src => src.id === a.from);
    if (a.type === 'foundation') home(n, src);
    else {
      const dst = sources(n).find(dst => dst.id === a.to);
      dst.cards.push(...src.cards.splice(a.index));
    }
  }
  stabilize(n); n.revision++;
  const errors = validateState(n);
  return errors.length ? {error: errors.join('; ')} : {state: n, effects: []};
}
export function status(s) { return validateState(s).length ? 'lost' : won(s) ? 'won' : legalActions(s).length ? 'in-progress' : 'no-legal-actions'; }
export function view(s) {
  const display = c => ({...shown(c), label: `${['','A','2','3','4','5','6','7','8','9','10','J','Q','K'][c.rank]} ${c.suit}`, color: color(c.suit)});
  return {zones: [...sources(s).map(src => ({id: src.id, label: src.id === 'cell' ? (s.stock.length ? 'Cell unavailable until stock empty' : 'Single-card cell') : src.id,
    cards: src.cards.map(display)})),
    {id: 'stock', label: `Stock (${s.stock.length}) — draw three`, cards: s.stock.map((_, i) => ({id: `hidden-stock-${i}`, label: 'Face-down', hidden: true}))},
    ...SUITS.map(suit => ({id: `f-${suit}`, label: `${suit} foundation`, cards: deck().filter(c => c.suit === suit && c.rank <= s.foundationHeight[suit]).map(display)}))],
    message: `Auto: ${s.autoPolicy}. Single pass; no recycle or foundation retrieval.`};
}
