# Cluj Solitaire — implementation rules

## Evidence and fidelity

The official rule images were opened and visually read. **Cluj is `vegas`, not `lightning`**: its logo explicitly says Cluj Solitaire; `lightning` contains Sigmar's Garden marble rules.[14][2] The authoritative movement rules are the four `vegas_*.png` panels.[10][11][12][13] Two independent community solvers supplement setup, empty columns, and the precise collapse trigger.[16][19] These are not Zachtronics source code. Sections marked **Default** make a playable specification where official documentation is silent; they are not claims of exact commercial-game behavior.

## 1. Inventory and setup

- A 36-card Russian-style deck: one of each `(suit, rank)` with four suits and ranks `6,7,8,9,10,V,D,K,T`. `V` is Jack, `D` Queen, `K` King, `T` Ace. Ace is highest, never low. Exact descending chain: `T,K,D,V,10,9,8,7,6`.[10][16]
- Suits and colors do **not** constrain movement: normal builds compare only ranks. Preserve suits and physical card IDs for rendering and conservation.[10][19]
- Six tableau columns, six cards each, all visible/face-up, with the lowest displayed card exposed for play. All 36 cards are dealt; there is no stock, waste, foundation region, or free cell in the described game.[16][19]
- **Default dealer:** generate all 36 unique cards, use seeded Fisher–Yates, distribute round-robin into six columns, six rounds. Store initial order plus RNG algorithm/version. The sources establish the 6×6 layout, **not** Zachtronics' RNG, shuffle, distribution order, or solvability filtering. Do not claim seed compatibility or guaranteed solvability.
- Normalize complete columns after setup (default lifecycle choice); initial random rank adjacencies are ordinary dealt relationships, not cheats.

## 2. Orientation and state model

Use arrays in **board-nearest to exposed order**, e.g. `[T,K,D]` has `D` exposed. A selected stack is a nonempty suffix. Never use screen-position words like “top” without this convention.

```text
Card { id, suit, rank }
Column { cards: Card[], locked: bool, cheatedExposedId: id|null }
Game { columns[6], phase: PLAYING|WON, cheatMovesUsed, moveCount,
       initialDeal, rulesVersion, undoHistory? }
rankIndex: 6=0,7=1,8=2,9=3,10=4,V=5,D=6,K=7,T=8
```

`cheatedExposedId` records an **action-created restriction**, not every nonconsecutive adjacency. Initial unsorted columns contain many nonconsecutive pairs without markers. A marker can exist only on the exposed card of an unlocked column. Locked columns retain their nine IDs (even if rendered as a single back), have no marker, and remain occupied. This representation preserves conservation and makes invalid saves rejectable.

## 3. Normal moves

Cards build down by exactly one rank; a consecutive descending suffix can move as one stack. Neither suit nor color matters.[10] Empty unlocked columns accept any single card or descending suffix in the community engine; they are not restricted to T.[19] The other solver enumerates T-to-empty moves preferentially as a search reduction, not reliable evidence that other ranks cannot use an empty column.[16]

A normal move from column `s`, starting at suffix index `k`, to column `d` is legal iff:

1. `s != d`, both exist, neither is locked, and `k` is in range.
2. The suffix is consecutive descending internally, or is a single card.
3. If source has a cheat marker, only its exposed single card may move.
4. Destination has no cheat marker.
5. Destination is empty, or `rankIndex(destination.exposed) == rankIndex(suffix.first)+1`.

The marker prohibitions follow the official requirement that invalid-position cards move only to valid positions and that nothing be stacked on them.[13] Normal movement of a cheated card **clears its marker**; moving to an empty column is a valid recovery according to the community engine.[19]

Examples: `D` onto `K` is legal; `V,10,9` onto `D` is legal; `9` onto `9` is not normal; `K` onto `D` is not normal; `T` cannot build onto any occupied column. A valid run may be split: the exposed `9` may move separately from `[V,10,9]`.

## 4. Cheating: exact restriction and recovery

The official rule permits **single cards** to be moved to invalid positions.[12] An invalid-position card can subsequently move **only to a valid position**, and **no further cards may be stacked on it**, even a card that would fit its rank.[13]

