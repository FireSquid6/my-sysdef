/** StatusNotifier pixmaps are network-order ARGB; GTK's chosen texture is RGBA. */
export function trayPixels(values: unknown): { width: number; height: number; rgba: Uint8Array } | null {
  if (!Array.isArray(values)) return null;
  const candidates = values.filter((v): v is [number, number, Uint8Array | number[]] => Array.isArray(v) &&
    Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] > 0 && v[1] > 0 && v[0] <= 256 && v[1] <= 256 &&
    (v[2] instanceof Uint8Array || Array.isArray(v[2])) && v[2].length === v[0] * v[1] * 4);
  candidates.sort((a, b) => Math.abs(a[0] - 24) - Math.abs(b[0] - 24));
  const chosen = candidates[0];
  if (!chosen) return null;
  const [width, height, argb] = chosen;
  const rgba = new Uint8Array(argb.length);
  for (let i = 0; i < argb.length; i += 4) {
    rgba[i] = argb[i + 1]!; rgba[i + 1] = argb[i + 2]!; rgba[i + 2] = argb[i + 3]!; rgba[i + 3] = argb[i]!;
  }
  return { width, height, rgba };
}
