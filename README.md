# pi-radio-suomi

Pi extension for controlling Finnish and Swedish radio streams from any Pi coding session.

## Features

- `/radio` toggles radio playback on/off.
- `/radio <channel-id>` starts a specific Finnish or Swedish radio channel.
- Native autocomplete for channel IDs.
- Current channel shown in Pi footer/status bar.
- Cross-session control through shared state under `~/.pi/agent/radio-suomi/`.
- Low-overhead cross-session status sync using file-watch events plus slow liveness fallback.
- Uses `ffplay` by default on macOS when `mpv` is unavailable; uses `mpv` if installed.
- Swedish channel snapshot generated from Sveriges Radio API v2; runtime does not call the network for autocomplete or playback selection.

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
/radio channel-sr-p1
/radio channel-sr-p3
/radio stop
/radio now
/radio list
/radio list fi
/radio list se
```

Typing `/radio ` opens autocomplete for all channels.

## Finnish channels

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

## Swedish channels

Swedish channels are generated from Sveriges Radio API v2:

```text
https://api.sr.se/api/v2/channels?format=json&pagination=false
```

The API documentation notes that the API is no longer maintained, but remains usable for now. To keep `/radio` fast and offline-capable, this extension commits a generated `sr-channels.ts` snapshot instead of fetching channels at runtime.

Current snapshot includes all SR channels with `liveaudio.url` at generation time. Examples:

- `channel-sr-p1` — P1
- `channel-sr-p2` — P2
- `channel-sr-p3` — P3
- `channel-sr-p4-stockholm` — P4 Stockholm
- `channel-sr-sr-sapmi` — SR Sápmi
- `channel-sr-sveriges-radio-finska` — Sveriges Radio Finska
- `channel-sr-p4-plus` — P4 Plus

Use `/radio list se` or autocomplete to see the full local snapshot.

## Updating Sveriges Radio channels

Regenerate the Swedish channel snapshot:

```bash
npm run update:sr-channels
npm run check:sr-channels
```

`api.sr.se` must be reachable from the machine running the update script. The generated `sr-channels.ts` file is committed to the package and included in releases.

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
