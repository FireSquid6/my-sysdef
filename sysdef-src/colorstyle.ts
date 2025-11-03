
export type RGB = `[${number}, ${number}, ${number}]`

export type ForegroundColor =
  | "text-black"
  | "text-red"
  | "text-green"
  | "text-yellow"
  | "text-blue"
  | "text-magenta"
  | "text-cyan"
  | "text-white"
  | "text-none"
  | "text-b-black"
  | "text-b-red"
  | "text-b-green"
  | "text-b-yellow"
  | "text-b-blue"
  | "text-b-magenta"
  | "text-b-cyan"
  | "text-b-white"
  | `text-rgb-${RGB}`

export type FontOption =
  | "bold"
  | "italics"
  | "faint"
  | "dim"
  | "underline"
  | "inverse"
  | "hidden"
  | "strikethrough"

export type BackgroundColor =
  | "bg-black"
  | "bg-red"
  | "bg-green"
  | "bg-yellow"
  | "bg-blue"
  | "bg-magenta"
  | "bg-cyan"
  | "bg-white"
  | "bg-none"
  | "bg-b-black"
  | "bg-b-red"
  | "bg-b-green"
  | "bg-b-yellow"
  | "bg-b-blue"
  | "bg-b-magenta"
  | "bg-b-cyan"
  | "bg-b-white"
  | `bg-rgb-${RGB}`


export type Style = BackgroundColor | FontOption | ForegroundColor | "clear-codes"

const ANSI_CODES: Record<Style, string> = {
  "text-black": "\x1b[30m",
  "text-red": "\x1b[31m",
  "text-green": "\x1b[32m",
  "text-yellow": "\x1b[33m",
  "text-blue": "\x1b[34m",
  "text-magenta": "\x1b[35m",
  "text-cyan": "\x1b[36m",
  "text-white": "\x1b[37m",
  "text-none": "\x1b[39m",
  "text-b-black": "\x1b[90m",
  "text-b-red": "\x1b[91m",
  "text-b-green": "\x1b[92m",
  "text-b-yellow": "\x1b[93m",
  "text-b-blue": "\x1b[94m",
  "text-b-magenta": "\x1b[95m",
  "text-b-cyan": "\x1b[96m",
  "text-b-white": "\x1b[97m",
  "bg-black": "\x1b[40m",
  "bg-red": "\x1b[41m",
  "bg-green": "\x1b[42m",
  "bg-yellow": "\x1b[43m",
  "bg-blue": "\x1b[44m",
  "bg-magenta": "\x1b[45m",
  "bg-cyan": "\x1b[46m",
  "bg-white": "\x1b[47m",
  "bg-none": "\x1b[49m",
  "bg-b-black": "\x1b[100m",
  "bg-b-red": "\x1b[101m",
  "bg-b-green": "\x1b[102m",
  "bg-b-yellow": "\x1b[103m",
  "bg-b-blue": "\x1b[104m",
  "bg-b-magenta": "\x1b[105m",
  "bg-b-cyan": "\x1b[106m",
  "bg-b-white": "\x1b[107m",
  "bold": "\x1b[1m",
  "faint": "\x1b[2m",
  "dim": "\x1b[2m",
  "italics": "\x1b[3m",
  "underline": "\x1b[4m",
  "inverse": "\x1b[7m",
  "hidden": "\x1b[8m",
  "strikethrough": "\x1b[9m",
  "clear-codes": "\x1b[0m",
};


export function getAnsi(style: Style): string {
  if (style.startsWith("text-rgb-") || style.startsWith("bg-rgb-")) {
    const rgbMatch = style.match(/\[(\d+), (\d+), (\d+)\]/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch;
      const prefix = style.startsWith("text-rgb-") ? "38" : "48";
      return `\x1b[${prefix};2;${r};${g};${b}m`;
    }
  }
  return ANSI_CODES[style as keyof typeof ANSI_CODES] || "";
}

export function stylesToAnsi(styles: Style[]): string {
  return styles.map(style => getAnsi(style)).join("");
}

export function styleText(styles: Style[], text: string, clear: boolean = true): string {
  const end = clear ? "\x1b[0m" : "";
  return `${stylesToAnsi(styles)}${text}${end}`;
}
