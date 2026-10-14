import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import type { Animations } from 'termcore/store/files';
import { Logo } from 'termcore/ui/components/Logo';
import { icons, theme } from 'termcore/ui/theme';

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

/** The dashboard's eye-catcher: the logo, and below it the one action (and how to drop files). */
export function Banner({
  width,
  compact,
  selected,
  animate = true,
  mode = 'brief',
}: {
  width: number;
  compact: boolean;
  selected: boolean;
  animate?: boolean;
  /** animations from settings.json: the glint plays always, twice, or never */
  mode?: Animations;
}) {
  return (
    <Box flexDirection="column" width={width} alignItems="center" flexShrink={0}>
      <Logo lines={compact ? LOGO_SMALL : LOGO} animate={animate} mode={mode} />
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
