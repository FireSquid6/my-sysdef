# Zachtronics solitaire — implementation design documents

> Imported text specifications from `temp/zachtronics-solitaire-design-docs.zip`.
> The statements below describe the source handoff, not the implementation's
> current test status. The arcade implementation is in
> `herdr/mods/tty-zachtronics/`; controls, implemented policies and verification
> limits are documented in [Herdr's arcade guide](../../herdr/TTY.md#solitaire-collection).
> Reference screenshots, logos and the thesis PDF remain in the input archive;
> they are not distributed as game artwork. The textual rule transcript and
> evidence ledger are retained here alongside the specs.

Rules specifications for **all eight games in The Zachtronics Solitaire Collection**, rather than only the seven originally embedded in earlier releases. The eighth is Fortune's Foundation. The scope follows the [publisher's official game list](https://www.zachtronics.com/solitaire-collection/).

## Start here

1. Read [Shared implementation contract](implementation-contract.md) for evidence levels, state conventions, transactions, undo, randomness, and testing boundaries.
2. Read the target game's complete specification, including its source notes and unresolved details.
3. Implement a pure rules engine and translate the concrete acceptance scenarios into executable tests before adding presentation.
4. Resolve or explicitly adopt the stated fallback for any fidelity-sensitive uncertainty. Do not silently pass an implementation choice off as an original Zachtronics rule.

## Game specifications

| Game | Document | Core rules concern |
|---|---|---|
| Shenzhen Solitaire | [shenzhen-solitaire.md](shenzhen-solitaire.md) | Three-color tableau, dragons, flower, and foundations |
| Sigmar's Garden | [sigmars-garden.md](sigmars-garden.md) | Hex-board accessibility, element pairing, ordered metals |
| Proletariat's Patience | [proletariats-patience.md](proletariats-patience.md) | Asymmetric suit handling and different build conditions |
| Kabufuda Solitaire | [kabufuda-solitaire.md](kabufuda-solitaire.md) | Equal-rank groups and unlockable/consumed free cells |
| Cluj Solitaire | [cluj-solitaire.md](cluj-solitaire.md) | Rank-descending runs regardless of suit, cheating, and cheat recovery |
| Cribbage Solitaire | [cribbage-solitaire.md](cribbage-solitaire.md) | Four-column pegging, forced count resets, and suffix scoring; no hands or crib |
| Sawayama Solitaire | [sawayama-solitaire.md](sawayama-solitaire.md) | Klondike-derived tableau and stock/waste variations |
| Fortune's Foundation | [fortunes-foundation.md](fortunes-foundation.md) | Tarot ranks, foundations, and special temporary storage |

## What these documents specify

Each game document addresses inventory, initial layout, state representation, legal actions, automatic consequences, end conditions, corner cases, source evidence, and concrete acceptance tests. Source-backed behavior is distinguished from engineering recommendations and fidelity gaps. The common contract is deliberately implementation-language and UI-framework independent.

The documents describe rules, not a license to redistribute the original artwork, music, narrative, card illustrations, or game binaries. Use original or appropriately licensed presentation assets.

## Source of authority

- [Official collection and complete game list](https://www.zachtronics.com/solitaire-collection/).
- [Official illustrated rules for all eight games](https://zachtronics.com/solitaire-rules/).
- Additional game-specific references are cited inside each specification. Community descriptions and independent implementations are supplementary evidence, not first-party rules.

The official rules are image panels. Their actual contents must be read; the HTML text alone does not contain the rules. Where those panels leave details unspecified, the documents identify the limitation instead of claiming access to Zachtronics' internal implementation.

## Completion boundary

This package is a researched design handoff, **not an implemented or gameplay-tested collection**. Acceptance scenarios are specifications to execute in a future implementation. Exact compatibility with the original game's random seeds, complete starting-position catalogues, hidden generation algorithms, and incidental UI behavior requires additional reference testing wherever identified in the individual documents.
