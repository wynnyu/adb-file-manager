# Modbench

English | [中文](README.md)

A browser-based toolbox for Android devices. It currently provides a file manager, with apps, props, settings and fastboot modules planned.

All operations are performed through adb (`adb push` / `adb pull` / `adb shell`) instead of MTP. As a result, it works even when the device's USB mode is set to "charging only", and avoids common MTP issues such as dropped connections, stalled large transfers and invisible hidden directories. On rooted devices, root mode provides access to system directories such as `/data`.

## Quick start

Requirements:

- Node.js 20 or later, and [pnpm](https://pnpm.io/)
- adb (Android SDK Platform-Tools), available on `PATH` or specified with `ADB_PATH`

  See [Installing Node.js and adb](#installing-nodejs-and-adb) below for installation instructions
- USB debugging enabled on the device: under Settings, open About phone and tap "Build number" 7 times to enable Developer options, then enable "USB debugging" under "Developer options"

Clone the repository and run the following commands:

```bash
git clone https://github.com/wynnyu/adb-file-manager.git
cd adb-file-manager
pnpm install
pnpm build
pnpm start
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

- Four views modeled on Finder: icons, list, columns and gallery. The list view uses Finder's columns (Name, Date Modified, Size, Kind), and the disclosure triangle next to a folder expands it in place. The column view expands from the root one level at a time: a single click selects an item; a selected folder lists its contents in the next column, and the Right Arrow key or a double-click opens it; a selected file shows its details, including a thumbnail for images. The gallery view shows a large preview above a thumbnail strip, with an info panel on the right
- Breadcrumb navigation (double-click it or click the **Type a path** button at its end to enter a path directly) and one-click access to common folders: internal storage, Downloads, Camera, Pictures, Movies, Music and Documents
- Filtering, sorting by name / size / modified time, and an option to show or hide dotfiles
- Internal storage usage (used and total) displayed in the toolbar

**Viewing**

- Double-clicking a file, pressing `Enter` or choosing **Open** in the context menu opens the file in an in-page viewer. Left / Right Arrow moves to the previous / next file in the same folder, and `Esc` closes the viewer
- Images: initially scaled to fit the window; holding `Ctrl` while scrolling, or pinching on a trackpad, zooms in and out. A zoomed image can be dragged, and a double-click toggles between fit to window and actual size
- Video and audio: built-in playback controls, autoplay 1 second after opening, a draggable progress bar, and volume and mute settings that persist across files; videos can be played in full screen. `Space` plays or pauses, and `F` toggles full screen. Playback depends on the formats supported by the browser
- Other files are shown as plain text. Only UTF-8 is supported, and only the first 1 MB of larger files is shown
- Archives (`.zip`, `.apk`, `.apks`, `.xapk`, `.jar`, `.aar`, `.tar`, `.tar.gz`, `.tgz`, `.tar.bz2`, `.tbz2`, `.tbz`) are shown as an expandable tree with names, sizes and dates. The contents of the entries are not previewed, and only the first 20000 entries are shown for larger archives. 7z, rar and xz are not supported and are handled like other files
- Binary files and formats the browser cannot decode (such as HEIC images or MKV videos) show a notice with a download button

**Transfers**

- Upload via the button or by dragging files and folders into the window, with directory structure preserved
- Downloads start from the context menu, the selection bar or the download button in the viewer. Single files are downloaded as is; folders and multiple selections are downloaded as a zip archive
- A transfer queue displays the progress and result of each task

**Organizing**

- Context menu: open (folders are entered, files open in the viewer), extract (archives only), download, compress as zip or tar.gz, cut / copy / paste, copy path, properties, rename and delete. Right-clicking empty space provides options to create a folder, upload to the current folder or switch views
- **Compress as zip** and **Compress as tar.gz** in the context menu or the selection bar compress the selection into an archive in the folder that contains it. A single item gives the archive its own name, and multiple items produce `Archive`. On a name conflict, a number is appended and existing files are never overwritten. A tar.gz is created directly on the device without passing through the computer. The device has no `zip` command, so a zip is created on the computer: the selection is pulled to a temporary folder and the result is pushed back, which requires temporary space of at least twice the size of the selection. `adb pull` skips symbolic links, so a zip does not contain them and the number of skipped entries is reported afterwards, while a tar.gz keeps symbolic links
- Choosing **Extract** on an archive extracts it on the device into the folder that contains the archive, without passing through the computer. An archive with a single top-level item extracts that item directly; otherwise a folder named after the archive is created. On a name conflict, a number is appended and existing files are never overwritten. Extraction uses the `unzip` (available from Android 9) and `tar` commands of the device, and archives that contain absolute paths, `..` segments or entries below a symbolic link are rejected before anything is extracted
- Copying never overwrites existing files: on a name conflict, a number is appended (`photo 2.jpg`, `photo 3.jpg`, …). Renaming or moving onto an existing name results in an error
- A folder cannot be moved or copied into itself

**Properties**

- Choose "Properties" in the context menu, or press `Cmd I` (Mac) or `Alt Enter` (other systems). The panel shows the path, size, modification time, status change time, symlink target (with a jump to the target), partition, inode, hard link count and SELinux context. The access time is not shown
- The total size, file count and folder count of a folder are calculated automatically half a second after the panel opens, and the calculation is cancelled when the panel closes; items that cannot be read are reported as an incomplete total. A multiple selection shows a summary
- Permissions (checkboxes or octal), owner and group can be changed, which usually requires root mode. For folders, the change can be applied to everything inside, with an extra confirmation. Protected paths and symbolic links are read-only

**Devices and UI**

- Switching between multiple connected devices, with automatic detection of connection and disconnection; devices are identified by their marketing names
- English and Chinese interface, following the browser language by default
- [Catppuccin](https://catppuccin.com) theme with four flavors (Latte / Frappé / Macchiato / Mocha) and five accent colors, following the system light / dark setting by default

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Enter` | Open a folder, or open a file in the viewer |
| `F2` | Rename |
| `Cmd I` / `Alt Enter` | Properties (`Cmd I` on Mac, `Alt Enter` on other systems) |
| `Delete` / `Cmd Backspace` | Delete |
| `Backspace` / `Alt` + Up Arrow | Up one level |
| `Cmd/Ctrl A` | Select all |
| `Cmd/Ctrl C` / `X` / `V` | Copy / cut / paste |
| Up / Down Arrow | Move the selection |
| Left / Right Arrow | Collapse or expand folders in list view; go into and out of folders in column view; previous / next item in gallery view; previous / next file in the viewer |
| `Cmd/Ctrl Shift .` | Show or hide dotfiles |
| `Space` | Play or pause video and audio in the viewer |
| `F` | Toggle full screen for video in the viewer |
| `Esc` | Clear the selection; close the viewer |

## Root mode

Root mode is enabled with the shield button in the header, to the left of the device selector. It is disabled by default and requires confirmation before it is enabled; selecting "Remember my choice and enable automatically next time" enables it automatically on subsequent visits.

When root mode is enabled, the tool first detects how the device provides root access:

- If adbd runs as root (for example, on engineering builds or emulators after `adb root`), it is used directly
- Otherwise, privileges are escalated with `su -c`, which is supported by Magisk, KernelSU and APatch. On first use, the root manager on the device displays an authorization prompt; grant root access to **Shell**

When su is used, `adb push` / `adb pull` do not run with root privileges, so uploads and downloads are staged through a temporary directory under `/data/local/tmp`, which is removed upon completion.

Safeguards against accidental operations:

- A **ROOT** badge is displayed next to the title, the tab title includes ROOT, and the tab icon turns red
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
PORT=8080 ADB_PATH=~/Android/platform-tools/adb pnpm start
```

## Security

This tool can read and write any file on the device, including system partitions and app data in root mode. The backend therefore serves only the local machine:

- Listens only on `127.0.0.1`, so it is not reachable from other devices on the network
- Rejects requests whose `Host` header is not localhost (DNS rebinding protection)
- Checks `Origin` and `Sec-Fetch-Site` and rejects cross-site requests from other web pages (CSRF protection)
- Resolves symlinks before deleting, renaming, moving or changing permissions, and refuses to operate on the root directory, top-level directories (`/system`, `/data`, `/sdcard`, …) and the root of each storage volume
- The viewer reads only common image, video and audio formats as media; other files are shown read-only with syntax highlighting chosen by file name and line numbers, and Cmd+F (Ctrl+F on other systems) searches within the file; only UTF-8 is supported and the display is limited to the first 1 MB. The **Word wrap** button at the bottom right of the viewer toggles line wrapping. Markdown files are shown as a formatted preview by default, and the **Markdown preview** button switches back to the source; embedded HTML is sanitized before rendering, and images with relative paths are read from the device. SVGs are rendered in a sandbox so that embedded scripts do not run

Do not expose it to a local network or the internet through a reverse proxy or any other means.

## Development

```bash
pnpm install
pnpm dev      # frontend at http://127.0.0.1:5173, backend on port 3001, both with hot reload
pnpm build    # build into dist/
pnpm start    # run the build: http://127.0.0.1:3001
pnpm test     # run unit tests
```

The [architecture overview](docs/architecture.md) covers the overall structure, main flows and module dependency graphs, the [API reference](docs/api.md) describes the backend endpoints and the frontend client, and the [design guide](docs/design.md) covers colors, components, motion and interaction rules. These documents are written in Chinese.

Tech stack:

- Backend: Node.js + Express 5. adb is invoked through `execFile`, and paths in device-side commands are single-quote-escaped
- Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion + TanStack Query. Fonts (MiSans, Maple Mono) are bundled locally, so no network access is required

Project structure:

```
server/
  adb.ts        low-level adb calls: run, shell, push / pull, device list, root detection
  fs-cmds.ts    on-device file commands: list, copy / move / delete, compress / extract, read
  devices.ts    device endpoints: device list, reauthorize, root check, storage
  app.ts        assembles the HTTP server; serves the frontend after a build
  files.ts      file operation endpoints: list, create, rename, delete, copy, move, preview
  attrs.ts      attribute endpoints: stat, recursive folder usage, chmod and chown
  transfer.ts   upload and download endpoints, staged through a temporary directory on the computer
  guard.ts      security checks: local-only access, protected paths
  request.ts    request parameter parsing and root status cache
  index.ts      entry point
  *.test.ts     unit tests (vitest)
  i18n.ts       English and Chinese strings for backend error messages
shared/
  types.d.ts    API data types shared by the backend and frontend
src/
  App.tsx       shell: composes devices, root, toasts, dialogs, the transfer queue and the current module
  modules/      feature modules; index.ts is the module registry
    files/      the file manager module, split into hooks, components and lib
      hooks/        state and interaction logic: directories, selection, file operations, shortcuts
      lib/          module helpers: the directory query cache, bookmarks, sorting
      components/   UI components
        views/      the icon, list, column and gallery views
        toolbar/    toolbar, breadcrumbs, selection bar, status bar
        bookmarks/  quick links and the bookmark editor
        viewer/     the viewer
        overlays/   context menu items, the properties sheet, drop hint
  hooks/        shared state and interaction logic: devices, root, toasts, the transfer queue, shell state
  lib/          shared frontend helpers: API requests, formatting, preferences, theme switching
  components/   shared UI components; ui.tsx holds the building blocks
    shell/      header, device, language and theme pickers, module navigation, page layout
    overlays/   dialogs, context menus, toasts, transfer queue
  i18n/         frontend strings (zh.ts is the source of the types; en.ts must match it)
  test/         setup and shared helpers for frontend tests
  *.test.ts(x)  unit tests for hooks and components, next to the modules under test (vitest + jsdom)
  index.css     Catppuccin palettes and theme variables
docs/
  architecture.md  architecture overview and module dependency graphs
  api.md           backend endpoints and the frontend API client
  design.md        UI design guide
```

Build output: `dist/web/` contains the frontend and `dist/server/` contains the compiled backend.

## License

The code is released under the [MIT](LICENSE) license.

The fonts bundled into the frontend are subject to their own licenses:

- [MiSans](https://hyperos.mi.com/font/): Xiaomi's MiSans Font IP License Agreement
- [Maple Mono](https://github.com/subframe7536/maple-font): SIL Open Font License 1.1
