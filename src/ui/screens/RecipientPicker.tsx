import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import type { AppStore } from '../../core/store.js';
import type { LocalFile } from '../../transfer/local.js';
import { filesLabel, formatBytes, plural } from '../../transfer/units.js';
import { Footer } from '../components/Footer.js';
import { useWheel } from '../mouse.js';
import { icons, theme } from '../theme.js';

interface Props {
  store: AppStore;
  width: number;
  height: number;
  files: LocalFile[];
  /** preselect this friend (`--to`) as soon as they're online */
  to?: string;
  onSend(ids: string[]): void;
  /** back to the file list */
  onEditFiles(): void;
  onCancel(): void;
}

/**
 * Step 2 of sending: who gets the files. Lists the friends online right now and keeps up as
 * they come and go (at launch they connect one by one); several can be ticked.
 */
export function RecipientPicker({ store, width, height, files, to, onSend, onEditFiles, onCancel }: Props) {
  const friends = store.onlineFriends();
  const [cursor, setCursor] = useState(0);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [preselected, setPreselected] = useState(false);
  const sel = Math.min(cursor, Math.max(0, friends.length - 1));
  const offline = store.dashboard().friends.filter((f) => f.state === 'accepted' && !f.online).length;

  // --to Bob: tick and select Bob once he's online (he may connect a moment after launch)
  const target = to && !preselected ? store.findFriend(to) : null;
  useEffect(() => {
    if (!target?.online) return;
    setPreselected(true);
    setChosen((s) => new Set(s).add(target.id));
    const i = friends.findIndex((f) => f.id === target.id);
    if (i >= 0) setCursor(i);
  }, [target?.id, target?.online]);

  useWheel((dir) => setCursor((c) => Math.max(0, Math.min(friends.length - 1, c + dir))));

  useInput((input, key) => {
    if (key.escape) return onCancel();
    if (key.upArrow || input === 'k') return setCursor((sel - 1 + friends.length) % Math.max(1, friends.length));
    if (key.downArrow || input === 'j') return setCursor((sel + 1) % Math.max(1, friends.length));
    if (input === 'f' || key.tab) return onEditFiles();
    const current = friends[sel];
    if (input === ' ' && current) {
      setChosen((s) => {
        const next = new Set(s);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
      return;
    }
    if (input === 'a') {
      setChosen(new Set(friends.map((f) => f.id)));
      return;
    }
    if (key.return) {
      const ids = friends.filter((f) => chosen.has(f.id)).map((f) => f.id);
      // nothing ticked → the highlighted one, like most pickers
      if (ids.length) onSend(ids);
      else if (current) onSend([current.id]);
    }
  });

  const ticked = friends.filter((f) => chosen.has(f.id));
  const listRows = Math.max(3, height - 2 - 2 - 2 - 1);
  const start = Math.max(0, Math.min(sel - listRows + 1, friends.length - listRows));
  const visible = friends.slice(start, start + listRows);
  const total = files.reduce((n, f) => n + f.size, 0);
  const waitingFor = to && !preselected ? to : null;

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box paddingX={1} width={width}>
        <Text color={theme.dim} bold>
          SEND TO
        </Text>
        <Text color={theme.dim} wrap="truncate-end">
          {' '}
          · {filesLabel(files)} · {formatBytes(total)}
          {ticked.length ? ` · ${ticked.length} selected` : ''}
        </Text>
      </Box>
      <Text> </Text>
      <Box flexDirection="column" height={listRows} paddingX={1} overflow="hidden">
        {friends.length === 0 ? (
          <>
            <Text color={theme.dim} wrap="wrap">
              {icons.pending} No friends online right now
              {offline ? ` (${plural(offline, 'friend')} offline)` : ''}. They show up here as soon as they connect.
            </Text>
            <Text color={theme.faint} wrap="wrap">
              New friends: press esc, pick someone under Nearby, or press a and enter their IP.
            </Text>
          </>
        ) : (
          visible.map((f, i) => {
            const active = start + i === sel;
            const on = chosen.has(f.id);
            return (
              <Box key={f.id}>
                <Text color={theme.accent}>{active ? `${icons.pointer} ` : '  '}</Text>
                <Text color={on ? theme.success : theme.dim}>{on ? '[x] ' : '[ ] '}</Text>
                <Text color={theme.success}>{icons.online} </Text>
                <Text bold={active} color={active ? theme.accent : undefined} wrap="truncate-end">
                  {f.display}
                </Text>
                {f.trusted ? <Text color={theme.warning}> {icons.star}</Text> : null}
                {f.away ? <Text color={theme.faint}> · away</Text> : null}
              </Box>
            );
          })
        )}
      </Box>
      <Text> </Text>
      <Box paddingX={1}>
        <Text color={theme.dim} wrap="truncate-end">
          {waitingFor
            ? `Waiting for ${waitingFor} to come online …`
            : ticked.length
              ? `enter sends to ${ticked.map((f) => f.display).join(', ')}`
              : friends[sel]
                ? `enter sends to ${friends[sel]!.display} – space ticks more`
                : ''}
        </Text>
      </Box>
      <Text> </Text>
      <Footer hints={['enter send', 'space select', 'a all', '↑↓ move', 'f edit files', 'esc cancel']} toast={store.toast} width={width} />
    </Box>
  );
}
