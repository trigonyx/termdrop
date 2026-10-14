import chalk from 'chalk';

/**
 * The banner's shine: a light streak that runs across the logo once and then rests
 * (same shimmer as termchat's <shine> tag, without the tag machinery).
 */
type RGB = [number, number, number];

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [255, 255, 255];

export const hexToRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;

/** ms a shimmer takes to cross the text */
export const SHINE_SWEEP = 900;
/** half width of the shimmer in columns */
const SHINE_HALF = 4;

/**
 * Color of column `col` (of `width`) at time `t` ms after the shine started. The streak moves
 * left to right and leans with the rows (`row` shifts it), so it looks like a glint on metal.
 */
export function shineColor(base: RGB, col: number, row: number, width: number, t: number): RGB {
  const u = t / SHINE_SWEEP;
  if (u < 0 || u >= 1) return base;
  const center = (width + 2 * SHINE_HALF + 6) * u - SHINE_HALF - 6 + row;
  const strength = Math.max(0, 1 - Math.abs(col + 0.5 - center) / SHINE_HALF);
  return mix(base, WHITE, strength * 0.85);
}

/** Paints one line of the logo for frame `t` (≥ SHINE_SWEEP = resting, plain color). */
export function shineLine(line: string, row: number, width: number, hex: string, t: number): string {
  const base = hexToRgb(hex);
  if (t < 0 || t >= SHINE_SWEEP) return chalk.hex(hex)(line);
  let out = '';
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') out += ch;
    else {
      const [r, g, b] = shineColor(base, col, row, width, t);
      out += chalk.rgb(Math.round(r), Math.round(g), Math.round(b))(ch);
    }
    col++;
  }
  return out;
}
