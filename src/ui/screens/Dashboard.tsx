import fs from 'node:fs';
import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { DiscoveredPeer } from '../../core/discovery.js';
import type { AppStore, FriendView, RequestEntry } from '../../core/store.js';
import { resolvePastedPaths } from '../../transfer/paste.js';
import { filesLabel, formatBytes, plural } from '../../transfer/units.js';
import type { Actions } from '../actions.js';
import { Banner, bannerCompact, bannerHeight } from '../components/Banner.js';
import { CommandMenu, menuHeight } from '../components/CommandMenu.js';
import { Dialog, dialogHeight, type DialogSpec } from '../components/Dialog.js';
import { Footer } from '../components/Footer.js';
import { InputBox, inputBoxHeight } from '../components/InputBox.js';
import { OfferDetail, offerDetailHeight } from '../components/OfferDetail.js';
import { itemKey, TransferList, transferItems, transferPanelHeight, type TransferItem } from '../components/TransferList.js';
import { cleanPaste, edit, emptyEditor, type EditorState } from '../editor.js';
import { usePaste, useWheel } from '../mouse.js';
import { openPath, revealPath } from '../open.js';
import { icons, theme } from '../theme.js';
import { useCommandInput } from './useCommandInput.js';

type Entry =
  | { type: 'banner'; key: string }
  | { type: 'request'; key: string; request: RequestEntry }
  | { type: 'friend'; key: string; friend: FriendView }
  | { type: 'nearby'; key: string; peer: DiscoveredPeer };

type Line = { kind: 'section'; title: string } | { kind: 'gap' } | { kind: 'entry'; entry: Entry; index: number };

export type DashFocus = 'list' | 'transfers';

interface Props {
  store: AppStore;
  width: number;
  height: number;
  rows: number;
  actions: Actions;
  dialog: DialogSpec | null;
  selectedKey: string | null;
  onSelect(key: string | null): void;
  history: string[];
  focus: DashFocus;
  onFocus(f: DashFocus): void;
  transferKey: string | null;
  onTransferKey(key: string | null): void;
}

/** Side-by-side list and panel from this width on; below it they're stacked. */
const SIDE_BY_SIDE = 84;
const PANEL_WIDTH = 40;

const exists = (p: string) => {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
};

function friendStatus(f: FriendView): { icon: string; color: string; text: string } {
  switch (f.state) {
    case 'outgoing':
      return { icon: icons.pending, color: theme.faint, text: 'request sent' };
    case 'declined':
      return { icon: icons.error, color: theme.faint, text: 'declined your request' };
    case 'blocked':
      return { icon: icons.error, color: theme.error, text: 'blocked' };
    default:
      if (f.online && f.busy) return { icon: icons.online, color: theme.accent, text: 'transferring' };
      if (f.away) return { icon: icons.away, color: theme.warning, text: 'away' };
      if (f.online) return { icon: icons.online, color: theme.success, text: 'online' };
      return { icon: icons.offline, color: theme.faint, text: 'offline' };
  }
}

