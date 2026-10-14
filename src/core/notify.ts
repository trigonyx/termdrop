import { execFile } from 'node:child_process';

// Text is passed as argv (not interpolated into the script), so peer-controlled
// content can't inject AppleScript.
const MAC_SCRIPT = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run';

/** Shows a desktop banner (macOS; Linux if notify-send exists). Fire-and-forget; failures are ignored. */
export function notify(title: string, body: string): void {
  const cmd =
    process.platform === 'darwin'
      ? (['osascript', ['-e', MAC_SCRIPT, title, body]] as const)
      : process.platform === 'linux'
        ? (['notify-send', ['--app-name=termdrop', '--', title, body]] as const)
        : null;
  if (!cmd) return;
  try {
    execFile(cmd[0], [...cmd[1]], () => {}).on('error', () => {});
  } catch {
    // no notifications available
  }
}
