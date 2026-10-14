import { Box, Text } from 'ink';
import { formatId } from '../../core/identity.js';
import type { AppStore } from '../../core/store.js';
import { VERSION } from '../../core/version.js';
import { icons, theme } from '../theme.js';

/** Header: name and version on the left, own identity, address and friends online on the right. */
export function Header({ store, width }: { store: AppStore; width: number }) {
  const me = store.me;
  const online = store.onlineCount();
  const ip = me.ips[0] ? `${me.ips[0]}:${me.port}` : 'no network';
  const wide = width >= 72;
  return (
    <Box flexDirection="column" width={width}>
      <Box paddingX={1} width={width}>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">
            <Text backgroundColor={theme.accent} color="#1E1E1E" bold>
              {' termdrop '}
            </Text>
            <Text color={theme.faint}> v{VERSION}</Text>
            <Text>  </Text>
            <Text bold>{me.name}</Text>
            {wide ? (
              <>
                <Text color={theme.faint}> · </Text>
                <Text color={theme.dim}>{formatId(me.id)}</Text>
              </>
            ) : null}
          </Text>
        </Box>
        <Box flexShrink={0} marginLeft={1}>
          {store.updateAvailable ? (
            <>
              <Text color={theme.accent} bold>
                {wide ? `⬆ ${store.updateAvailable} available · /update` : '⬆ update'}
              </Text>
              <Text color={theme.faint}> · </Text>
            </>
          ) : null}
          {wide ? (
            <>
              <Text color={theme.dim}>{ip}</Text>
              <Text color={theme.faint}> · </Text>
            </>
          ) : null}
          <Text color={online ? theme.success : theme.faint}>{online ? icons.online : icons.offline}</Text>
          <Text color={theme.dim}>
            {' '}
            {online} {wide ? (online === 1 ? 'friend online' : 'friends online') : 'online'}
          </Text>
        </Box>
      </Box>
      <Text color={theme.faint}>{'─'.repeat(Math.max(0, width))}</Text>
    </Box>
  );
}
