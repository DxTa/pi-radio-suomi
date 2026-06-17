# pi-radio-suomi

Pi extension for Finnish and Swedish radio streams.

## Install

```bash
pi install git:git@github.com:DxTa/pi-radio-suomi.git@main
```

Requires `ffmpeg` or `mpv`:

```bash
brew install ffmpeg  # or: brew install mpv
```

## Usage

```
/radio              — toggle playback
/radio <channel>    — play specific channel
/radio stop         — stop
/radio list         — all channels
/radio list fi      — Finnish only
/radio list se      — Swedish only
```

Autocomplete available after `/radio `.

## Channels

**Finnish:** Rondo Classic, Radio Helsinki, Radio Sun, Finest FM, Sea FM, Roll FM, Kaaos Radio (dubstep/chill), Radio Musa, RadioSE, and more.

**Swedish:** All Sveriges Radio channels (P1, P2, P3, P4 regional, SR Sápmi, etc.) from a committed API snapshot.

## Contributing

### Local dev

```bash
pi -e ./index.ts
```

### Update Swedish channels

```bash
npm run update:sr-channels
npm run check:sr-channels
```

Requires `api.sr.se` to be reachable.

### State

Runtime state at `~/.pi/agent/radio-suomi/state.json`. Reset with:

```bash
rm -rf ~/.pi/agent/radio-suomi
```
