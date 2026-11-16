# Proletariat's Patience — implementation rules

## Evidence and fidelity

The official logo confirms the `burbank` asset family is Proletariat's Patience.[15] All four official panels were opened and visually read, including the face-card locking diagram and the one-card free cell.[6][7][8][9] A community engine for the original EXAPUNKS minigame supplies a 36-card inventory and nine-column, four-card deal.[18] The official panels establish the same two card classes and movement mechanics, but do not independently spell out the deal algorithm. Secondary-source setup is identified below; recommended defaults are not claimed to reproduce Zachtronics' RNG or every original-version UI detail.

## 1. Inventory: two asymmetric classes

Use a 36-card Russian-style deck, four suits, nine cards per suit. For each suit there are five **number/worker** cards `6,7,8,9,10` and four **face/royalty** cards, conventionally `V,D,K,T` (Jack, Queen, King, Ace). This yields 20 workers and 16 royalty. Crucially, **T/Ace belongs to the four-card royalty set, not a number foundation**. The community engine deliberately models each suit's royalty as four equivalent symbols; the official face-card panel depicts four distinct face designs in a same-suit completed stack.[7][18]

Standard suit/color mapping, as shown in the official illustrations: hearts and diamonds red; spades and clubs black.[6][7] Preserve all four suits for artwork and inventory. Worker movement depends only on **color and numeric rank**, while royalty movement depends only on **suit**, never relative royal rank.[6][7]

| Class | Quantity | What controls building | Complete standalone column |
|---|---|---|---|
| Workers | One 6–10 in each of four suits | Descending by exactly one; alternating red/black | Five cards `10,9,8,7,6`, alternating colors |
| Royalty | Four distinct face identities per suit | Same suit, any order | All four royalty of one suit; automatically locks |

The inventory and nine-column layout are corroborated by `Game.face_cards`, `number_cards`, `card_stacks=9`, and `deal_cards()` in the EXAPUNKS solver, **not** an official published shuffle specification.[18]

## 2. Setup and board geometry

- Nine interchangeable tableau columns, each initially four face-up cards; one initially empty free cell in the upper-right. No stock or waste, and no separate ascending foundations. The nine-by-four deal is secondary-source evidence; the one-card free cell is explicitly official.[9][18]
- All 36 cards are available in the tableau from the start. Initial arbitrary mixed sequences are allowed; dealing is not constrained to produce legal builds.[18]
- The **asymmetry is in the card classes, not preassigned worker and royalty columns**. Any empty unlocked tableau column can receive either kind of card or a valid run. A locked royalty column subsequently becomes permanently unavailable.[7][18]
- **Default dealer:** shuffle the 36 distinct card IDs with seeded Fisher–Yates, then distribute four cards per column in column-major order. This matches the secondary engine's slice layout but does not establish the original game's shuffle order, seed mapping, or solvability filtering.[18] Keep dealer pluggable and record algorithm/version in saves.
- **Default lifecycle:** normalize any standalone four-royalty set after dealing. No hidden cards to flip; a face-down locked set is a completion token, not an unrevealed deal card.

Do not mistake the official victory illustration's eight finished groups for an eight-column initial board: the goal consumes eight columns and can leave one tableau column empty.[8][18]

## 3. State, orientation, and invariants

Arrays list cards from **board-nearest to exposed**, e.g. `[10♠,9♥,8♣]` exposes `8♣`. A movable selection must be a suffix; covered cards cannot leave while cards beyond them remain.

```text
Card { id, suit: HEARTS|DIAMONDS|SPADES|CLUBS,
       kind: WORKER|ROYALTY, rank: 6..10|V|D|K|T }
Column { cards: Card[], locked: bool }
Game { columns[9], freeCell: Card|null, phase: PLAYING|WON,
       initialDeal, moveCount, rulesVersion, undoHistory? }
```

Invariant: every one of the 36 physical IDs appears exactly once across tableau and free cell; locked columns retain their four card IDs and suit. Worker suits must not be discarded merely because their colors determine compatibility. A locked column is occupied, not empty. No card is created, removed from the accounting, recolored, or converted into another type by collapse.

## 4. Worker moves

Number cards stack by alternating color and decreasing value; legal stacks can move together at any size.[6] In this spec “decreasing” means the consecutive chain 10→9→8→7→6, as drawn in the official examples and checked by the secondary engine.[6][18]

To put a worker suffix on an occupied tableau column:

1. Every selected card is a worker.
2. Adjacent selected cards descend by exactly one and alternate colors.
3. Destination is unlocked and its exposed card is a worker.
4. Selected suffix's first card is exactly one lower than destination exposure and has opposite color.

Any worker single card or valid suffix may move to an empty unlocked column. There is no King-only or 10-only empty-slot restriction in the secondary engine.[18] There is no FreeCell-style capacity formula: a valid stack does not require enough intermediate free slots.[6]

Examples: `9♥,8♣,7♦` onto `10♠` is legal even if every other column and the free cell are occupied. `9♦` onto `10♥` is illegal (both red); `8♥` onto `10♣` is illegal (rank gap); a worker onto a face card is illegal.[6][18]

