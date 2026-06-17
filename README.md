# pi-radio-suomi

Pi extension for controlling Finnish radio streams from any Pi coding session.

## Features

- `/radio` toggles radio playback on/off.
- `/radio <channel-id>` starts a specific Finnish radio channel.
- Native autocomplete for channel IDs.
- Current channel shown in Pi footer/status bar.
- Cross-session control through shared state under `~/.pi/agent/radio-suomi/`.
- Low-overhead cross-session status sync using file-watch events plus slow liveness fallback.
- Uses `ffplay` by default on macOS when `mpv` is unavailable; uses `mpv` if installed.

## Install

From GitHub over SSH:

```bash
pi install git:git@github.com:DxTa/pi-radio-suomi.git@main
```

Or test without installing:

```bash
pi -e git:git@github.com:DxTa/pi-radio-suomi.git@main
```

## Runtime dependency

Install at least one audio player:

```bash
brew install ffmpeg
# or
brew install mpv
```

`ffplay` comes from `ffmpeg`.

## Usage

```text
/radio
/radio channel-radio-helsinki
/radio channel-rondo-classic-klasu-pro
/radio stop
/radio now
/radio list
```

Typing `/radio ` opens autocomplete for all channels.

## Channels

- `channel-rondo-classic-klasu-pro` — Rondo Classic Klasu Pro — Classical music
- `channel-radio-sun` — Radio Sun — local Finnish stuff
- `channel-finest-fm` — Finest FM — contemporary, Finnish and English songs
- `channel-sea-fm` — Sea FM — contemporary, Finnish and English songs
- `channel-radio-helsinki` — Radio Helsinki — contemporary, Finnish and English songs
- `channel-radio-dei` — Radio Dei — Christian broadcasting
- `channel-radio-hear` — Radio Hear — eclectic old/weird mix
- `channel-roll-fm` — Roll FM — old tracks (50s - 80s)
- `channel-radio-patmos` — Radio Patmos — Christian broadcasting, current affairs
- `channel-kaaos-radio-dubstep` — Kaaos Radio — dubstep, breakbeat
- `channel-kaaos-radio-chill` — Kaaos Radio — lo-fi, electronic
- `channel-radio-musa` — Radio Musa — nostalgia, jazz, country
- `channel-radiose` — RadioSE — classic rock

## Local development

This directory is a standalone Pi package repo. In dotfiles it can later be replaced with a git submodule at:

```text
pi/agent/extensions/radio-suomi
```

Smoke-load from a local checkout:

```bash
pi -e ./index.ts
```

## State and cleanup

Runtime state lives outside the repo:

```text
~/.pi/agent/radio-suomi/state.json
~/.pi/agent/radio-suomi/state.lock
```

To reset local state after stopping playback:

```bash
rm -rf ~/.pi/agent/radio-suomi
```
