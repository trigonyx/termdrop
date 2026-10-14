# termdrop

AirDrop for the terminal: send files to friends on your local network, end-to-end encrypted, with progress bars.
No server, no account, no cloud: friends on the same Wi-Fi show up automatically, and you drag a file into the window.

```
 termdrop  v1.0.0  Alice · NMBU-CRR4                       192.168.1.20:5054 · ● 2 friends online
──────────────────────────────────────────────────────────────────────────────────────────────────
            ████████╗███████╗██████╗ ███╗   ███╗██████╗ ██████╗  ██████╗ ██████╗
            ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔══██╗██╔══██╗██╔═══██╗██╔══██╗
               ██║   █████╗  ██████╔╝██╔████╔██║██║  ██║██████╔╝██║   ██║██████╔╝
               ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║  ██║██╔══██╗██║   ██║██╔═══╝
               ██║   ███████╗██║  ██║██║ ╚═╝ ██║██████╔╝██║  ██║╚██████╔╝██║
               ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝

                                    ▶ Send files  enter
                                or drag files into this window

 REQUESTS · 1                                           ╭──────────────────────────────────────╮
 ❯ ◆ Carl             wants to send 3 files · 48.2 MB   │ TRANSFERS · 1                        │
                                                        │   ↑ Bob        holiday.mov           │
 FRIENDS · 2 ONLINE                                     │     ━━━━━━━━───  62% 12.4 MB/s · ~5s │
   ● Bob ★            transferring                      │                                      │
   ● Carl             online                            │ RECENT                               │
   ○ Dana             offline                           │   ✓ ↓ Dana     report.pdf     2.1 MB │
                                                        │   ✗ ↑ Carl     3 files      declined │
 NEARBY                                                 │                                      │
   ● Eve              on your network · 192.168.1.31    │ ↑ 1.2 GB sent · ↓ 340 MB received    │
                                                        ╰──────────────────────────────────────╯
```

## Installation

