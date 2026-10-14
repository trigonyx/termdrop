// Escape sequences (CSI, OSC, DCS, …) and lone ESC characters
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[PX^_][^\u001b]*(?:\u001b\\)?|[@-Z\\-_])?/g;
// C0 control characters except tab/newline, DEL, C1 control characters
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
// Bidi overrides, which can reverse displayed text to mislead
const BIDI = /[\u202a-\u202e\u2066-\u2069]/g;

export const MAX_TEXT = 16_000;
export const MAX_NAME = 32;

/**
 * Strips everything a peer could use to manipulate the terminal
 * (set colors, move the cursor, change the title, clear the screen …).
 */
export function sanitizeText(input: string): string {
  return input.replace(/\r\n?/g, '\n').replace(ANSI, '').replace(CONTROL, '').replace(BIDI, '').replace(/\t/g, '    ');
}

/** Single-line, short display name. */
export function cleanName(input: unknown): string {
  if (typeof input !== 'string') return 'Unknown';
  const name = sanitizeText(input).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return name || 'Unknown';
}
