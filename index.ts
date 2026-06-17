import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { CHANNELS, type Channel } from "./channels.ts";
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  watch,
  type FSWatcher,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const STATUS_KEY = "radio-suomi";
const STATE_DIR = path.join(os.homedir(), ".pi", "agent", "radio-suomi");
const STATE_PATH = path.join(STATE_DIR, "state.json");
const LOCK_PATH = path.join(STATE_DIR, "state.lock");
const DEFAULT_CHANNEL_ID = "channel-rondo-classic-klasu-pro";
const WATCH_DEBOUNCE_MS = 150;
const LIVENESS_CHECK_MS = 60_000;
const STARTUP_REFRESH_DELAYS_MS = [250, 1_000, 2_500];
const LOCK_RETRY_ATTEMPTS = 20;
const LOCK_RETRY_MS = 100;
const LOCK_STALE_MS = 10_000;
const LOCK_FORCE_STALE_MS = 30_000;

interface RadioState {
  version: 1;
  pid: number | null;
  player: "mpv" | "ffplay" | null;
  channelId: string | null;
  channelName: string | null;
  url: string | null;
  startedAt: string | null;
  lastChannelId: string | null;
  updatedAt: string;
}

interface LockState {
  pid: number;
  token: string;
  createdAt: string;
}

const CHANNEL_BY_ID = new Map(CHANNELS.map((channel) => [channel.id, channel]));
const COMMAND_ALIASES = ["off", "stop", "now", "list", "list fi", "list se"];

let activeCtx: ExtensionContext | null = null;
let stateWatcher: FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let livenessTimer: ReturnType<typeof setInterval> | null = null;
let startupRefreshTimers: Array<ReturnType<typeof setTimeout>> = [];
let corruptStateWarningShown = false;
let cachedPlayer: "mpv" | "ffplay" | null | undefined;

function nowIso(): string {
  return new Date().toISOString();
}

function defaultState(): RadioState {
  return {
    version: 1,
    pid: null,
    player: null,
    channelId: null,
    channelName: null,
    url: null,
    startedAt: null,
    lastChannelId: null,
    updatedAt: nowIso(),
  };
}

