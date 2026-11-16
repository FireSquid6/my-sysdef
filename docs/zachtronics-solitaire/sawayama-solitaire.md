# Sawayama Solitaire — implementation-ready rules specification

## 1. Scope and evidence contract

Target: Zachtronics' Sawayama Solitaire as presented in **The Zachtronics Solitaire Collection**, not an arbitrary Klondike variant or a fan clone's extensions. The official rules are image panels, not the mostly empty extracted HTML. All five `hikone` panels and the `hikone_logo.png` title were visually inspected; the title explicitly identifies **SAWAYAMA Solitaire**.

Evidence labels used below:
- **[P] Primary:** directly stated or visibly demonstrated by the official rules panels.
- **[S] Secondary:** independently implemented/described behavior, not proof of original source code.
- **[D] Design default:** an explicit implementation decision where the available material does not determine the exact original behavior. These defaults make the specification executable without disguising uncertainty.

### Sources

- **P0:** [Official collection rules index](https://zachtronics.com/solitaire-rules/), [Sawayama title](https://zachtronics.com/solitaire-rules/images/hikone_logo.png).
- **P1:** [hikone_0.png](https://zachtronics.com/solitaire-rules/images/hikone_0.png): “Stack cards by alternating colors and decreasing values.” Diagram: black 4, red 3, black 2 moving as a run onto a red 5.
- **P2:** [hikone_1.png](https://zachtronics.com/solitaire-rules/images/hikone_1.png): “Any card or stack can be moved into an empty column.” Diagram shows J–10–9 moving into a vacant column.
- **P3:** [hikone_2.png](https://zachtronics.com/solitaire-rules/images/hikone_2.png): clicking the deck deals additional cards “three at a time.”
- **P4:** [hikone_3.png](https://zachtronics.com/solitaire-rules/images/hikone_3.png): “When the deck is empty it can be used to store a single card.”
- **P5:** [hikone_4.png](https://zachtronics.com/solitaire-rules/images/hikone_4.png): win by stacking all cards on the left “by suit from ace to king.”
- **S1:** Blake Watson's [Sawayama rules](https://www.watsonbrosgames.com/solitaire/): face-up tableau; only exposed cards/ordered sequences move; one stock pass, no reset; foundation cards cannot return. This is a fan implementation and includes noncanonical conveniences such as undo.
- **S2:** Watson's [Game.ts](https://github.com/blakewatson/sawayama-solitaire/blob/main/ts/Game.ts), inspected through its [raw file](https://raw.githubusercontent.com/blakewatson/sawayama-solitaire/main/ts/Game.ts): full rank/suit product, seven columns, triangular 28-card deal, draw-three append to persistent waste, top-only waste selection. Used only as secondary corroboration of setup and ordering; its early win shortcut and undo are **not** adopted.
- **S3:** [Last Call BBS player discussion](https://steamcommunity.com/app/1511780/discussions/0/3418811628262547526/), especially comments 2–3: single pass/no undo, automatic foundation movement, manual double-click to force a card up. These are player observations.
- **S4:** [Collection player discussion about automatic foundations](https://steamcommunity.com/app/1988540/discussions/0/596266633501137409/?l=english): black 3 is retained while a red 2 remains in play; Aces automatically advance. The exact algorithm is not disclosed.
- **P6:** [Official developer patch note, “UPDATE: Assorted bug fixes”](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4606641560256822406), retrieved in full through the [Steam news API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1988540&count=100&maxlength=0), announcement GID `4606641560256822406`: “[Sawayama Solitaire] Made the auto-mover more conservative, so that it never causes you to lose a game.” This establishes developer intent, not a disclosed formula or an independently proved guarantee for the policy below.

## 2. Deck, geometry, and exact initial state

### Inventory and visibility

Use a standard **52-card deck**: one card of every `(suit, rank)` in `{clubs, diamonds, hearts, spades} × {1..13}`. Ace=1, Jack=11, Queen=12, King=13; hearts/diamonds red, clubs/spades black. No jokers, wildcards, duplicate cards, wrapping, or suit ordering in tableau. Full inventory/setup is secondary-corroborated [S1,S2]; four suits/Ace–King is primary [P5].

- Seven tableau columns, left-to-right lengths **1,2,3,4,5,6,7**, totaling 28 cards. Every tableau card is face up, including obstructed cards; identity visibility does not imply move accessibility. [S1,S2]
- Remaining **24 cards** form one face-down stock. Player cannot inspect their identities/order before drawing. [S2; D privacy boundary]
- One face-up waste to the right of the stock; initially empty. Older waste cards persist underneath newer cards; only the most recently drawn, still-present card is playable. [S2]
- Four empty foundations, one per suit, displayed down the left side. [P5]
- The stock's physical position is **not** a usable free cell initially. It becomes one empty single-card cell immediately after the last stock draw, even when waste remains. [P4]
- No hidden tableau cards, flip action, second stock, initial reserve card, or initial foundation cards.

### Reproducible deal contract [D]

Persist the shuffled 52-ID permutation and ruleset version. Define `drawNext()` as consuming the front of that permutation. Deal triangular rows: for `row=0..6`, for `column=row..6`, append `drawNext()` to that column. The 24 undealt cards retain draw order. This reproduces the familiar 1–7 layout; exact original PRNG, seed translation, shuffle filtering, and physical dealing order are not established. Default `dealPolicy=uniformShuffle`, `openingFilter=none`; do **not** claim all resulting games are winnable. Replay restores the stored permutation, not a reconstructed seed in an unspecified PRNG.

Deal is atomic; run stabilization after the whole deal, not while cards are still arriving. An exposed initial Ace can auto-advance in this default. Reports that the original generator filters Ace positions [S3] do not define a reproducible filter.

## 3. Data model and invariants

All pile arrays run **base → exposed end**; `last()` is the playable/frontmost card. A selected tableau suffix retains that order when moved.

```text
Card = {id, suit, rank}                  # unique id = suit + rank
State = {
  tableau: Card[7][],
  stock: deque<Card>,                    # front = next draw
  waste: Card[],                         # last = newest accessible card
  cell: Card | null,
  foundationHeight: map<Suit, 0..13>,
  initialPermutation: CardId[52],
  status: PLAYING | WON,
  rules: {autoPolicy, foundationAccess, allowUndo, ...}
}
cellAvailable(state) := stock.length == 0
```

Foundation height `h` represents exactly that suit's ranks 1 through h, not arbitrary cards. Every card appears in exactly one location, counting implicit foundation contents; total inventory is always 52. `cell != null` implies empty stock. Waste never receives player placements. Tableau can contain arbitrary adjacency from the initial deal; only newly formed joins and moved suffixes must be ordered. Do not globally require every column to be sequential.

## 4. Legal actions and transitions

### Shared predicates

```text
joinOK(lower, upper):
  return lower.rank == upper.rank + 1
         and color(lower) != color(upper)
# lower = existing destination top; upper = first/base card of moving run

ordered(run):
  return len(run) >= 1
         and every(joinOK(run[i], run[i+1]) for i=0..len(run)-2)

sourcePayload(src, start):
  if src is tableau[i]:
    require 0 <= start < len(tableau[i])
    run = tableau[i][start:]
    require ordered(run)
    return run
  if src is waste:
    require start == len(waste)-1 and len(waste)>0
    return [waste.last]
  if src is cell:
    require cellAvailable and cell != null
    return [cell]
  reject                           # stock/foundations never sources
```

**Sequence mobility:** Any ordered exposed suffix may move, not just the entire maximal sequence. A visible interior card cannot move alone leaving its covering cards behind. Run length has **no free-cell/supermove limit**: the run is a primitive action [P1,P2; S1]. Empty tableau columns accept any rank or valid run, not only Kings [P2]. Aces cannot support anything; no King-to-Ace wrap.

### MOVE_TO_TABLEAU(src, start, j)

```text
require status == PLAYING and src != tableau[j]
run = sourcePayload(src,start)
require tableau[j].empty or joinOK(tableau[j].last, run.first)
atomically detach run from src; append run to tableau[j]
stabilize(); validateInventory(); evaluateWin()
```

No stacking onto an interior card in a destination column. The old destination may contain disordered cards further back; this does not invalidate a legal exposed join. Reject invalid moves without mutation.

### STORE_IN_CELL(src, start)

```text
require status == PLAYING and cellAvailable and cell == null and src != cell
run = sourcePayload(src,start)
require len(run) == 1
atomically detach run; cell = run[0]
stabilize(); validateInventory(); evaluateWin()
```

No run may be stored, even if it is internally ordered. Taking the cell card to tableau or foundation makes the cell reusable; it never turns back into stock [P4,S1].

### DRAW_STOCK

```text
require status == PLAYING and len(stock) > 0
n = min(3,len(stock))
repeat n times:
  waste.append(stock.popFront())
# The third drawn card is the accessible one. No inter-card user action.
stabilize(); validateInventory(); evaluateWin()
```

This is a **single pass with no recycle** [S1,S3]. Drawing is allowed even if legal tableau/waste moves exist and even if waste is nonempty. Each new batch covers the previous waste top; old cards are not discarded. Removing all newer cards eventually exposes an older batch. `DRAW_STOCK` with empty stock is illegal, not a reset. The normal 24-card stock draws in eight complete batches; `min(3,n)` is a robustness default for imported/test states, not a separate draw-one mode. [P3; D atomicity and short draw]

### SEND_TO_FOUNDATION(src)

```text
require status == PLAYING
require src is nonempty tableau, waste, or available occupied cell
c = exposed card at src             # last, NEVER an arbitrary interior card
require c.rank == foundationHeight[c.suit] + 1
atomically remove c from src; foundationHeight[c.suit] += 1
stabilize(); validateInventory(); evaluateWin()
```

Send exactly **one exposed card**; no whole-run foundation transfer and no skipping a rank. Foundation retrieval/extraction **back out** is forbidden [S1]. Thus the action is irreversible with `allowUndo=false`. Foundation transfer does not depend on alternating colors.

**Access/UI default:** `foundationAccess=manualAndAuto`, with double-click and an explicit accessible “send to foundation” command mapped to this transition [S3]. Allowing drag onto a foundation can map to the same command, but is optional UI, not an extra rule. Exposed-only **extraction from tableau/waste into foundations** follows S1/S2; the official panels do not explicitly spell out extraction mechanics. Default `foundationSourcePolicy=exposedOnly`; do not auto-pull buried waste cards, obstructed Aces, or undrawn stock cards just because their identities are known to the engine.

## 5. Automatic actions, winning, and deadlocks

Official panels specify the objective, but not a complete auto-mover. Automatic transfer is player-observed [S3,S4]. Use this explicit **conservative configurable default**, not an assertion of recovered proprietary code:

```text
safeForAuto(c):
  require c is exposed and foundation-legal
  if c.rank == 1: return true
  return every(foundationHeight[s] >= c.rank-1
               for s in suits with color(s) != color(c))

stabilize():
  if autoPolicy == OFF: return
  while exists exposed foundation-legal card c with safeForAuto(c):
    choose first in deterministic scan order:
      tableau[0..6], waste, cell
    transfer c to its suit foundation (without recursive stabilize)
```

Policy name: `OPPOSITE_COLORS_CLEARED`. A black 3 remains while either red 2 is outside foundations, even if that 2 is currently inaccessible in stock. A 2 waits for both opposite-color Aces; Aces are always eligible when exposed. A human may force a foundation-legal card before it satisfies this safety threshold. Recheck newly exposed cards until fixed point. Never draw stock, rearrange tableau, store in the cell, or remove a card from a foundation automatically. Disable user input during atomic transition plus stabilization, then render animations from the event list. [D]

**Win:** after stabilization, all four foundation heights equal 13 (all 52 cards accounted for there) [P5]. Do not merely declare win when stock empties or tableau is ordered. Optional finish animation may execute the remaining legal foundation transfers, but cannot invent illegal ones or declare win prematurely.

**Deadlock:** generate all legal tableau/cell/foundation commands and stock draw. If none exist and not won, report optional `NO_LEGAL_ACTIONS`; do not destroy/reset the game. Reversible rearrangement loops mean “some move exists” does not imply solvability. A solver can label proven unsolvable only after exhaustive search with visited-state detection; stock emptiness alone is not loss. Default no forced loss popup, hints optional [D].

**Undo/restart:** default `allowUndo=false` for original-like play [S3]. New deal and replay are meta-actions, not stock recycling. A development-only undo should restore the complete pre-command snapshot including **all** automatic transfers and stock/cell state. They must not be exposed as legal in-game foundation retrieval.

## 6. Edge cases and unresolved fidelity points

1. Colors, not suits, govern tableau joins: clubs onto spades is illegal even when ranks fit.
2. All tableau faces visible does not permit arbitrary card extraction.
3. A run's first/base card determines destination fit; its last card determines neither the join nor permission to omit cards.
4. Preserve persistent waste ordering; never make all three recently drawn cards independently selectable.
5. The reserve unlocks on stock exhaustion, not waste exhaustion; moving a waste card into it is then legal.
6. Auto-foundation safety formula, scan ordering, opening deal filtering, original PRNG, exact click/drag behavior, and no-moves UI are not fully specified by primary panels. The named defaults above settle them for this implementation. Validate against the installed original before claiming pixel/mechanics-perfect parity.
7. Manual forcing may remove useful support. Do not silently reject an otherwise foundation-legal move because it fails **auto** safety.
8. No timed loss, score requirement, or difficulty-dependent deck change is evidenced. Default untimed, unscored play with a win counter outside the core state.

## 7. Concrete acceptance tests

Notation: piles in brackets are base→exposed; `F(s)=h` is foundation height. Tests isolating manual legality use `autoPolicy=OFF` unless stated. Local fixtures must be embedded in a full inventory-valid state, placing irrelevant cards in untouched locations; no duplicate identities.

| ID | Given / action | Expected |
|---|---|---|
| S01 | Fresh setup before stabilization | Column lengths 1–7, 28 visible tableau cards, 24 hidden stock cards, empty waste/cell/foundations; reserve unavailable. |
| S02 | Source `[4♣,3♥,2♠]`, destination `[5♦]`; move all three | Legal; destination becomes `[5♦,4♣,3♥,2♠]`, source empty. |
| S03 | Source `[4♣,3♠]`; try moving both to empty column | Illegal because selected run is same-color; no mutation. Moving exposed `3♠` alone is legal. |
| S04 | Source `[8♣,7♥,6♠]`; move suffix `[7♥,6♠]` onto `8♠` | Legal; source retains `8♣`; tests partial run splitting. |
| S05 | Exposed `7♥` onto `8♦` | Illegal, same color; onto `8♣` legal. |
| S06 | Ordered run beginning `Q♣` to empty column | Legal despite not beginning with King; no reserve-capacity check. |
| S07 | Stock draw order begins `K♠,4♦,J♣`; draw | Waste ends `[K♠,4♦,J♣]`; only `J♣` playable. `4♦` cannot move or be foundation-extracted first. |
| S08 | Waste `[K♠,4♦,J♣]`, new draw `9♥,6♣,2♦` | Waste becomes all six in that order; removing newest three exposes `J♣` again. No cards discarded. |
| S09 | Stock has exactly three cards, nonempty waste; draw | Stock empties; reserve becomes usable immediately although waste still contains cards. |
| S10 | Empty stock, nonempty waste; request draw | Illegal; no recycle and waste ordering unchanged. |
| S11 | Reserve unavailable; try storing a single exposed `9♣` | Illegal. After stock exhaustion, same move legal if reserve empty. |
| S12 | Available empty reserve; try storing `[4♣,3♥]` | Illegal; storing exposed `3♥` alone legal. A second card into occupied reserve illegal. |
| S13 | `F(♠)=1`, exposed `2♠`; send to foundation | Legal; `F(♠)=2`. Exposed `3♠` when `F(♠)=1` is illegal. Wrong-suit foundation target is illegal. |
| S14 | `F(♠)=2`; attempt to take `2♠` back | Illegal regardless of empty columns/reserve. |
| S15 | Tableau `[A♠,9♥]`; try sending Ace up | Illegal, Ace obstructed; exposing Ace first makes it legal. Same exposed-only rule applies to waste. |
| S16 | Auto enabled, exposed `A♣`, `F(♣)=0` | Ace automatically advances; no user click needed. |
| S17 | Auto enabled, exposed `3♣`, `F(♣)=2`, `F(♥)=1`, `F(♦)=2` | No auto move because red `2♥` remains; explicit foundation send legal. Once both red heights ≥2, auto move occurs. |
| S18 | Stock exhausted; take sole reserve card to legal tableau target | Reserve becomes empty and immediately reusable, never stock again. |
| S19 | All foundations at 13 after final legal send | WON exactly once; all other locations empty. One incomplete foundation means not won. |
| S20 | Imported fixture with two stock cards; draw | Both append in draw order, second accessible, reserve unlocks; no underflow. This is robustness behavior [D]. |
| S21 | Auto chain exposes another safe foundation card | Stabilization repeats to fixed point, preserves 52-card identity inventory, then evaluates win. |
| S22 | Rejected wrong-color move or same-pile move | State, history, win count, stock, and foundation heights unchanged. |

These are specification acceptance cases, not a claim that a game engine or automated test suite has been implemented/executed as part of this research document.