## 5. Royalty moves

Face cards stack by **same suit in any order**, and same-suit stacks may move as a group.[7] Thus `[K♥,V♥]` can be put on exposed `T♥`, regardless of royal ordering, but cannot be put on `D♦`, despite the same color. Worker/royalty cross-class building is not allowed.[7][18]

- A single exposed royal or an exposed suffix of same-suit royals can move.
- The destination must be an empty unlocked column, or expose a royal of that same suit.
- A selected suffix cannot include a worker or a different suit.
- A full four-card royal set **resting on unrelated cards** remains movable: the official rule locks only a completed face stack **placed directly on the board**.[7] Community players explicitly describe using full sets above other cards before committing them to a column.[17]
- Only when the **entire column** consists of all four royals of one suit does it collapse and become immovable. It occupies that column permanently. It cannot receive workers, more royals, or another completed set, and cannot be broken apart.[7][18]

A mixed dealt column such as `[K♦,T♦,V♥]` is valid state, but is not one movable group. It may receive more heart royalty on its exposed `V♥`; only the homogeneous heart suffix may move together. Do not impose a global requirement that every adjacency in a column be legal: initial deal adjacencies need not be.[17][18]

## 6. Free cell

Exactly one card of **any type** can be stored in the upper-right free cell.[9] Movement into it requires an exposed singleton and an empty cell. A group, including a complete royal set, cannot enter it; an occupied cell cannot receive even a matching card. From the cell, the single card may move to a tableau column using the same destination rules as above. There is no foundation action or special royal collection action in the free cell.[9][18]

The cell is temporary storage, not an additional tableau column. A movable suffix may be split by sending only its exposed last card to the cell. The single stored card is fully available for play; it cannot be swapped atomically with another exposed card (perform legal separate moves instead).

## 7. Automatic effects and completion

A standalone four-card same-suit royal set automatically collapses and locks.[7][18] Retain the four card IDs, set `locked=true`, and render a card back/completion token. Check both changed columns after each move: revealing such a set by removing a dealt covering card should also lock it under the lifecycle default.

**Worker runs are different:** a complete `10…6` alternating run is a completed group for the goal, but the official text does not say worker runs collapse or become immovable. The secondary engine leaves them unlocked. Do **not** lock worker columns or remove their cards; normal splitting/movement remains possible until victory.[7][8][18]

Win when all dealt cards form **four complete worker columns and four complete royalty columns**.[8] Under the specified nine-column layout this means four locked royal columns (one per suit), four exact five-card worker columns, one empty tableau column, and an empty free cell. A complete worker suffix with unrelated cards beneath it is not a completed goal column. Worker suits need not be uniform or match the royal suits; only rank/color legality matters.[6][8][18]

- Automatically detect victory after normalization; no manual “win” command is required (recommended interface).
- No published rule here adds a score, timer, move limit, compulsory-move priority, or redeal.[6][7][8][9]
- **Default stuck handling:** if not won and no legal tableau/cell move exists, show “no legal moves,” retaining undo/restart. Legal reversible moves do not imply a solvable position. A search timeout is not proof of loss.

## 8. Legal predicates and transitions

`compatible(a,b)` means **b may be appended onto exposed a**. This direction is important.

```text
compatible(a,b):
    if a.kind != b.kind: return false
    if a.kind == ROYALTY: return a.suit == b.suit
    return a.rank == b.rank+1 and color(a.suit) != color(b.suit)

validSuffix(cards):
    return len(cards)>0 and every adjacent (a,b) satisfies compatible(a,b)

legalMove(src, index, dst):
    require phase == PLAYING and src != dst
    if src == FREECELL:
        require freeCell != null and index == 0
        run = [freeCell]
    else:
        require !src.locked and index within src.cards
        run = src.cards[index:]
        require validSuffix(run)
    if dst == FREECELL:
        require freeCell == null and len(run) == 1
    else:
        require !dst.locked
        require dst.cards.empty or compatible(dst.cards.last, run.first)
    return run

apply(src,index,dst):
    run = legalMove(src,index,dst)    // reject before mutating
    snapshot = clone(state)          // optional undo includes automatic locks
    remove selected suffix/singleton from src
    append run to dst or store singleton in freeCell
    moveCount += 1
    for c in changed tableau columns:
        if !c.locked and len(c.cards)==4:
            if all cards are ROYALTY and all have same suit:
                c.locked = true
    assert conservationOf36DistinctIds()
    phase = WON if goalSatisfied() else PLAYING

goalSatisfied():
    return freeCell == null
       and count(locked royal columns) == 4
       and distinct locked royal suits == allFourSuits
       and count(columns with exactly [10,9,8,7,6]
                 and worker-only alternating colors) == 4
       and count(empty tableau columns) == 1
```

Atomic move application must preserve valid existing deal prefixes. Never reject a move because an untouched, lower adjacency was already mismatched. Optional undo restores complete prior state including locks, counters, and phase; do not make automatic collapse an extra user move.

