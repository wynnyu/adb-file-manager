# ADB File Manager

English | [中文](README.md)

Manage the files on your Android phone from a browser.

Everything goes through adb (`adb push` / `adb pull` / `adb shell`) rather than MTP, so it works even when the phone's USB mode is set to "charging only", and you avoid the usual MTP trouble: dropped connections, stalled large transfers and hidden directories you can't see. On a rooted phone you can also turn on root mode to reach system directories such as `/data`.

## Quick start

You need:

- Node.js 20 or later
- adb (Android SDK Platform-Tools), either on your `PATH` or pointed to with `ADB_PATH`

  If you don't have them yet, see [Installing Node.js and adb](#installing-nodejs-and-adb) below
- USB debugging enabled on the phone: go to Settings → About phone, tap "Build number" 7 times to unlock developer mode, then turn on "USB debugging" under "Developer options"

Then run:

```bash
npx adb-file-manager
```

Open <http://127.0.0.1:3001> in your browser, connect the phone with a USB cable, and tap **Allow** when the phone asks you to authorize debugging.

### Installing Node.js and adb

**Node.js**

Download the LTS installer from [nodejs.org](https://nodejs.org/), or use a package manager:

```bash
# macOS (Homebrew)
brew install node
# Windows (winget)
winget install OpenJS.NodeJS.LTS
```

The Node.js shipped by Linux distributions may be older than 20; it's better to install it with a version manager such as nvm, following the [nodejs.org download page](https://nodejs.org/en/download). Afterwards, run `node -v` and check that the version is 20 or later.

**adb (Android SDK Platform-Tools)**

You only need Platform-Tools, not Android Studio or the full Android SDK. Install it with a package manager:

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

Or download the official zip from the [Android developers site](https://developer.android.com/tools/releases/platform-tools) ([Windows](https://dl.google.com/android/repository/platform-tools-latest-windows.zip) / [macOS](https://dl.google.com/android/repository/platform-tools-latest-darwin.zip) / [Linux](https://dl.google.com/android/repository/platform-tools-latest-linux.zip)), unzip it, and either add the `platform-tools` folder to your `PATH` or point `ADB_PATH` at the `adb` inside it (`adb.exe` on Windows).

Run `adb version` to check that adb can be found. With the phone connected, run `adb devices`: if the phone is listed with the state `device`, the connection works. If it doesn't show up on Windows, you may need a USB driver: the [Google USB Driver](https://developer.android.com/studio/run/win-usb) for Pixel phones, or the manufacturer's driver for other brands.

## Features

**Browsing**

- Four Finder-style views: icons, list, columns and gallery. The list view has Finder's columns (Name, Date Modified, Size, Kind), and the triangle next to a folder expands it in place. The column view expands from the root one column at a time: a click only selects, a selected folder shows its contents in the next column and `→` or a double-click moves into it, a selected file shows its details, with thumbnails for images. The gallery view shows a large preview, a strip of thumbnails and an info panel
- Breadcrumbs (double-click to type a path) and one-click links to common folders: internal storage, Downloads, Camera, Pictures, Movies, Music and Documents
- Filter, sort by name / size / modified time, and show or hide dotfiles
- Used and total internal storage shown in the toolbar

**Transfers**

- Upload with the buttons or by dragging files and folders into the window; folder structure is preserved
- A single file downloads as is; folders and multiple selections download as a zip
- A transfer queue shows the progress and result of each job

**Organizing**

- Right-click menu: open, download, cut / copy / paste, copy path, rename, delete. Right-click empty space to create a folder, upload to the current folder or switch views
- Copies never overwrite: name clashes get a number (`photo 2.jpg`, `photo 3.jpg`, …). Renames and moves onto an existing name fail with an error
- A folder can't be moved or copied into itself

**Devices and UI**

- Switch between several connected devices, with automatic detection when they are plugged in or removed; devices are shown by their marketing name
- English and Chinese UI, following your browser language by default
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
| `Esc` | Clear the selection |

## Root mode

Turn it on with the shield button in the toolbar. It is off by default and asks for confirmation first; tick "remember my choice" to have it turn on automatically next time.

When you turn it on, the tool first checks how the device provides root:

- If adbd itself runs as root (for example on engineering builds or emulators after `adb root`), it uses that directly
- Otherwise it escalates with `su -c`, which works with Magisk, KernelSU and APatch. The first time, your root manager will show a prompt on the phone; grant root to **Shell**

When running through su, `adb push` / `adb pull` have no root privileges of their own, so uploads and downloads are staged through a temporary directory under `/data/local/tmp`, which is cleaned up afterwards.

To guard against mistakes:

- A warning banner appears at the top, the main panel gets a red outline, and the tab title shows `⚠ ROOT`
- Deleting takes two confirmations; the second one lists the full paths and has a 3-second countdown
- If root access is revoked during an operation, root mode turns itself off and tells you why

## Configuration

Set these environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Port to listen on |
| `ADB_PATH` | `adb` | Path to the adb executable |
| `ADBFM_SU` | `su -c` | Privilege-escalation prefix used in root mode. Change it if your su takes different arguments, e.g. `ADBFM_SU="su 0 sh -c"` |

```bash
PORT=8080 ADB_PATH=~/Android/platform-tools/adb npx adb-file-manager
```

## Security

This tool can read and write any file on the phone, including system partitions and app data in root mode, so the backend only serves the local machine:

- It listens on `127.0.0.1` only, so other devices on your network can't reach it
- It rejects requests whose `Host` isn't localhost (DNS rebinding protection)
- It checks `Origin` and `Sec-Fetch-Site` and rejects cross-site requests from other web pages (CSRF protection)
- Before deleting, renaming or moving, it resolves symlinks and refuses to touch the root directory, top-level directories (`/system`, `/data`, `/sdcard`, …) and the root of each storage volume
- Previews are limited to common image formats, and SVGs are shown in a sandbox so their scripts don't run

Do not expose it to your network or the internet through a reverse proxy or similar.

## Development

```bash
pnpm install
pnpm dev      # frontend at http://127.0.0.1:5173, backend on port 3001, both with hot reload
pnpm build    # build into dist/
pnpm start    # run the build: http://127.0.0.1:3001
```

Stack:

- Backend: Node.js + Express 5. adb is called through `execFile`, and paths in device-side commands are single-quote-escaped
- Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion. Fonts (MiSans, Maple Mono) are bundled locally, so no network access is needed

Layout:

```
server/
  adb.ts        adb wrapper: listing, push / pull, root detection, copy / move / delete
  index.ts      HTTP API and security checks; serves the frontend after a build
  i18n.ts       English and Chinese strings for backend error messages
src/
  App.tsx       main screen and most of the interaction logic
  components/   UI components
  i18n/         frontend strings (zh.ts is the source of the types; en.ts must match it)
  index.css     Catppuccin palettes and theme variables
  theme.ts      theme switching
```

Build output: `dist/web/` is the frontend and `dist/server/` is the compiled backend, which is also the npm package's `bin` entry.

## License

The code is released under the [MIT](LICENSE) license.

The fonts bundled into the frontend have their own licenses:

- [MiSans](https://hyperos.mi.com/font/): Xiaomi's MiSans Font IP License Agreement
- [Maple Mono](https://github.com/subframe7536/maple-font): SIL Open Font License 1.1
