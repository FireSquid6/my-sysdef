import { test } from "node:test";
import assert from "node:assert/strict";
for (const name of ["sigmar", "proletariat", "cribbage", "fortune"]) {
  const game = await import(`../mods/tty-zachtronics/${name}.js`);
  test(`${name}: deterministic inventory, pure transitions and restore`, () => {
    let s = game.newGame(123);
    assert.deepEqual(s, game.newGame(123));
    assert.deepEqual(game.validateState(s), []);
    for (let i = 0; i < 40; i++) {
      const before = JSON.stringify(s);
      assert.ok(game.applyAction(s, { type: "bogus" }).error);
      assert.equal(JSON.stringify(s), before);
      const a = game.legalActions(s).find((a) => a.type !== "undo");
      if (!a) break;
      const r = game.applyAction(s, a);
      assert.ok(!r.error, r.error);
      assert.equal(JSON.stringify(s), before);
      s = JSON.parse(JSON.stringify(r.state));
      assert.deepEqual(game.validateState(s), []);
      const zones = game.view(s).zones;
      assert.equal(new Set(zones.map((z) => z.id)).size, zones.length);
    }
  });
}

import * as sigmar from "../mods/tty-zachtronics/sigmar.js";
import * as proletariat from "../mods/tty-zachtronics/proletariat.js";
import * as cribbage from "../mods/tty-zachtronics/cribbage.js";
import * as fortune from "../mods/tty-zachtronics/fortune.js";
const clone = (x) => JSON.parse(JSON.stringify(x));
const action = (g, s, from, to, index) =>
  g
    .legalActions(s)
    .find(
      (a) =>
        a.from === from &&
        a.to === to &&
        (index === undefined || a.index === index),
    );
