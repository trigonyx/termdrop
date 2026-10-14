import { Box, Text } from 'ink';
import type { Toast } from '../../core/store.js';
import { icons, theme } from '../theme.js';

const KIND_STYLE = {
  info: { color: theme.accent, icon: icons.request },
  success: { color: theme.success, icon: icons.joined },
  error: { color: theme.error, icon: icons.error },
} as const;

/** Bottom line: key hints – or briefly a notification. */
export function Footer({ hints, toast, width }: { hints: string[]; toast: Toast | null; width: number }) {
  if (toast) {
    const s = KIND_STYLE[toast.kind];
    return (
      <Box width={width} paddingX={1}>
        <Text wrap="truncate-end">
          <Text color={s.color}>{s.icon} </Text>
          {toast.text}
        </Text>
      </Box>
    );
  }
  return (
    <Box width={width} paddingX={1}>
      <Text color={theme.dim} wrap="truncate-end">
        {hints.join(' · ')}
      </Text>
    </Box>
  );
}
