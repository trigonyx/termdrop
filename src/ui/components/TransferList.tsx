import { Box, Text } from 'ink';
import type { AppStore } from '../../core/store.js';
import type { HistoryEntry } from '../../transfer/history.js';
import { secondsLeft, type Transfer } from '../../transfer/session.js';
import { filesLabel, formatBytes, formatEta, formatSpeed } from '../../transfer/units.js';
import { icons, theme } from '../theme.js';

/** One row of the panel: a transfer of this session that's still open, or a finished one. */
export type TransferItem = { kind: 'live'; t: Transfer } | { kind: 'done'; e: HistoryEntry };

export const itemKey = (i: TransferItem) => (i.kind === 'live' ? i.t.xid : i.e.xid);

const RECENT = 5;

/** What the panel lists: open transfers first, then the latest finished ones. */
export function transferItems(store: AppStore, recent = RECENT): TransferItem[] {
  const live = store.transfers.open().map((t): TransferItem => ({ kind: 'live', t }));
  const done = store.history.recent(recent).map((e): TransferItem => ({ kind: 'done', e }));
  return [...live, ...done];
}

/** Rows one item takes (a running transfer gets a second line for its bar). */
const itemRows = (i: TransferItem) => (i.kind === 'live' && (i.t.status === 'active' || i.t.status === 'connecting') ? 2 : 1);

/** Rows the panel takes, border included (for the layout math). */
export function transferPanelHeight(items: TransferItem[], compact: boolean): number {
  const live = items.filter((i) => i.kind === 'live');
  const done = items.filter((i) => i.kind === 'done');
  const shownDone = compact ? done.slice(0, 2) : done;
  let rows = 2 + 1; // border + title
  rows += live.length ? live.reduce((n, i) => n + itemRows(i), 0) : 1;
  if (shownDone.length) rows += 1 + 1 + shownDone.length; // gap + title + rows
  if (!compact) rows += 2; // gap + totals
  return rows;
}

const Title = ({ children }: { children: string }) => (
  <Text color={theme.dim} bold>
    {children.toUpperCase()}
  </Text>
);

/** ━━━━━━━──── in the accent color (green when done, red when failed). */
export function Bar({ fill, width, color }: { fill: number; width: number; color: string }) {
  const w = Math.max(4, width);
  const full = Math.round(Math.max(0, Math.min(1, fill)) * w);
  return (
    <Text>
      <Text color={color}>{'━'.repeat(full)}</Text>
      <Text color={theme.faint}>{'─'.repeat(w - full)}</Text>
    </Text>
  );
}

export const RESULT_LABEL: Record<HistoryEntry['result'], string> = {
  done: 'done',
  declined: 'declined',
  cancelled: 'cancelled',
  failed: 'failed',
  expired: 'expired',
};

function Cell({ children, color }: { children: string; color: string }) {
  return (
    <Box width={2} flexShrink={0}>
      <Text color={color}>{children}</Text>
    </Box>
  );
}

const Arrow = ({ dir }: { dir: 'in' | 'out' }) => <Cell color={dir === 'out' ? theme.accent : theme.peer}>{dir === 'out' ? icons.up : icons.down}</Cell>;
const Pointer = ({ on }: { on: boolean }) => <Cell color={theme.accent}>{on ? icons.pointer : ' '}</Cell>;

