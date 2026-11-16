/**
 * JSON state v1: cells maps all 91 `tile:q,r` IDs to a marble or null;
 * removed retains consumed physical marbles. initialAssignment and witness
 * describe the certified starting deal, not additional live inventory.
 * profile.goldPolicy is fixed per deal. revision advances once per removal.
 */
export const title = "Sigmar's Garden";
export const policies = [
  "Standard 55-marble game. Gold default afterSilver; lastMarble compatibility profile supported.",
  "Axial radius-five board; antipodal occupancy. LCG32/Fisher–Yates random candidates accepted only with complete replayable solver witness; bounded generation may explicitly fail rather than promise an unsolved board.",
  "No publisher masks, assets or seed mapping. Pair actions are atomic; selection is UI-only.",
];
export const rules = [
  "Remove matching free pairs: identical elements, salt with element/salt, vitae with mors.",
  "Free means three consecutive empty neighbors (cyclic); off-board counts empty. Both pieces must be free before removal.",
  "Quicksilver pairs with lead, tin, iron, copper, silver in that order. Then remove free gold singly.",
  "Clear all marbles; no moving, falling, replenishing or automatic matches.",
];
const cardinal = ["air", "earth", "fire", "water"],
  metals = ["lead", "tin", "iron", "copper", "silver", "gold"];
const directions = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];
const coords = [];
for (let r = -5; r <= 5; r++)
  for (let q = Math.max(-5, -r - 5); q <= Math.min(5, -r + 5); q++)
    coords.push([q, r]);
