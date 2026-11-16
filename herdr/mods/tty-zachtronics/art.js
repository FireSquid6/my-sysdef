import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
export const P = { background: "#10142b", foreground: "#fff1c1", accent: "#57e8ff", border: "#394574", chrome: "#191f3d", hover: "#293960", selected: "#334273", dim: "#9ca9cf", pink: "#e887ff", yellow: "#ffe477", green: "#78efac" };
// Original block-pixel icons; no publisher illustrations or logos.
const ICONS = {
  hearts: ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000", "0000000"],
  diamond: ["0001000", "0011100", "0111110", "1111111", "0111110", "0011100", "0001000"],
  clubs: ["0011100", "0011100", "1101011", "1111111", "1101011", "0001000", "0011100"],
  spades: ["0001000", "0011100", "0111110", "1111111", "1111111", "0101010", "0011100"],
  dragon: ["0110110", "1101100", "1111110", "0111001", "0011111", "1100110", "0111100"],
  sun: ["1001001", "0011100", "0111110", "1111111", "0111110", "0011100", "1001001"],
  star: ["0001000", "0001000", "1111111", "0111110", "0011100", "0110110", "1100011"],
  flower: ["0011100", "0111110", "1101011", "1110111", "1101011", "0111110", "0011100"],
  moon: ["0011110", "0111000", "1110000", "1110000", "1110000", "0111000", "0011110"],
  bamboo: ["0100010", "1110111", "0100010", "0100010", "1110111", "0100010", "0100010"],
  characters: ["1111111", "0001000", "0111110", "0101010", "0111110", "0001000", "1111111"],
  dots: ["1100011", "1100011", "0000000", "0011100", "0000000", "1100011", "1100011"],
  air: ["0001000", "0010100", "0100010", "1111111", "0100010", "1000001", "1111111"],
  earth: ["1111111", "1000001", "0100010", "1111111", "0010100", "0001000", "0000000"],
  fire: ["0001000", "0010100", "0100010", "0100010", "1000001", "1111111", "0000000"],
  water: ["1111111", "1000001", "0100010", "0100010", "0010100", "0001000", "0000000"],
  salt: ["0011100", "0100010", "1000001", "1111111", "1000001", "0100010", "0011100"],
  quicksilver: ["1000001", "0100010", "0011100", "0100010", "0011100", "0001000", "0011100"],
  vitae: ["0001000", "0011100", "0101010", "1001001", "0001000", "0001000", "0001000"],
  mors: ["0001000", "0001000", "0001000", "1001001", "0101010", "0011100", "0001000"],
  metal: ["0001000", "0011100", "0100010", "1000001", "0100010", "0011100", "0001000"],
  wands: ["1000000", "0100000", "0010000", "0001000", "0000100", "0000010", "0000001"],
  cups: ["1111111", "1000001", "0100010", "0011100", "0001000", "0001000", "0011100"],
  swords: ["0001000", "0001000", "0001000", "0001000", "0111110", "0001000", "0001000"],
  coins: ["0011100", "0100010", "1011101", "1010101", "1011101", "0100010", "0011100"],
  back: ["1010101", "0101010", "1010101", "0101010", "1010101", "0101010", "1010101"],
};
export function pixels(icon, color = P.accent, scale = 2) {
  return v_flex().flex_none().gap(0).children((ICONS[icon] || ICONS.star).map(row =>
    h_flex().flex_none().gap(0).children([...row].map(bit => div().w(scale).h(scale).flex_none()
      .when(bit === "1", el => el.bg(color))))));
}
export function cardIcon(card, fallback) {
  if (card.hidden) return "back";
  const label = card.label.toLowerCase();
  if (/heart|♥/.test(label)) return "hearts";
  if (/diamond|♦/.test(label)) return "diamond";
  if (/club|♣/.test(label)) return "clubs";
  if (/spade|♠/.test(label)) return "spades";
  if (/dragon/.test(label)) return "dragon";
  if (/flower/.test(label)) return "flower";
  for (const kind of ["bamboo", "characters", "dots", "air", "earth", "fire", "water", "salt", "quicksilver", "vitae", "mors", "wands", "cups", "swords", "coins"]) {
    if (label.includes(kind)) return kind;
  }
  if (/lead|tin|iron|copper|silver|gold/.test(label)) return "metal";
  return fallback;
}
export function faceColor(card) {
  if (card.hidden) return P.accent;
  const label = card.label.toLowerCase();
  if (/red|characters|heart|diamond|fire|mors|♥|♦/.test(label)) return "#b52f50";
  if (/green|bamboo|earth|vitae/.test(label)) return "#18794b";
  if (/dots|water|cups/.test(label)) return "#285c9e";
  if (/gold|coins|flower/.test(label)) return "#856000";
  if (/air|wands/.test(label)) return "#7b4a9c";
  return "#394574";
}
export function shortLabel(card) {
  if (card.hidden) return "Hidden";
  return card.label.replace(/hearts|diamonds|spades|clubs|bamboo|characters|dots|Wands|Cups|Swords|Coins/g, "").trim()
    .replace(/ dragon/, " DR").replace(/quicksilver/, "Hg").replace(/copper/, "Cu")
    .replace(/silver/, "Ag").replace(/lead/, "Pb").replace(/iron/, "Fe").replace(/gold/, "Au")
    .replace(/tin/, "Sn").replace(/Major /, "XX ").replace(/ \[.*$/, "!");
}