Requires [Node.js](https://nodejs.org) 22 or newer.

```sh
npm i -g https://github.com/trigonyx/termdrop/tarball/main
termdrop
```

### Updating

termdrop checks for a new version every time it starts. If there is one, the header shows
`⬆ 1.2.0 available · /update`. Update in whichever way is handiest:

- inside termdrop: `/update` (installs it and offers to restart)
- in a terminal: `termdrop update`
- or the install command again: `npm i -g https://github.com/trigonyx/termdrop/tarball/main`

Your profile, friends and transfer history live in `~/.termdrop` and are kept across updates.

Updates never need `sudo`. If Node came from the nodejs.org installer, npm's global folder belongs to root, so
`/update` and `termdrop update` install the new version into `~/.termdrop/app` instead, and the `termdrop`
command always starts the newest version it finds.

Only the first install may need `sudo` on such a setup: if npm says `EACCES`, use `sudo npm i -g https://github.com/trigonyx/termdrop/tarball/main`,
or install Node via a version manager such as [nvm](https://github.com/nvm-sh/nvm), [fnm](https://github.com/Schniz/fnm) or Homebrew.

## How it works

- **First launch:** you pick a name. termdrop generates a key pair, and your ID comes from it (e.g. `NMBU-CRR4-…`). It never changes, even if you change your name or IP address, so your friends always recognize you.
- **Finding people:** everyone running termdrop on the same network shows up under "Nearby" (UDP port 5055). Many school and office Wi-Fis drop broadcasts, so termdrop also asks every address of your subnet directly once at startup and whenever your IP changes (about 100 small packets per second, a few seconds for a typical network, at most the /16 around you), checks where your friends were last seen, and passes on the addresses it knows, so finding one person is enough to find the rest. Friends are recognized by their ID, never their IP: if a friend's IP changes, termdrop picks up the new one and reconnects on its own. Someone still not showing up (for example on a different subnet)? Press `a` and enter their IP.
- **Friends:** whoever asks first shows up under "Requests" on the other side, and they decide with `enter` (accept) or `x` (decline). **Only friends can send you files** – offers from anyone else are ignored without an answer.
- **Sending:** press `enter` on the banner (or on a friend), pick the files, tick one or more friends, `enter`. Every friend gets their own offer and their own line under "Transfers": `◷ waiting`, then a progress bar with speed and time left, then `✓` – or `✗ declined` / `cancelled` / `failed`. Someone who declines never holds up the others.
- **Drag & drop:** drag files from Finder into the terminal window – on the dashboard, nothing needs to be open first. The terminal "types" their paths, and termdrop recognizes them: backslash-escaped spaces (Terminal.app, iTerm2), quoted paths (other terminals), several files at once, `~` and `file://` URLs. Ordinary typing is never mistaken for a drop: every word has to be an absolute path to something that exists.
- **From the shell:** `termdrop photo.jpg report.pdf` opens termdrop with these files and goes straight to choosing friends; `--to Bob` ticks Bob, so `enter` is all that's left. If termdrop is already open in another window, the files are handed to that window instead (`Added 2 files to the open termdrop window.`) – handy when the window stays open and you work in another shell.
- **Receiving:** an offer shows up under "Requests", as a short notice at the bottom and, while the terminal is in the background, as a desktop notification. Select it to see sender, file names, sizes and the free space; `enter` accepts, `x` declines. An offer disappears when the sender cancels it or goes offline.
- **Trusted friends** (`t` or `/trust`, marked `★`): their files are accepted without asking – you still get a notice. Offers that don't fit on your disk (with 100 MB to spare) are always declined automatically, and the sender sees why.
- **Where files go:** `~/Downloads` (change it with `/folder <path>`). Nothing is ever overwritten: if `photo.jpg` exists, the new one becomes `photo (1).jpg`. Finished transfers stay in the panel; `tab` focuses it, `enter` opens a received file, `o` shows it in Finder.
- **Firewalls:** termdrop needs a direct connection to each friend, and it's enough if one of the two computers accepts incoming connections. If it can't reach a friend, it says so. Then allow Node.js in the firewall: on Windows, also for *public* networks (school Wi-Fi usually counts as public); on macOS, click "Allow" when asked whether node may accept incoming connections.
- termdrop, [keyrace](https://github.com/trigonyx/keyrace) and [termchat](https://github.com/trigonyx/termchat) use different ports and ignore each other, so all three can run at the same time.

## Security

- **Encryption:** every connection – the friend connection and each transfer's data connection – is authenticated and encrypted: an X25519 key exchange signed with both sides' Ed25519 identity keys, then ChaCha20-Poly1305 with a fresh key per connection and direction (forward secrecy). Only Node's built-in crypto is used. `/whois` shows a safety code; compare it once in person to rule out anyone sitting in the middle.
- **Only friends:** offers from people who aren't your friends, or whom you blocked, are dropped without a reply. A data connection is only taken if it comes from the friend the offer belongs to and carries that transfer's random ID inside the encrypted handshake.
- **Integrity:** every file is hashed (SHA-256) on both sides while it streams. A file is only given its real name once the sender's hash matches; a mismatch, more bytes than announced, or a file that changes while it's being sent fails the transfer.
- **Hostile file names:** names from the network are reduced to a plain base name: no `/`, `\` or `..`, no control characters, escape sequences, zero-width or bidi characters, no leading dashes, no trailing dots, no Windows device names (`CON`, `NUL` …), at most 200 bytes, never empty (`file`). The result is checked to stay inside the download folder. Files are created with `O_EXCL`, so a planted symlink is never followed and nothing is ever overwritten.
- **Partial files:** a file arrives as `<name>.termdrop-part` in the download folder and is deleted if the transfer fails or is cancelled. Files that were already complete and verified stay.
- **The terminal:** everything shown – names, file names, reasons – goes through the same sanitizer as termchat's messages, so escape sequences can't move the cursor, change the title or clear your screen.

## Usage

| Dashboard | |
|---|---|
| `↑` `↓` / `j` `k` | select |
| `enter` | send files (banner) · send to a friend · accept a request or an offer · add someone from Nearby |
| `x` | decline a request or an offer |
| `t` | trust / stop trusting the selected friend |
| `a` | add a friend by IP |
| `r` / `d` | rename (your own nickname) / remove a friend |
| `tab` | focus the transfers panel |
| `/` | enter a command (`tab` completes) |
| `?` | help |
| `q` / `ctrl+c` | quit (asks first while transfers run) |

| Transfers panel (`tab`) | |
|---|---|
| `↑` `↓` | select |
| `c` | cancel the selected transfer, or withdraw an offer (asks first) |
| `enter` | open a received file (several: show them in Finder) |
| `o` | show in Finder (Linux: open the folder) |
| `tab` / `esc` | back to the list |

| Choosing files | |
|---|---|
| drag & drop | adds the dropped files |
| `a`, or start typing `/`, `~` or `.` | type a path; `tab` completes, `enter` adds |
| `d` | remove the selected file |
| `enter` | next: choose friends |
| `esc` | cancel |

| Choosing friends | |
|---|---|
| `space` / `a` | tick a friend / all |
| `enter` | send (nothing ticked: the highlighted friend) |
| `f` | back to the files |
| `esc` | cancel |

### Commands

| Command | |
|---|---|
| `/help` | all commands |
| `/send [paths…]` | send files (no paths: the file picker) |
| `/me` | your name, ID, address and download folder |
| `/name <name>` | change your display name |
| `/add <ip[:port]>` | add a friend by IP |
| `/rename [name]` | your own nickname for the selected friend |
| `/remove` | remove the selected friend |
| `/block` · `/unblock` | block / unblock |
| `/whois` | details and safety code of the selected friend |
| `/trust` · `/untrust` | accept the selected friend's files automatically, or not |
| `/folder [path]` | show or change where received files go |
| `/history` | all past transfers |
| `/notifications [on\|off]` | desktop notifications for incoming files |
| `/update` | install the latest version |
| `/quit` | quit |

## On macOS

- **Notifications:** a system banner appears for incoming files while the terminal window is in the background. Toggle with `/notifications on|off`. It needs a terminal that reports focus (Terminal.app, iTerm2). On Linux, termdrop uses `notify-send` if it's installed.
- Works in Terminal.app and iTerm2 from 60 columns on; below 84 columns the transfers panel moves under the list, and narrow or short windows get a compact logo.

## Options

```
termdrop [files…]          # send these files (or hand them to the open termdrop)
         --to <name>       # preselect this friend (name, nickname or ID)
         --home <dir>      # different data directory (default ~/.termdrop, or $TERMDROP_HOME)
         --port <port>     # TCP port (default 5054, falls back to a free one if taken)
         --no-discovery    # no automatic search
         --debug           # connection log at <home>/termdrop.log
         -v, --version
         -h, --help
termdrop update            # install the latest version
```

Two instances on one machine (to try it out):

```sh
termdrop --home /tmp/td-a --port 5064
termdrop --home /tmp/td-b --port 5065
```

Then press `a` in one of them and enter `127.0.0.1:5065` (or `:5064`), and give each its own folder with
`/folder /tmp/td-a-files` and `/folder /tmp/td-b-files`.

## Data

Everything lives in `~/.termdrop/` (readable only by you):

- `identity.json`: your secret key. **Don't share it.** If it's lost, you get a new ID.
- `config.json`: name, port, download folder and notification setting
- `contacts.json`: your friends (and requests), including whom you trust and their last known address
- `peers.json`: names of former friends, so the history can still name them
- `transfers.jsonl`: one line per finished transfer – time, direction, friend, file names and sizes, result, duration and where received files were saved
- `termdrop.lock` and `termdrop.sock`: held by the running termdrop (one per data folder) – this is how `termdrop <files>` finds the open window. Both are removed on exit; a lock left behind by a crash is detected and replaced.

## Details and design decisions

- **Ports:** TCP 5054 for connections, UDP 5055 for discovery (termchat uses 5050/5051, keyrace 5052/5053).
- **One data connection per transfer.** Offers, answers and cancels go over the existing encrypted friend connection; the bytes of each transfer get a TCP connection of their own, authenticated with the same handshake. That way a big file never holds up pings, offers or other transfers, several recipients run in parallel without any scheduling code, and TCP does the flow control. It's opened by whichever side opened the friend connection – that direction demonstrably gets through both firewalls.
- **On the data connection,** files go one after another in encrypted chunks of ~64 KB; after each file the sender sends its SHA-256, and at the end the receiver confirms (`done`) or says what went wrong (`failed`). Both sides wait whenever the other can't keep up: the sender for the socket to drain, the receiver pauses reading while its disk catches up. Nothing is ever held in memory as a whole.
- **Speed:** limited by the network, not by termdrop. On localhost, the tests measure about 230–300 MB/s on an Apple Silicon Mac (256 MiB with encryption and hashing on both sides).
- **Progress** reaches the screen at most 10 times a second; the speed is smoothed over ~2 s, and the time left is rounded (`<10s`, `~25s`, `~3 min`), so the numbers don't jump. While nothing runs, nothing redraws – apart from a light shimmer that runs across the logo every 6 seconds while the dashboard is in front (it rests while the terminal is in the background or a dialog is open).
- **Limits:** 500 files per offer (folders aren't supported yet – zip them), 5 open offers per friend and 8 incoming transfers at once (more are declined as "busy"). A running transfer without a single byte for 30 s fails as stalled.
- **When something breaks:** if the connection drops, the transfer fails on both sides and the partial file is deleted. Resuming comes in a later version.
- **Multiple files, partly failed:** files that arrived complete and verified before a failure are kept, the rest is removed.
- **Running transfers and quitting:** `q` asks first; quitting cancels running transfers for both sides and declines open offers as "busy".
- **Dashboard selection:** a new incoming offer is selected as soon as it arrives, so `enter` accepts it right away; after sending, the transfers panel gets the focus, so `c` cancels right away.

## Development

```sh
npm install
npm run dev -- --home /tmp/td-a      # run from source
npm test                             # unit, integration (real instances on 127.0.0.1) and UI tests
npm run typecheck
```
