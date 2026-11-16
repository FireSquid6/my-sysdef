import * as shenzhen from "./shenzhen.js";
import * as sigmar from "./sigmar.js";
import * as proletariat from "./proletariat.js";
import * as kabufuda from "./kabufuda.js";
import * as cluj from "./cluj.js";
import * as cribbage from "./cribbage.js";
import * as sawayama from "./sawayama.js";
import * as fortune from "./fortune.js";
export const GAMES = [
  { id: "shenzhen", engine: shenzhen, detail: "THREE COLORS / DRAGONS / FLOWER", icon: "dragon" },
  { id: "sigmar", engine: sigmar, detail: "ALCHEMICAL PAIRS / HEX GARDEN", icon: "sun" },
  { id: "proletariat", engine: proletariat, detail: "TWO DECKS / ASYMMETRIC SUITS", icon: "star" },
  { id: "kabufuda", engine: kabufuda, detail: "MATCH FOUR / MANAGE FREE CELLS", icon: "flower" },
  { id: "cluj", engine: cluj, detail: "DESCENDING RUNS / CHEAT AND RECOVER", icon: "diamond" },
  { id: "cribbage", engine: cribbage, detail: "PEGGING / FIFTEENS / THIRTY-ONE", icon: "clubs" },
  { id: "sawayama", engine: sawayama, detail: "STOCK AND WASTE / MATCH SUITS", icon: "spades" },
  { id: "fortune", engine: fortune, detail: "TAROT / MAJOR ARCANA / THE CELL", icon: "moon" },
];
