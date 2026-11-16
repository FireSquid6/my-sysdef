/**
 * JSON state v1: columns[4], chronological active stack, chronological
 * retired stacks, count, score, victoryLatched, initialColumns and profile.
 * Score is validated by replaying every stack prefix, not trusted on restore.
 * Completion consumes the deck; reaching 61 does not disable further plays.
 */
export const title = "Cribbage Solitaire";
export const policies = [
  "LCG32/Fisher–Yates round-robin deal, not publisher seed mapping.",
  "Suffix pegging scoring; consumeDeck completion, forced automatic reset (explicit resetMode supported). No go/last-card points.",
];
export const rules = [
  "Play one exposed card to the stack without exceeding 31. You cannot pass a card that fits.",
  "Score 61 by deck exhaustion. First Jack +2; 15/31 +2; equal suffix 2/6/12; longest consecutive suffix 3–7.",
  "When none fit, start a fresh stack. Suits never affect scoring.",
];
const copy = (x) => JSON.parse(JSON.stringify(x));
const top = (a) => a[a.length - 1];
const value = (c) => Math.min(c.rank, 10);
const deck = () =>
  ["hearts", "diamonds", "spades", "clubs"].flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({
      id: `${suit}-${i + 1}`,
      suit,
      rank: i + 1,
    })),
  );
