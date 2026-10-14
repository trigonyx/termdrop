import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export const MENU_MAX = 6;

export interface MenuItem {
  key: string;
  label: string;
  description: string;
}

export function menuHeight(count: number): number {
  return count ? Math.min(count, MENU_MAX) : 0;
}

/** Suggestion list below the input as soon as you type "/" or "<" – like in Claude Code. */
export function CommandMenu({ items, selected, width }: { items: MenuItem[]; selected: number; width: number }) {
  if (!items.length) return null;
  const start = Math.max(0, Math.min(selected - MENU_MAX + 1, items.length - MENU_MAX));
  const visible = items.slice(start, start + MENU_MAX);
  const nameWidth = Math.min(34, Math.max(...items.map((it) => it.label.length)) + 2);
  return (
    <Box flexDirection="column" width={width} paddingX={2}>
      {visible.map((item, i) => {
        const active = start + i === selected;
        return (
          <Box key={item.key}>
            <Box width={nameWidth} flexShrink={0}>
              <Text color={active ? theme.accent : undefined} bold={active} wrap="truncate-end">
                {item.label}
              </Text>
            </Box>
            <Text color={active ? undefined : theme.dim} wrap="truncate-end">
              {item.description}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
