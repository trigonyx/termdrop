import { useStdout } from 'ink';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AppStore } from '../core/store.js';

export function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const read = () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return size;
}

/** Re-renders whenever anything in the store changes. */
export function useStoreVersion(store: AppStore): number {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}
