import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { useEffect, useState } from 'react';
import { shineLine, SHINE_SWEEP } from '../effects.js';
import { icons, theme } from '../theme.js';

/** "TERMDROP" in the ANSI Shadow figlet font (like keyrace's logo): 69 columns, 6 rows. */
export const LOGO = [
  '████████╗███████╗██████╗ ███╗   ███╗██████╗ ██████╗  ██████╗ ██████╗ ',
  '╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔══██╗██╔══██╗██╔═══██╗██╔══██╗',
  '   ██║   █████╗  ██████╔╝██╔████╔██║██║  ██║██████╔╝██║   ██║██████╔╝',
  '   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║  ██║██╔══██╗██║   ██║██╔═══╝ ',
  '   ██║   ███████╗██║  ██║██║ ╚═╝ ██║██████╔╝██║  ██║╚██████╔╝██║     ',
  '   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ',
];

/** Compact variant for narrow or short terminals: 35 columns, 2 rows. */
export const LOGO_SMALL = ['▀█▀ █▀▀ █▀█ █▀▄▀█ █▀▄ █▀█ █▀█ █▀█', ' █  ██▄ █▀▄ █ ▀ █ █▄▀ █▀▄ █▄█ █▀▀'];

const LOGO_WIDTH = stringWidth(LOGO[0]!);

/** Big logo only where it fits comfortably. */
export function bannerCompact(width: number, rows: number): boolean {
  return width < 80 || rows < 24;
}

/** Rows the banner takes (logo, gap, action line, hint line, gap). */
export function bannerHeight(compact: boolean): number {
  return (compact ? LOGO_SMALL.length : LOGO.length) + 4;
}

/** A shine runs across the logo this often (while the dashboard is in front). */
export const SHINE_EVERY = 6000;

/**
 * Plays a shine across the logo shortly after it appears and then every SHINE_EVERY ms.
 * Between shines nothing redraws; while `active` is false (terminal in the background, a
 * dialog open) it rests completely.
 */
function useShine(active: boolean, delay = 250): number {
  const [t, setT] = useState(-1);
  useEffect(() => {
    if (!active) {
      setT(-1);
      return;
    }
    let sweep: NodeJS.Timeout | null = null;
    let next: NodeJS.Timeout | null = null;
    const play = () => {
      const t0 = Date.now();
      sweep = setInterval(() => {
        const dt = Date.now() - t0;
        if (dt < SHINE_SWEEP) return setT(dt);
        if (sweep) clearInterval(sweep);
        sweep = null;
        setT(-1);
        next = setTimeout(play, SHINE_EVERY - SHINE_SWEEP);
      }, 33);
    };
    next = setTimeout(play, delay);
    return () => {
      if (next) clearTimeout(next);
      if (sweep) clearInterval(sweep);
    };
  }, [active, delay]);
  return t;
}

/** The dashboard's eye-catcher: the logo, and below it the one action (and how to drop files). */
export function Banner({ width, compact, selected, animate = true }: { width: number; compact: boolean; selected: boolean; animate?: boolean }) {
  const t = useShine(animate);
  const logo = compact ? LOGO_SMALL : LOGO;
  const logoWidth = compact ? stringWidth(LOGO_SMALL[0]!) : LOGO_WIDTH;
  return (
    <Box flexDirection="column" width={width} alignItems="center" flexShrink={0}>
      {logo.map((line, i) => (
        <Text key={i}>{shineLine(line, i, logoWidth, theme.accent, t)}</Text>
      ))}
      <Text> </Text>
      <Box>
        <Text color={theme.accent}>{selected ? `${icons.pointer} ` : '  '}</Text>
        <Text backgroundColor={selected ? theme.accent : undefined} color={selected ? '#1E1E1E' : theme.accent} bold>
          {` ${icons.send} Send files `}
        </Text>
        <Text color={theme.dim}>{selected ? ' enter' : '      '}</Text>
      </Box>
      <Text color={theme.faint}>or drag files into this window</Text>
      <Text> </Text>
    </Box>
  );
}
