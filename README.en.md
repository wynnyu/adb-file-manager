# ADB File Manager

English · [中文](README.md)

A web-based Android file manager. It works even when the phone's USB mode is set to "charging only": everything goes through `adb push` / `adb pull` / `adb shell`, with no MTP involved.

## Prerequisites
1. adb (Android SDK platform-tools) installed on your computer, either on your `PATH` or pointed to with `ADB_PATH=/path/to/adb`
2. On the phone: Developer options → enable **USB debugging**, then tap **Allow** on the phone after connecting it
3. Node.js 20 or later

## Usage
```bash
npx adb-file-manager     # then open http://127.0.0.1:3001
```

From source:
```bash
pnpm install
pnpm dev                 # development: http://127.0.0.1:5173
pnpm build && pnpm start # production:  http://127.0.0.1:3001
```

### Environment variables
| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Port to listen on |
| `ADB_PATH` | `adb` | Path to the adb executable |
| `ADBFM_SU` | `su -c` | Privilege-escalation prefix used in root mode |

## Features
- Browse directories, with breadcrumbs (double-click to type a path), quick links, filtering, sorting and a show-hidden-files toggle
- Upload files and folders (with the button or by dragging them into the window) and download files; folders and multi-selections download as a zip
- Create folders, rename and delete (top-level directories such as `/` and `/sdcard` are protected)
- Switch between multiple devices, with automatic detection when devices are plugged in or removed

## Root mode
Turn it on with the shield button in the toolbar. It is off by default and asks for confirmation first, with an optional "remember my choice". Once it is on, every operation runs as root through `su -c`, so directories such as `/data` become accessible:
- Uploads and downloads are staged through `/data/local/tmp` (adb push/pull have no root privileges of their own), and the staging files are cleaned up afterwards
- Deleting takes two confirmations; the second one lists the full paths and has a 3-second countdown
- A warning banner appears at the top, the main panel gets a red outline, and the tab title shows ⚠ ROOT
- The first time you turn it on, Magisk / KernelSU on the phone shows a prompt; grant root to **Shell**
- If your su takes different arguments, set `ADBFM_SU`, e.g. `ADBFM_SU="su 0 sh -c"`

Shortcuts: `Enter` open · `F2` rename · `Delete` delete · `Backspace` up one level · `⌘/Ctrl+A` select all · `Esc` clear selection

The UI is currently in Chinese.

## Security
This tool can read and write any file on the phone (including system directories in root mode), so the backend only serves the local machine:
- It listens on `127.0.0.1` only, so other devices on your network can't reach it
- It rejects requests whose Host isn't localhost (DNS rebinding protection)
- It rejects cross-site requests from other web pages by checking `Origin` / `Sec-Fetch-Site` (CSRF protection)

Do not expose it to the internet through a reverse proxy.

## Project layout
- `server/adb.ts`: adb wrapper (calls adb via `execFile`, single-quote-escapes device-side paths)
- `server/index.ts`: Express API (`/api/devices` `ls` `upload` `pull` + `fetch/:token` `mkdir` `rename` `delete`); after a build it also serves the frontend
- `src/`: React + TypeScript + Tailwind CSS v4 + motion; all four Catppuccin flavors (Latte / Frappé / Macchiato / Mocha) and 5 accent colors are defined in `src/index.css`, with switching logic in `src/theme.ts`; fonts (MiSans / Maple Mono) are bundled locally
- Build output: `dist/web/` (frontend bundled by vite) and `dist/server/` (backend compiled by tsc, also the npm package's `bin` entry)

## License
The code is released under the [MIT](LICENSE) license.

The fonts bundled into the frontend have their own licenses:
- [MiSans](https://hyperos.mi.com/font/): Xiaomi's MiSans Font IP License Agreement
- [Maple Mono](https://github.com/subframe7536/maple-font): SIL Open Font License 1.1