function ensureStateDir(): void {
  mkdirSync(STATE_DIR, { recursive: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function pidOrNull(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function normalizeState(value: unknown): RadioState {
  if (!isRecord(value)) return defaultState();
  const state = defaultState();
  const player = value.player === "mpv" || value.player === "ffplay" ? value.player : null;
  return {
    ...state,
    pid: pidOrNull(value.pid),
    player,
    channelId: stringOrNull(value.channelId),
    channelName: stringOrNull(value.channelName),
    url: stringOrNull(value.url),
    startedAt: stringOrNull(value.startedAt),
    lastChannelId: stringOrNull(value.lastChannelId),
    updatedAt: stringOrNull(value.updatedAt) ?? state.updatedAt,
  };
}

function readState(ctx?: ExtensionContext): RadioState {
  ensureStateDir();
  if (!existsSync(STATE_PATH)) return defaultState();
  try {
    return normalizeState(JSON.parse(readFileSync(STATE_PATH, "utf8")));
  } catch (error) {
    if (ctx?.hasUI && !corruptStateWarningShown) {
      corruptStateWarningShown = true;
      ctx.ui.notify(`radio-suomi: ignoring corrupt state file: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
    return defaultState();
  }
}

function writeState(state: RadioState): void {
  ensureStateDir();
  const next = { ...state, version: 1 as const, updatedAt: nowIso() };
  const tempPath = `${STATE_PATH}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    renameSync(tempPath, STATE_PATH);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid: number | null | undefined): boolean {
  if (!Number.isInteger(pid) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}

function readLock(): LockState | null {
  try {
    const parsed = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
    if (!isRecord(parsed)) return null;
    const pid = pidOrNull(parsed.pid);
    const token = stringOrNull(parsed.token);
    const createdAt = stringOrNull(parsed.createdAt);
    if (!pid || !token || !createdAt) return null;
    return { pid, token, createdAt };
  } catch {
    return null;
  }
}

function isLockStale(lock: LockState | null): boolean {
  if (!lock) return true;
  const age = Date.now() - Date.parse(lock.createdAt);
  if (!Number.isFinite(age)) return true;
  if (age > LOCK_FORCE_STALE_MS) return true;
  return age > LOCK_STALE_MS && !isProcessAlive(lock.pid);
}

async function withLock<T>(ctx: ExtensionContext | undefined, fn: () => Promise<T> | T): Promise<T> {
  ensureStateDir();
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const lock: LockState = { pid: process.pid, token, createdAt: nowIso() };

  for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt++) {
    try {
      const fd = openSync(LOCK_PATH, "wx");
      try {
        writeFileSync(fd, JSON.stringify(lock), "utf8");
      } finally {
        closeSync(fd);
      }
      try {
        return await fn();
      } finally {
        const current = readLock();
        if (current?.token === token) rmSync(LOCK_PATH, { force: true });
      }
    } catch (error) {
      if (!isRecord(error) || error.code !== "EEXIST") throw error;
      const existing = readLock();
      if (isLockStale(existing)) {
        rmSync(LOCK_PATH, { force: true });
        continue;
      }
      await sleep(LOCK_RETRY_MS);
    }
  }

  ctx?.ui.notify("radio-suomi: state is locked by another session; try again.", "warning");
  throw new Error("radio-suomi lock timeout");
}

function commandExists(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function detectPlayer(): "mpv" | "ffplay" | null {
  if (cachedPlayer !== undefined) return cachedPlayer;
  if (commandExists("mpv", ["--version"])) cachedPlayer = "mpv";
  else if (commandExists("ffplay", ["-version"])) cachedPlayer = "ffplay";
  else cachedPlayer = null;
  return cachedPlayer;
}

function playerArgs(player: "mpv" | "ffplay", url: string): string[] {
  if (player === "mpv") {
    return ["--no-video", "--really-quiet", "--no-terminal", url];
  }
  return [
    "-nodisp",
    "-loglevel",
    "quiet",
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    url,
  ];
}

function streamHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function psArgs(pid: number): string | null {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function validatesPlayerPid(state: RadioState): boolean {
  if (!state.pid || !state.player || !state.url || !isProcessAlive(state.pid)) return false;
  const args = psArgs(state.pid);
  if (!args) return false;
  if (!args.includes(state.player)) return false;
  if (args.includes(state.url)) return true;
  const host = streamHost(state.url);
  return Boolean(host && args.includes(host));
}

function clearPlayingFields(state: RadioState): RadioState {
  return {
    ...state,
    pid: null,
    player: null,
    channelId: null,
    channelName: null,
    url: null,
    startedAt: null,
  };
}

function isValidPlayingState(state: RadioState): boolean {
  return Boolean(state.pid && validatesPlayerPid(state));
}

async function cleanupStaleState(ctx?: ExtensionContext): Promise<void> {
  await withLock(ctx, () => {
    const state = readState(ctx);
    if (state.pid && !isValidPlayingState(state)) writeState(clearPlayingFields(state));
  });
}

async function stopCurrentLocked(ctx: ExtensionContext): Promise<void> {
  const state = readState(ctx);
  if (!state.pid) {
    writeState(clearPlayingFields(state));
    return;
  }

  if (validatesPlayerPid(state)) {
    try {
      process.kill(-state.pid, "SIGTERM");
    } catch {
      try {
        process.kill(state.pid, "SIGTERM");
      } catch {
        // State cleanup below is still safe; process may already be gone.
      }
    }

    await sleep(500);
    if (validatesPlayerPid(state)) {
      try {
        process.kill(-state.pid, "SIGKILL");
      } catch {
        try {
          process.kill(state.pid, "SIGKILL");
        } catch {
          // Best-effort cleanup.
        }
      }
    }
  }

  writeState(clearPlayingFields(state));
}

async function startChannelLocked(channel: Channel, ctx: ExtensionContext): Promise<void> {
  const player = detectPlayer();
  if (!player) {
    const state = readState(ctx);
    writeState(clearPlayingFields({ ...state, lastChannelId: channel.id }));
    ctx.ui.notify("No audio player found. Install mpv (brew install mpv) or ffmpeg (brew install ffmpeg).", "error");
    return;
  }

  await stopCurrentLocked(ctx);

  const child = spawn(player, playerArgs(player, channel.url), {
    detached: true,
    stdio: "ignore",
  });

  child.once("error", (error) => {
    ctx.ui.notify(`radio-suomi: failed to start ${player}: ${error.message}`, "error");
    void cleanupStaleState(ctx).then(() => refreshStatus(ctx));
  });

  child.once("exit", () => {
    void withLock(ctx, () => {
      const state = readState(ctx);
      if (state.pid === child.pid) writeState(clearPlayingFields(state));
    })
      .then(() => refreshStatus(ctx))
      .catch(() => undefined);
  });

  if (!child.pid) {
    ctx.ui.notify(`radio-suomi: ${player} did not report a PID.`, "error");
    return;
  }

  child.unref();
  writeState({
    version: 1,
    pid: child.pid,
    player,
    channelId: channel.id,
    channelName: channel.name,
    url: channel.url,
    startedAt: nowIso(),
    lastChannelId: channel.id,
    updatedAt: nowIso(),
  });
}

function channelForState(state: RadioState): Channel | undefined {
  if (state.channelId) return CHANNEL_BY_ID.get(state.channelId);
  if (state.lastChannelId) return CHANNEL_BY_ID.get(state.lastChannelId);
  return CHANNEL_BY_ID.get(DEFAULT_CHANNEL_ID);
}

function statusText(ctx: ExtensionContext, channelName: string): string {
  return `${ctx.ui.theme.fg("accent", "♪")} ${ctx.ui.theme.fg("success", channelName)}`;
}

function stopLivenessCheck(): void {
  if (!livenessTimer) return;
  clearInterval(livenessTimer);
  livenessTimer = null;
}

function startLivenessCheck(ctx: ExtensionContext): void {
  if (livenessTimer) return;
  livenessTimer = setInterval(() => {
    const state = readState(ctx);
    if (!state.pid) {
      stopLivenessCheck();
      void refreshStatus(ctx);
      return;
    }
    if (!isValidPlayingState(state)) {
      void cleanupStaleState(ctx).then(() => refreshStatus(ctx));
    }
  }, LIVENESS_CHECK_MS);
}

async function refreshStatus(ctx = activeCtx): Promise<void> {
  if (!ctx?.hasUI) return;
  const state = readState(ctx);
  if (isValidPlayingState(state) && state.channelName) {
    ctx.ui.setStatus(STATUS_KEY, statusText(ctx, state.channelName));
    startLivenessCheck(ctx);
    return;
  }

  if (state.pid) {
    await cleanupStaleState(ctx);
  }
  ctx.ui.setStatus(STATUS_KEY, undefined);
  stopLivenessCheck();
}

function stopStartupRefreshes(): void {
  for (const timer of startupRefreshTimers) clearTimeout(timer);
  startupRefreshTimers = [];
}

function scheduleStartupRefreshes(ctx: ExtensionContext): void {
  stopStartupRefreshes();
  startupRefreshTimers = STARTUP_REFRESH_DELAYS_MS.map((delay) =>
    setTimeout(() => {
      void refreshStatus(ctx);
    }, delay),
  );
}

function stopWatcher(): void {
  stopStartupRefreshes();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (stateWatcher) {
    stateWatcher.close();
    stateWatcher = null;
  }
}

function startWatcher(ctx: ExtensionContext): void {
  stopWatcher();
  ensureStateDir();
  stateWatcher = watch(STATE_DIR, (_eventType, filename) => {
    const changed = typeof filename === "string" ? filename : filename?.toString();
    if (changed && changed !== path.basename(STATE_PATH)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refreshStatus(ctx);
    }, WATCH_DEBOUNCE_MS);
  });

  stateWatcher.on("error", (error) => {
    ctx.ui.notify(`radio-suomi: status watcher stopped: ${error.message}`, "warning");
    stopWatcher();
  });
}

function completionItem(value: string, label: string, description: string): AutocompleteItem {
  return { value, label, description };
}

function channelSourceLabel(channel: Channel): string {
  if (channel.country === "SE") return "SE · Sveriges Radio";
  if (channel.country === "FI") return "FI";
  return "Radio";
}

function getArgumentCompletions(prefix: string): AutocompleteItem[] | null {
  const query = prefix.trim().toLowerCase();
  const aliasItems = COMMAND_ALIASES
    .filter((alias) => alias.startsWith(query))
    .map((alias) => completionItem(alias, alias, `radio-suomi ${alias}`));

  const channelItems = CHANNELS
    .filter((channel) => {
      if (!query) return true;
      return [channel.id, channel.name, channel.description].some((field) => field.toLowerCase().includes(query));
    })
    .map((channel) =>
      completionItem(channel.id, `${channel.id} — ${channel.name}`, `${channelSourceLabel(channel)} · ${channel.description}`),
    );

  const items = [...aliasItems, ...channelItems];
  return items.length > 0 ? items : null;
}

function notifyChannelList(ctx: ExtensionContext, country?: "FI" | "SE"): void {
  const channels = country ? CHANNELS.filter((channel) => channel.country === country) : CHANNELS;
  if (!country) {
    const fiCount = CHANNELS.filter((channel) => channel.country === "FI").length;
    const seCount = CHANNELS.filter((channel) => channel.country === "SE").length;
    ctx.ui.notify(`Radio channels: ${fiCount} Finnish, ${seCount} Swedish. Use /radio list fi or /radio list se for details.`, "info");
    return;
  }

  const lines = channels.map((channel) => `${channel.id} — ${channel.name}: ${channel.description}`);
  ctx.ui.notify(lines.join("\n"), "info");
}

async function handleToggle(ctx: ExtensionContext): Promise<void> {
  await withLock(ctx, async () => {
    const state = readState(ctx);
    if (isValidPlayingState(state)) {
      await stopCurrentLocked(ctx);
      ctx.ui.notify("Radio stopped.", "info");
      return;
    }

    if (state.pid) writeState(clearPlayingFields(state));
    const channel = channelForState(state) ?? CHANNEL_BY_ID.get(DEFAULT_CHANNEL_ID);
    if (!channel) throw new Error(`Default channel not found: ${DEFAULT_CHANNEL_ID}`);
    await startChannelLocked(channel, ctx);
  });
}

async function handlePlay(channel: Channel, ctx: ExtensionContext): Promise<void> {
  await withLock(ctx, async () => {
    await startChannelLocked(channel, ctx);
  });
}

async function handleStop(ctx: ExtensionContext): Promise<void> {
  await withLock(ctx, async () => {
    await stopCurrentLocked(ctx);
  });
  ctx.ui.notify("Radio stopped.", "info");
}

function notifyNow(ctx: ExtensionContext): void {
  const state = readState(ctx);
  if (isValidPlayingState(state) && state.channelName) {
    ctx.ui.notify(`Now playing: ${state.channelName}`, "info");
    return;
  }
  ctx.ui.notify("Nothing playing.", "info");
}

export default function radioSuomi(pi: ExtensionAPI): void {
  pi.registerCommand("radio", {
    description: "Control Finnish and Swedish radio. Usage: /radio toggles, /radio channel-sr-p1 plays a channel.",
    getArgumentCompletions,
    handler: async (args: string, ctx: ExtensionContext) => {
      const raw = (args ?? "").trim();
      const normalized = raw.toLowerCase();
      try {
        if (!raw) {
          await handleToggle(ctx);
        } else if (normalized === "off" || normalized === "stop") {
          await handleStop(ctx);
        } else if (normalized === "now") {
          notifyNow(ctx);
        } else if (normalized === "list") {
          notifyChannelList(ctx);
        } else if (normalized === "list fi") {
          notifyChannelList(ctx, "FI");
        } else if (normalized === "list se") {
          notifyChannelList(ctx, "SE");
        } else {
          const channel = CHANNEL_BY_ID.get(raw);
          if (!channel) {
            ctx.ui.notify("Unknown channel. Type /radio and use autocomplete, or run /radio list.", "warning");
            return;
          }
          await handlePlay(channel, ctx);
        }
      } catch (error) {
        ctx.ui.notify(`radio-suomi: ${error instanceof Error ? error.message : String(error)}`, "error");
      } finally {
        await refreshStatus(ctx);
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    activeCtx = ctx;
    ensureStateDir();
    startWatcher(ctx);
    await refreshStatus(ctx);
    scheduleStartupRefreshes(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    activeCtx = ctx;
    await refreshStatus(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stopWatcher();
    stopLivenessCheck();
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
    if (activeCtx === ctx) activeCtx = null;
  });
}