function pFixture(groups, cell) {
  const s = proletariat.newGame(1),
    all = s.columns.flatMap((c) => c.cards);
  const take = (id) => {
    const i = all.findIndex((c) => c.id === id);
    assert.notEqual(i, -1, id);
    return all.splice(i, 1)[0];
  };
  s.columns = Array.from({ length: 9 }, () => ({ cards: [], locked: false }));
  groups.forEach((ids, i) => (s.columns[i].cards = ids.map(take)));
  s.freeCell = cell ? take(cell) : null;
  s.columns[8].cards.push(...all);
  return s;
}
test("P02–P17: distinct worker/royal suffix rules and singleton cell", () => {
  const s = pFixture([
    ["hearts-9", "clubs-8", "diamonds-7"],
    ["spades-10"],
    ["hearts-K", "hearts-V"],
    ["hearts-D"],
    ["diamonds-K"],
    [],
    ["hearts-10"],
  ]);
  assert.ok(action(proletariat, s, "t0", "t1", 0));
  assert.ok(action(proletariat, s, "t0", "t5", 0));
  assert.equal(action(proletariat, s, "t0", "cell", 0), undefined);
  assert.ok(action(proletariat, s, "t0", "cell", 2));
  assert.ok(action(proletariat, s, "t2", "t3", 0));
  assert.equal(action(proletariat, s, "t2", "t4", 0), undefined);
  assert.equal(action(proletariat, s, "t2", "t1", 0), undefined);
  assert.equal(action(proletariat, s, "t0", "t6", 0), undefined);
  const r = proletariat.applyAction(s, action(proletariat, s, "t0", "t1", 0));
  assert.deepEqual(proletariat.validateState(r.state), []);
  assert.equal(r.state.columns[1].cards.length, 4);
});
test("P18–P23: full royal suffix stays mobile above unrelated cards; both uncover and destination lock", () => {
  const s = pFixture([
    ["clubs-6", "hearts-K", "hearts-D", "hearts-V", "hearts-T"],
    [],
    ["spades-K", "spades-D", "spades-V", "spades-T", "diamonds-6"],
    [],
  ]);
  const r = proletariat.applyAction(
    s,
    action(proletariat, s, "t0", "t1", 1),
  ).state;
  assert.equal(r.columns[1].locked, true);
  assert.equal(r.columns[0].cards.length, 1);
  assert.equal(
    proletariat.legalActions(r).some((a) => a.from === "t1" || a.to === "t1"),
    false,
  );
  const r2 = proletariat.applyAction(
    r,
    action(proletariat, r, "t2", "t3", 4),
  ).state;
  assert.equal(r2.columns[2].locked, true);
  assert.deepEqual(proletariat.validateState(r2), []);
});
test("P24: exact four worker columns and four locked sets win", () => {
  const groups = [];
  for (const suit of ["hearts", "diamonds", "spades", "clubs"])
    groups.push(["V", "D", "K", "T"].map((r) => `${suit}-${r}`));
  const runs = [
    ["hearts", "spades", "hearts", "spades", "hearts"],
    ["diamonds", "clubs", "diamonds", "clubs", "diamonds"],
    ["spades", "hearts", "spades", "hearts", "spades"],
    ["clubs", "diamonds", "clubs", "diamonds", "clubs"],
  ];
  groups.push(...runs.map((suits) => suits.map((s, i) => `${s}-${10 - i}`)));
  const s = pFixture(groups);
  s.columns.slice(0, 4).forEach((c) => (c.locked = true));
  assert.deepEqual(proletariat.validateState(s), []);
  assert.equal(proletariat.status(s), "won");
});
function cFixture(ranks) {
  const s = cribbage.newGame(1),
    all = s.columns.flat();
  const sequence = ranks.map((rank) => {
    const i = all.findIndex((c) => c.rank === rank);
    assert.notEqual(i, -1);
    return all.splice(i, 1)[0];
  });
  s.columns = [sequence.reverse(), all, [], []];
  return s;
}
const scoringCases = [
  [[11], [2]],
  [
    [11, 5],
    [2, 2],
  ],
  [
    [1, 1, 1, 1],
    [0, 2, 6, 12],
  ],
  [
    [5, 5, 5, 5],
    [0, 2, 8, 12],
  ],
  [
    [4, 6, 5, 7],
    [0, 0, 5, 4],
  ],
  [
    [2, 4, 3, 1],
    [0, 0, 3, 4],
  ],
  [
    [13, 11, 12],
    [0, 0, 3],
  ],
  [
    [1, 2, 3, 4, 5, 6, 7],
    [0, 0, 3, 4, 7, 6, 7],
  ],
  [
    [2, 3, 4, 4, 5],
    [0, 0, 3, 2, 0],
  ],
  [
    [10, 10, 10, 1],
    [0, 2, 6, 2],
  ],
  [
    [1, 13],
    [0, 0],
  ],
  [
    [10, 11],
    [0, 0],
  ],
  [
    [5, 10, 5],
    [0, 2, 0],
  ],
  [
    [3, 3, 4, 5],
    [0, 2, 0, 5],
  ],
];
scoringCases.forEach(([ranks, deltas], i) =>
  test(`C-T${String(i + 1).padStart(2, "0")}: suffix pegging scoring`, () => {
    let s = cFixture(ranks);
    for (const delta of deltas) {
      const old = s.score;
      const r = cribbage.applyAction(s, action(cribbage, s, "t0", "active"));
      assert.ok(!r.error, r.error);
      s = r.state;
      assert.equal(s.score - old, delta);
      assert.deepEqual(cribbage.validateState(s), []);
    }
  }),
);
test("C-T15–19: blocked count forces reset, no voluntary pass or buried play", () => {
  let s = cFixture([10, 10, 5, 7, 1]);
  s.profile.resetMode = "explicit";
  const ace = s.columns[1].findIndex((c) => c.rank === 1);
  s.columns[1].push(...s.columns[1].splice(ace, 1));
  for (let i = 0; i < 3; i++)
    s = cribbage.applyAction(s, action(cribbage, s, "t0", "active")).state;
  // An ace in another column still fits: no voluntary reset allowed.
  assert.equal(
    cribbage.legalActions(s).some((a) => a.type === "reset"),
    false,
  );
  assert.ok(
    cribbage.applyAction(s, {
      type: "play",
      from: "t0",
      to: "active",
      index: 0,
    }).error,
  );
  assert.ok(
    cribbage.applyAction(s, { type: "reset", from: "active", to: "retired" })
      .error,
  );
});
function fFixture(groups, parked) {
  const s = fortune.newGame(1, { autoFoundation: "manual" }),
    all = s.tableau.flat().concat(s.majorLow, s.majorHigh);
  const take = (id) => {
    const i = all.findIndex((c) => c.id === id);
    assert.notEqual(i, -1, id);
    return all.splice(i, 1)[0];
  };
  s.tableau = Array.from({ length: 11 }, () => []);
  groups.forEach((ids, i) => (s.tableau[i] = ids.map(take)));
  s.parked = parked ? take(parked) : null;
  s.tableau[10] = all;
  return s;
}
test("F-T01–07: local ±1 same suit, any empty column, only exposed single cards", () => {
  const s = fFixture([
    ["Cups-5"],
    ["Cups-4"],
    ["Cups-6"],
    ["Swords-4"],
    ["Cups-7"],
    [],
    ["Major-0"],
    ["Major-21"],
    ["Major-8", "Cups-9"],
  ]);
  for (const dest of ["t1", "t2", "t5"])
    assert.ok(action(fortune, s, "t0", dest));
  for (const dest of ["t3", "t4"])
    assert.equal(action(fortune, s, "t0", dest), undefined);
  assert.equal(action(fortune, s, "t6", "t7"), undefined);
  assert.equal(action(fortune, s, "t8", "t5", 0), undefined);
  assert.equal(action(fortune, s, "t8", "t5", 1).index, 1);
});
test("F-T08–T21: reserve globally blocks minors, not majors; release settles fixed point; parent snapshot restores exact auto effects", () => {
  let s = fFixture(
    [["Cups-4", "Cups-3", "Cups-2"], ["Swords-2"], ["Major-0"], ["Major-5"]],
    "Major-6",
  );
  s.profile.autoFoundation = "eligibleToFixedPoint";
  assert.equal(action(fortune, s, "t0", "f1"), undefined);
  assert.equal(action(fortune, s, "t1", "f2"), undefined);
  assert.ok(action(fortune, s, "t2", "low"));
  assert.equal(action(fortune, s, "parked", "low"), undefined);
  const before = clone(s);
  const r = fortune.applyAction(s, action(fortune, s, "parked", "t3"));
  assert.ok(!r.error, r.error);
  s = r.state;
  assert.equal(s.minorFoundation[1].length, 4);
  assert.equal(s.minorFoundation[2].length, 2);
  assert.equal(s.majorLow.length, 1);
  assert.equal(s.parked, null);
  assert.deepEqual(fortune.validateState(s), []);
  const invalidBefore = JSON.stringify(s);
  assert.ok(
    fortune.applyAction(s, { type: "move", from: "f1", to: "t0", index: 3 })
      .error,
  );
  assert.equal(JSON.stringify(s), invalidBefore);
  assert.ok(fortune.applyAction(s, { type: "undo" }).error);
  s = clone(before);
  assert.deepEqual(fortune.validateState(s), []);
  assert.equal(
    fortune.legalActions(s).some((a) => a.type === "undo"),
    false,
  );
});
test("F-T16–17: major fronts may meet at either side, no balanced split requirement", () => {
  const s = fFixture([["Major-21"]]);
  const majors = s.tableau[10].filter((c) => c.suit === "Major");
  s.tableau[10] = s.tableau[10].filter((c) => c.suit !== "Major");
  s.majorLow = majors.sort((a, b) => a.rank - b.rank);
  s.lastMajorCollected = 20;
  assert.ok(action(fortune, s, "t0", "low"));
  assert.ok(action(fortune, s, "t0", "high"));
  const r = fortune.applyAction(s, action(fortune, s, "t0", "low"));
  assert.deepEqual(fortune.validateState(r.state), []);
  assert.equal(r.state.majorLow.length, 22);
  assert.notEqual(fortune.status(r.state), "won");
});
function sFixture(placements, profile = {}) {
  const s = sigmar.newGame(1, profile),
    all = Object.values(s.cells).filter(Boolean);
  Object.keys(s.cells).forEach((k) => (s.cells[k] = null));
  s.removed = [];
  for (const [coord, kind] of placements) {
    const i = all.findIndex((c) => c.kind === kind);
    assert.notEqual(i, -1);
    s.cells[`tile:${coord}`] = all.splice(i, 1)[0];
  }
  s.removed = all;
  return s;
}
test("S01–03/28: full geometry, inventory, symmetry and replayable certified solution", () => {
  for (const seed of [1, 2, 3, 42, 123, 999]) {
    let s = sigmar.newGame(seed);
    assert.equal(Object.keys(s.cells).length, 91);
    assert.equal(Object.values(s.cells).filter(Boolean).length, 55);
    assert.equal(s.cells["tile:0,0"].kind, "gold");
    for (const [id, c] of Object.entries(s.cells)) {
      const [q, r] = id.slice(5).split(",").map(Number);
      assert.equal(Boolean(c), Boolean(s.cells[`tile:${-q},${-r}`]));
    }
    assert.deepEqual(sigmar.validateState(s), []);
    assert.equal(s.witness.length, 28);
    for (const a of s.witness) {
      const r = sigmar.applyAction(s, a);
      assert.ok(!r.error, r.error);
      s = r.state;
    }
    assert.equal(sigmar.status(s), "won");
    assert.deepEqual(sigmar.validateState(s), []);
  }
});
test("S04–09: contiguous, scattered, cyclic, and boundary freedom", () => {
  const D = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];
  for (const [empty, expected] of [
    [[0, 1, 2], true],
    [[0, 2, 4], false],
    [[5, 0, 1], true],
    [[0, 1, 2, 3], true],
  ]) {
    const placements = [
      ["0,0", "fire"],
      ["5,0", "salt"],
      ...D.flatMap(([q, r], i) =>
        empty.includes(i) ? [] : [[`${q},${r}`, "earth"]],
      ),
    ];
    const s = sFixture(placements);
    assert.equal(Boolean(action(sigmar, s, "tile:0,0", "tile:5,0")), expected);
  }
});
test("S10–21: families, blocked predecessor, gold profiles and snapshot freedom", () => {
  for (const [a, b, yes] of [
    ["fire", "fire", true],
    ["fire", "air", false],
    ["salt", "fire", true],
    ["salt", "salt", true],
    ["salt", "vitae", false],
    ["vitae", "mors", true],
    ["vitae", "vitae", false],
    ["quicksilver", "quicksilver", false],
    ["quicksilver", "lead", true],
    ["quicksilver", "tin", true],
  ]) {
    const s = sFixture([
      ["5,0", a],
      ["-5,0", b],
    ]);
    assert.equal(
      Boolean(action(sigmar, s, "tile:-5,0", "tile:5,0")),
      yes,
      `${a}/${b}`,
    );
  }
  let s = sFixture([
    ["0,0", "lead"],
    ["5,0", "tin"],
    ["-5,0", "quicksilver"],
  ]);
  assert.equal(
    sigmar.legalActions(s).some((a) => [a.from, a.to].includes("tile:5,0")),
    false,
  );
  s = sFixture([
    ["0,0", "gold"],
    ["5,0", "air"],
    ["-5,0", "air"],
  ]);
  assert.ok(sigmar.legalActions(s).some((a) => a.type === "gold"));
  s.profile.goldPolicy = "lastMarble";
  assert.equal(
    sigmar.legalActions(s).some((a) => a.type === "gold"),
    false,
  );
  s.removed.push(s.cells["tile:5,0"], s.cells["tile:-5,0"]);
  s.cells["tile:5,0"] = null;
  s.cells["tile:-5,0"] = null;
  assert.equal(
    sigmar.status(sigmar.applyAction(s, sigmar.legalActions(s)[0]).state),
    "won",
  );
});
test("restored corrupt inventories and structural invariants are rejected", () => {
  for (const g of [sigmar, proletariat, cribbage, fortune]) {
    const s = g.newGame(1);
    let bad = clone(s);
    if (g === sigmar) bad.cells["tile:0,0"] = { id: "fake", kind: "gold" };
    else if (g === proletariat) bad.columns[0].cards[0].rank = 0;
    else if (g === cribbage) bad.score = 100;
    else bad.minorFoundation[0][0].rank = 13;
    assert.ok(g.validateState(bad).length);
    assert.ok(g.applyAction(bad, g.legalActions(s)[0]).error);
    assert.ok(g.validateState(null).length);
  }
});
test("all engines reject stale revisions atomically", () => {
  for (const g of [sigmar, proletariat, cribbage, fortune]) {
    const s = g.newGame(4),
      before = JSON.stringify(s);
    assert.ok(
      g.applyAction(s, { ...g.legalActions(s)[0], revision: 99 }).error,
    );
    assert.equal(JSON.stringify(s), before);
  }
});
test("C-T20–22: play entire deck; terminal score and latch agree, no invented round", () => {
  for (const seed of [1, 4, 15]) {
    let s = cribbage.newGame(seed);
    while (s.columns.some((c) => c.length)) {
      const r = cribbage.applyAction(s, cribbage.legalActions(s)[0]);
      assert.ok(!r.error, r.error);
      s = r.state;
      assert.deepEqual(cribbage.validateState(s), []);
    }
    assert.equal(cribbage.status(s), s.score >= 61 ? "won" : "lost");
    assert.equal(cribbage.legalActions(s).length, 0);
    assert.equal(s.active.length + s.retired.flat().length, 52);
  }
});
test("C-T15/16: explicit reset only when no card fits, reset has no score", () => {
  let s = cFixture([10, 10, 5, 7]);
  s.profile.resetMode = "explicit";
  const all = s.columns[1];
  const seven = all.findIndex((c) => c.rank === 8);
  all.push(...all.splice(seven, 1));
  for (let i = 0; i < 3; i++)
    s = cribbage.applyAction(s, action(cribbage, s, "t0", "active")).state;
  assert.equal(s.count, 25);
  assert.deepEqual(
    cribbage.legalActions(s).map((a) => a.type),
    ["reset"],
  );
  const score = s.score;
  const r = cribbage.applyAction(s, cribbage.legalActions(s)[0]);
  assert.equal(r.state.count, 0);
  assert.equal(r.state.score, score);
  assert.deepEqual(r.state.columns, s.columns);
  assert.deepEqual(cribbage.validateState(r.state), []);
});
test("F-T23/24: all six foundations required, final major metadata retained", () => {
  let s = fFixture([["Major-12"]]);
  const rest = s.tableau[10];
  s.tableau[10] = [];
  for (const c of rest) {
    if (c.suit === "Major") {
      (c.rank < 12 ? s.majorLow : s.majorHigh).push(c);
    } else
      s.minorFoundation[
        ["Wands", "Cups", "Swords", "Coins"].indexOf(c.suit)
      ].push(c);
  }
  s.minorFoundation.forEach((p) => p.sort((a, b) => a.rank - b.rank));
  s.majorLow.sort((a, b) => a.rank - b.rank);
  s.majorHigh.sort((a, b) => b.rank - a.rank);
  s.lastMajorCollected = 13;
  assert.deepEqual(fortune.validateState(s), []);
  assert.notEqual(fortune.status(s), "won");
  s = fortune.applyAction(s, action(fortune, s, "t0", "low")).state;
  assert.equal(fortune.status(s), "won");
  assert.equal(s.lastMajorCollected, 12);
  assert.deepEqual(fortune.validateState(s), []);
  assert.deepEqual(fortune.legalActions(s), []);
});
test("F-T22/26: single-card inversion and parked foundation fallback", () => {
  let s = fFixture([["Cups-4", "Cups-5", "Cups-6", "Cups-7"], []]);
  for (let i = 0; i < 4; i++)
    s = fortune.applyAction(s, action(fortune, s, "t0", "t1")).state;
  assert.deepEqual(
    s.tableau[1].map((c) => c.rank),
    [7, 6, 5, 4],
  );
  s = fFixture([], "Cups-2");
  assert.equal(action(fortune, s, "parked", "f1"), undefined);
  s.profile.parkedFoundationExit = "allowAnyAfterLift";
  assert.ok(action(fortune, s, "parked", "f1"));
  s = fortune.applyAction(s, action(fortune, s, "parked", "f1")).state;
  assert.equal(s.parked, null);
  assert.equal(s.minorFoundation[1].length, 2);
});

test("view/action contract: numeric axial coordinates, labels and existing zone IDs", () => {
  for (const g of [sigmar, proletariat, cribbage, fortune]) {
    const s = g.newGame(2),
      zones = g.view(s).zones;
    const zoneIds = new Set(zones.map((z) => z.id));
    for (const a of g.legalActions(s)) {
      assert.equal(typeof a.label, "string");
      if (a.from !== undefined) assert.ok(zoneIds.has(a.from), a.from);
      if (a.to !== undefined) assert.ok(zoneIds.has(a.to), a.to);
    }
    if (g === sigmar)
      for (const zone of zones) {
        assert.ok(Number.isInteger(zone.q));
        assert.ok(Number.isInteger(zone.r));
        assert.ok(zone.cards.length <= 1);
      }
  }
});
