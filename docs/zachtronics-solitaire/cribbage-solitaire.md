# Cribbage Solitaire — implementation-ready rules

## Identity and scope

This is **Zachtronics' pegging-style Cribbage Solitaire**, from *Möbius Front '83* and *The Zachtronics Solitaire Collection*. It is **not** the similarly named traditional patience game with two six-card hands, discards to a crib, a starter, and four thirteen-card rounds. There are **no hands, crib, discards, starter, flush scores, or show-phase combinatorial hand scoring** here. Implementing those would implement the wrong game.

Read alongside [the shared implementation contract](implementation-contract.md). Arrays below are bottom-to-top, with the last card exposed.

## Evidence and authority

The official panels were visually inspected, not inferred from their filenames.

- **[C0, official rules](https://zachtronics.com/solitaire-rules/images/cheyenne_0.png):** headed “Cribbage Solitaire”; play tableau cards to one stack, one at a time; win with 61 or more points; stack total cannot exceed 31; face cards count as 10; if any card can be played it must be played; if none can be played, start a new stack.
- **[C1, official scoring](https://zachtronics.com/solitaire-rules/images/cheyenne_1.png):** first card of a stack is a Jack: +2; total exactly 15: +2; total exactly 31: +2; set of two/three/four identical ranks: +2/+6/+12; run of three through seven cards, in any order: +3 through +7. Examples printed are K-J-Q and 2-4-3-A.
- **[C2, independent solver analysis and source excerpts](https://giggs.gitlab.io/blog/cribbage_solitaire/):** explicitly identifies the Zachtronics game, standard 52-card deck, four columns of thirteen, and code for the exact suffix-based scoring described below. The author reports comparing solver scores against two independent solvers and in-game moves. This is substantial supplementary evidence, **not publisher source code**.
- **[C3, screenshot hosted with C2](https://giggs.gitlab.io/cribbage/cards.PNG):** visually inspected; four fully face-up overlapping columns, thirteen cards each, playable cards at their lower exposed ends.
- [Official rules index](https://zachtronics.com/solitaire-rules/) links the two `cheyenne` panels. Avoid unrelated generic Cribbage Solitaire rules returned by web search.

### What the evidence establishes versus leaves open

C0/C1 establish the scoring categories and play restrictions; C2 resolves important terse wording: a set/run is a **contiguous suffix of cards just played to the current stack**, not an arbitrary subset of a hand or the whole stack. Only the longest qualifying run suffix scores on a particular play. Each successive pair/triple/quadruple scores its listed amount anew. A four-card same-rank sequence therefore scores 2 + 6 + 12 = 20 before other bonuses, not merely 12 overall. C2 explicitly implements this behavior.

Exact publisher shuffle/deal-number mapping and incidental win-screen timing were not reproduced. Explicit policies below avoid silently claiming exact fidelity.

## Inventory and initial setup

- One standard deck: four suits × ranks A,2,3,4,5,6,7,8,9,10,J,Q,K = 52 unique physical cards; no jokers. Suits and colors never affect legality or scoring. [C2/C3]
- Rank integers are A=1, ..., 10=10, J=11, Q=12, K=13. Counting value is `min(rank,10)`; rank for sets/runs stays the original integer. [C0/C1/C2]
- Deal all cards face up into **four columns of thirteen**. Each column's last card is available; covered cards remain visible but unavailable until uncovered. [C2/C3]
- Start with empty active stack, count 0, score 0, and no retired stacks. No stock, waste, redeals, or additional deal rounds exist. New stacks during play are count-reset segments of this one deal, not new hands.
- **Implementation choice:** for a new arbitrary seed, shuffle with a documented PRNG and Fisher–Yates, then deal round-robin into four arrays (`for row in 0..12: for column in 0..3: append(nextCard)`). This chooses an exact deal mapping; C0–C3 do not prove that mapping is the publisher's. Save the actual initial columns, not only the seed. Permit direct loading of externally supplied columns.

## Authoritative state

```text
Card { id, suit, rank:1..13 }
State {
  columns[4]: Card[],         // bottom/back to exposed end
  active: Card[],             // chronological play order
  retired: Card[][],          // closed chronological stacks
  count:0..31, score:integer>=0,
  victoryLatched:boolean,     // score has reached 61
  phase:Playing | DealComplete,
  initialColumns, rulesProfile, transitionLog
}
```

`count == sum(value(card) for card in active)`. Every physical card appears exactly once across columns, active, and retired; total inventory remains 52. Initial tableau adjacencies are unrestricted. A retired stack never becomes available again. Preserve complete active-stack order for replay and score explanations even if a solver uses a smaller suffix representation.

## Legal actions and automatic actions

The sole strategic action is `Play(columnIndex)`:

1. Game must be playing; column must exist and be nonempty.
2. Select **only the exposed last card** of that column.
3. Require `count + value(card) <= 31`.
4. Remove that card from its column, append it to active, update count, then score the new suffix once using the function below.
5. Retain any score already earned: later interruptions do not retract points.
6. If cards remain and no exposed card fits, retire the active stack and start an empty one with count 0. Never reset while even one exposed card fits. [C0]
7. If no tableau cards remain, finish the deal. Do not reset an empty stack repeatedly.

`StartNewStack` may instead be a UI button, but is permitted **only** when cards remain and the legal-play set is empty. **Default policy `resetMode=automatic`:** perform that deterministic consequence within the triggering Play transaction. `resetMode=explicit` may expose the same forced action without creating a strategic choice. At count 31 every positive-valued card is blocked, so the same rule causes a reset; there is no separate 31 mechanic beyond its +2 score.

Forbidden: moving between tableau columns; playing a buried card; passing an available legal card; voluntarily clearing the stack; ordering a multi-card batch; exceeding 31; recovering retired cards. An empty tableau column stays empty.

### Exact scoring algorithm

Let `S` be the active stack **after** adding the new card. All categories below are additive.

```python
def score_play(S):
    r = S[-1].rank
    count = sum(min(c.rank, 10) for c in S)
    points = 2 if len(S) == 1 and r == 11 else 0
    if count == 15 or count == 31:
        points += 2

    # Equal-rank suffix ending at the new card; no skipping cards.
    n = 0
    for c in reversed(S):
        if c.rank != r:
            break
        n += 1
    points += {1: 0, 2: 2, 3: 6, 4: 12}[n]

    # Longest distinct consecutive-rank suffix, regardless of play order.
    run = 0
    for k in range(3, min(7, len(S)) + 1):
        ranks = [c.rank for c in S[-k:]]
        if len(set(ranks)) == k and max(ranks) - min(ranks) == k - 1:
            run = k
    return points + run
```

Aces are **low only**: A-2-3 works; Q-K-A does not wrap. J/Q/K are distinct ranks even though each counts 10. Order within a run does not matter, but chronological **contiguity** does. Duplicate ranks invalidate a candidate run suffix: no multiplying runs through duplicate choices. Do not count all embedded shorter runs when a longer suffix qualifies. Subsequent plays can score overlapping runs again. The maximum feasible run length is seven under the count limit; retaining an eight-card run option serves no purpose.

There is **no point for “go,” last card, closing a stack, or exhausting the deck** in C1/C2. No flush, nobs, starter Jack, pair among nonadjacent cards, arbitrary fifteen-sum subsets, or crib bonuses. The Jack bonus is for the **first play of every new active stack**, not simply the first card of the whole deal. The sum bonus tests the complete current count, not subsets. Multiplicity is temporal: three equal cards score +2 on card two and +6 on card three, not an extra combinatorial tally of every subset on every turn.

### Transition pseudocode

```text
play(i):
  require phase==Playing and columns[i] nonempty
  c = last(columns[i])
  require count + value(c) <= 31
  snapshot pre-state if undo extension enabled
  pop columns[i]; append c to active
  count += value(c); score += score_play(active)
  victoryLatched = (score >= 61)
  if every column empty:
    phase = DealComplete
  else if no i has nonempty columns[i] and count+value(last(columns[i]))<=31:
    append active to retired
    active=[]; count=0
  validate invariants; commit
```

## Victory, completion, loss, and optional conveniences

**Official objective:** score at least 61. Exactly 61 succeeds; 60 does not. [C0] There is no negative scoring or time limit.

**Explicit fallback `completionPolicy=consumeDeck`:** latch success at 61, allow the rest of the deal for final/high score, and classify the finished deal as Won if final score ≥61, otherwise Lost. This follows C2's full-deck score-optimization model. The official panel alone does not say whether the commercial UI declares victory immediately or after card 52; make presentation timing configurable as `announceAtThreshold` without changing scores or accepted plays. A strict `stopAtThreshold` variant is an explicit alternate policy, not a verified timing claim.

A nonempty tableau cannot be permanently stuck: forced reset makes its exposed cards fit in an empty stack. Do not declare loss because current count blocks all cards. No strategic action count is prescribed. No official undo rule is established by C0/C1; default `undoEnabled=false`, with optional undo as a clearly marked accessibility/training extension. Restart restores the same initial columns; New Game creates a different deal, not a redeal within play.

## Acceptance scenarios

Fixtures use rank names; repeated ranks stand for distinct physical cards. The listed deltas assume all cards are played into one initially empty stack in that order, with no reset inside the sequence. They were calculated by executing a small independent Python translation of the algorithm during documentation; they are **not commercial-game test runs**.

| ID | Stack sequence | Per-play score deltas | Total earned |
|---|---|---|---:|
| C-T01 | J | 2 | 2 |
| C-T02 | J,5 | 2,2 | 4 |
| C-T03 | A,A,A,A | 0,2,6,12 | 20 |
| C-T04 | 5,5,5,5 | 0,2,8,12 | 22 |
| C-T05 | 4,6,5,7 | 0,0,5,4 | 9 |
| C-T06 | 2,4,3,A | 0,0,3,4 | 7 |
| C-T07 | K,J,Q | 0,0,3 | 3 |
| C-T08 | A,2,3,4,5,6,7 | 0,0,3,4,7,6,7 | 27 |
| C-T09 | 2,3,4,4,5 | 0,0,3,2,0 | 5 |
| C-T10 | 10,10,10,A | 0,2,6,2 | 10 |
| C-T11 | A,K | 0,0 | 0 |
| C-T12 | 10,J | 0,0 | 0 |
| C-T13 | 5,10,5 | 0,2,0 | 2 |
| C-T14 | 3,3,4,5 | 0,2,0,5 | 7 |

Further concrete state/transition tests:

- **C-T15:** active count 25; exposed ranks `[7,8,10,K]`: force reset, score unchanged, all columns unchanged. Next exposed Jack (in another fixture) starts a fresh stack for +2.
- **C-T16:** active count 25; exposed `[7,6,10,K]`: rank 6 is legal, 7 is illegal, and reset is forbidden. Playing 6 scores +2 for 31 and then resets if cards remain.
- **C-T17:** at count 30, exposed A is legal and exposed 2 is not. Invalid play changes no state or score.
- **C-T18:** a buried A under an exposed K cannot be selected even when the A would fit and the K would not.
- **C-T19:** remove the last card of a column: it stays empty; no refill or new deal is requested.
- **C-T20:** after playing the last tableau card at final score 60, report DealComplete/Lost; at 61 report DealComplete/Won. No last-card or go point is added.
- **C-T21:** reach 61 with cards remaining under `consumeDeck`: success is latched, phase remains Playing, further legal plays still score.
- **C-T22:** initialize from a supplied standard deck: four lengths equal 13, 52 unique IDs, all face up, count and score zero. Replay a move trace twice: identical columns, active/retired stacks, and score.
- **C-T23:** changing every suit while preserving chronological ranks changes neither deltas nor legal actions.

## Fidelity gaps and explicit defaults

| Detail not fully established | Explicit implementation policy |
|---|---|
| Original PRNG, column distribution order, original numbered-deal catalogue | Use documented shuffle + round-robin mapping; persist actual initial columns; never label seeds as original deal numbers. |
| Exact win-announcement timing / whether original UI accepts post-threshold plays | `consumeDeck`, latch success at 61, announce timing configurable. |
| Reset animation/button timing | Automatic forced reset, or equivalent forced explicit button; no extra point. |
| Original undo/save UI | No undo by default; save exact state; optional training undo separately labeled. |

Scoring suffix semantics are supported by the independent solver, not spelled out word-for-word in the official note. The most valuable reference checks before claiming perfect commercial fidelity are C-T03/C-T04 (new full set award), C-T09 (duplicate-run interruption), and exact threshold/reset UI timing.