## 9. Acceptance tests

Specification tests, not a claim of executed engine tests. Use unique IDs; unused cards belong in other fixture columns. `[]` is an empty unlocked column; `R♥` denotes a royal of that suit with distinct ranks/IDs where needed.

| ID | Given/action | Expected |
|---|---|---|
| P01 | Initialize | Nine columns × four cards; 36 unique IDs; cell empty; all playable cards face-up. |
| P02 | `9♥` onto `10♠` | Accepted. |
| P03 | `9♦` onto `10♥` | Rejected: same color, despite different suits. |
| P04 | `8♥` onto `10♣` | Rejected: numeric gap. |
| P05 | `[9♥,8♣,7♦]` onto `10♠`, no spare slots | Accepted as one move; no free-space capacity limit. |
| P06 | Select `[9♥,8♦]` as a group | Rejected: same-color internal pair. |
| P07 | Exposed `6♣` into `[]` | Accepted; empty columns are not restricted to 10. |
| P08 | `K♥` onto `V♥`, or `T♥` onto `D♥` | Both accepted; royal order irrelevant. |
| P09 | `K♥` onto `D♦` | Rejected: same color does not substitute for same suit. |
| P10 | Worker onto royalty or royalty onto worker | Both rejected on occupied columns. |
| P11 | `[K♥,T♥]` onto `V♥` | Accepted same-suit suffix. |
| P12 | Select `[K♦,V♥]` together from mixed deal | Rejected; moving only exposed `V♥` may be legal. |
| P13 | Send one exposed worker to empty cell | Accepted; cell now occupied. |
| P14 | Send one exposed royal to empty cell | Accepted. |
| P15 | Send a two-card valid suffix into empty cell | Rejected: singleton capacity. |
| P16 | Send any card to occupied cell, including matching royal | Rejected; no swap or collection shortcut. |
| P17 | Cell `9♥` to exposed `10♣` | Accepted; cell becomes empty. |
| P18 | Fourth same-suit royal completes entire column | Collapse/lock immediately; no extra move. |
| P19 | Four heart royals above an unrelated dealt `6♣` | No collapse; full heart suffix remains movable. |
| P20 | Move P19's four hearts onto `[]` | Destination locks; source exposes `6♣`. |
| P21 | Any move into/out of locked royalty column | Rejected; never treat it as an empty slot. |
| P22 | Complete standalone alternating worker `10…6` | Counts as complete but remains unlocked and splittable before victory. |
| P23 | Remove covering card exposing standalone four same-suit royals | Source locks during normalization (lifecycle default). |
| P24 | Four royalty locks + four worker runs + empty ninth column + empty cell | Victory. |
| P25 | Full worker `10…6` suffix above unrelated card | Not a completed goal column. |
| P26 | Valid exposed suffix moves out of a column with a mismatched dealt prefix | Accepted; untouched prefix is not revalidated as a build. |
| P27 | Self-drop or malformed selection | Reject atomically, no move-count increment. |
| P28 | Undo P18/P20 if undo enabled | Restore prior open column, IDs, free cell, locks, counters, and phase. |

## 10. Fidelity gaps and configurable defaults

1. **Deal source:** nine columns of four is supported by an EXAPUNKS community engine rather than written explicitly in the collection's official panels. Keep initial column counts configurable in a variant profile; collection-specific first-deal footage would be the best next verification. Default is nine × four, not eight columns.
2. **Dealer internals:** RNG, seeds, solvability rejection, card-order identity, and shuffle/deal order of the shipped game are unverified. Default is the explicit seeded dealer above; never label a random board guaranteed solvable.
3. **Royal artwork names:** use `V/D/K/T` as internal distinct IDs or provide an artwork mapping; move logic must not impose that order. The secondary solver collapses faces into suit-only tokens, so it cannot independently verify each portrait's exact name.[18]
4. **Worker completion:** default unlocked, supported by the official distinction and secondary engine. Do not import Cluj's all-run collapse behavior into this game.[7][18]
5. **Initialization/uncover normalization:** automatic locking when a royal set is already complete at deal time or revealed by moving a covering card is an explicit lifecycle default, not a separately documented official animation.
6. **Undo and loss UI:** implement optional unlimited undo and restart as product features; no original-version parity is claimed. Keep these out of legal-move predicates.
7. No commercial executable was exercised. The deliverable is a sourced rules design, with acceptance cases ready to translate into unit tests, not a claim of executable-game conformance testing.

## Sources

[6] https://zachtronics.com/solitaire-rules/images/burbank_0.png
[7] https://zachtronics.com/solitaire-rules/images/burbank_1.png
[8] https://zachtronics.com/solitaire-rules/images/burbank_2.png
[9] https://zachtronics.com/solitaire-rules/images/burbank_3.png
[15] https://zachtronics.com/solitaire-rules/images/burbank_logo.png
[17] https://steamcommunity.com/app/1988540/discussions/0/3385042609881177894
[18] https://raw.githubusercontent.com/aaronrudkin/exapunks_solitaire_bot/master/exa_logic.py
