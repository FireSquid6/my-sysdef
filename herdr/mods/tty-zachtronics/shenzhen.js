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

export const title = 'Shenzhen Solitaire';
const GAME = 'shenzhen';
const SUITS = ['bamboo','characters','dots'];
const DRAGONS = ['red','green','white'];
const deck = () => [...SUITS.flatMap(suit => Array.from({length: 9}, (_, i) => ({id: `${suit}-${i+1}`, kind: 'number', suit, rank: i+1}))),
  ...DRAGONS.flatMap(dragonType => Array.from({length: 4}, (_, copy) => ({id: `dragon-${dragonType}-${copy}`, kind: 'dragon', dragonType, copy}))), {id: 'flower', kind: 'flower'}];
export const policies = ['Default conservative auto: flower, legal ranks 1/2, then ranks whose lower ranks are all home. Exact publisher auto threshold unknown; off and flowerOnly available.',
  'Matching occupied dragon cell is eligible (secondary-supported fallback; configurable matchingDragonCellEligible). Cell-to-cell transfers allowed as an unverified convenience.',
  'Fixed suit foundation IDs; uniform seeded shuffle, consecutive five-card columns. Original RNG/filter unknown; no guaranteed solvability.'];
export const rules = ['Build down one with adjacent suits different, not necessarily two-suit alternation. Ordered number suffixes move without a capacity limit.',
  'Empty columns accept any run/single card; cells hold one card. Flower homes separately.',
  'Collect four already-exposed matching dragons into an empty or matching-dragon cell. Collection is manual and permanently seals the cell.',
  'Build all three suits 1–9, home flower, and collect all dragons to win. No foundation withdrawal.'];