const key = (q, r) => `tile:${q},${r}`;
const ids = coords.map(([q, r]) => key(q, r));
const neighbors = coords.map(([q, r]) =>
  directions.map(([a, b]) => ids.indexOf(key(q + a, r + b))),
);
const inventory = () => [
  ...cardinal.flatMap((kind) =>
    Array.from({ length: 8 }, (_, i) => ({ id: `${kind}-${i}`, kind })),
  ),
  ...["salt", "vitae", "mors"].flatMap((kind) =>
    Array.from({ length: 4 }, (_, i) => ({ id: `${kind}-${i}`, kind })),
  ),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `quicksilver-${i}`,
    kind: "quicksilver",
  })),
  ...metals.map((kind) => ({ id: kind, kind })),
];
const copy = (x) => JSON.parse(JSON.stringify(x));
function free(a, i) {
  if (!a[i]) return false;
  const e = neighbors[i].map((j) => j < 0 || !a[j]);
  return e.some((_, j) => e[j] && e[(j + 1) % 6] && e[(j + 2) % 6]);
}
function pairs(a, profile) {
  const next = metals.find((k) => a.some((c) => c?.kind === k));
  const f = a.map((c, i) => (c && free(a, i) ? i : -1)).filter((i) => i >= 0),
    out = [];
  for (let x = 0; x < f.length; x++) {
    const i = f[x],
      k = a[i].kind;
    if (
      k === "gold" &&
      next === "gold" &&
      (profile.goldPolicy !== "lastMarble" || a.filter(Boolean).length === 1)
    )
      out.push([i]);
    for (let y = x + 1; y < f.length; y++) {
      const j = f[y],
        l = a[j].kind;
      if (
        (k === l && cardinal.includes(k)) ||
        (k === "salt" && [...cardinal, "salt"].includes(l)) ||
        (l === "salt" && cardinal.includes(k)) ||
        (k === "vitae" && l === "mors") ||
        (k === "mors" && l === "vitae") ||
        (k === "quicksilver" && l === next && l !== "gold") ||
        (l === "quicksilver" && k === next && k !== "gold")
      )
        out.push([i, j]);
    }
  }
  return out;
}
function solve(a, profile, budget) {
  const seen = new Set();
  let remaining = a.filter(Boolean).length;
  function visit() {
    if (!remaining) return [];
    if (--budget < 0) return null;
    const counts = {};
    for (const c of a) if (c) counts[c.kind] = (counts[c.kind] || 0) + 1;
    if (
      cardinal.filter((k) => (counts[k] || 0) % 2).length > (counts.salt || 0)
    )
      return null;
    const hash = a.map((c) => (c ? "1" : "0")).join("");
    if (seen.has(hash)) return null;
    seen.add(hash);
    const actions = pairs(a, profile);
    actions.sort((x, y) => {
      const priority = (z) =>
        z.some((i) => metals.includes(a[i].kind))
          ? 0
          : z.some((i) => a[i].kind === "salt")
            ? 2
            : 1;
      return priority(x) - priority(y);
    });
    for (const move of actions) {
      const saved = move.map((i) => a[i]);
      move.forEach((i) => (a[i] = null));
      remaining -= move.length;
      const tail = visit();
      remaining += move.length;
      move.forEach((i, j) => (a[i] = saved[j]));
      if (tail) return [move, ...tail];
      if (budget < 0) break;
    }
    return null;
  }
  return visit();
}
export function newGame(seed = 1, profile = {}) {
  const p = {
    goldPolicy:
      profile.goldPolicy === "lastMarble" ? "lastMarble" : "afterSilver",
  };
  let n = Number(seed) >>> 0;
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      const j = Math.floor((n / 4294967296) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const antipodes = coords
      .map(([q, r], i) => [i, ids.indexOf(key(-q, -r))])
      .filter(([i, j]) => i < j),
    center = ids.indexOf(key(0, 0));
  for (let attempt = 0; attempt < 200; attempt++) {
    const a = Array(91).fill(null),
      pieces = shuffle(inventory().filter((c) => c.kind !== "gold")),
      positions = shuffle(antipodes.slice()).slice(0, 27).flat();
    positions.forEach((i, j) => (a[i] = pieces[j]));
    a[center] = { id: "gold", kind: "gold" };
    const witness = solve(a, p, 15000);
    if (witness) {
      const cells = Object.fromEntries(ids.map((id, i) => [id, a[i]]));
      return {
        version: 1,
        seed,
        revision: 0,
        generatorVersion: "symmetric-solver-v1-lcg32",
        profile: p,
        cells,
        removed: [],
        initialAssignment: copy(cells),
        witness: witness.map((m) => ({
          type: m.length === 1 ? "gold" : "pair",
          from: ids[m[0]],
          ...(m.length === 2 ? { to: ids[m[1]] } : {}),
          label:
            m.length === 1
              ? "Remove gold"
              : `Match ${ids[m[0]]} and ${ids[m[1]]}`,
        })),
      };
    }
  }
  throw new Error(
    "Certified Sigmar generation exhausted 200 candidates; try another seed. No uncertified board emitted.",
  );
}
const array = (s) => ids.map((id) => s.cells[id]);
export function legalActions(s) {
  return pairs(array(s), s.profile).map((m) => ({
    type: m.length === 1 ? "gold" : "pair",
    from: ids[m[0]],
    ...(m.length === 2 ? { to: ids[m[1]] } : {}),
    label:
      m.length === 1
        ? "Remove gold"
        : `Match ${s.cells[ids[m[0]]].kind} with ${s.cells[ids[m[1]]].kind}`,
  }));
}
export function applyAction(s, a) {
  if (a?.revision !== undefined && a.revision !== s?.revision)
    return { error: "Stale revision" };
  const e = validateState(s);
  if (e.length) return { error: e.join("; ") };
  const match = legalActions(s).find(
    (x) =>
      x.type === a?.type &&
      ((x.from === a.from && x.to === a.to) ||
        (x.type === "pair" && x.from === a.to && x.to === a.from)),
  );
  if (!match)
    return { error: "Illegal match (both pieces must be free before removal)" };
  const n = copy(s);
  for (const id of [match.from, match.to].filter(Boolean)) {
    n.removed.push(n.cells[id]);
    n.cells[id] = null;
  }
  n.revision++;
  return { state: n, effects: [] };
}
export function validateState(s) {
  try {
    const e = [];
    if (
      s.version !== 1 ||
      Object.keys(s.cells).length !== 91 ||
      ids.some((id) => !(id in s.cells))
    )
      e.push("Invalid board mask");
    if (!["afterSilver", "lastMarble"].includes(s.profile.goldPolicy))
      e.push("Invalid gold policy");
    const a = array(s).filter(Boolean).concat(s.removed),
      d = inventory();
    if (
      a.length !== 55 ||
      new Set(a.map((c) => c.id)).size !== 55 ||
      a.some((c) => !d.some((x) => x.id === c.id && x.kind === c.kind))
    )
      e.push("Inventory mismatch");
    const initial = ids.map((id) => s.initialAssignment?.[id]).filter(Boolean);
    if (
      Object.keys(s.initialAssignment || {}).length !== 91 ||
      initial.length !== 55 ||
      new Set(initial.map((c) => c.id)).size !== 55 ||
      initial.some((c) => !d.some((x) => x.id === c.id && x.kind === c.kind))
    )
      e.push("Invalid initial assignment");
    if (!Number.isInteger(s.revision) || s.revision < 0)
      e.push("Invalid revision");
    return e;
  } catch {
    return ["Malformed state"];
  }
}
export const status = (s) =>
  !array(s).some(Boolean)
    ? "won"
    : legalActions(s).length
      ? "in-progress"
      : "no-legal-actions";
export function view(s) {
  return {
    zones: coords.map(([q, r], i) => ({
      id: ids[i],
      q,
      r,
      label: `(${q},${r})`,
      cards: s.cells[ids[i]]
        ? [{ id: s.cells[ids[i]].id, label: s.cells[ids[i]].kind }]
        : [],
    })),
    message: `${status(s)} · Gold: ${s.profile.goldPolicy}; certified seeded reconstruction`,
  };
}
