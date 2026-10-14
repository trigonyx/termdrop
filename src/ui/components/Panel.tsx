import { Box, Text, useInput } from 'ink';
import { renderText } from '../text.js';
import { theme } from '../theme.js';

/** Larger output (e.g. /help, /stats) on the dashboard. Closes on any key. */
export function Panel({ text, width, height, onClose }: { text: string; width: number; height: number; onClose(): void }) {
  useInput(() => onClose());
  const lines = renderText(text, width - 6).slice(0, Math.max(1, height - 4));
  return (
    <Box flexDirection="column" height={height} width={width}>
      <Box borderStyle="round" borderColor={theme.border} paddingX={2} flexDirection="column" width={width}>
        {lines.map((l, i) => (
          <Text key={i} wrap="truncate-end">
            {l || ' '}
          </Text>
        ))}
      </Box>
      <Box paddingX={1}>
        <Text color={theme.dim}>press any key to close</Text>
      </Box>
    </Box>
  );
}
