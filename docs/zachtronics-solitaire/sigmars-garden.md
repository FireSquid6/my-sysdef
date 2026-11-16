# Sigmar's Garden — implementation-ready rules design

## 1. Scope, corrected official mapping, and evidence standard

Implement the **standard 55-marble Sigmar's Garden** from Opus Magnum and The Zachtronics Solitaire Collection: a single-layer hex-grid matching game, not a jump-and-capture peg solitaire or multilayer Mahjong layout.

**Important source correction:** `milan_0.png`–`milan_3.png` are **Fortune's Foundation**, not Sigmar's Garden. Their logo visibly reads FORTUNE'S FOUNDATION and the panels explain Tarot foundations, a blocking reserve, and the scrying mirror. The correct official prefix for Sigmar's Garden is **`lightning`**, confirmed visually by `lightning_logo.png`. The official index lists panels **`lightning_0`, `lightning_1`, `lightning_2`, `lightning_4`**; it does not link a `lightning_3` panel. This document uses the correct panels.

Labels: **P** = explicit first-party rules/diagram; **S** = secondary report, screenshot, or independent implementation; **D** = chosen implementation behavior where original fidelity is unresolved. The latter are complete configurable defaults, not claims about the commercial executable.

### Sources and audit trail

- **P0**: [official collection description](https://www.zachtronics.com/solitaire-collection/) and [rules index](https://zachtronics.com/solitaire-rules/).
- **P1**: [lightning_0.png](https://zachtronics.com/solitaire-rules/images/lightning_0.png), goal and pair clearing.
- **P2**: [lightning_1.png](https://zachtronics.com/solitaire-rules/images/lightning_1.png), three contiguous empty neighbors; off-board counts empty.
- **P3**: [lightning_2.png](https://zachtronics.com/solitaire-rules/images/lightning_2.png), cardinal and salt matching.
- **P4**: [lightning_4.png](https://zachtronics.com/solitaire-rules/images/lightning_4.png), vitae/mors, ordered quicksilver/metal pairs, and gold depicted without a partner.
- **S1**: [Sumire, How to git gud in Sigmar's Garden](https://steamcommunity.com/sharedfiles/filedetails/?id=1176230609), inventory, 91 spaces, central gold, symmetric occupancy, gold singly after silver, and optional Sigmar's Garden II quintessence rule. Its language “6x6 hexagonal” means a hexagon of side length six, **not** a 36-cell rhombus. Saved in-game screenshot `sources/sigmar-guide-board.jpg` [direct image](https://images.steamusercontent.com/ugc/859485277793037825/07D8BE663FE2A5DA1D0512E375AD68113B696FB6/) visually confirms rows of 6,7,8,9,10,11,10,9,8,7,6.
- **S2**: [Doublevil/SigmarsBoredom](https://github.com/Doublevil/SigmarsBoredom), commit `92da913a883e2f3edaf4244c8add720c8d3cd278`; inspected `Solver.cs`, `Tile.cs`, `Board.cs`, `BoardReader.cs`, `SigmarCoordinateHelper.cs`. `BoardReader` asserts exact multiplicities; `Solver` checks cyclic adjacency and lowest remaining metal and removes gold by itself without a last-marble condition. This is an independent screen-playing solver, not Zachtronics source. Its clipped 11×11 coordinate mask was counted programmatically: 30 excluded cells, leaving 91, with the same row lengths as the observed screenshot. This independently corroborates the geometry; its offset coordinates must be converted consistently if using this document's axial representation.
- **S3**: [Easy Hints for Sigmar's Garden](https://steamcommunity.com/sharedfiles/filedetails/?id=1243498813), corroborating metal order, inventories, and gold clicked singly.
- **S4 (conflicting clone, not authority)**: [STCloudLake/opus-magnus-solitaire](https://github.com/STCloudLake/opus-magnus-solitaire), README includes both 93-cell and 91-cell geometry descriptions and asserts gold must be the final marble. Do not copy these statements uncritically; they conflict with S1/S2 and, for 93, the observed board. Its claim to use original help/assets is not direct verification of that help.
- **S5 (weak generator report)**: [Steam discussion](https://steamcommunity.com/app/1988540/discussions/0/561408449130286857/), a user attributes pregenerated Sigmar boards to Zach via a Discord message. The underlying Discord statement was not inspected; treat this as hearsay, not a verified guarantee or a generator algorithm.

Official images and logos were downloaded and inspected; transcript in `sources/shenzhen-sigmar-rule-transcripts.md`. A research thesis PDF was also downloaded (`sources/sigmar-thesis.pdf`) but local text extraction was unavailable and the remote extractor timed out; this document does not depend on uninspected thesis text.

## 2. Exact inventory and initial board

### Standard multiset [S1, S2]

| Family | Types | Copies per type | Subtotal |
|---|---|---:|---:|
| Cardinal elements | air, earth, fire, water | 8 | 32 |
| Salt | salt | 4 | 4 |
| Life/death | vitae, mors | 4 | 8 |
| Quicksilver | quicksilver (mercury) | 5 | 5 |
| Metals | lead, tin, iron, copper, silver, gold | 1 | 6 |
| **Total** | **14 kinds** | | **55** |

There are **91 playable cells**, initially **55 occupied and 36 empty**. Every marble is visible; no draw pile, replenishment, moving marbles between cells, gravity, swaps, jumps, stacks, or hidden tile layers. Gold begins at the center [S1 plus screenshot]. Symbols in P4 determine the metal order; names are identified by S1/S2. Quicksilver is not an additional ordered metal; it is the reagent matched to the first five metals.

### Exact coordinate specification

Use axial `(q,r)` hex coordinates. Recommended canonical board:

```text
B = {(q,r) integers | max(abs(q), abs(r), abs(q+r)) <= 5}
center = (0,0)
D = [(1,0), (0,1), (-1,1), (-1,0), (0,-1), (1,-1)]  // cyclic order
neighbors(p) = [p + d for d in D]
```

The six corners are `(5,0),(0,5),(-5,5),(-5,0),(0,-5),(5,-5)`. Its side length is six cells and its diameter is eleven cells including center. “Radius five,” “side six,” and “eleven across” describe the same board, not three board sizes. At fixed row `r`, enumerate:

```text
q_min = max(-5, -r-5)
q_max = min( 5, -r+5)
```

| r | inclusive q range | cell count |
|---:|---|---:|
| -5 | 0..5 | 6 |
| -4 | -1..5 | 7 |
| -3 | -2..5 | 8 |
| -2 | -3..5 | 9 |
| -1 | -4..5 | 10 |
| 0 | -5..5 | 11 |
| 1 | -5..4 | 10 |
| 2 | -5..3 | 9 |
| 3 | -5..2 | 8 |
| 4 | -5..1 | 7 |
| 5 | -5..0 | 6 |

For pointy-top hexagons with circumradius `s`, render centers at `x = originX + sqrt(3)*s*(q+r/2)`, `y = originY + 1.5*s*r`. Rotation/reflection or swapping coordinate signs is presentation-equivalent, provided the board and all neighbor calculations transform consistently. Store the explicit board mask rather than a rectangular 11×11 array whose clipped corners accidentally count as occupiable cells.

Evidence status: row lengths are observed in the S1 game screenshot; the axial representation is D (a mathematically equivalent implementation choice). A clone's “93 playable cells” and the rectangular-array dimensions in S2 are not sufficient reasons to add spaces to the observed regular hexagon.

### Dealing and generation [S1, D]

S1 reports initial **occupancy** symmetry and gold fixed centrally; symbols themselves need not be symmetric. Exact commercial masks, seed sequence, selection distribution, and solvability verification are not public rules established here. Randomly distributing 55 marbles does not guarantee a playable or solvable deal.

**D recommended generator**, versioned as `symmetric-solver-v1`:

1. Fix gold at `(0,0)`.
2. Partition the other 90 cells into 45 antipodal pairs `{p,-p}`.
3. Select 27 of those pairs without replacement. This creates 54 noncenter occupied cells plus gold; the 36 unchosen cells stay empty. This guarantees 180° occupancy symmetry only, not exact replication of the original mask distribution. Sixfold shape symmetry can be a later mask-bank option.
4. Shuffle the remaining 54 marble IDs/types into those cells using documented seeded PRNG/Fisher–Yates.
5. Solve under exactly the chosen rules, including gold policy. Accept only a complete solution and retain its witness. If exhausted, reject; if timed out, mark unknown and reject from the verified-solvable generator. Never silently mark a timeout unsolvable.
6. Bound attempts and per-attempt search effort. On exhaustion, report generation failure or use a previously solver-certified, locally created board. Do not fabricate a success or import copyrighted curated deal banks as an undocumented fallback.

Store `generatorVersion`, seed, mask, complete assignment, ruleset, and witness separately. Generating backwards is an alternative, but must replay the complete reverse witness **forwards**: a pair that can be placed during construction may not both be geometrically free at the corresponding forward removal unless explicitly checked.

## 3. Data model and geometry predicates

```text
Kind = Air | Earth | Fire | Water | Salt | Vitae | Mors | Quicksilver
     | Lead | Tin | Iron | Copper | Silver | Gold
State = {
  cells: map<Coord in B, Empty | Marble{id,kind}>,
  selected: Coord? ,
  phase: Ready | Animating | Won | Stuck,
  initialAssignment, seed, generatorVersion,
  settings: {goldPolicy, allowUndo, allowRestart}
}
METALS = [Lead,Tin,Iron,Copper,Silver,Gold]
CARDINALS = {Air,Earth,Fire,Water}
```

Types and positions never change; a move changes occupied cells to empty. A selected marble is **still occupied** and blocks its neighbors. Keep `geometricallyFree`, `metalEligible`, and `hasLegalPartner` separate: “has three empty neighbors” does not imply a later metal is playable, and being eligible does not imply a matching partner exists.

```text
emptyAt(p, S):
  return p not in B or S.cells[p] == Empty
free(p, S):
  if p not in B or S.cells[p] == Empty: return false
  e = [emptyAt(p+d, S) for d in D]
  return any(e[i] and e[(i+1)%6] and e[(i+2)%6] for i in 0..5)
nextMetal(S):
  return first k in METALS for which an occupied k exists, or None
metalEligible(kind, S):
  return kind not in METALS or kind == nextMetal(S)
```

This is **at least three consecutive empty neighbors**, cyclically around the marble; not exactly three, not any three scattered empty cells, and not a path from a marble to the board edge. Off-board neighbors satisfy emptyAt [P2]. A three-cell run spanning indices 5,0,1 must be recognized. A non-corner outer-edge marble can remain blocked because only two of its six adjacent positions lie outside the board.

## 4. Legal actions and transitions

### Matching table [P3, P4]

For two **distinct**, occupied, geometrically free cells, evaluated in the same pre-move state:

| First type | Second type | Additional condition |
|---|---|---|
| Cardinal X | Cardinal X | same one of air/earth/fire/water |
| Salt | Cardinal X | any cardinal |
| Salt | Salt | none |
| Vitae | Mors | opposites only |
| Quicksilver | Lead | lead is next metal |
| Quicksilver | Tin | tin is next metal |
| Quicksilver | Iron | iron is next metal |
| Quicksilver | Copper | copper is next metal |
| Quicksilver | Silver | silver is next metal |

Every pair is symmetric in selection order. No other pairing is allowed. Salt is not a universal wildcard: it cannot match quicksilver, vitae, mors, metals, or gold. No quicksilver–quicksilver, metal–same-metal, vitae–vitae, mors–mors, or different-cardinal pair. Gold is a singleton exception, not paired with a sixth quicksilver (there are only five).

```text
pairTypes(a,b,S):
  if a==b and a in CARDINALS: return true
  if a==Salt and (b in CARDINALS or b==Salt): return true
  if b==Salt and a in CARDINALS: return true
  if {a,b} == {Vitae,Mors}: return true
  if one is Quicksilver and other in [Lead,Tin,Iron,Copper,Silver]:
    return other == nextMetal(S)
  return false
canRemovePair(p,q,S):
  return p != q and free(p,S) and free(q,S)
     and pairTypes(kind(p),kind(q),S)
removePair(p,q):
  require canRemovePair(p,q,S)
  atomically set cells[p] = Empty; cells[q] = Empty
  selected = None
  recompute derived eligibility, legal moves, and status
```

Distance and adjacency between matching partners are irrelevant. A pair can lie at opposite board corners; there is no connecting-line, sliding-path, or unobstructed-line-of-sight rule [P1/S2]. Both must be free **before** removal; do not provisionally remove the first to make its blocked partner free.

### Ordered metal progression [P4, S1–S3]

**Lead → Tin → Iron → Copper → Silver → Gold.** Only the next surviving metal may be removed; blocked earlier metal still prevents later metal removal. It is not enough that the later metal is the lowest currently *free* metal. Other families can be removed before, between, or after metal moves; nonmetals have no sequencing requirement.

After a quicksilver/metal pair, the next metal becomes eligible, but its geometry still must satisfy `free`. If storing a `metalIndex` cache, derive/check it against remaining metals on load and undo; board occupancy is the authoritative source of truth.

### Gold singleton and documented conflict

P4 visually shows gold without a quicksilver partner but does not state a prose singleton precondition. S1 explicitly says gold can be taken when free after silver is matched. S2 implements gold as a self-referenced click pair after all preceding metals, without requiring all nonmetals gone. S4 asserts the stronger final-marble-only gate. No primary executable was exercised to settle this disagreement.

**D default `goldPolicy=afterSilver`:** accept a single click on gold iff it is geometrically free and `nextMetal(S)==Gold`, even if other elements/salt/vitae/mors remain. This is the better-supported behavior from the older guide and screen-playing solver, but is marked secondary-supported, not fully verified first-party prose. Offer `goldPolicy=lastMarble` as a compatibility switch; in that mode also require `occupiedCount==1`. Save the policy in each deal/replay; never change it midway.

```text
canRemoveGold(p,S):
  return occupied(p) and kind(p)==Gold and free(p,S)
    and nextMetal(S)==Gold
    and (goldPolicy==afterSilver or occupiedCount(S)==1)
removeGold(p):
  require canRemoveGold(p,S)
  cells[p] = Empty; selected = None; recomputeStatus()
```

Gold is removed only by the explicit player action; it does not automatically disappear when silver clears or when it becomes free. There is no transmutation animation that changes a lead marble into tin: removing lead and quicksilver simply empties their two cells.

### Selection/UI state [P1, D]

P1 specifies selecting a free marble and then a matching marble. Recommended complete interaction contract:

- Click a blocked marble/empty/outside position: no mutation, optional rejection feedback.
- Click eligible gold: execute singleton removal directly if its gold predicate passes.
- With no selection, click a free metal-eligible non-gold marble: select it; do not remove it.
- Click the selected coordinate again: deselect (not self-match).
- Click a legal second partner: commit pair removal atomically.
- Click a different selectable but incompatible marble: replace selection with it. This last behavior is D, not a verified original control.
- Escape/right-click: clear selection. Hint/highlight controls reveal information but do not mutate board contents.
- Input during removal animations is blocked or serialized against the committed state, never checked against a half-cleared pair.

## 5. Automatic behavior, win, and failure

No forced automatic matching, gravity, filling gaps, or board refresh. After each committed move, recompute highlights, per-kind counts, next-metal indication, pair availability, gold eligibility, and terminal status. Recompute all 91 cells first for correctness; incremental updates are optional (geometry only changes for neighbors of removed marbles, while metal eligibility may change globally).

**Win [P1]:** zero occupied cells, regardless of whether the final removal was gold or a pair. With 55 standard marbles there are 27 pair removals and one gold singleton: 28 committed removals total. Selection clicks are not removals.

**Immediate stuck:** occupied cells remain and the exact legal-action enumerator contains neither a valid pair nor an eligible gold singleton. There are no relocations, so this is a genuine forward-play dead end. Do not conclude loss merely because no same-element pair exists: salt, vitae/mors, and metal pairs must also be checked.

**Potentially doomed despite legal moves:** a board can still have legal actions but no full clearing sequence. Example: salt usage leaves an odd cardinal count with no remaining salt. Useful necessary condition for standard rules: let `O` be the number of cardinal types with odd remaining counts and `s` remaining salts; if `O > s`, no completion exists. `O <= s` does **not** prove solvability; geometry and metal constraints remain. Do not forbid a legal move solely because it harms future solvability. A solver may provide a warning; that is assistance, not legality.

**D default controls:** New Game creates a fresh deal; no automatic redeal on deadlock. `allowUndo=false`, `allowRestart=false` until port-specific original behavior is checked. Optional undo restores the entire committed removal, selected state, and eligibility; restart restores the exact initial assignment, not another shuffle. Counters should record one win per completed deal and should not increment for selecting a marble or replaying a completed animation. Timing and move count are optional presentation, not win conditions established by the rule panels.

## 6. Worked examples

1. For an occupied center with empty-neighbor flags `[1,1,0,1,0,1]` in cyclic order, indices `5,0,1` form a free run: the center is free. With `[1,0,1,0,1,0]` it is blocked despite three empty neighbors.
2. Free fire marbles at `(5,0)` and `(-5,0)` can match across the board, provided their local neighbor conditions hold.
3. Free tin plus free quicksilver is illegal while lead remains occupied anywhere, including buried at the center. Free salt plus free fire can still be removed in that state.
4. After silver is removed, a free center gold can be clicked singly. Under default afterSilver, remaining air marbles do not prevent that click; under lastMarble they do. Under either policy the game is not won until the air marbles also disappear.
5. Spend one salt on fire: an even fire count becomes odd. To eventually clear all fire, another remaining salt must absorb one more fire; do not silently “fix” the count or disallow the first match.

## 7. Concrete acceptance tests

Microstates below use the stated local occupancy; unspecified neighbors are empty unless otherwise stated. Microstates need not contain the entire initial inventory. Full-deal tests must validate exact inventory and masks. Geometry neighbor indices refer to D above.

1. **Inventory:** 55 unique IDs, eight of each cardinal, four salt/vitae/mors each, five quicksilver, one of each of six metals; exactly 14 kinds.
2. **Geometry:** enumerate B and obtain exactly 91 cells and row lengths `[6,7,8,9,10,11,10,9,8,7,6]`; `(5,0)` is in B, `(6,0)` is out, `(5,1)` is out.
3. **Setup:** a generated accepted board has 55 occupied/36 empty, central gold, no hidden layers, and antipodal occupancy equality under generator v1. Same seed and generator/rules version reproduces assignment.
4. **Contiguous three:** occupied test cell with empties at neighbor indices `{0,1,2}` is free even when indices `{3,4,5}` are occupied.
5. **Not scattered:** empty neighbors `{0,2,4}` with the other three occupied leaves center blocked.
6. **Wraparound:** empty neighbors `{5,0,1}` unlock the cell; an implementation scanning only linear triples fails this test.
7. **At least, not exactly:** four, five, or six empty neighbors all produce free.
8. **Boundary:** corner `(5,0)` is free with every in-board neighbor occupied, because neighbor indices `{5,0,1}` are outside. Edge point `(5,-2)` has only two exterior neighbors and remains blocked with all in-board neighbors occupied.
9. **No source:** empty or out-of-board coordinate is not a free marble, even though emptyAt returns true there.
10. **Identical elements:** two distant free fire marbles remove together; fire/air fails and preserves both cells.
11. **Salt:** free salt pairs with each cardinal and with salt; salt/quicksilver, salt/vitae, salt/mors and salt/lead each fail.
12. **Opposites:** vitae/mors clears in either click order; vitae/vitae and mors/mors fail.
13. **Quicksilver:** quicksilver/quicksilver fails; metal/metal fails. Quicksilver/lead succeeds if lead is geometrically free and present as earliest metal.
14. **Blocked predecessor:** lead remaining but blocked prevents a free tin/quicksilver pair; lead need not be selectable to enforce this gate.
15. **Progression:** after removing lead, tin becomes eligible; after tin, iron; after iron, copper; after copper, silver; after silver, gold. Each non-gold consumes exactly one quicksilver.
16. **Snapshot freedom:** partner q is blocked before a proposed removal but would become free if p disappeared; removePair(p,q) must reject without removing either.
17. **Selection still blocks:** selecting p does not change free(q), counts, metal progression, or occupiedCount.
18. **No self-match:** clicking the same fire coordinate twice deselects; it does not remove one marble or count it twice.
19. **Gold default:** free gold with no earlier metals and two nonmetal marbles remaining can be removed under afterSilver; remaining nonmetals prevent win.
20. **Gold alternate:** the identical test under lastMarble rejects; lone gold succeeds and ends the deal. Gold remains blocked by a surviving lead under either policy.
21. **Not universal wildcard:** gold/quicksilver fails even when gold is next. Gold never consumes a sixth quicksilver.
22. **Win accounting:** a full solution removes 27 pairs plus one singleton, ending at zero marbles after 28 removals; win counter increments once.
23. **Deadlock:** a board of two free different cardinal types and no salt, gold, or other legal family is stuck. A free salt plus free cardinal is not stuck.
24. **Doomed-but-legal:** with one fire, one water, no salt, and two free matching earth marbles, earth removal remains legal but cardinal parity proves no full completion.
25. **No falling:** removing two interior cells leaves all other marble coordinates unchanged; there is no refill.
26. **Rejected request atomicity:** stale second click, invalid coordinate, wrong metal, or repeated ID cannot partially clear the board.
27. **Optional undo/restart:** undo reinstates both marbles and prior metal eligibility; restart restores byte-equivalent initial occupancy, types, gold policy, and seed metadata.
28. **Generator witness:** for each accepted generated board, replay the retained solution through the same public legal-action engine; assert all actions legal and final occupiedCount zero. A timed-out candidate is never emitted as solver-certified.

## 8. Optional variants: explicitly not standard rules

### Sigmar's Garden II / quintessence [S1 only]

S1 describes adding two quintessence marbles to the otherwise standard inventory, for **57 occupied/34 empty** on the same 91-cell board. Each quintessence is removed simultaneously with one free marble of **each** cardinal type (fire, water, air, earth): a five-marble action. The guide does not establish salt substitution, partial selection, cancellation details, every participant's exact freedom timing, or official collection availability. Do not enable by accident in the 55-marble mode.

**D implementable extension, if desired:** `ruleset=quintessenceII`; inventory standard+2 quintessence; `removeQuintessence(Q,A,E,F,W)` requires five distinct occupied cells, correct types, and all geometrically free in the same pre-move snapshot; no salt substitution; remove all five atomically. Selection can collect five positions, escape cancels, and wrong type does not mutate. Existing pair and gold rules remain unchanged. Initial shape/generator for 57 is separately versioned; the antipodal-pair default uses 28 pairs plus gold. This is an explicit compatibility design based on secondary rules, not first-party verification.

### “House Colvan”

S4 mentions a same-metal-pair variant with a different inventory. No primary help text, exact complete tile multiset, and ordering conditions were independently verified here. This is **not** a selectable implemented ruleset in this specification. Do not infer it from the standard game's pair table or silently replace quicksilver with duplicate metals. If that variant is in project scope, obtain its actual official/in-game rule and inventory evidence before implementing it.

## 9. Remaining uncertainty and implementation boundary

The standard geometry, standard multiplicities, metal order, cyclic freedom rule, and pair families are specified exactly; evidence levels are separated. Main unresolved fidelity item: whether gold must be the last marble or merely next in the metal order and free. Default is the latter, with an explicit switch and paired acceptance tests. Also unresolved: commercial mask bank/generator algorithm, distribution, curation guarantees, UI mismatch-selection behavior, and port-specific undo/restart controls. This is a design/test specification, not a delivered engine or a claim of passed engine tests. Use original symbols or text labels; downloaded official/community imagery is research evidence only, not required game assets or permission to redistribute commercial art.
