# Shared implementation contract

## Purpose and authority

This document proposes an engine architecture for implementing the eight games in this directory. It is **engineering guidance**, not a claim about Zachtronics' internal code or an additional game rule. The individual game specifications take precedence for game behavior.

Scope is the eight titles listed by the publisher in [The Zachtronics Solitaire Collection](https://www.zachtronics.com/solitaire-collection/). First-party rule panels are available on the [official rules page](https://zachtronics.com/solitaire-rules/). Original minigame UI, achievements, music, artwork, and undocumented publisher RNG are not prerequisites for a functional rules implementation.

## Evidence labels

Read every game's evidence and uncertainty sections before implementing it:

- **Verified / official:** directly supported by a cited first-party rule panel or other first-party material.
- **Observed / secondary:** supported by an identified screenshot, gameplay observation, community rule description, or implementation. This is not automatically equivalent to publisher specification.
- **Recommended / implementation choice:** an explicit policy that fills an interface or engineering gap; do not advertise it as an original rule.
- **Unresolved:** an original-game detail needing additional evidence. Implement the stated fallback behind a named policy rather than silently treating the fallback as verified fidelity.

Some game-specific documents use equivalent wording instead of these exact labels. Source screenshots often describe moves but do not define the complete shuffle algorithm or every UI edge case. A playable reconstruction and a byte-for-byte recreation of the commercial program are different deliverables.

## Engine boundary

Keep rule validation independent of pointer input, animation, layout pixels, audio, and persistence. Each rules engine should expose equivalent operations:

```text
newGame(seed, rulesProfile) -> State
validateState(state) -> list<InvariantViolation>
legalActions(state) -> list<Action>
validateAction(state, action) -> Allowed | Rejected(reason)
applyAction(state, action) -> Transition | Rejected(reason)
status(state) -> InProgress | Won | RoundComplete | NoLegalActions | Lost
serialize(state) -> versioned data
restore(data) -> State | ValidationError
```

`RoundComplete` applies only where a game has rounds. Do not manufacture a round phase for a single-deal game. `NoLegalActions` does not prove the original deal unsolvable: a player may have undo history, and exhaustive solvability is a separate solver concern. The game's own explicit failure conditions determine `Lost`.

### Transition transaction

1. Reject commands against an incompatible phase or stale revision.
2. Validate using the **pre-action** state, including destination availability and all batch-move restrictions.
3. Apply the complete player action to a copy or reversible transaction.
4. Apply only mandatory consequences defined by that game's document.
5. Apply optional convenience automation only if enabled and legal; preserve each effect in the transition log.
6. Validate postconditions and invariants.
7. Commit one new state revision and one undo unit containing the player action plus its consequences.

Recommended rejection codes include `WRONG_PHASE`, `INVALID_SOURCE`, `NOT_EXPOSED`, `INVALID_SEQUENCE`, `DESTINATION_OCCUPIED`, `RANK_MISMATCH`, `SUIT_MISMATCH`, `INSUFFICIENT_CAPACITY`, and game-specific conditions. No rejected action may change state, consume RNG, or advance a timer used in scoring.

## State identity and order

- Give every physical card or tile a stable unique ID even when several have identical faces. Rule identity and physical identity are separate.
- For card stacks, use arrays ordered **bottom to top**; the last element is exposed. Name any exception explicitly.
- Store face-up/face-down status independently from card rank/suit. Rendering must not accidentally disclose hidden faces.
- For hex boards, store explicit coordinates and a fixed neighbor function; do not derive adjacency from rendered pixel proximity.
- Include every nonvisual rule field: locked cells, retired cards, cheat state, phase, score, stock/waste order, and any special move privilege.
- Keep pure metadata (cursor, selection highlight, animation progress) outside authoritative game state.

## Replay, undo, save, and randomness

Recommended behavior, unless a game-specific specification says otherwise:

- Persist a schema version, game ID, rules-profile ID, policy overrides, initial seed, PRNG identifier/version, full initial deal or tile assignment, and ordered player commands.
- Store the actual initial board as well as a seed. A seed alone is not portable across shuffle and PRNG versions.
- Implement undo by snapshots or exact inverse transitions, never by guessing from the visible board. Undo restores score, hidden information state, privileges, and automatic effects together.
- Redo replays the recorded transition without obtaining a different random result.
- Restart restores the exact original deal; New Game obtains a new seed.
- Do not promise compatibility with publisher deal numbers or guaranteed-winnable deals unless you have reproduced and tested that algorithm.
- If generating solvable deals, verify with a legal-action solver or retain a reverse-construction witness. A shuffled legal inventory alone does not establish solvability.

## UI behavior that must not alter rules

The input adapter translates clicks, drags, keyboard selections, and touch gestures into the same commands. A drag preview may show rejection reasons, but cannot bypass the validator. Animation is a view of a committed transition, not the authority for whether a move happened. Disable or queue input while a transition is being presented so a second drag cannot mutate an intermediate state.

Optional hints select from legal actions. They must not imply that an arbitrary legal action preserves solvability. Optional auto-foundation behavior requires the exact game's documented policy; generic FreeCell automation must not be reused indiscriminately. Distinguish player-authorized multi-card moves from repeated single-card moves when the game's capacity restrictions differ.

## Cross-game invariant checklist

Run after every accepted transition and every restored save:

1. Every physical piece appears in exactly one live or retired location.
2. Inventory counts equal the specified initial inventory, allowing only explicitly modeled removal/retirement.
3. Location capacities and structural constraints hold.
4. Foundation/completed-pile order is valid according to that game's rules.
5. Hidden/exposed status agrees with the rules, not merely the visual arrangement.
6. Locked or spent resources cannot be reused without an explicit transition that permits it.
7. Counters are nonnegative and scores equal the game's scoring function.
8. Status is consistent with board state and phase.
9. Rejected actions preserve a serialized-state digest.
10. Replaying the same commands from the same initial state yields the same final state.

Do not assert that every adjacency in every tableau is a valid build: some games intentionally permit arbitrary initial stacks or cheating. Validate the relevant movable suffix rather than invalidating a legal dealt board.

## Verification levels

1. **Document review:** each of eight games has inventory, setup, legal transitions, termination, edge cases, and test fixtures. This package supplies specifications and acceptance scenarios, not implemented engines.
2. **Engine unit tests:** turn every acceptance scenario into executable fixtures, plus rejection-state immutability and conservation tests.
3. **Property tests:** generate legal play traces and validate invariants after every transition; undo to the exact initial state.
4. **Reference comparison:** compare the same corner cases against the commercial game or another explicitly identified authoritative reference. Resolve outstanding fidelity policies here.
5. **Playable UI test:** exercise a complete deal or round with input, animation, save/restore, and terminal-state presentation.

Passing document review is not evidence that an implementation passed the remaining levels.