Implement a cheat move iff:

- Source and destination are distinct, unlocked columns.
- Source selection is exactly its exposed single card.
- Source card is not already cheated.
- Destination is nonempty and unmarked.
- The placement fails the normal rank test.

Transition: remove the source card; append it to destination; mark that particular card as cheated; increment cheat count. There is no global “one cheat at a time”: multiple columns may each have one cheated exposed card. No column can receive a second cheat while its first remains.[13][19]

Cheating is **not gated on having no normal moves**. A community README introduces cheating with “If there aren't any legal moves available,” but the official rule states no such condition, and the second engine enumerates cheats alongside normal moves. Treat the README wording as strategy/context, not an extra legality requirement.[12][16][19]

Concrete sequence: exposed `9` moves illegally onto `6` and becomes marked. `8` cannot be played onto that marked `9`. The marked `9` cannot be moved illegally onto `D`; it can move normally onto exposed `10` or into an empty column, at which point it becomes unmarked and can receive `8`. Unrelated normal or cheat moves remain available meanwhile.

Do not infer “any card anywhere”: multi-card cheating, re-cheating marked cards, covering a marker, and playing on locked columns are forbidden.

## 5. Automatic completion, goal, and stuck states

Goal: four complete descending nine-card stacks; completion automatically collapses stacks.[11] Supplementary engines clarify the important condition: a full `T…6` run collapses **only when it is the entire column, directly on the board**. A full suffix resting on unrelated cards stays movable and does not collapse until transferred onto an empty column.[16][19]

After each accepted move, check **both** changed columns. For an unlocked, unmarked column whose full rank list is exactly `T,K,D,V,10,9,8,7,6`, set `locked=true`; retain cards and slot. Completing in place by adding the final `6` also triggers collapse.[19] Checking the source matters when moving a temporary cheat card reveals a previously covered complete run (derived lifecycle consequence, not separately illustrated by the official panels).

- Win iff four columns are locked and the other two are empty, with exactly all 36 IDs accounted for. No current cheat marker may remain.
- Collapse is mandatory, not a user-selected foundation move. A locked column cannot be moved from, built on, or reused as an empty slot.[16][19]
- No move limit, timer, or score threshold is stated by the official rules. Do not invent one.[10][11][12][13]
- **Default:** classify `STUCK` diagnostically when not won and no legal normal **or cheat** moves exist; allow restart/undo if offered. A state with legal reversible moves can still be unsolvable; “no progress found” is not proof of loss. Keep solver budgets distinct from rules.

## 6. Reference transition pseudocode

```text
normalFits(dst, first):
    return dst.cards.empty or rank(dst.last) == rank(first)+1

validate(s, k, d, kind):
    require phase == PLAYING and s != d
    require !s.locked and !d.locked and 0 <= k < len(s.cards)
    run = s.cards[k:]
    require d.cheatedExposedId == null
    if kind == CHEAT:
        require len(run) == 1 and s.cheatedExposedId == null
        require !d.cards.empty and !normalFits(d,run.first)
    else:
        require consecutiveDescending(run)
        if s.cheatedExposedId != null: require len(run) == 1
        require normalFits(d,run.first)
    return run

apply(s,k,d,kind):
    run = validate(s,k,d,kind)     // validate everything before mutation
    snapshot = state.clone()    // optional undo, includes markers and locks
    s.cards = s.cards[:k]
    d.cards.extend(run)
    s.cheatedExposedId = null   // if marked, validation forced single exposure
    d.cheatedExposedId = run.first.id if kind == CHEAT else null
    if kind == CHEAT: cheatMovesUsed += 1
    moveCount += 1
    for col in [s,d]:
        if !col.locked and col.cheatedExposedId == null:
            if ranks(col.cards) == [T,K,D,V,10,9,8,7,6]:
                col.locked = true
    assertInventoryAndMarkerInvariants()
    phase = WON if fourLockedAndTwoEmpty() else PLAYING
```