export function Dashboard(props: Props) {
  const { store, width, height, rows, actions, dialog, selectedKey, onSelect, history, focus, onFocus, transferKey, onTransferKey } = props;
  const data = store.dashboard();
  const sections = {
    banner: [{ type: 'banner', key: 'banner' } as Entry],
    requests: data.requests.map(
      (r): Entry => ({ type: 'request', key: r.kind === 'offer' ? `o:${r.offer.xid}` : `r:${r.friend.id}`, request: r }),
    ),
    friends: data.friends.map((f): Entry => ({ type: 'friend', key: `f:${f.id}`, friend: f })),
    nearby: data.nearby.map((p): Entry => ({ type: 'nearby', key: `n:${p.id}`, peer: p })),
  };
  const entries: Entry[] = Object.values(sections).flat();
  let selected = entries.findIndex((e) => e.key === selectedKey);
  // nothing picked (yet, or it's gone): an open request first, so enter answers it – else the banner
  if (selected === -1) selected = sections.requests.length ? 1 : 0;
  const current = entries[selected];
  const currentOffer = current?.type === 'request' && current.request.kind === 'offer' ? current.request.offer : null;

  // a new incoming offer gets selected, so enter accepts it (offers are what people react to right away)
  const newestOffer = data.requests.find((r) => r.kind === 'offer');
  const newestKey = newestOffer?.kind === 'offer' ? `o:${newestOffer.offer.xid}` : null;
  const seenOffer = useRef<string | null>(null);
  useEffect(() => {
    if (newestKey && newestKey !== seenOffer.current && !dialog) {
      onSelect(newestKey);
      onFocus('list');
    }
    seenOffer.current = newestKey;
  }, [newestKey]);

  const items = transferItems(store);
  const tFocus = focus === 'transfers' && items.length > 0;
  let tSel = items.findIndex((i) => itemKey(i) === transferKey);
  if (tSel === -1) tSel = 0;
  const currentItem: TransferItem | undefined = tFocus ? items[tSel] : undefined;

  const [commandMode, setCommandMode] = useState(false);
  // set synchronously so characters typed right after "/" are not lost
  const commandRef = useRef(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const closeCommand = () => {
    commandRef.current = false;
    setCommandMode(false);
    setEditor(emptyEditor);
  };
  const selectedId = current?.type === 'friend' ? current.friend.id : null;
  const cmd = useCommandInput({
    editor,
    setEditor,
    onSubmit: async (value) => {
      closeCommand();
      if (value.trim()) await actions.runCommand(value.trim(), selectedId);
    },
    onEscape: closeCommand,
  });

  /** Runs an action and turns errors into a toast instead of crashing. */
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      store.showToast((err as Error).message, 'error');
    }
  };

  /** Files dropped onto the window: straight to the file picker. */
  const onDrop = (text: string): boolean => {
    const paths = resolvePastedPaths(text, exists);
    if (!paths) return false;
    actions.sendFiles(paths);
    return true;
  };
  const idle = !dialog && !commandMode;
  usePaste(onDrop, idle);

  const activate = (e: Entry | undefined) => {
    if (!e) return;
    if (e.type === 'banner') return actions.sendFiles();
    if (e.type === 'request') {
      const r = e.request;
      if (r.kind === 'offer') return attempt(() => store.transfers.accept(r.offer.xid));
      const id = r.friend.id;
      attempt(() => store.accept(id));
      return onSelect(`f:${id}`);
    }
    if (e.type === 'nearby') return attempt(() => store.requestNearby(e.peer.id));
    const f = e.friend;
    if (f.state === 'accepted') {
      if (!f.online) return store.showToast(`${f.display} is offline`, 'error');
      return actions.sendFiles(undefined, { to: f.id });
    }
    if (f.state === 'declined') return attempt(() => store.request(f.id));
    if (f.state === 'blocked') return store.showToast(`${f.display} is blocked – /unblock to undo`, 'info');
    store.showToast(`Waiting for ${f.display} to accept your friend request`, 'info');
  };

  /** enter / o on a transfer: open the received file, or show it (or the sent one) in Finder. */
  const openItem = (item: TransferItem | undefined, reveal: boolean) => {
    if (!item) return;
    const saved = item.kind === 'done' ? item.e.saved : item.t.saved;
    const local = item.kind === 'done' ? item.e.paths : item.t.paths;
    const files = saved?.length ? saved : local;
    if (!files?.length) return store.showToast(item.kind === 'live' ? 'Still running – nothing to open yet' : 'No files to show', 'info');
    const first = files[0]!;
    // one received file opens; several (or what we sent) are shown in Finder
    const show = reveal || files.length > 1 || !saved?.length;
    void (show ? revealPath(first) : openPath(first)).then((ok) => {
      if (!ok) store.showToast("Couldn't open it – the file may have been moved", 'error');
    });
  };

  useWheel(
    (dir) => {
      if (tFocus) {
        const next = Math.max(0, Math.min(items.length - 1, tSel + dir));
        return onTransferKey(itemKey(items[next]!));
      }
      const next = Math.max(0, Math.min(entries.length - 1, selected + dir));
      if (next !== selected) onSelect(entries[next]!.key);
    },
    idle,
  );

  useInput(
    (input, key) => {
      if (commandRef.current) {
        // input isn't active yet – forward characters to it
        const text = cleanPaste(input);
        if (text && !key.ctrl && !key.meta) setEditor((e) => edit.insert(e, text));
        return;
      }
      // a drop in a terminal without bracketed paste arrives as one long "key"
      if (input.length > 1 && onDrop(input)) return;
      if (key.tab) {
        if (focus === 'transfers' || !items.length) return onFocus('list');
        onFocus('transfers');
        if (!items.some((i) => itemKey(i) === transferKey)) onTransferKey(itemKey(items[0]!));
        return;
      }
      if (input.startsWith('/')) {
        commandRef.current = true;
        setCommandMode(true);
        setEditor({ value: input, cursor: input.length });
        return;
      }
      if (input === '?') return void actions.runCommand('/help', null);
      if (input === 'q') return void actions.runCommand('/quit', null);
      if (input === 'a') {
        void actions.prompt('Add a friend by IP', { hint: 'e.g. 192.168.1.20 or 192.168.1.20:5054' }).then((v) => {
          if (v) void actions.runCommand(`/add ${v}`, null);
        });
        return;
      }

      if (tFocus) {
        const moveT = (d: number) => onTransferKey(itemKey(items[Math.max(0, Math.min(items.length - 1, tSel + d))]!));
        if (key.escape) return onFocus('list');
        if (key.upArrow || input === 'k') return moveT(-1);
        if (key.downArrow || input === 'j') return moveT(1);
        if (key.return) return openItem(currentItem, false);
        if (input === 'o') return openItem(currentItem, true);
        if (input === 'c' && currentItem?.kind === 'live') {
          const t = currentItem.t;
          const what = `${filesLabel(t.files)} ${t.dir === 'out' ? 'to' : 'from'} ${t.peerName}`;
          void actions.confirm(t.status === 'waiting' ? `Withdraw the offer of ${what}?` : `Cancel ${what}?`).then((ok) => {
            if (ok) store.transfers.cancel(t.xid);
          });
        }
        return;
      }

      const move = (d: number) => {
        const next = Math.max(0, Math.min(entries.length - 1, selected + d));
        if (next !== selected) onSelect(entries[next]!.key);
      };
      if (key.upArrow || input === 'k') return move(-1);
      if (key.downArrow || input === 'j') return move(1);
      if (key.pageUp) return move(-10);
      if (key.pageDown) return move(10);
      if (key.return) return activate(current);
      if (input === 'x' && current?.type === 'request') {
        const r = current.request;
        attempt(() => (r.kind === 'offer' ? store.transfers.decline(r.offer.xid) : store.decline(r.friend.id)));
        return;
      }
      if (input === 't' && current?.type === 'friend') {
        const f = current.friend;
        if (f.state !== 'accepted') return store.showToast('Only friends can be trusted', 'info');
        return attempt(() => store.setTrusted(f.id, !f.trusted));
      }
      if (input === 'r' && current?.type === 'friend') {
        const f = current.friend;
        void actions
          .prompt(`Nickname for ${f.name}`, { hint: "Leave empty to use the person's own name", initial: f.alias })
          .then((v) => {
            if (v !== null) store.rename(f.id, v);
          });
        return;
      }
      if (input === 'd' && current?.type === 'friend') {
        const f = current.friend;
        void actions.confirm(`Remove ${f.display} as a friend?`).then((ok) => ok && store.removeFriend(f.id));
      }
    },
    { isActive: idle },
  );

  // ── Layout ──
  const compact = bannerCompact(width, rows);
  const banner = bannerHeight(compact);
  const bottom = dialog ? dialogHeight(dialog) : commandMode ? inputBoxHeight(editor, width) + menuHeight(cmd.items.length) : 0;
  const side = width >= SIDE_BY_SIDE;
  const mainHeight = Math.max(3, height - banner - bottom - 1);
  const panelWidth = side ? PANEL_WIDTH : width;
  // the panel: an offer's details while one is selected, else the transfers
  let panelRows: number;
  let panelCompact = false;
  let offerFiles = 0;
  if (currentOffer) {
    offerFiles = Math.max(1, Math.min(currentOffer.files.length, (side ? mainHeight : Math.floor(mainHeight / 2)) - offerDetailHeight(currentOffer, 0)));
    panelRows = offerDetailHeight(currentOffer, offerFiles);
  } else {
    panelCompact = !side || mainHeight < transferPanelHeight(items, false);
    panelRows = transferPanelHeight(items, panelCompact);
  }
  // stacked: the panel only shows if the list still gets a few rows
  const showPanel = side ? mainHeight >= Math.min(panelRows, 5) : mainHeight - panelRows >= 4;
  const listHeight = Math.max(2, mainHeight - (showPanel && !side ? panelRows : 0));
  const listWidth = side ? width - PANEL_WIDTH - 1 : width;
  const inner = listWidth - 2;

  const lines: Line[] = [];
  const section = (title: string, list: Entry[], showEmpty = false) => {
    if (!list.length && !showEmpty) return;
    if (lines.length) lines.push({ kind: 'gap' });
    lines.push({ kind: 'section', title });
    for (const e of list) lines.push({ kind: 'entry', entry: e, index: entries.indexOf(e) });
  };
  section(`Requests · ${data.requests.length}`, sections.requests);
  const online = data.friends.filter((f) => f.state === 'accepted' && f.online).length;
  section(data.friends.length ? `Friends · ${online} online` : 'Friends', sections.friends, true);
  const scanning = store.me.scanning;
  section(scanning ? 'Nearby · searching the network …' : 'Nearby', sections.nearby, scanning);

  const selLine = lines.findIndex((l) => l.kind === 'entry' && l.index === selected);
  const start = Math.max(0, Math.min(selLine - Math.floor(listHeight / 2), lines.length - listHeight));
  const visible = lines.slice(start, start + listHeight);

  const hints = (() => {
    if (tFocus) {
      const base = ['↑↓ select'];
      if (currentItem?.kind === 'live') base.push('c cancel');
      else base.push('enter open', 'o show in Finder');
      return [...base, 'tab back to friends', 'q quit'];
    }
    const base = ['↑↓ select'];
    if (!current || current.type === 'banner') base.push('enter send files');
    else if (current.type === 'request') base.push('enter accept', 'x decline');
    else if (current.type === 'nearby') base.push('enter add friend');
    else {
      if (current.friend.state === 'accepted') base.push('enter send', current.friend.trusted ? 't untrust' : 't trust');
      base.push('r rename', 'd remove');
    }
    if (items.length) base.push('tab transfers');
    return [...base, 'a add by IP', '/ commands', '? help', 'q quit'];
  })();

  const empty = data.friends.length === 0 && data.requests.length === 0;
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Banner width={width} compact={compact} selected={!tFocus && current?.type === 'banner'} animate={store.isFocused && idle} />
      <Box flexDirection={side ? 'row' : 'column'} height={mainHeight} width={width} alignItems="flex-start" overflow="hidden">
        <Box flexDirection="column" height={listHeight} width={listWidth} paddingX={1} overflow="hidden" flexShrink={0}>
          {visible.map((l, i) => {
            if (l.kind === 'gap') return <Text key={`g${i}`}> </Text>;
            if (l.kind === 'section') {
              return (
                <Text key={`s${i}`} color={theme.dim} bold>
                  {l.title.toUpperCase()}
                </Text>
              );
            }
            return <Row key={l.entry.key} entry={l.entry} selected={!tFocus && l.index === selected} width={inner} />;
          })}
          {empty && listHeight - visible.length >= 3 ? <EmptyHint store={store} width={inner} /> : null}
        </Box>
        {showPanel ? (
          <Box marginLeft={side ? 1 : 0} flexShrink={0} height={side ? mainHeight : panelRows} overflow="hidden" alignItems="flex-start">
            {currentOffer && !tFocus ? (
              <OfferDetail store={store} offer={currentOffer} width={panelWidth} maxFiles={offerFiles} />
            ) : (
              <TransferList
                store={store}
                items={items}
                width={panelWidth}
                compact={panelCompact}
                selected={currentItem ? itemKey(currentItem) : null}
                focused={tFocus}
              />
            )}
          </Box>
        ) : null}
      </Box>
      {dialog ? (
        <Dialog spec={dialog} width={width} />
      ) : commandMode ? (
        <>
          <InputBox
            state={editor}
            onChange={setEditor}
            onSubmit={cmd.submit}
            onKey={cmd.onKey}
            isActive
            width={width}
            history={history}
            borderColor={theme.accent}
            singleLine
          />
          <CommandMenu items={cmd.items} selected={cmd.selected} width={width} />
        </>
      ) : null}
      <Footer hints={commandMode ? ['enter run', 'tab complete', 'esc cancel'] : hints} toast={store.toast} width={width} />
    </Box>
  );
}

