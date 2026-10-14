import { Box, Text } from 'ink';
import { tildify } from '../../core/paths.js';
import type { AppStore } from '../../core/store.js';
import type { Transfer } from '../../transfer/session.js';
import { formatBytes, plural } from '../../transfer/units.js';
import { icons, theme } from 'termcore/ui/theme';

/** Rows the panel takes for `visibleFiles` file lines, border included. */
export function offerDetailHeight(offer: Transfer, maxFiles: number): number {
  const shown = Math.min(offer.files.length, maxFiles);
  const more = offer.files.length > shown ? 1 : 0;
  // border, title, gap, files, more, gap, total, folder, gap, keys
  return 2 + 1 + 1 + shown + more + 1 + 1 + 1 + 1 + 1;
}

/** An incoming offer, in the side panel while it's selected: who, what, how big, where to. */
export function OfferDetail({ store, offer, width, maxFiles }: { store: AppStore; offer: Transfer; width: number; maxFiles: number }) {
  const inner = width - 4;
  const shown = offer.files.slice(0, Math.max(1, maxFiles));
  const dir = store.downloadDir();
  const free = store.freeSpace(dir);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1} width={width} flexShrink={0}>
      <Text bold wrap="truncate-end">
        <Text color={theme.accent}>{icons.request} </Text>
        {offer.peerName}
        <Text color={theme.dim}> wants to send you</Text>
      </Text>
      <Text> </Text>
      {shown.map((f, i) => (
        <Box key={i} width={inner}>
          <Box width={2} flexShrink={0}>
            <Text color={theme.faint}>{icons.file}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="truncate-middle">{f.name}</Text>
          </Box>
          <Box flexShrink={0} marginLeft={1}>
            <Text color={theme.dim}>{formatBytes(f.size)}</Text>
          </Box>
        </Box>
      ))}
      {offer.files.length > shown.length ? <Text color={theme.dim}>  … and {plural(offer.files.length - shown.length, 'more file')}</Text> : null}
      <Text> </Text>
      <Text wrap="truncate-end">
        <Text bold>{plural(offer.files.length, 'file')}</Text>
        <Text color={theme.dim}> · </Text>
        <Text bold>{formatBytes(offer.total)}</Text>
      </Text>
      <Text color={theme.dim} wrap="truncate-middle">
        to {tildify(dir)}
        {free !== null ? ` · ${formatBytes(free)} free` : ''}
      </Text>
      <Text> </Text>
      <Text color={theme.dim} wrap="truncate-end">
        <Text color={theme.accent}>enter</Text> accept · <Text color={theme.accent}>x</Text> decline
      </Text>
    </Box>
  );
}
