/**
 * JSON state v1: tableau[11], minorFoundation[4], majorLow, majorHigh,
 * parked|null, lastMajorCollected|null, initialLayout, profile and revision.
 * All piles are bottom-to-top; foundations are never player sources.
 * Undo/history is exclusively the parent adapter's single-use mirror.
 * Automatic collection is included in the returned player transaction.
 */
export const title = "Fortune's Foundation";
export const policies = [
  "LCG32/Fisher–Yates; separate aces, seven rows across ten columns, central empty column; not guaranteed solvable or publisher deals.",
  "Default eligibleToFixedPoint auto-foundations, column order and low-side tie break; manual profile available.",
  "Single-card moves; any empty column; foundationReturn=false; parkedFoundationExit=tableauOnly (allowMajor/allowAnyAfterLift supported). Parent adapter provides singleUsePreviousAction mirror, including automatic effects; no engine undo action.",
];
export const rules = [
  "Build by same suit, up or down exactly one. Move only one exposed card.",
  "Minors build A–K; majors build from 0 upwards and 21 downwards until they meet.",
  "One shared parked card blocks ALL minor foundations. Return it to a legal tableau location.",
  "The mirror undoes the last action including automatic collection, once.",
];
const suits = ["Wands", "Cups", "Swords", "Coins"];
const copy = (x) => JSON.parse(JSON.stringify(x));
const top = (a) => a[a.length - 1];
const deck = () =>
  suits
    .flatMap((suit) =>
      Array.from({ length: 13 }, (_, i) => ({
        id: `${suit}-${i + 1}`,
        suit,
        rank: i + 1,
      })),
    )
    .concat(
      Array.from({ length: 22 }, (_, rank) => ({
        id: `Major-${rank}`,
        suit: "Major",
        rank,
      })),
    );
const foundationIds = ["f0", "f1", "f2", "f3", "low", "high"];
const pile = (s, id) =>
  id === "parked"
    ? s.parked
      ? [s.parked]
      : []
    : id === "low"
      ? s.majorLow
      : id === "high"
        ? s.majorHigh
        : id[0] === "f"
          ? s.minorFoundation[+id.slice(1)]
          : s.tableau[+id.slice(1)];
const won = (s) =>
  s.minorFoundation.reduce((n, p) => n + p.length, 0) +
    s.majorLow.length +
    s.majorHigh.length ===
  74;
