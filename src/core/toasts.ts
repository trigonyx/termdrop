export type NoteKind = 'info' | 'success' | 'error';

export interface Toast {
  text: string;
  kind: NoteKind;
}

const TOAST_MS = 4000;

/** The one-line notification in the footer: shown for a few seconds, the newest wins. */
export class Toasts {
  current: Toast | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly changed: () => void,
    private readonly ms = TOAST_MS,
  ) {}

  show(text: string, kind: NoteKind = 'info'): void {
    this.current = { text, kind };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.current = null;
      this.changed();
    }, this.ms);
    this.timer.unref();
    this.changed();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