function points(a) {
  const r = top(a).rank,
    count = a.reduce((n, c) => n + value(c), 0);
  let p =
      (a.length === 1 && r === 11 ? 2 : 0) + ([15, 31].includes(count) ? 2 : 0),
    same = 0;
  for (let i = a.length - 1; i >= 0 && a[i].rank === r; i--) same++;
  p += { 1: 0, 2: 2, 3: 6, 4: 12 }[same] || 0;
  let run = 0;
  for (let k = 3; k <= Math.min(7, a.length); k++) {
    const ranks = a.slice(-k).map((c) => c.rank);
    if (
      new Set(ranks).size === k &&
      Math.max(...ranks) - Math.min(...ranks) === k - 1
    )
      run = k;
  }
  return p + run;
}
export function newGame(seed = 1, profile = {}) {
  let n = Number(seed) >>> 0;
  const d = deck();
  for (let i = 51; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((n / 4294967296) * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  const columns = Array.from({ length: 4 }, () => []);
  d.forEach((c, i) => columns[i % 4].push(c));
  return {
    version: 1,
    seed,
    revision: 0,
    columns,
    initialColumns: copy(columns),
    active: [],
    retired: [],
    playedFrom: [], // source-column witness, aligned with retired.flat() + active
    count: 0,
    score: 0,
    victoryLatched: false,
    profile: {
      resetMode: profile.resetMode === "explicit" ? "explicit" : "automatic",
    },
  };
}
const remaining = (s) => s.columns.some((c) => c.length);
export function legalActions(s) {
  if (!remaining(s)) return [];
  const a = [];
  s.columns.forEach((c, i) => {
    if (c.length && s.count + value(top(c)) <= 31)
      a.push({
        type: "play",
        from: `t${i}`,
        index: c.length - 1,
        to: "active",
        label: `Play ${top(c).rank} ${top(c).suit}`,
      });
  });
  return a.length
    ? a
    : [
        {
          type: "reset",
          from: "active",
          to: "retired",
          label: "Start new stack (forced)",
        },
      ];
}
export function applyAction(s, a) {
  if (a?.revision !== undefined && a.revision !== s?.revision)
    return { error: "Stale revision" };
  const e = validateState(s);
  if (e.length) return { error: e.join("; ") };
  if (
    !legalActions(s).some(
      (x) =>
        x.type === a?.type &&
        x.from === a.from &&
        x.index === a.index &&
        x.to === a.to,
    )
  )
    return { error: "Illegal action" };
  const n = copy(s),
    effects = [];
  const reset = () => {
    n.retired.push(n.active);
    n.active = [];
    n.count = 0;
    effects.push({ type: "reset" });
  };
  if (a.type === "reset") reset();
  else {
    const column = +a.from.slice(1), c = n.columns[column].pop();
    n.playedFrom.push(column);
    n.active.push(c);
    n.count += value(c);
    const delta = points(n.active);
    n.score += delta;
    n.victoryLatched = n.score >= 61;
    effects.push({ type: "score", points: delta });
    if (
      remaining(n) &&
      n.profile.resetMode === "automatic" &&
      legalActions(n)[0].type === "reset"
    )
      reset();
  }
  n.revision++;
  return { state: n, effects };
}
export function validateState(s) {
  try {
    const e = [],
      all = s.columns.flat().concat(s.active, s.retired.flat()),
      d = deck();
    if (
      s.version !== 1 ||
      s.columns.length !== 4 ||
      !Number.isInteger(s.revision) ||
      s.revision < 0
    )
      e.push("Invalid schema");
    if (
      all.length !== 52 ||
      new Set(all.map((c) => c.id)).size !== 52 ||
      all.some(
        (c) =>
          !d.some(
            (x) => x.id === c.id && x.rank === c.rank && x.suit === c.suit,
          ),
      )
    )
      e.push("Inventory mismatch");
    if (
      !Array.isArray(s.initialColumns) ||
      s.initialColumns.length !== 4 ||
      s.initialColumns.some((c) => c.length !== 13) ||
      s.initialColumns
        .flat()
        .some(
          (c) =>
            !d.some(
              (x) => x.id === c.id && x.rank === c.rank && x.suit === c.suit,
            ),
        ) ||
      new Set(s.initialColumns.flat().map((c) => c.id)).size !== 52
    )
      e.push("Invalid initial columns");
    if (s.count !== s.active.reduce((n, c) => n + value(c), 0) || s.count > 31)
      e.push("Invalid count");
    let score = 0;
    for (const stack of [...s.retired, s.active]) {
      let count = 0;
      stack.forEach((c, i) => {
        count += value(c);
        if (count > 31) e.push("Stack exceeds 31");
        score += points(stack.slice(0, i + 1));
      });
    }
    if (s.score !== score || s.victoryLatched !== score >= 61)
      e.push("Invalid score or victory latch");
    const played = s.retired.flat().concat(s.active);
    if (!Array.isArray(s.playedFrom) || s.playedFrom.length !== played.length ||
        s.playedFrom.some(i => !Number.isInteger(i) || i < 0 || i > 3)) {
      e.push("Invalid play-source witness");
    } else {
      // Reconstruct exposure at each retirement, not just the final score.
      const columns = copy(s.columns);
      for (let i = played.length - 1; i >= 0; i--) columns[s.playedFrom[i]].push(played[i]);
      let offset = 0;
      for (const [index, stack] of [...s.retired, s.active].entries()) {
        for (const card of stack) {
          if (columns[s.playedFrom[offset]].pop()?.id !== card.id) e.push("Invalid exposure history");
          offset++;
        }
        if (index < s.retired.length) {
          const count = stack.reduce((n, c) => n + value(c), 0);
          if (!stack.length || !columns.some(c => c.length) ||
              columns.some(c => c.length && count + value(top(c)) <= 31))
            e.push("Illegal voluntary stack reset");
        }
      }
    }
    if (!["automatic", "explicit"].includes(s.profile.resetMode))
      e.push("Invalid profile");
    return e;
  } catch {
    return ["Malformed state"];
  }
}
export const status = (s) =>
  remaining(s) ? "in-progress" : s.score >= 61 ? "won" : "lost";
export function view(s) {
  const card = (c) => ({
    id: c.id,
    label: `${{ 1: "A", 11: "J", 12: "Q", 13: "K" }[c.rank] || c.rank} ${c.suit}`,
  });
  return {
    zones: s.columns
      .map((c, i) => ({
        id: `t${i}`,
        label: `Column ${i + 1}`,
        cards: c.map(card),
      }))
      .concat([
        {
          id: "active",
          label: `Active (${s.count}/31)`,
          cards: s.active.map(card),
        },
        {
          id: "retired",
          label: "Retired stacks",
          cards: s.retired.flat().map(card),
        },
      ]),
    message: `Score ${s.score}/61 · ${status(s)} · ${s.profile.resetMode} resets; consume deck`,
  };
}