Reject invalid input atomically; never silently convert an explicitly requested normal move to cheat unless the UI clearly previews that action. UI recommendation: show a persistent contrasting cheat marker and an explanatory invalid-drop reason. Renderers may invert the card as the official illustration does, but must not encode the restriction only in color.[12][13]

## 7. Acceptance tests

These are specification cases, not a claim that an implementation was executed. Use unique physical IDs and fill irrelevant columns with legal fixture inventory when exercising whole-game assertions. `!9` means the exposed 9 is marked; `LOCK` is a retained occupied completed column.

| ID | Given/action | Required result |
|---|---|---|
| C01 | New deal | Six columns of six; 36 distinct IDs; zero markers; all face-up. |
| C02 | `D` onto `K`, different suits | Normal accepted. |
| C03 | `V,10,9` onto `D` | Accepted in original order as a suffix. |
| C04 | Select `10,8` together | Rejected; gap invalidates group movement. |
| C05 | Exposed `9` onto `9`, normal request | Rejected atomically. |
| C06 | Same placement as cheat | Accepted; destination exposed 9 marked. |
| C07 | Another normal move exists, perform C06 | Cheat still accepted. |
| C08 | Cheat `[9,8]` onto `6` | Rejected: exactly one card required. |
| C09 | Marked `!9` onto `D` | Rejected even with cheat request. |
| C10 | `8` onto marked `!9` | Rejected even though ranks fit. |
| C11 | Marked `!9` onto unmarked `10` | Accepted; marker removed; later `8` can build. |
| C12 | Marked `!9` into empty unlocked column | Accepted; marker removed. |
| C13 | Cheat separately onto two different unmarked columns | Both markers coexist; no global cheat cap. |
| C14 | Move ordinary exposed `8` to empty column | Accepted; no T-only restriction. |
| C15 | `[T,K,D,V,10,9,8,7]` on board; append `6` | Entire column locks immediately. |
| C16 | `[8,T,K,D,V,10,9,8,7,6]` exists | No collapse; full run is not directly on board. |
| C17 | Move C16's suffix `T…6` onto empty column | Destination locks; source retains its leading 8. |
| C18 | Attempt any move onto or out of LOCK | Rejected; slot stays occupied. |
| C19 | Move temporary marked cover off a board-rooted complete run | Source normalization locks the revealed run. |
| C20 | Four LOCKs, two empty columns | Win; no additional foundation action needed. |
| C21 | Undo a cheating move (if enabled) | Restore exact prior IDs, marker flags, locks, and counters. |
| C22 | Same-column drop | Reject/no-op without counter increment or inventory change. |

## 8. Remaining fidelity questions and explicit defaults

1. Exact commercial shuffle, seed mapping, and rejection/filtering are unknown; use the documented seeded uniform dealer, not invented official behavior.
2. Original MOLEK-SYNTEZ and collection may differ in undo/restart UI. Default unlimited undo as an optional accessibility feature, outside the core rules; save the feature flag. Do not advertise this as verified historical behavior.
3. Initial normalization and normalization after uncovering a full run are specified here for consistency; official panels do not separately describe those lifecycle instants.
4. No sourced column-height cap. Do not copy `MAX_STACK_SIZE=15` from the bot as a rule: it is an implementation constant, not official evidence. Permit any inventory-bounded height.[19]
5. No actual commercial game was run for this document. Movement panels are primary evidence; 6×6 dealing and board-rooted collapse are corroborated secondary evidence.

## Sources

[2] https://zachtronics.com/solitaire-rules/images/lightning_0.png
[10] https://zachtronics.com/solitaire-rules/images/vegas_0.png
[11] https://zachtronics.com/solitaire-rules/images/vegas_1.png
[12] https://zachtronics.com/solitaire-rules/images/vegas_2.png
[13] https://zachtronics.com/solitaire-rules/images/vegas_3.png
[14] https://zachtronics.com/solitaire-rules/images/vegas_logo.png
[16] https://github.com/Starwort/NEA
[19] https://raw.githubusercontent.com/Hegemege/molek-syntez-solitaire-bot/master/game_state.py
