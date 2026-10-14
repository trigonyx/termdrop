import { Box, Text, useApp, useInput } from 'ink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { registry } from '../commands/builtin.js';
import type { Paths } from '../core/paths.js';
import { AppStore, type StoreOptions } from '../core/store.js';
import { checkForUpdate } from '../core/update.js';
import { VERSION } from '../core/version.js';
import type { Inbox } from '../transfer/handoff.js';
import type { LocalFile } from '../transfer/local.js';
import { filesLabel } from '../transfer/units.js';
import type { Actions } from './actions.js';
import type { DialogSpec } from 'termcore/ui/components/Dialog';
import { Header } from 'termcore/ui/components/Header';
import { Panel } from 'termcore/ui/components/Panel';
import { useStoreVersion, useTerminalSize } from 'termcore/ui/hooks';
import { mouse } from 'termcore/ui/mouse';
import { Dashboard, type DashFocus } from './screens/Dashboard.js';
import { FilePicker } from './screens/FilePicker.js';
import { Onboarding } from 'termcore/ui/components/Onboarding';
import { LOGO_SMALL } from './components/Banner.js';
import { RecipientPicker } from './screens/RecipientPicker.js';
import { theme } from 'termcore/ui/theme';

type Phase = { name: 'onboarding' } | { name: 'starting' } | { name: 'ready'; store: AppStore } | { name: 'error'; message: string };

/** The send flow: files first, then who gets them. */
export interface Flow {
  step: 'files' | 'recipients';
  files: LocalFile[];
  notices: string[];
  to?: string;
}

