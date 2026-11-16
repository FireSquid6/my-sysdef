# Shenzhen / Sigmar official panel inspection record

Source index: https://zachtronics.com/solitaire-rules/
All image URLs below use base `https://zachtronics.com/solitaire-rules/images/`.
Downloaded PNG files in this directory were opened with vision_analyze and inspected directly. These are source evidence, not runtime assets; no redistribution permission is implied.

## Shenzhen

`shenzhen_logo.png`: title is **SHENZHEN SOLITAIRE**, with 深圳.

`shenzhen_0.png`:
> To win, stack the three suits from 1 to 9 in the top-right corner of the table.

Diagram: three foundations, green bamboo, black characters, red circles, each showing 9 at top.

`shenzhen_1.png`:
> Cards can be stacked and moved in the center of the table, but only if they are of alternating suits and decreasing values.

Diagram: green 7, red 6, green 5, black 4, red 3. This is adjacency-based different suits, not a mandatory fixed pair of suits.

`shenzhen_2.png`:
> The free cells in the top-left corner of the table can store one card of any type.

Diagram: three cells containing respectively red dragon, green 3, and empty; three corresponding dragon buttons on right.

`shenzhen_3.png`:
> When all four dragons of a single type are exposed, they can all be permanently moved to an open free cell by pushing the corresponding button.

Diagram: four outlined white dragons collected with white-dragon button into face-down bundle occupying one cell.

## Sigmar's Garden: CORRECT prefix is lightning

`lightning_logo.png`: title is **SIGMAR'S GARDEN** (also visible as the second entry in `other-logos.jpg`).

`lightning_0.png`, heading CLEARING MARBLES:
> Your goal is to clear the board.
> Select a free marble, and then pick a matching marble to remove them both from the board.

Diagram: select one fire then a matching fire.

`lightning_1.png`, heading UNLOCKING MARBLES:
> A marble is only free if it has 3 contiguous empty spaces next to it.
> Luckily, spaces off the board count as empty spaces.

Diagram: two nonconsecutive empty neighbors do not unlock; three consecutive do; exterior spaces can supply two of the three empties.

`lightning_2.png`:
> The four cardinal elements match with others of the same type.
> Salt matches with any of the cardinal elements, or with itself.

Diagram: fire, earth, water, air matched with themselves; each of these four plus salt matched with salt.

`lightning_4.png`:
> Vitae and Mors will only match with their opposite.
> The metals match with quicksilver, but only in the order of their transmutation from lead to gold.

Diagram: vitae plus mors. Metal symbols in order: Saturn/lead, Jupiter/tin, Mars/iron, Venus/copper, Moon/silver, Sun/gold. Each of the first five shown over plus sign and quicksilver; gold is drawn separately without a quicksilver partner. No prose statement on whether gold requires all nonmetals gone appears in these panels.

The index links `_0`, `_1`, `_2`, `_4` for lightning; do not invent a missing `_3` instruction panel.

## Mapping error caught and excluded

`milan_logo.png` reads **FORTUNE'S FOUNDATION**.
`milan_0.png`: cards stacked by suit increasing/decreasing; only one card moved at a time.
`milan_1.png`: move all cards to foundations; major arcana up from 0/down from 21, minor arcana A to K.
`milan_2.png`: reserve above minor foundations blocks further minor-arcana moves there.
`milan_3.png`: scrying mirror undoes latest move.
These are not Sigmar rules and are deliberately not applied to Sigmar's Garden.

## Supplementary screenshot observations

`shenzhen-screenshot.jpg` is a midgame screenshot from https://raw.githubusercontent.com/pushcx/shenzhen/master/screenshot.jpg. Eight tableau positions; three cells upper left (one numbered card, one sealed bundle, one empty); flower home and three number foundations upper right. It does not prove initial five-card deal by itself; that is corroborated by two inspected independent engines.

`sigmar-guide-board.jpg` is an actual game board reproduced in Sumire's guide, https://steamcommunity.com/sharedfiles/filedetails/?id=1176230609 . Rows visibly have 6,7,8,9,10,11,10,9,8,7,6 spaces. Center contains gold; occupancy appears symmetric while types differ at antipodal cells. Guide says 55 standard marbles and 91 cells. Download URL is cited in sigmars-garden.md.

## Retrieval limitations

The thesis at https://theses.liacs.nl/pdf/2024-2025-RuigrokMMax.pdf was successfully downloaded, but web_extract timed out; read_file requested OCR; local pymupdf and pdftotext were absent. It is retained as unused supplementary evidence. No final factual claim relies on its uninspected full text.