const fits = (a,b) => a.kind === 'number' && b.kind === 'number' && a.rank === b.rank + 1 && a.suit !== b.suit;
const ordered = cs => cs.every((c, i) => !i || fits(cs[i-1], c));
function sources(s) { return [...s.columns.map((cards, i) => ({id: `t${i}`, cards})), ...s.cells.map((cell, i) => ({id: `c${i}`, cards: cell.kind === 'single' ? cell.cards : []}))]; }
function home(s, src) {
  const c = src.cards.pop();
  if (src.id[0] === 'c') s.cells[+src.id.slice(1)].kind = 'empty';
  if (c.kind === 'flower') s.flowerHome = true;
  else s.foundationHeight[c.suit]++;
}
function stabilize(s) {
  if (s.autoPolicy === 'off') return;
  while (true) {
    const candidates = sources(s).filter(src => {
      const c = last(src.cards);
      return c && (c.kind === 'flower' || s.autoPolicy === 'conservative' && c.kind === 'number' &&
        c.rank === s.foundationHeight[c.suit] + 1 && (c.rank <= 2 || SUITS.every(suit => s.foundationHeight[suit] >= c.rank - 1)));
    });
    candidates.sort((a,b) => {
      const x = last(a.cards), y = last(b.cards);
      return (x.rank || 0) - (y.rank || 0) || SUITS.indexOf(x.suit) - SUITS.indexOf(y.suit);
    });
    if (!candidates.length) break;
    home(s, candidates[0]);
  }
}
export function newGame(seed = 1, profile = {}) {
  const autoPolicy = typeof profile === 'string' ? profile : profile.autoPolicy || 'conservative';
  if (!['off','flowerOnly','conservative'].includes(autoPolicy)) throw new Error('Unknown Shenzhen auto policy');
  const cards = shuffled(deck(), seed);
  const s = {...metadata(GAME, seed, cards), autoPolicy,
    matchingDragonCellEligible: typeof profile === 'object' ? profile.matchingDragonCellEligible ?? true : true,
    columns: Array.from({length: 8}, (_, i) => cards.slice(i*5,i*5+5)),
    cells: Array.from({length: 3}, () => ({kind: 'empty', cards: []})),
    foundationHeight: Object.fromEntries(SUITS.map(suit => [suit, 0])), flowerHome: false};
  stabilize(s); return s;
}
export function validateState(s) {
  try {
    const homes = deck().filter(c => c.kind === 'number' && c.rank <= s.foundationHeight[c.suit] || c.kind === 'flower' && s.flowerHome);
    const errors = inventoryErrors(s, deck(), [...s.columns.flat(), ...s.cells.flatMap(c => c.cards), ...homes]);
    if (s.columns.length !== 8 || !s.columns.every(Array.isArray) || s.cells.length !== 3) errors.push('Invalid board');
    if (!['off','flowerOnly','conservative'].includes(s.autoPolicy) || typeof s.matchingDragonCellEligible !== 'boolean' || typeof s.flowerHome !== 'boolean') errors.push('Invalid profile/home');
    if (Object.keys(s.foundationHeight).length !== 3 || !SUITS.every(suit => Number.isInteger(s.foundationHeight[suit]) && s.foundationHeight[suit] >= 0 && s.foundationHeight[suit] <= 9)) errors.push('Invalid foundations');
    for (const cell of s.cells) {
      if (!Array.isArray(cell.cards) || !['empty','single','sealed'].includes(cell.kind) || cell.cards.length !== ({empty: 0, single: 1, sealed: 4}[cell.kind])) errors.push('Invalid cell');
      if (cell.kind === 'sealed' && (!DRAGONS.includes(cell.dragonType) || !cell.cards.every(c => c.kind === 'dragon' && c.dragonType === cell.dragonType))) errors.push('Invalid dragon seal');
      if (cell.kind !== 'sealed' && cell.dragonType !== undefined) errors.push('Unexpected dragon seal type');
    }
    return errors;
  } catch { return ['Malformed Shenzhen state']; }
}
function won(s) { return s.flowerHome && SUITS.every(suit => s.foundationHeight[suit] === 9) && s.cells.every(c => c.kind === 'sealed'); }
function dragonAction(s, type) {
  const exposed = sources(s).filter(src => { const c = last(src.cards); return c && c.kind === 'dragon' && c.dragonType === type; });
  if (exposed.length !== 4) return null;
  const destination = s.cells.findIndex(c => c.kind === 'empty' || s.matchingDragonCellEligible && c.kind === 'single' && c.cards[0].kind === 'dragon' && c.cards[0].dragonType === type);
  return destination < 0 ? null : action(s, 'collect', undefined, undefined, `c${destination}`, {dragonType: type});
}
export function legalActions(s) {
  if (validateState(s).length || won(s)) return [];
  const out = [];
  for (const src of sources(s)) src.cards.forEach((c, index) => {
    const run = src.cards.slice(index);
    if (!ordered(run)) return;
    s.columns.forEach((dst,i) => { if (src.id !== `t${i}` && (!dst.length || fits(last(dst), c))) out.push(action(s, 'move', src.id,index,`t${i}`)); });
    if (run.length !== 1) return;
    s.cells.forEach((dst,i) => { if (dst.kind === 'empty' && src.id !== `c${i}`) out.push(action(s,'move',src.id,index,`c${i}`)); });
    if (c.kind === 'flower' && !s.flowerHome) out.push(action(s,'flower',src.id,index,'flower'));
    if (c.kind === 'number' && c.rank === s.foundationHeight[c.suit] + 1) out.push(action(s,'foundation',src.id,index,`f-${c.suit}`));
  });
  for (const type of DRAGONS) { const a = dragonAction(s,type); if (a) out.push(a); }
  return out;
}
export function applyAction(s, request) {
  const a = chosenAction(s, request);
  if (!a) return {error: 'Illegal or stale action / invalid state'};
  const n = clone(s);
  if (a.type === 'collect') {
    const cards = [];
    for (const src of sources(n)) {
      const c = last(src.cards);
      if (c && c.kind === 'dragon' && c.dragonType === a.dragonType) {
        cards.push(src.cards.pop());
        if (src.id[0] === 'c') n.cells[+src.id.slice(1)].kind = 'empty';
      }
    }
    n.cells[+a.to.slice(1)] = {kind: 'sealed', dragonType: a.dragonType, cards};
  } else {
    const src = sources(n).find(src => src.id === a.from);
    if (a.type === 'foundation' || a.type === 'flower') home(n, src);
    else {
      const cards = src.cards.splice(a.index);
      if (src.id[0] === 'c') n.cells[+src.id.slice(1)].kind = 'empty';
      if (a.to[0] === 't') n.columns[+a.to.slice(1)].push(...cards);
      else n.cells[+a.to.slice(1)] = {kind: 'single', cards};
    }
  }
  stabilize(n); n.revision++;
  const errors = validateState(n);
  return errors.length ? {error: errors.join('; ')} : {state: n, effects: []};
}
export function status(s) { return validateState(s).length ? 'lost' : won(s) ? 'won' : legalActions(s).length ? 'in-progress' : 'no-legal-actions'; }
export function view(s) {
  const display = c => ({...shown(c), label: c.kind === 'number' ? `${c.rank} ${c.suit}` : c.kind === 'dragon' ? `${c.dragonType} dragon` : 'Flower'});
  return {zones: [...s.columns.map((cards,i) => ({id: `t${i}`,label: `Column ${i+1}`,cards: cards.map(display)})),
    ...s.cells.map((c,i) => ({id: `c${i}`,label: `Cell ${i+1}: ${c.kind}`,locked: c.kind === 'sealed',cards: c.cards.map(display)})),
    ...SUITS.map(suit => ({id: `f-${suit}`,label: `${suit} foundation`,cards: deck().filter(c => c.kind === 'number' && c.suit === suit && c.rank <= s.foundationHeight[suit]).map(display)})),
    {id: 'flower',label: 'Flower home',cards: s.flowerHome ? [{id: 'flower',label: 'Flower'}] : []}],
    message: `Auto: ${s.autoPolicy}; matching occupied dragon cell ${s.matchingDragonCellEligible ? 'eligible' : 'ineligible'}. Dragon collection is manual.`};
}