export function Root({
  paths,
  options,
  inbox,
  notice,
}: {
  paths: Paths;
  options: Omit<StoreOptions, 'paths'>;
  inbox?: Inbox;
  /** shown once the app runs (e.g. that the profile moved to ~/.termhub) */
  notice?: string;
}) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState<Phase>(() => (AppStore.hasProfile(paths) ? { name: 'starting' } : { name: 'onboarding' }));
  const storeRef = useRef<AppStore | null>(null);
  const quitting = useRef(false);

  const quit = useCallback(() => {
    if (quitting.current) return;
    quitting.current = true;
    const store = storeRef.current;
    void (store ? store.stop() : Promise.resolve()).finally(() => exit());
  }, [exit]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') quit();
  });

  useEffect(() => {
    if (phase.name !== 'starting') return;
    let cancelled = false;
    (async () => {
      try {
        const store = new AppStore({ paths, ...options });
        await store.start();
        if (notice) store.showToast(notice, 'success');
        if (cancelled) return void store.stop();
        storeRef.current = store;
        setPhase({ name: 'ready', store });
      } catch (err) {
        setPhase({ name: 'error', message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.name]);

  // one spare row so Ink doesn't clear the whole screen on every render
  const height = Math.max(10, rows - 1);

  if (phase.name === 'onboarding') {
    return (
      <Onboarding
        logo={LOGO_SMALL}
        tagline="encrypted file sharing with friends on your network"
        width={columns}
        create={(name) => AppStore.createProfile(paths, name)}
        onDone={() => setPhase({ name: 'starting' })}
      />
    );
  }
  if (phase.name === 'starting') {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color={theme.dim}>Starting termdrop …</Text>
      </Box>
    );
  }
  if (phase.name === 'error') {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column">
        <Text color={theme.error} bold>
          termdrop could not start
        </Text>
        <Text>{phase.message}</Text>
        <Text color={theme.dim}>ctrl+c to quit</Text>
      </Box>
    );
  }
  return <Main store={phase.store} width={columns} height={height} rows={rows} quit={quit} inbox={inbox} />;
}

export function Main({
  store,
  width,
  height,
  rows,
  quit,
  inbox,
  initialFlow = null,
}: {
  store: AppStore;
  width: number;
  height: number;
  rows: number;
  quit(): void;
  inbox?: Inbox;
  initialFlow?: Flow | null;
}) {
  const version = useStoreVersion(store);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [flow, setFlow] = useState<Flow | null>(initialFlow);
  const [focus, setFocus] = useState<DashFocus>('list');
  const [transferKey, setTransferKey] = useState<string | null>(null);
  const seenRequest = useRef(0);

  // once per launch: is there a newer version on GitHub? (shown in the header)
  useEffect(() => {
    void checkForUpdate().then((v) => v && store.setUpdateAvailable(v));
  }, [store]);

  // terminal window focus (reported by the terminal) → desktop notifications while in background
  useEffect(() => {
    mouse.on('focus', (f) => store.setFocused(f));
    return () => void mouse.removeAllListeners('focus');
  }, [store]);

  // files from the command line or another shell (`termdrop <files>` while this one runs)
  useEffect(() => {
    if (!inbox) return;
    const drain = () => {
      for (let r = inbox.take(); r; r = inbox.take()) store.requestSend(r.paths, r.to, 'shell');
    };
    drain();
    inbox.on('request', drain);
    return () => void inbox.off('request', drain);
  }, [store, inbox]);

  // a new send request (shell, drop, /send): open the flow, or add to the one that's open
  useEffect(() => {
    const req = store.sendRequest;
    if (!req || req.seq === seenRequest.current) return;
    seenRequest.current = req.seq;
    const notices = req.rejected.map((r) => r.reason);
    setPanel(null);
    setFlow((cur) => {
      if (cur) {
        const known = new Set(cur.files.map((f) => f.path));
        const files = [...cur.files, ...req.files.filter((f) => !known.has(f.path))];
        const step = req.source === 'drop' || !files.length ? cur.step : 'recipients';
        return { ...cur, files, notices, step, ...(req.to ? { to: req.to } : {}) };
      }
      if (!req.files.length && req.source !== 'command') {
        if (notices[0]) store.showToast(notices.length > 1 ? `${notices[0]} (and ${notices.length - 1} more)` : notices[0], 'error');
        return null;
      }
      const step = req.source === 'shell' && req.files.length ? 'recipients' : req.recipients && req.files.length ? 'recipients' : 'files';
      return { step, files: req.files, notices, ...(req.to ? { to: req.to } : {}) };
    });
  }, [version, store]);

  const actions: Actions = useMemo(() => {
    const ask = <T,>(make: (resolve: (v: T) => void) => DialogSpec) =>
      new Promise<T>((resolve) =>
        setDialog(
          make((v) => {
            setDialog(null);
            resolve(v);
          }),
        ),
      );
    const a: Actions = {
      quit,
      confirm: (title) => ask<boolean>((resolve) => ({ kind: 'confirm', title, resolve })),
      prompt: (title, opts) => ask<string | null>((resolve) => ({ kind: 'prompt', title, hint: opts?.hint, initial: opts?.initial, resolve })),
      pick: (title, options, multi, opts) => ask<string[] | null>((resolve) => ({ kind: 'pick', title, options, multi, opts, resolve })),
      sendFiles: (paths, opts) => {
        if (paths?.length) store.requestSend(paths, opts?.to, opts?.recipients ? 'command' : 'drop', opts?.recipients);
        else {
          setPanel(null);
          setFlow({ step: 'files', files: [], notices: [], ...(opts?.to ? { to: opts.to } : {}) });
        }
      },
      print: (text, kind = 'info') => {
        if (text.includes('\n')) setPanel(text);
        else store.showToast(text.replace(/[`*]/g, ''), kind);
      },
      runCommand: async (input, selectedId) => {
        await registry.execute(input, {
          store,
          selectedId,
          ui: {
            print: (text, kind) => a.print(text, kind),
            quit: a.quit,
            confirm: a.confirm,
            pick: a.pick,
            sendFiles: a.sendFiles,
          },
        });
        setHistory((h) => (h[h.length - 1] === input ? h : [...h.slice(-99), input]));
      },
    };
    return a;
  }, [store, quit]);

  const send = (ids: string[]) => {
    if (!flow) return;
    try {
      const out = store.send(flow.files, ids);
      const names = out.map((t) => t.peerName);
      const who = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ');
      store.showToast(`Offered ${filesLabel(flow.files)} to ${who}`, 'success');
      setFlow(null);
      setFocus('transfers');
      setTransferKey(out[0]?.xid ?? null);
    } catch (err) {
      store.showToast((err as Error).message, 'error');
    }
  };

  const bodyHeight = height - 2;
  let body;
  if (flow?.step === 'files') {
    body = (
      <FilePicker
        store={store}
        width={width}
        height={bodyHeight}
        files={flow.files}
        notices={flow.notices}
        onChange={(files, notices) => setFlow((f) => (f ? { ...f, files, notices } : f))}
        onNext={() => setFlow((f) => (f && f.files.length ? { ...f, step: 'recipients', notices: [] } : f))}
        onCancel={() => setFlow(null)}
      />
    );
  } else if (flow?.step === 'recipients') {
    body = (
      <RecipientPicker
        store={store}
        width={width}
        height={bodyHeight}
        files={flow.files}
        to={flow.to}
        onSend={send}
        onEditFiles={() => setFlow((f) => (f ? { ...f, step: 'files' } : f))}
        onCancel={() => setFlow(null)}
      />
    );
  } else if (panel) {
    body = <Panel text={panel} width={width} height={bodyHeight} onClose={() => setPanel(null)} />;
  } else {
    body = (
      <Dashboard
        store={store}
        width={width}
        height={bodyHeight}
        rows={rows}
        actions={actions}
        dialog={dialog}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        history={history}
        focus={focus}
        onFocus={setFocus}
        transferKey={transferKey}
        onTransferKey={setTransferKey}
      />
    );
  }

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header
        app="termdrop"
        version={VERSION}
        width={width}
        me={store.me}
        address={store.me.ips[0] ? `${store.me.ips[0]}:${store.me.port}` : 'no network'}
        online={store.onlineCount()}
        updateAvailable={store.updateAvailable}
      />
      {body}
    </Box>
  );
}