/** A running or waiting transfer. */
function LiveRow({ t, width, selected }: { t: Transfer; width: number; selected: boolean }) {
  const nameW = Math.min(12, Math.max(6, Math.floor(width * 0.28)));
  const head = (
    <Box width={width}>
      <Pointer on={selected} />
      <Arrow dir={t.dir} />
      <Box width={nameW} flexShrink={0}>
        <Text bold={selected} color={selected ? theme.accent : undefined} wrap="truncate-end">
          {t.peerName}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0} marginLeft={1}>
        <Text wrap="truncate-middle">{filesLabel(t.files)}</Text>
      </Box>
      {t.status === 'waiting' ? (
        <Box flexShrink={0} marginLeft={1}>
          <Text color={theme.warning}>
            {icons.pending} waiting
          </Text>
        </Box>
      ) : null}
    </Box>
  );
  if (t.status !== 'active' && t.status !== 'connecting') return head;
  const fill = t.total ? t.bytes / t.total : 1;
  const pct = `${Math.floor(fill * 100)}%`;
  const info = t.status === 'connecting' ? 'connecting …' : t.speed > 0 ? `${formatSpeed(t.speed)} · ${formatEta(secondsLeft(t))}` : 'starting …';
  // the bar gets what the numbers leave, between 6 and 16 columns
  const barW = Math.max(6, Math.min(16, width - 4 - 5 - Math.min(info.length, 24) - 1));
  return (
    <Box flexDirection="column" width={width}>
      {head}
      <Box width={width} paddingLeft={4}>
        <Box flexShrink={0}>
          <Bar fill={fill} width={barW} color={theme.accent} />
        </Box>
        <Box width={5} flexShrink={0} justifyContent="flex-end">
          <Text>{pct}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} marginLeft={1}>
          <Text color={theme.dim} wrap="truncate-end">
            {info}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function DoneRow({ e, width, selected }: { e: HistoryEntry; width: number; selected: boolean }) {
  const ok = e.result === 'done';
  const nameW = Math.min(12, Math.max(6, Math.floor(width * 0.28)));
  const right = ok ? formatBytes(e.total) : RESULT_LABEL[e.result];
  return (
    <Box width={width}>
      <Pointer on={selected} />
      <Cell color={ok ? theme.success : theme.error}>{ok ? icons.done : icons.error}</Cell>
      <Arrow dir={e.dir} />
      <Box width={nameW} flexShrink={0}>
        <Text bold={selected} color={selected ? theme.accent : undefined} wrap="truncate-end">
          {e.peerName}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0} marginLeft={1}>
        <Text color={theme.dim} wrap="truncate-middle">
          {filesLabel(e.files)}
        </Text>
      </Box>
      <Box flexShrink={0} marginLeft={1}>
        <Text color={ok ? theme.dim : theme.error}>{right}</Text>
      </Box>
    </Box>
  );
}

/**
 * Right of the list (below it when narrow): transfers that run or wait, the latest finished
 * ones, and what went over in total. `tab` focuses it for c / enter / o.
 */
export function TransferList({
  store,
  items,
  width,
  compact,
  selected,
  focused,
}: {
  store: AppStore;
  items: TransferItem[];
  width: number;
  compact: boolean;
  /** key of the selected item, when the panel has the focus */
  selected: string | null;
  focused: boolean;
}) {
  const inner = width - 4;
  const live = items.filter((i): i is Extract<TransferItem, { kind: 'live' }> => i.kind === 'live');
  const done = items.filter((i): i is Extract<TransferItem, { kind: 'done' }> => i.kind === 'done');
  const shownDone = compact ? done.slice(0, 2) : done;
  const totals = store.totals();
  const sel = (key: string) => focused && selected === key;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={focused ? theme.accent : theme.border} paddingX={1} width={width} flexShrink={0}>
      <Title>{live.length ? `Transfers · ${live.length}` : 'Transfers'}</Title>
      {live.length ? (
        live.map((i) => <LiveRow key={i.t.xid} t={i.t} width={inner} selected={sel(i.t.xid)} />)
      ) : (
        <Text color={theme.faint} wrap="truncate-end">
          Nothing running right now.
        </Text>
      )}
      {shownDone.length ? (
        <>
          <Text> </Text>
          <Title>Recent</Title>
          {shownDone.map((i) => (
            <DoneRow key={i.e.xid} e={i.e} width={inner} selected={sel(i.e.xid)} />
          ))}
        </>
      ) : null}
      {!compact ? (
        <>
          <Text> </Text>
          <Text color={theme.dim} wrap="truncate-end">
            {icons.up} {formatBytes(totals.sentBytes)} sent · {icons.down} {formatBytes(totals.receivedBytes)} received
          </Text>
        </>
      ) : null}
    </Box>
  );
}
