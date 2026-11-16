/**
 * JSON state v1: columns[9] contain {cards, locked}, plus freeCell|null.
 * Cards are bottom-to-top; initialDeal is historical, not live inventory.
 * Royal locking is a mandatory part of the same transaction as the move.
 * There is no stored phase: status derives completion from the live board.
 */
export const title = "Proletariat's Patience";
export const policies = [
  "Secondary-source nine columns of four; column-major seeded LCG32/Fisher–Yates, not original deal numbers or guaranteed solvable.",
  "Standalone royalty locks on deal and uncover; workers remain movable.",
];
export const rules = [
  "Build workers down by one in alternating colors; move any valid suffix without capacity limits.",
  "Build royalty by suit in any order. Four alone lock permanently.",
  "One card may use the free cell. Finish four worker runs and four royal sets.",
];
const suits = ["hearts", "diamonds", "spades", "clubs"];
const deck = () =>
  suits.flatMap((suit) =>
    [6, 7, 8, 9, 10, "V", "D", "K", "T"].map((rank) => ({
      id: `${suit}-${rank}`,
      suit,
      rank,
      kind: typeof rank === "number" ? "worker" : "royalty",
    })),
  );
const copy = (x) => JSON.parse(JSON.stringify(x));
const top = (a) => a[a.length - 1];
const compatible = (a, b) =>
  a.kind === b.kind &&
  (a.kind === "royalty"
    ? a.suit === b.suit
    : a.rank === b.rank + 1 &&
      suits.indexOf(a.suit) < 2 !== suits.indexOf(b.suit) < 2);
const suffix = (a) =>
  a.length > 0 && a.every((c, i) => !i || compatible(a[i - 1], c));
const royal = (a) =>
  a.length === 4 &&
  a.every((c) => c.kind === "royalty" && c.suit === a[0].suit);
const normalize = (s) =>
  s.columns.forEach((c) => {
    if (royal(c.cards)) c.locked = true;
  });
const won = (s) =>
  !s.freeCell &&
  s.columns.filter((c) => c.locked).length === 4 &&
  s.columns.filter(
    (c) => c.cards.length === 5 && c.cards[0].rank === 10 && suffix(c.cards),
  ).length === 4 &&
  s.columns.some((c) => !c.cards.length);
export function newGame(seed = 1) {
  let n = Number(seed) >>> 0;
  const a = deck();
  for (let i = a.length - 1; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((n / 4294967296) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const s = {
    version: 1,
    seed,
    revision: 0,
    columns: Array.from({ length: 9 }, (_, i) => ({
      cards: a.slice(i * 4, i * 4 + 4),
      locked: false,
    })),
    freeCell: null,
    moveCount: 0,
  };
  normalize(s);
  s.initialDeal = copy(s.columns);
  return s;
}
function moves(s) {
  if (won(s)) return [];
  const out = [];
  const sources = s.columns
    .map((c, i) => ({ id: `t${i}`, cards: c.cards, locked: c.locked }))
    .concat([
      { id: "cell", cards: s.freeCell ? [s.freeCell] : [], locked: false },
    ]);
  for (const src of sources)
    if (!src.locked)
      for (let index = 0; index < src.cards.length; index++) {
        const run = src.cards.slice(index);
        if (!suffix(run)) continue;
        for (const dst of sources) {
          if (dst.id === src.id || dst.locked) continue;
          if (
            dst.id === "cell"
              ? !dst.cards.length && run.length === 1
              : !dst.cards.length || compatible(top(dst.cards), run[0])
          )
            out.push({
              type: "move",
              from: src.id,
              index,
              to: dst.id,
              label: `Move ${run.length} from ${src.id} to ${dst.id}`,
            });
        }
      }
  return out;
}
export const legalActions = (s) => moves(s);
export function applyAction(s, a) {
  if (a?.revision !== undefined && a.revision !== s?.revision)
    return { error: "Stale revision" };
  const errors = validateState(s);
  if (errors.length) return { error: errors.join("; ") };
  const match = moves(s).find(
    (x) =>
      x.type === a?.type &&
      x.from === a.from &&
      x.index === a.index &&
      x.to === a.to,
  );
  if (!match) return { error: "Illegal move" };
  const n = copy(s);
  const run =
    a.from === "cell"
      ? [n.freeCell]
      : n.columns[+a.from.slice(1)].cards.splice(a.index);
  if (a.from === "cell") n.freeCell = null;
  if (a.to === "cell") n.freeCell = run[0];
  else n.columns[+a.to.slice(1)].cards.push(...run);
  normalize(n);
  n.moveCount++;
  n.revision++;
  return { state: n, effects: [] };
}
export function validateState(s) {
  try {
    const e = [];
    if (s.version !== 1 || s.columns.length !== 9) e.push("Invalid schema");
    const cards = s.columns
      .flatMap((c) => c.cards)
      .concat(s.freeCell ? [s.freeCell] : []);
    const expected = deck();
    if (
      cards.length !== 36 ||
      new Set(cards.map((c) => c.id)).size !== 36 ||
      cards.some(
        (c) =>
          !expected.some(
            (d) =>
              d.id === c.id &&
              d.suit === c.suit &&
              d.rank === c.rank &&
              d.kind === c.kind,
          ),
      )
    )
      e.push("Inventory mismatch");
    if (
      !Array.isArray(s.initialDeal) ||
      s.initialDeal.length !== 9 ||
      s.initialDeal.some((c) => c.cards.length !== 4) ||
      s.initialDeal
        .flatMap((c) => c.cards)
        .some(
          (c) =>
            !expected.some(
              (d) =>
                d.id === c.id &&
                d.rank === c.rank &&
                d.suit === c.suit &&
                d.kind === c.kind,
            ),
        ) ||
      new Set(s.initialDeal.flatMap((c) => c.cards).map((c) => c.id)).size !==
        36
    )
      e.push("Invalid initial deal");
    if (
      s.columns.some(
        (c) => typeof c.locked !== "boolean" || c.locked !== royal(c.cards),
      )
    )
      e.push("Invalid royal lock");
    if (
      !Number.isInteger(s.moveCount) ||
      s.moveCount < 0 ||
      !Number.isInteger(s.revision) ||
      s.revision < 0
    )
      e.push("Invalid counters");
    return e;
  } catch {
    return ["Malformed state"];
  }
}
export const status = (s) =>
  won(s) ? "won" : moves(s).length ? "in-progress" : "no-legal-actions";
export function view(s) {
  return {
    zones: s.columns
      .map((c, i) => ({
        id: `t${i}`,
        label: `Column ${i + 1}${c.locked ? " (locked)" : ""}`,
        cards: c.cards.map((x) => ({
          id: x.id,
          label: c.locked ? "Completed royalty" : `${x.rank} ${x.suit}`,
          hidden: c.locked,
          color: suits.indexOf(x.suit) < 2 ? "#d65b5b" : "#c7c7c7",
        })),
      }))
      .concat([
        {
          id: "cell",
          label: "Free cell",
          cards: s.freeCell
            ? [
                {
                  id: s.freeCell.id,
                  label: `${s.freeCell.rank} ${s.freeCell.suit}`,
                },
              ]
            : [],
        },
      ]),
    message: `${status(s)} · ${s.moveCount} moves`,
  };
}
