# Kabufuda Solitaire — implementation-ready rules specification

## 1. Scope and evidence contract

Target: Zachtronics' **Kabufuda Solitaire**, as represented in The Zachtronics Solitaire Collection official rules. This is a matching/set-collection solitaire, not traditional Oicho-Kabu and not Klondike. The official `nagoya_logo.png` title reads KABUFUDA SOLITAIRE; all four `nagoya_0..3.png` panels were inspected visually. They establish matching-run movement, permanent collapse, tableau-triggered unlocking, free-cell storage, and the ten-set objective.

Labels:
- **[P] Primary**: stated or visibly demonstrated in official panels.
- **[S] Secondary**: player account, independent solver, or fan implementation; useful corroboration, not proprietary game code.
- **[D] Design default**: deterministic choice for a detail not settled by the available evidence. Defaults are explicit/configurable and are not silently passed off as original behavior.

### Sources

- **P0:** [Official rules index](https://zachtronics.com/solitaire-rules/), [Kabufuda title](https://zachtronics.com/solitaire-rules/images/nagoya_logo.png).
- **P1:** [nagoya_0.png](https://zachtronics.com/solitaire-rules/images/nagoya_0.png): “Matching cards can be stacked and can then be moved together.” Diagram shows a matching three-card run being moved; a vacant tableau slot is visible.
- **P2:** [nagoya_1.png](https://zachtronics.com/solitaire-rules/images/nagoya_1.png): “When four matching cards are united on the tableau they will collapse into a locked stack. This will also unlock a free cell if one is available.” Diagram specifically moves four matching cards onto an **empty** tableau position, which then becomes dark/sealed.
- **P3:** [nagoya_2.png](https://zachtronics.com/solitaire-rules/images/nagoya_2.png): “Free cells can store a single card of any type. Four matching cards can also be united in a free cell to collapse them into a locked stack.” Full-board diagram shows four upper cells and eight tableau columns.
- **P4:** [nagoya_3.png](https://zachtronics.com/solitaire-rules/images/nagoya_3.png): “To win the game, collapse all ten types of cards into ten locked stacks.” Victory diagram shows four sealed upper cells and six sealed tableau positions, with two empty tableau positions; this is an example, not a required distribution.
- **S1:** [ComicSansMS Kabufuda solver README](https://github.com/ComicSansMS/kabufuda-solver): eight stacks of five cards and ten identities represented as digits 0–9; difficulty determines initial available upper cells.
- **S2:** [Solver source](https://github.com/ComicSansMS/kabufuda-solver/blob/main/kabufuda.cpp), inspected via [raw code](https://raw.githubusercontent.com/ComicSansMS/kabufuda-solver/main/kabufuda.cpp): `CardStack::tryCollapse` requires entire pile size four with four matches; `SwapField` distinguishes Locked/Free/Occupied/Collapsed; upper destinations accept **one or four** cards only and must be empty/free; difficulties start with 4/3/2/1 upper cells. This is an independent solver, not original game code; do not copy it as an unquestioned oracle (its transition checks are not a complete robust engine).
- **S3:** [quasar098 fan implementation README](https://github.com/quasar098/kabufuda-solitaire): easy=4, normal=3, hard=2, expert=1 available upper cells; a four-card set **by itself** is immovable; completing sets on the lower eight positions unlocks upper cells. Labels this implementation as an independent Last Call BBS recreation.
- **S4:** [Last Call BBS player strategy discussion](https://steamcommunity.com/app/1511780/discussions/0/3318610798931475287/): tableau collapse unlocks a cell at higher difficulties; upper cells otherwise hold only one card; creating more tableau seals trades lower-space capacity for upper-cell access.
- **S5:** [TI-84 independent recreation](https://github.com/ariajd27/kabufuda-solitaire-ti84plusce): identical cards move as groups; four copies must be stacked directly on the table to become immovable; free cells hold one card or a collapsed set. This recreation hardcodes expert-style initial access; do not generalize its single difficulty to the original.

## 2. Deck inventory, layout, visibility, and difficulty

### Exact inventory

**40 cards = ten types × four copies per type.** [P2,P4; S1,S2]

Represent types as integers **1..10**, copy IDs **0..3**. These are ten matching identities, not ten ascending ranks: `type=3` neither follows `type=2` nor differs in strength from `type=10`. There are no suits, colors, trumps, wildcards, stock cards, or extra jokers. A standard deck's A–10 cards of four suits can serve as a physical substitute if matching ignores suit; the implementation's native inventory is still the ten-type, four-copy set.

A card's `type` controls equality. Stable per-copy IDs permit conservation checks, replay, animation and undo; copy order has no strategic meaning. Traditional numeral/artwork labeling is presentation only. The red patterned design visible among active cards in P1/P3 must not be conflated with the separate dark sealed-stack graphic: use explicit state, never texture color, to decide whether a card is playable.

### Board and initial deal

- **Eight lower tableau columns**, each containing **five cards**, all dealt face up; all 40 cards are on the tableau initially. [S1,S2; eight columns visible in P3]
- **Four upper free-cell positions**, initially empty of cards. Their accessibility is difficulty-dependent. [P3; S2,S3]
- No card is hidden in the active tableau. Overlap can obscure most artwork, but a type indicator should remain readable. Only an exposed matching suffix is movable; full identity visibility does not permit picking a buried singleton out of a column.
- A completed set remains on its occupied slot as a sealed/locked stack, visually collapsed into one card-back-like marker. This marker represents **four cards**, not one hidden card to reveal later. [P2,P3]
- No draw action, waste, recycle, redeal-in-place, separate foundation region, or hidden reserve.

| Difficulty | Initially open upper cells | Initially unavailable upper cells |
|---|---:|---:|
| Easy | 4 | 0 |
| Normal | 3 | 1 |
| Hard | 2 | 2 |
| Expert | 1 | 3 |

Counts are independently corroborated by S2/S3; official panels do **not** print the difficulty table. Accept `Medium` as an input alias for `Normal` if importing S1's files, but display **Normal** by default [D]. Do not invent further restrictions at higher difficulties: the deck and lower deal stay the same; only upper-cell availability changes.

### Deterministic setup defaults [D]

Default difficulty **Normal**, configurable; all difficulties directly selectable. Original progression/unlock requirements are outside the card rules and not established by these panels. Shuffle the 40 unique IDs uniformly with a recorded PRNG/permutation. For row 0..4 and column 0..7, append the next card to that column. Open the leftmost N upper cells; mark the remainder `UNAVAILABLE`. Exact original PRNG, seed mapping, deal order, filtering of trivial/unsolvable deals, and which side starts open are not established. Default `dealFilter=none`; make no guaranteed-solvability claim.

Finish the deal atomically before applying any collapse normalization; transient partial-deal states must not unlock cells. Keep the initial permutation for replay. Initial columns have five cards, so none is a standalone four-card set at setup.

## 3. Data model: distinguish two meanings of “locked”

```text
Card = {id: (type,copy), type: 1..10}
TableauSlot = Active(cards: Card[]) | Sealed(type, cardIds[4])
UpperCell = Unavailable
          | Empty
          | Single(card)
          | Sealed(type, cardIds[4])
State = {
  tableau: TableauSlot[8],
  upper: UpperCell[4],
  difficulty: EASY | NORMAL | HARD | EXPERT,
  initialPermutation: CardId[40],
  status: PLAYING | WON,
  config: {upperCompletionPolicy, unlockOrder, allowUndo, ...}
}
```

Active arrays run **base → exposed**, `last()` is the accessible end. `Unavailable` is a **not-yet-unlocked upper cell**; `Sealed` is a **permanently occupied completed set**. Never use one boolean called `locked` for both without a separate reason/tag. Tableau slots never start unavailable; their sealed state is permanent.

### Invariants

1. Exactly 40 unique card IDs, four of each type, counting four inside every sealed marker.
2. An upper cell is unavailable, empty, single, or sealed — never a temporary pair or triple.
3. Every sealed stack has exactly four equal-type cards. No sealed stack can source or receive cards, and it never becomes empty again during normal play.
4. Active columns may have mixed types in their buried portions. Only the payload and newly formed join must match; do not require initial columns to be homogeneous.
5. After normalization, no active column consists of exactly four matching cards; it would already be sealed.
6. A type cannot appear both in a seal and elsewhere, because the seal consumes all four copies.
7. Upper unlocking is monotone: `Unavailable → Empty` only. Occupied/Sealed upper cells are not “available to unlock.”

## 4. Mobility, placement, and exact collapse rules

### Source payload

```text
payload(src, start):
  if src is tableau[i]:
    require tableau[i] is Active(cards)
    require 0 <= start < len(cards)
    p = cards[start:]
    require every card in p has type == p[0].type
    return p
  if src is upper[j]:
    require upper[j] is Single(c)
    require start == 0
    return [c]
  reject
```

The player may move **any homogeneous suffix**, including one card from a larger matching run [P1; S2 corroborates split sizes]. A mismatched buried prefix stays behind. There is no FreeCell-style sequence-capacity calculation; a matching run is a primitive group move, including four cards while they still rest on unrelated cards. A sealed stack is not a movable four-card run.

### MOVE_TO_TABLEAU(src, start, dst)

```text
require status == PLAYING and src != dst
p = payload(src,start)
require dst is tableau[k] and dst is Active(cards)
require cards.empty or cards.last.type == p.first.type
atomically remove p from src; append p to dst.cards
normalizeAfterMove(); validateInventory(); evaluateWin()
```

An empty **active** tableau column accepts any single card or homogeneous run. A nonempty active tableau column accepts only the matching type. No ascending/descending or color predicate applies. All source/destination checks happen before mutation. Same-slot moves are rejected/no-ops, never a way to trigger rewards.

### MOVE_TO_UPPER(src, start, dst)

Default `upperCompletionPolicy=EMPTY_ONLY_ONE_OR_FOUR` [S2; D fidelity resolution]:

```text
require status == PLAYING and src != dst
p = payload(src,start)
require dst is upper[k] and upper[k] == Empty
require len(p) == 1 or len(p) == 4
atomically remove p from src
if len(p) == 1: upper[k] = Single(p[0])
else: upper[k] = Sealed(p[0].type, ids(p))
normalizeAfterMove(); validateInventory(); evaluateWin()
```

Thus a cell can hold a single card temporarily or receive an intact four-card matching run and seal it immediately. A pair or triple cannot be parked there. Under this default, a cell already holding one card **cannot** accept three matching cards to finish a set, nor one matching card to form a pair. To complete that type, return its single card to a matching tableau pile, then transfer the four-card run from a still-active tableau pile onto an empty cell.

**Why explicit:** P3's phrase “united in a free cell” does not independently settle whether a 3+1 transfer into an occupied cell is allowed. S2 explicitly rejects occupied upper destinations and accepts only payload lengths one/four. That is the selected default, not a falsely claimed primary fact. If direct original-game testing confirms 3+1, introduce a separately versioned policy `EMPTY_OR_COMPLETE_SINGLE` that accepts matching payload length three into `Single(c)` and immediately seals all four. Never permit stable pairs/triples. Do not switch this policy mid-deal or hide the difference in UI code.

### Automatic tableau collapse and upper unlocking

**A four-card matching run collapses on tableau only when it is the entire column, with no unrelated card beneath it.** [P2 diagram; S2,S3,S5] This condition matters: `[B,A,A,A,A]` is movable at its A suffix and is **not** sealed; `[A,A,A,A]` alone is sealed and cannot later be sent to an upper cell.

```text
normalizeAfterMove():
  for i in 0..7:                     # deterministic default
    if tableau[i] is Active(cards)
       and len(cards)==4
       and all cards have same type:
      tableau[i] = Sealed(cards[0].type, ids(cards))
      j = first upper index in configured unlockOrder
          where upper[j] == Unavailable
      if j exists: upper[j] = Empty
```

Check **both source and destination**, not only the recipient of a move. Removing a covering card may leave a standalone matching set in the source and must then seal it. Initial/imported states should be validated or normalized explicitly, not awarded repeatedly when rendered or reloaded.

- Each **new tableau seal** unlocks **at most one** still-unavailable upper cell [P2]. Default unlock order left→right [D].
- A seal created in an **upper cell unlocks no other cell** [P2 distinguishes tableau reward; S3,S4].
- If no upper cell remains unavailable, the tableau set still seals; the unlock reward is simply absent. Never clear an occupied upper cell, recycle a sealed cell, create a fifth upper cell, or bank a reward for later.
- No player “confirm collapse” action or delay is required. Collapse is mandatory and atomic once its predicate holds. You cannot assemble a standalone tableau set and then move it elsewhere before sealing. Plan the fourth-card join over an unrelated base if you want to preserve the option to send the completed run upward.
- Collapse consumes space permanently, even though the graphic becomes smaller. Do not remove the set from the board and free its tableau slot.

### Example of the strategic distinction

`T0=[B,A,A,A]`, `T1=[A]`, `U0=Empty`: move `A` from T1 onto T0. Result T0=`[B,A,A,A,A]`, still active. Its A×4 suffix may go to U0 and seal there, leaving `[B]` and unlocking nothing. Alternatively move A×4 to empty T2: T2 immediately seals, and exactly one unavailable upper cell opens. Once T2 is sealed, neither its individual cards nor its complete set can be moved again.

## 5. Auto-actions, victory, deadlocks, and meta-actions

**Mandatory auto-actions:** normalize standalone tableau sets; seal a four-card upper transfer; unlock one unavailable cell per newly sealed tableau set; evaluate victory. Never auto-rearrange cards, move sets to upper cells, choose a strategic collection destination, or reveal a hidden card. [P2,P3 plus deterministic D transition timing]

**Win:** exactly ten sealed sets, one for each type, accounting for all 40 cards [P4]. The distribution across upper/tableau positions is irrelevant. Do not require all four upper cells to contain sets or copy the particular P4 example. A complete four-card run still resting on another type is not yet a completed objective. Emit a win once after the whole command/normalization transaction; increment a persistent win counter once per deal ID [D].

```text
evaluateWin():
  sealed = all Sealed entries across tableau and upper
  if count(sealed)==10 and set(sealed.type)=={1..10}:
    require no active cards and no Single upper cells
    status = WON
```

**Deadlock:** generate legal source homogeneous suffixes and destination predicates, including full-four transfers to upper cells; apply stabilization to candidate results. Zero legal nontrivial actions and not won means immediate stalemate. Legal reversible shuffling can remain in unsolvable states; neither a nonempty move list nor an empty free-cell row establishes solvability. A complete solver needs visited states; canonicalize identical-copy permutations if desired without merging `Unavailable` and `Sealed` cell states. Default no forced-loss popup; allow abandonment/new game [D].

**Undo:** default disabled for original-like play (S3); not a card rule. If offering an optional practice mode, undo the entire transaction including source/destination seals and any unlocked upper cell, not merely card placement. New deal creates a new initial permutation; replay restores the saved one and difficulty/policy version. Changing difficulty starts a new deal by default, rather than reopening cells mid-game [D].

## 6. Edge cases and unresolved fidelity details

- Four matching cards atop unrelated cards are not a seal. A standalone matching four is automatically a seal, not a selectable group.
- If removing a top card leaves `[A,A,A,A]`, normalize the source immediately. If removing a group leaves an empty source, that source stays active/empty and does not unlock anything.
- “Unlock a free cell if one is available” means one still-unavailable **upper** position; it does not mean an empty upper cell, an occupied singleton, or a previously sealed stack.
- Easy already has all four cells open, but tableau sealing still blocks that lower slot and counts toward victory.
- Two/three identical cards can move together onto matching tableau or empty tableau, but not into an upper cell under the default policy.
- One card may transfer between empty/occupied upper-cell sources and a different empty upper destination as a harmless legal rearrangement [D; S2]. Do not mistake this loop for strategic progress.
- Reject a seal with duplicate IDs or missing copies; a single “locked marker” must retain the full consumed inventory in saved state.
- Exact original shuffle/filter, difficulty-selection progression, Normal versus Medium display naming, initial left/right positioning, upper occupied-cell 3+1 behavior, and automatic scan timing require direct original-game verification for strict parity. All are explicitly resolved by defaults here; none alters the unambiguous primary matching/collapse objective.
- Artwork reproduction/licensing is separate from these rules; use original or licensed art rather than copying a fan repository's ripped assets.

## 7. Concrete acceptance tests

Notation: `A,B,C` are different card types, repeated letters mean **distinct copies**. Piles in brackets are base→exposed. Fixtures are partial views of otherwise inventory-valid 40-card states. Tests execute placement plus mandatory normalization. `U=Unavailable`, `E=Empty`, `S(A)=Single(A)`, `X(A)=Sealed(A×4)`.

| ID | Given / action | Expected |
|---|---|---|
| K01 | Fresh deal at each difficulty | Eight active columns × five face-up cards; 40 IDs/four per type; upper open counts Easy=4, Normal=3, Hard=2, Expert=1, with the rest U. No stock/waste. |
| K02 | `T0=[B,A,A]`, `T1=[C,A]`; move A×2 from T0 to T1 | Legal; T0=`[B]`, T1=`[C,A,A,A]`; not sealed because C beneath the run. |
| K03 | `T0=[B,A,A]`; try moving `[B,A,A]` | Illegal heterogeneous payload. Moving suffix `[A,A]` is legal to empty tableau. |
| K04 | `T0=[B,A,A,A]`; move only exposed A onto matching target | Legal; T0 retains `[B,A,A]`. Matching runs may be split. |
| K05 | Exposed A onto exposed B | Illegal even if artwork colors or numeric labels would form a sequence. |
| K06 | Active empty T1; move `[A,A,A]` there from `[B,A,A,A]` | Legal; T1 remains active with three cards. No upper-cell capacity multiplier. |
| K07 | `T0=[B,A,A,A,A]` after a join | Remains active; four A cards can still move together. No unlock yet. |
| K08 | Move A×4 from `[B,A,A,A,A]` to empty active T1; Expert upper `[E,U,U,U]` | T1 becomes X(A), T0=`[B]`, upper becomes `[E,E,U,U]`; exactly one new upper cell opens. |
| K09 | Try moving one A or the entire A×4 from sealed T1 in K08 | Both illegal; also cannot place any card onto sealed T1. |
| K10 | `T0=[A,A,A,A,B]`; move exposed B to a legal target | Source becomes X(A) immediately; one U opens if present. Ensures normalization checks source, not only destination. |
| K11 | `T0=[B,A,A,A,A]`, upper destination E; move A×4 upward | Upper becomes X(A), T0=`[B]`; no unavailable upper cell is unlocked. |
| K12 | Upper destination E; try moving A×2 or A×3 into it | Both illegal; moving one A is legal and creates S(A). |
| K13 | Upper destination S(A); move matching A×3 to it | Illegal under `EMPTY_ONLY_ONE_OR_FOUR`; original occupied-cell completion is an explicitly unresolved fidelity point. State unchanged. |
| K14 | Upper destination U or X(B); try placing single A | Illegal in both cases; U is not a card-bearing sealed set, and X(B) is not unlockable. |
| K15 | Upper S(A); move its single A to `[B,A,A]` | Legal; upper becomes E, target `[B,A,A,A]`; no seal because B remains underneath. |
| K16 | Easy upper has no U; complete standalone A×4 on tableau | Tableau seals normally; no upper cell replaced/cleared/created and no reward banked. |
| K17 | Hard upper `[S(B),X(C),U,U]`; newly seal A on tableau | First U becomes E; singleton B and sealed C remain untouched. Only one of the two U opens. |
| K18 | Reload a saved state with one tableau seal and two U | No new upper unlock just because a sealed slot was read/rendered; reward was already applied once. |
| K19 | Ten seals containing all ten types, distributed six tableau/four upper | WON. Equivalent seven tableau/three upper is also WON if all ten types sealed and no active cards remain. |
| K20 | Eight seals for the other types, active `T0=[B,B,B,B,A,A,A,A]` | Inventory-valid 40-card state, not won: neither A nor B is sealed. Move A×4 to empty upper cell: upper seals A, source automatically seals B, then WON. |
| K21 | Completed nine types, last active type distributed among four exposed singletons | Not won until legal joins and final collapse yield the tenth seal. |
| K22 | Same-source/destination move or rejected type mismatch | No card changes, no unlock, no history entry, no win-counter change. |
| K23 | Full A×4 moved upward from `[B,A,A,A,A]`, leaving B×1 | Source stays active, not sealed; upper seals; no unlocking. Contrast source `[B,B,B,B,A,A,A,A]` in a valid fixture: moving A×4 upward also exposes standalone B×4, which seals and **does** unlock one cell. |
| K24 | A completed stack is rendered as one marker and then saved/reloaded | Still accounts for four original IDs; cannot reveal, move, or reuse that slot. |

These are specification acceptance cases, not a claim that a game engine or automated test suite has been implemented/executed as part of this research document.
