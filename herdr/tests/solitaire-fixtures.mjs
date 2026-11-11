import { SUITS } from "../mods/tty-solitaire/engine.js";

// Every remaining card is face-up in legal alternating descending stacks.
export function exposedGame(foundationRank = 0) {
  const pairs = [["clubs", "hearts"], ["hearts", "clubs"], ["spades", "diamonds"], ["diamonds", "spades"]];
  return {
    version: 1, moves: 17, stock: [], waste: [],
    foundations: SUITS.map(suit => Array.from({ length: foundationRank }, (_, i) => ({ suit, rank: i + 1, faceUp: true }))),
    tableau: [...pairs.map(pair => Array.from({ length: 13 - foundationRank }, (_, i) => {
      const rank = 13 - i;
      return { rank, suit: pair[rank % 2 ? 0 : 1], faceUp: true };
    })), [], [], []],
  };
}