function Pointer({ selected }: { selected: boolean }) {
  return (
    <Box width={2} flexShrink={0}>
      <Text color={theme.accent}>{selected ? icons.pointer : ' '}</Text>
    </Box>
  );
}

function Row({ entry, selected, width }: { entry: Entry; selected: boolean; width: number }) {
  const nameWidth = Math.min(20, Math.max(10, Math.floor(width * 0.3)));
  const name = (text: string, extra?: string) => (
    <Box width={nameWidth} flexShrink={0}>
      <Text bold={selected} color={selected ? theme.accent : undefined} wrap="truncate-end">
        {text}
      </Text>
      {extra ? <Text color={theme.warning}>{extra}</Text> : null}
    </Box>
  );
  const dot = (icon: string, color: string) => (
    <Box width={2} flexShrink={0}>
      <Text color={color}>{icon}</Text>
    </Box>
  );

  if (entry.type === 'banner') return null;
  if (entry.type === 'nearby') {
    const p = entry.peer;
    return (
      <Box>
        <Pointer selected={selected} />
        {dot(icons.online, theme.success)}
        {name(p.name)}
        <Text color={theme.dim} wrap="truncate-end">
          on your network · {p.ip}
        </Text>
      </Box>
    );
  }
  if (entry.type === 'request') {
    const r = entry.request;
    const who = r.kind === 'offer' ? r.offer.peerName : r.friend.display;
    const text = r.kind === 'offer' ? `wants to send ${plural(r.offer.files.length, 'file')} · ${formatBytes(r.offer.total)}` : 'wants to be friends';
    return (
      <Box>
        <Pointer selected={selected} />
        {dot(icons.request, theme.accent)}
        {name(who)}
        <Text wrap="truncate-end">{text}</Text>
      </Box>
    );
  }
  const f = entry.friend;
  const st = friendStatus(f);
  return (
    <Box>
      <Pointer selected={selected} />
      {dot(st.icon, st.color)}
      <Box width={nameWidth} flexShrink={0}>
        <Text bold={selected} color={selected ? theme.accent : undefined} wrap="truncate-end">
          {f.display}
        </Text>
        {f.trusted && f.state === 'accepted' ? <Text color={theme.warning}> {icons.star}</Text> : null}
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text color={f.state === 'accepted' && f.online ? st.color : theme.dim} italic={f.state !== 'accepted'} wrap="truncate-end">
          {st.text}
        </Text>
      </Box>
    </Box>
  );
}

function EmptyHint({ store, width }: { store: AppStore; width: number }) {
  const me = store.me;
  const addr = me.ips.length ? me.ips.map((ip) => `${ip}:${me.port}`).join(', ') : 'no network';
  return (
    <Box paddingLeft={2} width={width}>
      <Text color={theme.dim} wrap="wrap">
        Other termdrop users on your network show up under "Nearby" – press enter to send them a friend request. Not
        showing up? Press <Text color={theme.accent}>a</Text> and enter their IP. Yours:{' '}
        <Text color={theme.accent}>{addr}</Text>
      </Text>
    </Box>
  );
}
