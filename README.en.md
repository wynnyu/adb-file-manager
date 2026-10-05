# ADB File Manager

English | [中文](README.md)

A browser-based file manager for Android devices.

All operations are performed through adb (`adb push` / `adb pull` / `adb shell`) instead of MTP. As a result, it works even when the device's USB mode is set to "charging only", and avoids common MTP issues such as dropped connections, stalled large transfers and invisible hidden directories. On rooted devices, root mode provides access to system directories such as `/data`.

## Quick start

Requirements:

- Node.js 20 or later
- adb (Android SDK Platform-Tools), available on `PATH` or specified with `ADB_PATH`

  See [Installing Node.js and adb](#installing-nodejs-and-adb) below for installation instructions
- USB debugging enabled on the device: in Settings → About phone, tap "Build number" 7 times to enable Developer options, then enable "USB debugging" under "Developer options"

Run the following command:

```bash
npx adb-file-manager
```

Open <http://127.0.0.1:3001> in a browser, connect the device via USB, and tap **Allow** in the USB debugging authorization prompt on the device.

### Installing Node.js and adb

**Node.js**

Download the LTS installer from [nodejs.org](https://nodejs.org/), or install it with a package manager:

```bash
# macOS (Homebrew)
brew install node
# Windows (winget)
winget install OpenJS.NodeJS.LTS
```

Some Linux distributions ship a Node.js version older than 20. In that case, install it with a version manager such as nvm, as described on the [nodejs.org download page](https://nodejs.org/en/download). Then run `node -v` to verify that the version is 20 or later.

**adb (Android SDK Platform-Tools)**

Only Platform-Tools is required; Android Studio and the full Android SDK are not needed. It can be installed with a package manager:

```bash
# macOS (Homebrew)
brew install --cask android-platform-tools
# Windows (winget)
winget install Google.PlatformTools
# Debian / Ubuntu
sudo apt install adb
# Arch Linux
sudo pacman -S android-tools
# Fedora
sudo dnf install android-tools
```

Alternatively, download the official archive from the [Android developers site](https://developer.android.com/tools/releases/platform-tools) ([Windows](https://dl.google.com/android/repository/platform-tools-latest-windows.zip) / [macOS](https://dl.google.com/android/repository/platform-tools-latest-darwin.zip) / [Linux](https://dl.google.com/android/repository/platform-tools-latest-linux.zip)), extract it, and either add the `platform-tools` directory to `PATH` or set `ADB_PATH` to the `adb` executable inside it (`adb.exe` on Windows).

Run `adb version` to verify that adb is available. With the device connected, run `adb devices`; a working connection is indicated by the device being listed with the state `device`. If the device is not detected on Windows, a USB driver may be required: the [Google USB Driver](https://developer.android.com/studio/run/win-usb) for Pixel devices, or the manufacturer's driver for other brands.

## Features

**Browsing**

- Four views modeled on Finder: icons, list, columns and gallery. The list view uses Finder's columns (Name, Date Modified, Size, Kind), and the disclosure triangle next to a folder expands it in place. The column view expands from the root one level at a time: a single click selects an item; a selected folder lists its contents in the next column, and `→` or a double-click opens it; a selected file shows its details, including a thumbnail for images. The gallery view shows a large preview above a thumbnail strip, with an info panel on the right
- Breadcrumb navigation (double-click to enter a path directly) and one-click access to common folders: internal storage, Downloads, Camera, Pictures, Movies, Music and Documents
- Filtering, sorting by name / size / modified time, and an option to show or hide dotfiles
- Internal storage usage (used and total) displayed in the toolbar

**Transfers**

- Upload via the button or by dragging files and folders into the window, with directory structure preserved
- Single files are downloaded as is; folders and multiple selections are downloaded as a zip archive
- A transfer queue displays the progress and result of each task

**Organizing**

- Context menu: open, download, cut / copy / paste, copy path, rename and delete. Right-clicking empty space provides options to create a folder, upload to the current folder or switch views
- Copying never overwrites existing files: on a name conflict, a number is appended (`photo 2.jpg`, `photo 3.jpg`, …). Renaming or moving onto an existing name results in an error
- A folder cannot be moved or copied into itself

**Devices and UI**

- Switching between multiple connected devices, with automatic detection of connection and disconnection; devices are identified by their marketing names
- English and Chinese interface, following the browser language by default
- [Catppuccin](https://catppuccin.com) theme with four flavors (Latte / Frappé / Macchiato / Mocha) and five accent colors, following the system light / dark setting by default

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Enter` | Open |
| `F2` | Rename |
| `Delete` / `⌘ Backspace` | Delete |
| `Backspace` / `Alt ↑` | Up one level |
| `⌘/Ctrl A` | Select all |
| `⌘/Ctrl C` / `X` / `V` | Copy / cut / paste |
| `↑` `↓` | Move the selection |
| `←` `→` | Collapse or expand folders in list view; go into and out of folders in column view; previous / next item in gallery view |
| `⌘/Ctrl Shift .` | Show or hide dotfiles |
| `Esc` | Clear the selection |

## Root mode

Root mode is enabled with the shield button in the header, to the left of the device selector. It is disabled by default and requires confirmation before it is enabled; selecting "Remember my choice and enable automatically next time" enables it automatically on subsequent visits.

When root mode is enabled, the tool first detects how the device provides root access:

- If adbd runs as root (for example, on engineering builds or emulators after `adb root`), it is used directly
- Otherwise, privileges are escalated with `su -c`, which is supported by Magisk, KernelSU and APatch. On first use, the root manager on the device displays an authorization prompt; grant root access to **Shell**

When su is used, `adb push` / `adb pull` do not run with root privileges, so uploads and downloads are staged through a temporary directory under `/data/local/tmp`, which is removed upon completion.

Safeguards against accidental operations:

- A **ROOT** badge is displayed next to the title, and the tab title includes `⚠ ROOT`
- Deleting items in internal storage or on an SD card requires a single confirmation, as in normal mode
- Deleting items elsewhere (for example, `/data` or `/system`) shows a root warning that lists the full paths and includes a 3-second countdown; after "Do not show again" is selected, such deletions also require only a single confirmation
- If root access is revoked during an operation, root mode is disabled automatically and the reason is displayed

## Configuration

Configuration is done through environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Port to listen on |
| `ADB_PATH` | `adb` | Path to the adb executable |
| `ADBFM_SU` | `su -c` | Privilege-escalation prefix used in root mode. Adjust it if su on the device expects different arguments, e.g. `ADBFM_SU="su 0 sh -c"` |

```bash
PORT=8080 ADB_PATH=~/Android/platform-tools/adb npx adb-file-manager
```

## Security

This tool can read and write any file on the device, including system partitions and app data in root mode. The backend therefore serves only the local machine:

- Listens only on `127.0.0.1`, so it is not reachable from other devices on the network
- Rejects requests whose `Host` header is not localhost (DNS rebinding protection)
- Checks `Origin` and `Sec-Fetch-Site` and rejects cross-site requests from other web pages (CSRF protection)
- Resolves symlinks before deleting, renaming or moving, and refuses to operate on the root directory, top-level directories (`/system`, `/data`, `/sdcard`, …) and the root of each storage volume
- Previews are limited to common image formats, and SVGs are rendered in a sandbox so that embedded scripts do not run

Do not expose it to a local network or the internet through a reverse proxy or any other means.

## Development

```bash
pnpm install
pnpm dev      # frontend at http://127.0.0.1:5173, backend on port 3001, both with hot reload
pnpm build    # build into dist/
pnpm start    # run the build: http://127.0.0.1:3001
pnpm test     # run unit tests
```

Tech stack:

- Backend: Node.js + Express 5. adb is invoked through `execFile`, and paths in device-side commands are single-quote-escaped
- Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion. Fonts (MiSans, Maple Mono) are bundled locally, so no network access is required

Project structure:

```
server/
  adb.ts        adb wrapper: listing, push / pull, root detection, copy / move / delete
  app.ts        assembles the HTTP server; serves the frontend after a build
  files.ts      file operation endpoints: list, create, rename, delete, copy, move, preview
  transfer.ts   upload and download endpoints, staged through a temporary directory on the computer
  guard.ts      security checks: local-only access, protected paths
  request.ts    request parameter parsing and root status cache
  index.ts      entry point
  *.test.ts     unit tests (vitest)
  i18n.ts       English and Chinese strings for backend error messages
shared/
  types.d.ts    API data types shared by the backend and frontend
src/
  App.tsx       main screen; composes the hooks and components
  hooks/        state and interaction logic: devices, directories, selection, file operations, shortcuts
  lib/          frontend helpers: API requests, bookmarks, sorting, formatting, preferences, theme switching
  components/   UI components; ui.tsx holds the shared building blocks
    views/      the icon, list, column and gallery views
    header/     the header with the device, language and theme pickers
    toolbar/    toolbar, breadcrumbs, selection bar, status bar
    bookmarks/  quick links and the bookmark editor
    overlays/   dialogs, context menus, toasts, drop hint, transfer queue
  i18n/         frontend strings (zh.ts is the source of the types; en.ts must match it)
  index.css     Catppuccin palettes and theme variables
```

Build output: `dist/web/` contains the frontend and `dist/server/` contains the compiled backend, which also serves as the npm package's `bin` entry.

## License

The code is released under the [MIT](LICENSE) license.

The fonts bundled into the frontend are subject to their own licenses:

- [MiSans](https://hyperos.mi.com/font/): Xiaomi's MiSans Font IP License Agreement
- [Maple Mono](https://github.com/subframe7536/maple-font): SIL Open Font License 1.1
