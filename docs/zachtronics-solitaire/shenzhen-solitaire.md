# Shenzhen Solitaire — implementation-ready rules design

## 1. Scope and confidence

Implement the standard Shenzhen Solitaire in SHENZHEN I/O, its standalone release, and The Zachtronics Solitaire Collection. This is an open-information, 40-card, FreeCell-inspired game, **not FreeCell with a standard deck**. In particular, do not import FreeCell's temporary-storage limit on moving runs.

Evidence labels throughout: **P** = explicit first-party rule panel; **S** = secondary description, screenshot, or independently written engine; **D** = recommended implementation decision where fidelity has not been established. The rules below define an implementable default; D items must not be described as reverse-engineered Zachtronics behavior.

### Sources

- **P0**: [official rule index](https://zachtronics.com/solitaire-rules/), linked by the [official collection page](https://www.zachtronics.com/solitaire-collection/).
- **P1–P4**: official image panels [shenzhen_0.png](https://zachtronics.com/solitaire-rules/images/shenzhen_0.png), [shenzhen_1.png](https://zachtronics.com/solitaire-rules/images/shenzhen_1.png), [shenzhen_2.png](https://zachtronics.com/solitaire-rules/images/shenzhen_2.png), [shenzhen_3.png](https://zachtronics.com/solitaire-rules/images/shenzhen_3.png). Downloaded and visually inspected; exact text preserved in `sources/shenzhen-sigmar-rule-transcripts.md`. `shenzhen_logo.png` explicitly reads SHENZHEN SOLITAIRE.
- **S1**: [rktjmp's implementation README](https://github.com/rktjmp/shenzhen-solitaire.nvim), inventory, exposed-card handling, flower, foundations, automatic moves. A clone is secondary evidence, not the official implementation.
- **S2**: [pushcx's Haskell solver](https://github.com/pushcx/shenzhen/blob/03b36102ca1be75dcd5f8c1889860f245bf89fbc/src/Main.hs), inspected setup and dragon-collection predicates; `chunksOf 5`, eight columns, same-type dragon cell usable as collection destination. Its automatic-build code is too aggressive to treat as authoritative, and its empty-tableau victory shortcut should not be copied blindly.
- **S3**: [Turn of a Friendly Card, originally 2017](https://netizen.club/~wildweasel/friendlycard/shenzhen.html), explicitly says runs do not require free cells; original game has no undo and no foundation withdrawal.
- **S4**: [hickford solver, dragon.py](https://github.com/hickford/shenzhen-solitaire-solver/blob/master/dragon.py), setup, collection into a cell already holding a matching dragon, and automatic rank-1/rank-2 handling. Its minimum-foundation expression includes the flower slot and is not a fidelity specification.
- **S5**: [Online Math Learning implementation/rules](https://www.onlinemathlearning.com/shenzhen-solitaire-game.html), supports unlimited runs and arbitrary empty-column placement. Its double-click, undo, and animal symbols are features of that implementation, not verified original controls.
- **S6**: [in-game screenshot reproduced by pushcx](https://raw.githubusercontent.com/pushcx/shenzhen/master/screenshot.jpg), saved as `sources/shenzhen-screenshot.jpg`; shows eight column positions and upper regions, but is midgame, not an untouched deal.

## 2. Exact components and setup

### Inventory [S1, S2, S4]

| Card kind | Values/types | Copies | Total |
|---|---|---:|---:|
| Number | Bamboo (green), Characters/Myriad (black), Dots/Coins (red); ranks 1–9 | one per suit/rank | 27 |
| Dragon | red, green, white | four per dragon type | 12 |
| Flower | one unranked flower | one | 1 |
| **Total** | | | **40** |

Suit and dragon type are separate enums. A red dragon is not a red rank-zero card. White dragons may be drawn in black outline: do not identify their game type by displayed color alone.

### Board [P1–P4, S1, S2, S4, S6]

- Eight tableau columns, indexed 0–7, each initially five cards, all face up; no stock, waste, redeal, hidden flips, or draw action.
- Three upper-left free cells, each initially empty. A cell holds one ordinary card, or one permanently collected four-dragon bundle.
- Three upper-right number foundations, each building one suit from 1 through 9. Their screen assignment can be dynamically bound by first rank-1 placement; the engine can simply key them by suit. Dynamic binding versus fixed screen assignment is a presentation choice not resolved by the official text.
- One flower home between the dragon controls and numbered foundations, initially empty.
- Three dragon-collection buttons, one per type; these are not additional card-storage cells.

**D deal protocol:** construct canonical deck ordered by kind/suit/rank/copy ID, Fisher–Yates shuffle with a documented seeded PRNG, then fill columns consecutively with five cards each, stored covered-to-exposed. Deal animation may be round-robin without affecting the final state if it uses the same explicit assignment. The original RNG, seed encoding, shuffle order, initial-deal filtering, and solvability guarantee were not established. Default `dealPolicy=random` does not promise every deal is winnable; optional `verifiedSolvable` uses a real solver and retains a replayable solution. Never call a timeout a proof of impossibility.

## 3. State model and invariants

```text
Card = Number{id, suit, rank:1..9}
     | Dragon{id, dragonType}
     | Flower{id}
Cell = Empty | Single{cardId} | Sealed{dragonType, cardIds[4]}
State = {
  columns: list<CardId>[8],   // first covered, last exposed
  cells: Cell[3],
  foundationHeight: map<Suit, 0..9>,
  flowerHome: boolean,
  phase: Ready | Animating | Won,
  seed, initialAssignment,
  settings: {autoPolicy, allowUndo, allowRestart}
}
```

A foundation height `h` represents exactly that suit's ranks 1..h; retain underlying IDs if needed for audit/serialization. Every one of the 40 card IDs exists in exactly one region, including the four IDs inside a sealed cell. Each dragon type is either four individually located dragons or one sealed bundle, never both. Columns may contain arbitrary adjacent cards from the deal; only a selectable suffix must be ordered. There is no maximum tableau height.

A card is **exposed** if it is the last entry of a nonempty column or the sole card in a `Single` cell. Cards visible as overlapping labels but covered by others are not exposed. Foundation and sealed cards are terminal and cannot be sources [P4, S3].

## 4. Legal actions and atomic transitions

### 4.1 Tableau move [P2, S1, S3]

Move any nonempty suffix of a column to a different column if it is a valid run and its leading card fits. A single exposed card is a valid run, including a dragon or flower. A multi-card run contains number cards only, with each successive card exactly one lower and of a different suit from its predecessor. “Alternating” means adjacent suits differ; it does not require a two-suit ABAB pattern. A green 7, red 6, green 5, black 4, red 3 is legal (as the official diagram shows).

An empty column accepts any valid run or single card, not just 9s. A nonempty destination accepts only a number card/run whose leading card is one lower than, and a different suit from, the exposed destination number. Nothing may be built onto a dragon or flower, nor may one be built onto a number. There is no wrapping 1→9, no gaps, and no same-rank stacking.

```text
fits(a, b):                     // a is leading moving card; b is target top
  return bothNumber(a,b) and a.rank + 1 == b.rank and a.suit != b.suit
validRun(R):
  return len(R)==1 or all(fits(R[i+1],R[i]) for i=0..len(R)-2)
moveSuffix(sourceCol, startIndex, destCol):
  require sourceCol != destCol and inRange(startIndex)
  R = columns[sourceCol][startIndex:]
  require validRun(R)
  require empty(destCol) or fits(R[0], last(destCol))
  atomically delete R from source; append R to destination
```

Do **not** impose `(emptyCells+1)*2^emptyColumns` or require a sequence of physically possible single-card transfers. Runs are moved as units irrespective of spare storage [S3].

### 4.2 Free-cell transfers [P3]

- Exposed tableau card → `Empty` cell: move exactly one card of any kind.
- `Single` cell → tableau: move that one card using the same empty/nonempty destination predicate.
- **D** `Single` cell → different `Empty` cell: allow as a storage-equivalent convenience; direct cell-to-cell UI behavior was not verified. This changes no reachability because cell positions are interchangeable.
- Never place two ordinary cards in a cell or move into/out of a sealed cell.

### 4.3 Number foundation [P1, S1]

An exposed number card may be moved manually to its suit's foundation iff `rank == foundationHeight[suit] + 1`. Remove it from the source and increment that height. No multi-card foundation drop; a UI may batch separately validated single-card actions. No foundation withdrawal [S3]. It is legal to advance a foundation beyond the conservative automatic threshold; the player may intentionally sacrifice a useful tableau support card.

### 4.4 Flower [S1, S2]

An exposed flower moves to its unique flower home; home must be empty. The ordinary stabilized game does this automatically immediately when exposure occurs. The flower has no rank, cannot participate in a tableau run, and cannot accept a card. With autos disabled it can be moved to an empty column/cell or manually home [D explicit accessibility mode].

### 4.5 Collect dragons [P4, S2, S4]

All four dragons of type `d` must be simultaneously exposed, across columns and/or single-card cells. There must be a cell that is empty **or presently contains one of those same four dragons**: collecting frees that cell as part of the atomic action. A cell holding a different dragon or a number does not qualify. The matching button is enabled iff this predicate is true. Collection is player initiated, not mandatory auto-play.

```text
collect(d):
  E = all exposed unsealed Dragon(d) cards
  require len(E) == 4
  candidates = [i | cells[i]==Empty or cells[i]==Single(Dragon(d))]
  require candidates not empty
  destination = smallest candidate index  // D deterministic UI tie-break
  atomically remove all four IDs from their source regions
  cells[destination] = Sealed(d, ids(E))
```

Matching-type occupied-cell eligibility is supported by secondary engines; official wording only says “open free cell.” Keep `matchingDragonCellEligible=true` configurable if strict fidelity later contradicts that reading. Never remove buried dragons, even when their faces can partly be seen. Do not collect recursively uncovered same-type cards in one action: four must already be exposed.

## 5. Automatic behavior and input ordering

Official panels do not specify automatic thresholds. Sources agree the exposed flower is cleared automatically and only safe number cards should be automatically removed, but secondary implementations differ [S1, S2, S4, S5]. Do not confuse “legal foundation move” with “must automatically execute.”

**D default `autoPolicy=conservative`:** auto-home the flower; auto-home any exposed legal number of rank 1 or 2; otherwise only a legal number of rank `r` for which every number foundation has height at least `r-1`. This is a conservative, explicitly specified approximation consistent with the common “no lower-valued cards remain” explanation; exact original threshold remains unverified. `autoPolicy=off` disables all autos; `flowerOnly` disables number autos. Keep this policy isolated for later replacement.

```text
settle(state):
  while exists exposed auto-eligible card:
    choose flower first, then lowest rank, then suit order, then source order
    execute its legal home move
  update terminal status
applyPlayerAction(action):
  require phase == Ready and action currently legal
  save one pre-action snapshot if undo enabled
  perform action atomically
  settle(state)
  publish one committed state; animations replay its event list
```

Do not accept a second move against a partially animated state. If undo is offered, rewind the player's action and its entire automatic cascade together. **Original-style defaults:** no undo and no restart-current-deal, per S3; these can be opt-in accessibility/debug features, not advertised as original rules. No automatic dragon collection and no automatic rearrangement of tableau stacks.

## 6. Win, stuck states, examples

**Win:** all three heights equal 9, flower home occupied, all three dragon types sealed, and all tableau columns and single cells empty. P1 gives the numerical goal; the complete invariant follows the inventory and dragon/flower goals in S1/S5. Use the full condition, not merely `all columns empty`: a number still in a free cell must prevent winning. No timer/score requirement.

**No legal move:** enumerate all actions after settling; exclude identity moves. Storage permutations and moving an entire column into an equivalent empty column can create cycles. “No currently useful move” is not a sound losing predicate. Label `stuck` only when the chosen move model has no nontrivial legal action, or `provenUnsolvable` after exhaustive search; otherwise `solvabilityUnknown`. New Game abandons the deal. Never mutate a losing board by reshuffling cards midgame.

Examples:

- `[7G,6R,5G,4B,3R]` can be moved onto exposed `8B` even with all free cells sealed; not onto `8G` because the leading `7G` has the same suit.
- `[7G,6R,4B]` is not a movable three-card suffix because 6→4 skips a rank. `4B` alone remains selectable.
- Three red dragons at tableau ends plus one red dragon in a cell can be collected even when the other two cells are occupied. All four vanish from their old locations; one cell is sealed.
- An exposed green 6 with green foundation at 5 is manually playable even when another suit foundation is only 2. Default conservative autoplay leaves it for the player.

## 7. Concrete acceptance tests

Use microstates with auto disabled unless explicitly testing autos. Omitted cards can live in a test fixture's inaccessible reservoir; full-deck integration tests must not use that reservoir. G/R/B denote number suits, not dragon types.

1. **Deck:** construction yields 40 unique IDs: 27 distinct suit/ranks, four each red/green/white dragons, one flower.
2. **Deal:** before settlement, eight columns have five cards each; all 40 face up; all cells/foundations/homes empty. Same seed/version yields same assignment.
3. **Valid run:** `[7G,6R,5G,4B,3R]` moves onto `8B`; order and IDs preserved.
4. **Unlimited run:** test 3 succeeds with all three cells sealed and no spare empty column.
5. **Same suit:** exposed `6G` onto `7G` fails without mutation.
6. **Gap/equal:** `5R` onto `7G`, or `7R` onto `7G`, fails.
7. **Malformed suffix:** `[7G,6R,4B]` cannot move as three cards; its final `4B` alone can move onto `5R`.
8. **Empty column:** `4G`, any single dragon, and any valid number run can separately enter an empty column; no king/9-only restriction.
9. **Dragon stacking:** dragon onto another dragon or a number fails; number onto dragon fails.
10. **Cells:** exposed `8B` enters empty cell; a second card and a two-card run cannot enter it. A sealed cell rejects every transfer.
11. **Covered source:** first card of `[Dragon(red),4G]` cannot move singly, collect, or go home while covered.
12. **Foundation:** `1G` enters empty green home; then `2G`; `4G` cannot follow `2G`; a red card cannot advance green height. Withdrawal fails.
13. **Early manual foundation:** `6G` with green height 5 and red/black heights 2 can be played manually with autos off.
14. **Four exposed dragons:** four white tableau-end dragons and one empty cell enable collection; exactly four IDs become one sealed bundle and one fewer free cell is available thereafter.
15. **Matching occupied destination:** one white dragon in a cell plus three exposed white tableau dragons, other cells occupied, can collect into that same cell.
16. **No destination:** four exposed white dragons with cells occupied by unrelated numbers/different dragons cannot collect.
17. **One covered:** three exposed plus one covered matching dragon disables the button even with empty cells.
18. **Flower cascade:** move a card covering the flower; default settlement moves flower home, then reevaluates the newly exposed card. Flower never stacks as a ranked card.
19. **Autoplay policy:** with all heights at least 2, exposed legal `3G` auto-homes; if red height is 1, it does not. Exposed legal 1s/2s auto-home regardless of other heights.
20. **False win guard:** empty tableau but an unhomed number in a single cell is not a win. Full heights, flower home and all dragon bundles, with no singles/tableau, is a win exactly once.
21. **Transactional undo option:** undo restores the state preceding both a player move and a multi-step auto cascade, preserving IDs and cell seals.
22. **Invalid action:** out-of-range column, source=destination, nonexistent ID, or stale request fails without partial mutation.

## 8. Remaining fidelity checks and delivery boundary

Unverified: original shuffle/generator filters and seeds; exact autoplay threshold/tie-break; dynamic screen foundation binding; direct cell-to-cell UI transfer; whether all ports share original no-undo/restart behavior. Matching occupied-dragon destination is secondary-supported and should be retained by default. These uncertainties do not leave legality undefined: the D defaults above are explicit and independently configurable. No executable engine or claim that these acceptance tests have passed is part of this document. Implement with original shapes/text/colors; downloaded screenshots and rule panels in `sources/` are research evidence, not runtime assets or a redistribution license.