function destinations(s, c, parked = false) {
  if (parked && s.profile.parkedFoundationExit === "tableauOnly") return [];
  if (c.suit === "Major") {
    const a = [];
    if (c.rank === s.majorLow.length) a.push("low");
    if (c.rank === 21 - s.majorHigh.length) a.push("high");
    if (a.length === 2 && s.profile.majorFinalSide === "high") a.reverse();
    return a;
  }
  if (parked && s.profile.parkedFoundationExit !== "allowAnyAfterLift")
    return [];
  const i = suits.indexOf(c.suit);
  return (!s.parked ||
    (parked && s.profile.parkedFoundationExit === "allowAnyAfterLift")) &&
    c.rank === s.minorFoundation[i].length + 1
    ? [`f${i}`]
    : [];
}
function transfer(s, from, to) {
  let c;
  if (from === "parked") {
    c = s.parked;
    s.parked = null;
  } else c = pile(s, from).pop();
  if (to === "parked") s.parked = c;
  else pile(s, to).push(c);
  if (foundationIds.includes(to) && c.suit === "Major")
    s.lastMajorCollected = c.rank;
}
function settle(s, effects) {
  if (s.profile.autoFoundation === "manual") return;
  for (;;) {
    let moved = false;
    for (let i = 0; i < 11; i++) {
      const c = top(s.tableau[i]);
      if (!c) continue;
      const dest = destinations(s, c)[0];
      if (dest) {
        transfer(s, `t${i}`, dest);
        effects.push({ type: "collect", from: `t${i}`, to: dest, card: c.id });
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
}
export function newGame(seed = 1, profile = {}) {
  let n = Number(seed) >>> 0;
  const d = deck(),
    aces = d.filter((c) => c.suit !== "Major" && c.rank === 1),
    rest = d.filter((c) => !aces.includes(c));
  for (let i = rest.length - 1; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((n / 4294967296) * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const s = {
    version: 1,
    seed,
    revision: 0,
    tableau: Array.from({ length: 11 }, () => []),
    minorFoundation: aces.map((c) => [c]),
    majorLow: [],
    majorHigh: [],
    parked: null,
    lastMajorCollected: null,
    profile: {
      autoFoundation:
        profile.autoFoundation === "manual" ? "manual" : "eligibleToFixedPoint",
      parkedFoundationExit: ["allowMajor", "allowAnyAfterLift"].includes(
        profile.parkedFoundationExit,
      )
        ? profile.parkedFoundationExit
        : "tableauOnly",
      majorFinalSide: profile.majorFinalSide === "high" ? "high" : "low",
    },
  };
  const indices = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10];
  rest.forEach((c, i) => s.tableau[indices[i % 10]].push(c));
  settle(s, []);
  s.initialLayout = board(s);
  return s;
}
function board(s) {
  return copy({
    tableau: s.tableau,
    minorFoundation: s.minorFoundation,
    majorLow: s.majorLow,
    majorHigh: s.majorHigh,
    parked: s.parked,
    lastMajorCollected: s.lastMajorCollected,
  });
}
export function legalActions(s) {
  const a = [];
  if (!won(s))
    for (const from of [...s.tableau.map((_, i) => `t${i}`), "parked"]) {
      const src = pile(s, from),
        c = top(src);
      if (!c) continue;
      const index = src.length - 1;
      for (let i = 0; i < 11; i++) {
        const to = `t${i}`,
          t = top(s.tableau[i]);
        if (
          from !== to &&
          (!t || (t.suit === c.suit && Math.abs(t.rank - c.rank) === 1))
        )
          a.push({
            type: "move",
            from,
            index,
            to,
            label: `Move ${c.id} to column ${i + 1}`,
          });
      }
      if (from !== "parked" && !s.parked)
        a.push({
          type: "move",
          from,
          index,
          to: "parked",
          label: `Park ${c.id} (blocks minors)`,
        });
      for (const to of destinations(s, c, from === "parked"))
        a.push({
          type: "move",
          from,
          index,
          to,
          label: `Collect ${c.id} to ${to}`,
        });
    }
  return a;
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
  transfer(n, a.from, a.to);
  settle(n, effects);
  n.revision++;
  return { state: n, effects };
}
function boardErrors(s) {
  const e = [],
    d = deck();
  if (s.tableau.length !== 11 || s.minorFoundation.length !== 4)
    e.push("Invalid layout");
  const all = s.tableau
    .flat()
    .concat(
      s.minorFoundation.flat(),
      s.majorLow,
      s.majorHigh,
      s.parked ? [s.parked] : [],
    );
  if (
    all.length !== 74 ||
    new Set(all.map((c) => c.id)).size !== 74 ||
    all.some(
      (c) =>
        !d.some((x) => x.id === c.id && x.rank === c.rank && x.suit === c.suit),
    )
  )
    e.push("Inventory mismatch");
  s.minorFoundation.forEach((p, i) => {
    if (p.some((c, j) => c.suit !== suits[i] || c.rank !== j + 1))
      e.push("Invalid minor foundation");
  });
  if (
    s.majorLow.some((c, i) => c.suit !== "Major" || c.rank !== i) ||
    s.majorHigh.some((c, i) => c.suit !== "Major" || c.rank !== 21 - i) ||
    s.majorLow.length + s.majorHigh.length > 22
  )
    e.push("Invalid major fronts");
  if (
    s.lastMajorCollected !== null &&
    ![...s.majorLow, ...s.majorHigh].some(
      (c) => c.rank === s.lastMajorCollected,
    )
  )
    e.push("Invalid final major");
  return e;
}
export function validateState(s) {
  try {
    const e = boardErrors(s);
    if (s.version !== 1 || !Number.isInteger(s.revision) || s.revision < 0)
      e.push("Invalid schema");
    if (
      !["manual", "eligibleToFixedPoint"].includes(s.profile.autoFoundation) ||
      !["tableauOnly", "allowMajor", "allowAnyAfterLift"].includes(
        s.profile.parkedFoundationExit,
      ) ||
      !["low", "high"].includes(s.profile.majorFinalSide)
    )
      e.push("Invalid profile");
    if (!s.initialLayout) e.push("Missing initial layout");
    else e.push(...boardErrors(s.initialLayout).map((x) => `Initial: ${x}`));
    return e;
  } catch {
    return ["Malformed state"];
  }
}
export const status = (s) =>
  won(s) ? "won" : legalActions(s).length ? "in-progress" : "no-legal-actions";
export function view(s) {
  const ids = [...s.tableau.map((_, i) => `t${i}`), ...foundationIds, "parked"];
  return {
    zones: ids.map((id) => ({
      id,
      label: id === "parked" ? "Parked (blocks minors)" : id,
      cards: pile(s, id).map((c) => ({
        id: c.id,
        label: `${c.suit} ${c.rank}`,
      })),
    })),
    message: `${status(s)} · ${s.profile.autoFoundation}; parked exit: ${s.profile.parkedFoundationExit}${s.lastMajorCollected === null ? "" : ` · last major ${s.lastMajorCollected}`}`,
  };
}
