# Fortune's Foundation — implementation-ready rules

## Identity, authority, and a critical source-mapping correction

This is the Tarot solitaire created for *The Zachtronics Solitaire Collection*. The correct official image family is **`milan`**, not `vegas`. The [milan logo](https://zachtronics.com/solitaire-rules/images/milan_logo.png) visibly says “Fortune's Foundation”; the [vegas logo](https://zachtronics.com/solitaire-rules/images/vegas_logo.png) says “Cluj Solitaire.” Both logos and the rules panels were visually inspected. Importing the `vegas` rules would incorrectly add cheating, collective stack moves, and automatic completed-stack removal to this game.

Read alongside [the shared implementation contract](implementation-contract.md). This document separates first-party rules, secondary observations, and explicit reconstruction policies. It is a design handoff, not a claim that the commercial executable was tested.

## Sources and evidence ledger

### Official panels, directly viewed

- **[F0](https://zachtronics.com/solitaire-rules/images/milan_0.png):** “Cards may be stacked by suit in increasing or decreasing order. Only one card may be moved at a time.” Its examples show wands 6-5-4-3, cups 7-8-9-10-J, and major ranks 13-14-15-16 with 17 being moved.
- **[F1](https://zachtronics.com/solitaire-rules/images/milan_1.png):** “To win, move all cards to the foundations. The major arcana are built up from 0 and down from 21 until they meet. The minor arcana are built up by suit from A to K.” The panel depicts two major foundations and four minor foundations.
- **[F2](https://zachtronics.com/solitaire-rules/images/milan_2.png):** “A card may be placed above the minor arcana foundation, but will block further minor arcana from moving there.” The illustration shows **one** horizontal parked card across the minor-foundation area, not four independent reserve slots.
- **[F3](https://zachtronics.com/solitaire-rules/images/milan_3.png):** “Use the scrying mirror to undo the most recent move.”
- [Official rules index](https://zachtronics.com/solitaire-rules/) links these panels under the matching logo.

### Supplementary evidence, not publisher rules/code

- **[F4: Christopher Livingston, PC Gamer](https://www.pcgamer.com/zachtronics-combined-tarot-with-solitaire-and-its-my-new-daily-jam/):** explicitly describes 52 minor cards plus 22 major cards, 70 cards dealt into ten columns plus one empty column, single-card moves, same-suit ascending/descending tableau, one parked card blocking minor foundations, and the fortune after victory. Search retrieval exposed the article text; the normal text extractor returned subscription material. Its actual [gameplay screenshot](https://cdn.mos.cms.futurecdn.net/DttgDFVBDUfMoz6aLNd2XG.jpg) was viewed and corroborates eleven tableau positions, four minor foundations, two major foundations, and a single horizontal reserve. It is an in-progress board, not an untouched initial deal.
- **[F5: Emma, Signal Decay](https://signaldecay.substack.com/p/a-quick-game-of-cards):** describes the 52+22 inventory, all face-up cards, ten dealt piles, aces moving to foundations during the deal, and one initially empty tableau position.
- **[F6: community strategy discussion](https://steamcommunity.com/app/1988540/discussions/0/3489753174656990604/):** explicitly observes cards automatically moving to foundations. Claims about original solvable-deal generation are speculative and challenged within this very thread; do not promote them to verified rules.
- **[F7: Not A Game Devlog, rules/gameplay transcript](https://www.youtube.com/watch?v=2ph2HHipQEQ):** describes a single undo step, default single-card movement, optional “entire stack” setting, automatic foundation collection, and needing a legal move to release the parked card.
- **[F8: community discussion of optional movement](https://steamcommunity.com/app/1988540/discussions/0/604143512630388894/):** explains the entire-stack option as automating repeated legal transfers/inversion rather than introducing a new primitive stack move. Some examples in the post are imprecisely written; use F0 as the primitive-move authority.
- **[F9: community transcription of the Tarot readings](https://steamcommunity.com/sharedfiles/filedetails/?id=3406664116):** supplies the complete numeric-name mapping below; several entries independently match first-party panels (2 Priestess, 6 Lovers, 11 Justice, 16 Tower, 17 Stars). Do not redistribute the full copyrighted fortune prose merely because it appears in this guide.

## Inventory and exact rank order

There are **74 unique physical cards**, not a conventional 78-card Tarot deck:

1. Four **minor** suits with thirteen ranks each: `A,2,3,4,5,6,7,8,9,10,J,Q,K`.
2. One **major** suit with twenty-two ranks: integer `0,1,2,...,21`.

Use suit identities `Wands`, `Cups`, `Swords`, and `Coins` (wheel/star imagery) as implementation vocabulary. Suit glyphs/IDs, not display colors, determine matches. These conventional suit names are presentation choices where the official panels show symbols rather than naming suits. There are **no additional Page/Knight ranks**. The minor progression is explicitly A through K; use integer ranks A=1, J=11, Q=12, K=13.

The ascending major order, including source-specific names, is [F9]:

| Rank | Name | Rank | Name |
|---:|---|---:|---|
| 0 | The Fool | 11 | Justice |
| 1 | The Magician | 12 | The Hanged Man |
| 2 | The Priestess | 13 | Death |
| 3 | The Empress | 14 | Temperance |
| 4 | The Emperor | 15 | The Devil |
| 5 | The Hierophant | 16 | The Tower |
| 6 | The Lovers | 17 | The Stars |
| 7 | The Chariot | 18 | The Moon |
| 8 | Strength | 19 | The Sun |
| 9 | The Hermit | 20 | Judgment |
| 10 | The Wheel | 21 | The World |

In particular, **Strength is 8 and Justice is 11**; do not swap these because another Tarot tradition does. Major rank 0 is a real card, not an empty-slot sentinel. No cyclic wrapping: 21 is not adjacent to 0. Numeric rank is authoritative even if artwork or localization changes a title.

## Setup and deal policy

### Established layout

- All information is face up. [F5]
- Eleven tableau columns: ten dealt columns and one initially empty position. The empty position is an ordinary tableau column with unrestricted stack depth, **not a single-card free cell**. [F4/F5/F8]
- Four minor foundations, one per suit; the four aces are placed there during initialization. [F5; screenshot corroborates the layout]
- Two initially empty major foundations: low starts at 0 and ascends; high starts at 21 and descends. [F1/F4]
- One initially empty **shared parked-card slot** above the four minor foundations. Capacity is one card total. [F2]
- No stock, waste, draw operation, redeal pass, or face-down cards.

### Explicit reproducible fallback, not recovered publisher generation

Use `dealPolicy=separateAcesThenSevenEach`:

1. Create the 74-card inventory and move each minor Ace to its matching foundation.
2. Shuffle the other 70 cards using a documented PRNG/Fisher–Yates (or accept a supplied order).
3. Deal seven face-up rows round-robin across ten occupied positions, leaving column index 5 empty: occupied indices `[0,1,2,3,4,6,7,8,9,10]`.
4. Initialize the parked slot empty, major foundations empty, and mirror unavailable.
5. Run the configured foundation settling policy; initial exposed cards that are already eligible may therefore leave the tableau before the first player move.

F4 reports seventy cards and ten columns, but the consulted sources do **not** prove every original generated board has precisely seven cards in each before initialization automation, the exact initial-empty-column index, or whether aces are removed before distribution versus encountered during dealing. Seven per occupied column and the central empty index are explicit reconstruction defaults. Support `loadInitialLayout` to retain an observed original deal without forcing these generation assumptions. Never claim an unconstrained shuffled board is guaranteed winnable. A guaranteed-solvable mode needs a solver certificate or a separately verified generation algorithm. Save actual initial state and policy versions.

## State model and invariants

```text
Card = Minor { id, suit, rank:1..13 } | Major { id, rank:0..21 }
State {
  tableau[11]: Card[],                 // bottom/back to exposed top
  minorFoundation[4]: Minor[],         // each ascending from A
  majorLow: Major[],                   // [0,1,...,L]
  majorHigh: Major[],                  // [21,20,...,H]
  parked: Card | null,                 // ONE global card
  mirrorSnapshot: BoardSnapshot|null,  // one prior completed player action
  phase:Playing | Won | Abandoned,
  lastMajorCollected:rank|null,
  initialLayout, rulesProfile, revision
}
```

Every unique card occurs once in live state. Mirror snapshots are historical copies, not additional live cards. Foundation minor ranks must be the exact initial prefix for that suit. The major foundations are disjoint endpoint prefixes: absent low top can be represented by -1, absent high top by 22; require `lowTop < highTop`. At complete major collection, `highTop == lowTop + 1` using those sentinels, including the cases where all 22 cards went onto just one side. There is no required split at 10/11.

Tableau may contain arbitrary dealt adjacencies: do **not** reject a restored board for having disordered covered cards. Only newly created adjacencies need satisfy build rules. All cards are face up but only exposed cards are selectable. Parked capacity is one regardless of how many minor foundations are completed.

## Legal actions

### A. Move one exposed card to a tableau column

Source can be the last card of a nonempty tableau column, or the parked card. Foundation cards are not sources under the default fidelity policy below.

For `MoveToTableau(source,destination)`:

- Source and destination must differ; select one exposed card only.
- If the destination is empty, accept **any rank of either card family**, including a King, a 2, major 0, or major 21. [Secondary interpretation consistent with F4/F8; explicit `emptyColumnPolicy=anyCard` default.]
- Otherwise require the same suit/family and ranks differing by **exactly one**: `sameSuit(a,b) and abs(a.rank-b.rank)==1`.
- All major cards share a fifth logical suit; no major/minor stacking even if printed numbers match. Minor suit must match exactly; no alternating-color rule.
- No restriction requires an entire existing column to run in one direction. The local new adjacency is the rule; a dealt column can be arbitrary. Because each rank exists once per suit, a clean monotone suffix cannot turn back on itself without repeating a card.
- On success move the card, expose its predecessor if any, then settle foundations and check victory.

**Kings have no exclusive empty-column privilege.** Q may go onto K and K may go onto Q of the same suit; neither can wrap onto A. There is no special bonus, removal, or locking when K reaches an empty column. An empty column may be reused as often as moves allow; it is not consumed.

### B. Park one exposed tableau card

`Park(column)` requires an exposed tableau card and `parked==null`. Move that card into the shared slot, even when there is no ordinary tableau destination. It may be a major or minor card. [F2's illustration is major rank 6.]

While occupied:

- No further minor card may be added to **any** of the four minor foundations. This is a shared global block, not a block on just one suit. [F2/F4/F7]
- Major foundations continue to accept legal major cards. F2 specifically restricts further **minor** collection, not all foundation moves.
- Nothing can be stacked on the parked card. It is not a twelfth tableau column.
- It cannot be replaced, discarded, or freely swapped with a tableau card. To release it, use a legal exposed-card move to a tableau column. [F7]
- Releasing it restores minor-foundation availability and can trigger a chain of automatic collections.

The parked slot is a reusable occupancy privilege, **not a once-per-game cheat** and not four independent FreeCell spaces. Blocking is a real consequence; do not automatically discard a parked card simply because it obstructs progress.

**Unresolved edge case:** the panels do not specify whether a parked card that is itself next for a foundation may be sent there directly, especially a minor whose own presence causes the block. Default `parkedFoundationExit=tableauOnly`: parked→foundation is forbidden, for major and minor alike; the card must first return to a legal tableau location. Expose alternative policies `allowMajor` and `allowAnyAfterLift` for reference testing, rather than hiding a guess in the implementation.

### C. Move an exposed tableau card to a foundation

A minor card can move to its own suit foundation iff the parked slot is empty and its rank is exactly one above that foundation's top (A if empty). A major card can move to low iff it is the next rank after low top (0 if empty), or to high iff it is the next rank below high top (21 if empty). No skipping, wrong-suit placement, moving to an interior major rank, or moving a minor downwards on a foundation. These predicates also define automatic collection. [F1]

At the final uncollected major rank, either side can accept that same remaining card if both endpoint fronts are present; transfer it once to the selected side, never duplicate it. All major cards can theoretically be collected from one side: “until they meet” is not a requirement to balance the two piles.

### D. Undo with the scrying mirror

F3 guarantees undo of the **most recent** move; F7 describes one step. Default `undoPolicy=singleUsePreviousAction`:

- Before an accepted player action, retain the complete preceding stable board snapshot.
- Include all resulting automatic collections in that player's action transaction.
- `Undo` restores that entire board (cards, parked occupancy, major fronts, last-major metadata, terminal status), then **clears** the mirror snapshot. A second consecutive Undo is unavailable.
- A later new accepted action creates a fresh one-step snapshot. Invalid actions do not overwrite it. Initialization does not create an undoable player move.
- Do not run auto-collection immediately upon undoing: restore the recorded stable board, rather than instantly redoing the effect.

Exact commercial grouping of automation and whether Undo can be repeated/toggled were not directly tested. The one-step policy is an explicit fidelity fallback, not permission to add unlimited move history. An unlimited undo mode should be clearly labeled a training extension.

### Reversibility is not the same thing as Undo

An ordinary opposite-direction move must pass current legality checks. If moving a card exposed a different rank/suit underneath, moving it back may now be illegal even though the original move was legal. You cannot reverse a foundation move by dragging a foundation card out under the default `foundationReturn=false` policy; only the mirror can revert its parent action. Foundation-return behavior is not explicit in F0–F3 and needs a commercial reference check before being asserted as exact.

### Optional “entire stack” convenience

Primitive rules remain single-card moves. F7/F8 report an optional setting that automates a sequence of those moves. The safe baseline is `movementMode=singleCard`.

An exposed monotone suffix `[4,5,6,7]` (back to exposed top) can be transferred top-first to an empty column as the legal trace `7,6,5,4`, resulting in `[7,6,5,4]`: it **reverses orientation**. It can similarly transfer onto an exposed 8 of that suit by first moving the 7. This is not the same as transporting `[4,5,6,7]` unchanged onto a 3. Never teleport buried cards, invoke a generic FreeCell capacity formula, or authorize an unchanged multi-card drag solely because its ranks look ordered.

If this convenience is implemented, first produce a concrete trace of valid primitive moves, including automatic effects between steps; execute atomically with a defined undo group. Default fallback excludes it from required gameplay until reference-tested. Its exact commercial click/drag grouping is undocumented here.

## Automatic collection and transition pseudocode

Automatic foundation collection is observed in F6/F7 but its exact scheduling is not specified in the official panels. Use explicit default `autoFoundation=eligibleToFixedPoint`:

1. Examine exposed tableau cards only, in ascending column index.
2. If any satisfies a foundation predicate, transfer one and restart the scan.
3. Repeat until none qualify. Parked cards are excluded under the default exit policy.
4. If the final major card could go on either side, default tie-break `majorFinalSide=low` (configurable); record `lastMajorCollected` on every major transfer.
5. A parked card blocks minor moves throughout this loop, including a minor that happens to be next for its foundation. Major moves remain enabled.
6. Check victory only after this settles.

No automatic whole-suit collapse, tableau sorting, compulsory parking, newly empty-column refill, or automatic redeal exists. Keep an optional `autoFoundation=manual` mode for engine testing and a reference comparison switch; it is not the observed original default.

```text
canBuildOn(c, target):
  return target is empty OR
         (sameSuit(c,target.top) AND abs(rank(c)-rank(target.top))==1)

minorEligible(c):
  return c is Minor AND parked is null AND
         c.rank == nextRequiredRank(minorFoundation[c.suit])

majorDestinations(c):
  if c is not Major: return []
  result=[]
  if c.rank == (majorLow.empty ? 0 : majorLow.top.rank+1): add Low
  if c.rank == (majorHigh.empty ? 21 : majorHigh.top.rank-1): add High
  return result

applyPlayerAction(action):
  require phase==Playing and action valid against current stable state
  before = snapshotBoard()  // exclude undo history itself
  execute one validated card transfer
  settleFoundations()      // fixed point, or no-op in manual mode
  phase = all74CardsOnFoundations() ? Won : Playing
  mirrorSnapshot = before
  validate inventory, capacities, foundation prefixes; commit revision

undo():
  require mirrorSnapshot exists
  restoreBoard(mirrorSnapshot)
  mirrorSnapshot=null
  validate and commit revision  // do not auto-settle again
```

## Victory, dead ends, and presentation

Win iff **all 74 cards are in the six foundations**: all four minor suit piles reach K, majors collectively contain every rank 0–21 once, tableau is empty, and parked is empty. [F1] Completing only the majors or only four minor suits is insufficient. There is no points threshold, timed defeat, opponent, or extra round.

The post-victory fortune is based on the final major card in the collection sequence [F4/F7]; store that rank separately because the last **overall** card could instead be minor. Exact final-major tie-breaking/animation order is a fidelity gap. A rules-only implementation may show the rank/title without reproducing the prose. Choose deterministic collection order so replay has the same result.

No legal forward moves means `NoLegalActions`, not proof the initial deal was unwinnable. Undo may still be available. Legal moves can also form cycles without a path to victory; counting legal actions does not solve the game. Do not silently redeal or declare victory because there are no moves. Allow user abandonment/New Game; Restart restores the supplied initial layout. Original guaranteed-solvable generation is not recovered here.

## Concrete acceptance scenarios

These are future engine tests, not claimed runs of the commercial game. Use complete valid inventories with unmentioned cards in arbitrary covered locations; for isolated predicates disable autoFoundation or choose ranks not currently collectable. Arrays are back-to-exposed-top.

| ID | Given / action | Expected result |
|---|---|---|
| F-T01 | Minor Cups 5 onto exposed Cups 4; repeat on Cups 6 in a separate fixture | Both legal, ascending and descending respectively. |
| F-T02 | Cups 5 onto Swords 4 or Cups 7 | Reject wrong suit and nonconsecutive rank; preserve state. |
| F-T03 | Major 17 onto major 16 or major 18; separately major 10 onto minor Cups 9 | First two legal; third rejects wrong family despite consecutive printed ranks. |
| F-T04 | Major 0 onto major 21; minor A onto K | Both reject: no wrap. |
| F-T05 | Exposed Cups K onto Cups Q | Legal; Q onto K is also legal in a separate fixture. |
| F-T06 | Empty column and exposed Cups 5, Cups K, or major 0, tested independently | Each may occupy it under `anyCard`; column remains reusable. |
| F-T07 | Tableau column `[major 8, Cups 5]`; attempt to move major 8 | Reject buried source; all cards being face up grants no buried-card selection. |
| F-T08 | Exposed major 6, parked empty; Park it | Legal; parked now major 6; all four minor foundations blocked. |
| F-T09 | Parked major 6; attempt to park Cups 8 or stack major 5 onto parked 6 | Reject both; capacity is one and parked is not a tableau build destination. |
| F-T10 | Parked occupied; minor foundations at A; expose Cups 2 and Swords 2 | Neither minor collects, regardless of suit; an exposed major 0 can still collect to low. |
| F-T11 | Parked major 6; exposed major 5 on a tableau destination | Release parked onto 5 is legal; reserve empties; any exposed minor 2 may now auto-collect. |
| F-T12 | Parked major 6; no empty tableau and no exposed major 5/7 | No release move; do not discard it or grant a swap. Mirror may still undo. |
| F-T13 | Cups foundation A; exposed Cups 2; reserve empty | Move 2 to Cups foundation legal; Cups 3 before 2 or Swords 2 onto Cups rejects. |
| F-T14 | Both major foundations empty; exposed 0,21,7 | 0 starts low; 21 starts high; 7 cannot start either. |
| F-T15 | Low `[0,1,2]`, high `[21,20]`; expose 3 and 19 | Low accepts 3; high accepts 19; no gap skipping. |
| F-T16 | Low 0..9; high 21..11; remaining major 10 exposed | 10 is eligible on either side; default automation chooses low, moving one physical card once. Major collection now complete. |
| F-T17 | Low 0..20; high empty; expose major 21 | Low may accept 21; major completion does not require one card on each side. |
| F-T18 | Minor Cups foundation at A, tableau `[Cups 4,Cups 3,Cups 2]`, reserve empty | Fixed-point automation removes 2, then 3, then 4, ending Cups foundation at 4 and tableau empty. |
| F-T19 | Same tableau as F-T18 but reserve occupied by noncollectable major 8 | No Cups card automatically collected. Releasing reserve later triggers the chain. |
| F-T20 | Action reveals the F-T18 chain; Undo once | Restore every auto-moved card, exact tableau order, prior foundations, reserve, and phase; second consecutive Undo unavailable by default. |
| F-T21 | Action is rejected while a mirror snapshot exists | Board and mirror snapshot remain byte-equivalent to before rejection. |
| F-T22 | Manual mode, `[Cups 4,Cups 5,Cups 6,Cups 7]` and empty column | Primitive transfer sequence 7,6,5,4 gives `[7,6,5,4]`; direct four-card transfer is not a primitive action. |
| F-T23 | All minor foundations A..K; all majors except 12 collected; last tableau card major 12; reserve empty | Collect 12: Won, no tableau cards, `lastMajorCollected=12`. |
| F-T24 | All major ranks collected but uncollected minor K remains | Not Won; likewise not Won with any parked card. |
| F-T25 | A collected foundation top is dragged to a tableau column | Reject under default `foundationReturn=false`; mirror Undo is distinct. |
| F-T26 | Minor parked card is itself the next required rank for its foundation | No parked→foundation move under `tableauOnly`; must release legally to tableau first. Test other policies separately. |
| F-T27 | Construct setup before settling under the default generation policy | 74 unique IDs; four aces on four foundations; ten tableau lengths 7 and one length 0; 22 majors total; reserve/mirror empty. |
| F-T28 | Apply any valid action, serialize, restore, then undo | Exact pre-action board restored, including reserve block and major fronts; no lost or duplicated cards. |

## Remaining fidelity questions and chosen defaults

| Unresolved original behavior | Named default / how to resolve |
|---|---|
| Original solvable-layout generation, PRNG, exact distribution and initial empty index | `separateAcesThenSevenEach`, index 5 empty; no solvability promise. Load real layouts for reference work. |
| Empty-column restriction not stated verbatim in panels | `emptyColumnPolicy=anyCard`, consistent with secondary descriptions of stack reversal. Confirm a non-K minor and a major in the commercial game. |
| Moving a collected foundation card back to tableau | `foundationReturn=false`; test directly before claiming exact fidelity. |
| Parked→foundation exit and whether lifting a minor clears its own block | `parkedFoundationExit=tableauOnly`; test major-eligible and minor-eligible parked cards separately. |
| Exact automatic collection scheduling and final-major side priority | `eligibleToFixedPoint`, columns left-to-right, `majorFinalSide=low`; configurable/manual comparison mode. |
| Exact one-step undo behavior and transaction grouping | Snapshot player action plus automatic effects; consume snapshot after Undo. |
| “Entire stack” drag semantics and undo grouping | Single-card baseline; optional convenience only through an explicitly valid single-card trace. |
| Full English suit labeling and localized readings | Numeric ranks and stable suit glyph IDs are authoritative; conventional suit names are implementation vocabulary. |

These policies make a complete playable reconstruction possible without presenting missing commercial implementation details as established facts.
