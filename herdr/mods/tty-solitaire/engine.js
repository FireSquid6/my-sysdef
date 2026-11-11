// Pure draw-one Klondike rules. Operations mutate only the supplied game.
export const SUITS = ["clubs", "diamonds", "hearts", "spades"];
export const red = card => card.suit === "diamonds" || card.suit === "hearts";
export const descending = (a, b) => a.rank === b.rank + 1 && red(a) !== red(b);
export function newGame(random = Math.random) {
  const stock = SUITS.flatMap(suit => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1, faceUp: false })));
  for (let i = stock.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [stock[i], stock[j]] = [stock[j], stock[i]];
  }
  const tableau = Array.from({ length: 7 }, (_, i) => {
    const pile = stock.splice(stock.length - i - 1);
    pile[pile.length - 1].faceUp = true;
    return pile;
  });
  return { version: 1, stock, waste: [], foundations: [[], [], [], []], tableau, moves: 0 };
}
export function won(game) { return game.foundations.every(pile => pile.length === 13); }
// Once every card is exposed in the playing area, only foundation cleanup
// remains. Hidden cards or a remaining stock/waste still require actual play.
export function canAutoComplete(game) {
  return validSave(game) && !won(game) && game.stock.length === 0 && game.waste.length === 0 &&
    game.tableau.every(pile => pile.every(card => card.faceUp));
}
export function autoComplete(game) {
  if (!canAutoComplete(game)) return 0;
  let transferred = 0;
  // In a valid, fully exposed descending tableau the lowest outstanding rank
  // is always accessible. Use the normal move rules rather than teleporting
  // cards so that foundation order and the move counter remain correct.
  for (;;) {
    let progressed = false;
    for (let index = 0; index < game.tableau.length; index++) {
      if (!game.tableau[index].length) continue;
      for (let foundation = 0; foundation < game.foundations.length; foundation++) {
        if (move(game, { area: "tableau", index }, { area: "foundations", index: foundation })) {
          transferred++; progressed = true; break;
        }
      }
    }
    if (!progressed || won(game)) return transferred;
  }
}
export function draw(game) {
  if (won(game)) return false;
  if (game.stock.length) {
    const card = game.stock.pop(); card.faceUp = true; game.waste.push(card);
  } else if (game.waste.length) {
    game.stock = game.waste.reverse(); game.waste = [];
    game.stock.forEach(card => { card.faceUp = false; });
  } else return false;
  game.moves++;
  return true;
}
function pileAt(game, location) {
  if (!location) return null;
  if (location.area === "waste") return game.waste;
  if (!["tableau", "foundations"].includes(location.area) || !Number.isInteger(location.index)) return null;
  return game[location.area][location.index] ?? null;
}
export function move(game, source, destination) {
  if (won(game)) return false;
  const from = pileAt(game, source), to = pileAt(game, destination);
  if (!from || !to || from === to || !["tableau", "foundations"].includes(destination.area)) return false;
  const start = source.card ?? from.length - 1;
  if (!Number.isInteger(start) || start < 0 || start >= from.length) return false;
  if (source.area !== "tableau" && start !== from.length - 1) return false;
  const stack = from.slice(start), card = stack[0];
  if (!stack.every(c => c.faceUp) || !stack.every((c, i) => !i || descending(stack[i - 1], c))) return false;
  const top = to.at(-1);
  if (destination.area === "foundations") {
    if (stack.length !== 1 || (top ? card.suit !== top.suit || card.rank !== top.rank + 1 : card.rank !== 1)) return false;
  } else if (top ? !top.faceUp || !descending(top, card) : card.rank !== 13) return false;
  to.push(...from.splice(start));
  if (source.area === "tableau" && from.length) from.at(-1).faceUp = true;
  game.moves++;
  return true;
}
export function validSave(game) {
  if (!game || game.version !== 1 || !Number.isSafeInteger(game.moves) || game.moves < 0 ||
      !Array.isArray(game.stock) || !Array.isArray(game.waste) ||
      !Array.isArray(game.tableau) || game.tableau.length !== 7 ||
      !Array.isArray(game.foundations) || game.foundations.length !== 4 ||
      ![...game.tableau, ...game.foundations].every(Array.isArray)) return false;
  const cards = [...game.stock, ...game.waste, ...game.tableau.flat(), ...game.foundations.flat()];
  if (cards.length !== 52 || !cards.every(c => c && SUITS.includes(c.suit) && Number.isInteger(c.rank) && c.rank >= 1 && c.rank <= 13 && typeof c.faceUp === "boolean") ||
      new Set(cards.map(c => `${c.suit}:${c.rank}`)).size !== 52) return false;
  if (game.stock.some(c => c.faceUp) || game.waste.some(c => !c.faceUp)) return false;
  if (!game.foundations.every(p => p.every((c, i) => c.faceUp && c.rank === i + 1 && c.suit === p[0].suit))) return false;
  return game.tableau.every(p => (!p.length || p.at(-1).faceUp) && p.every((c, i) =>
    !i || (!p[i - 1].faceUp ? true : c.faceUp && descending(p[i - 1], c))));
}
