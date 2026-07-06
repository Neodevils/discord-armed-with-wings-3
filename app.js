const assetUrl = (path) => new URL(path, document.baseURI).href;

const FILE_PATH = assetUrl("./game.swf?v=20260706-1");
const DISCORD_SDK_MODULE_URL = assetUrl("./vendor/discord-sdk.js");
const DISCORD_READY_TIMEOUT_MS = 3500;
const DISCORD_CLIENT_ID = "1520427674860912660";
const DISCORD_ACTIVITY_SCOPES = ["identify", "rpc.activities.write"];

const params = new URLSearchParams(window.location.search);
const isDiscordActivity =
  window.location.hostname.endsWith(".discordsays.com") ||
  params.has("instance_id") ||
  params.has("frame_id") ||
  params.has("discord_proxy_ticket");
const discordClientId = params.get("discordClientId") || params.get("client_id") || (isDiscordActivity ? DISCORD_CLIENT_ID : "");

const target = document.querySelector("#player");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const fullscreenButton = document.querySelector("#fullscreenButton");
const hint = document.querySelector("#hint");

let rufflePlayer = null;
let discordSdk = null;
let discordReady = false;
const keyboardListenerTargets = new Set();

function setStatus(state, text) {
  statusDot.className = `dot ${state || ""}`;
  statusText.textContent = text;
}

function runBackgroundTask(promise, label) {
  Promise.resolve(promise).catch((error) => {
    if (!window.__armedWithWingsIsAbortError?.(error)) {
      console.warn(`${label} failed:`, error);
    }
  });
}

async function boot() {
  const api = window.RufflePlayer?.newest?.();

  if (!api || !target) {
    setStatus("error", "Ruffle missing");
    console.error("Ruffle or player container was not found.");
    return;
  }

  const player = api.createPlayer();
  player.tabIndex = 0;
  target.appendChild(player);
  rufflePlayer = player;

  installFocusHandlers();
  await player.ruffle().load(FILE_PATH);
  installKeyboardListeners();
  focusRufflePlayer();
  setStatus("ready", isDiscordActivity ? "Discord ready" : "Ready");
  window.setTimeout(() => hint?.classList.add("is-hidden"), 5000);
}

function focusRufflePlayer() {
  focusRufflePlayerNow();
  requestAnimationFrame(focusRufflePlayerNow);
}

function focusRufflePlayerNow() {
  const focusTarget = rufflePlayer?.shadowRoot?.querySelector("canvas") || rufflePlayer;
  focusTarget?.focus?.({ preventScroll: true });
}

function ruffleEventTargets() {
  const targets = [rufflePlayer];
  if (rufflePlayer?.shadowRoot) targets.push(rufflePlayer.shadowRoot);
  const shadowCanvas = rufflePlayer?.shadowRoot?.querySelector("canvas");
  if (shadowCanvas) targets.push(shadowCanvas);
  if (target) targets.push(target);
  if (document.activeElement) targets.push(document.activeElement);
  targets.push(document, window);
  return Array.from(new Set(targets.filter(Boolean)));
}

function installKeyboardListeners() {
  for (const listenerTarget of ruffleEventTargets()) {
    if (keyboardListenerTargets.has(listenerTarget) || !listenerTarget.addEventListener) continue;
    keyboardListenerTargets.add(listenerTarget);
    listenerTarget.addEventListener("keydown", focusRufflePlayer, true);
    listenerTarget.addEventListener("keyup", focusRufflePlayer, true);
  }
}

function installFocusHandlers() {
  const refocus = () => {
    installKeyboardListeners();
    focusRufflePlayer();
  };

  window.addEventListener("pointerdown", refocus, true);
  window.addEventListener("touchstart", refocus, { passive: false, capture: true });
  window.addEventListener("mousedown", refocus, true);
  window.addEventListener("focus", refocus, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refocus();
  });
}

async function enterFullscreen() {
  const element = document.documentElement;

  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  if (element.requestFullscreen) {
    await element.requestFullscreen();
  }
}

async function setupDiscordSdk() {
  if (!isDiscordActivity || !discordClientId) {
    return;
  }

  try {
    const module = await import(DISCORD_SDK_MODULE_URL);
    const DiscordSDK = module.DiscordSDK || module.default?.DiscordSDK || module.default;
    if (!DiscordSDK) throw new Error("Discord SDK export was not found.");

    discordSdk = new DiscordSDK(discordClientId);
    await withTimeout(discordSdk.ready(), DISCORD_READY_TIMEOUT_MS, "Discord SDK ready");
    discordReady = true;
    await authorizeDiscordActivity();
    await updateDiscordActivityStatus();
  } catch (error) {
    discordReady = false;
    console.warn("Discord Activity setup failed:", error);
  }
}

async function authorizeDiscordActivity() {
  if (!discordSdk?.commands?.authorize || !discordSdk?.commands?.authenticate) return;

  const { code } = await discordSdk.commands.authorize({
    client_id: discordClientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: DISCORD_ACTIVITY_SCOPES
  });

  if (!code) return;
  const token = params.get("access_token");
  if (!token) return;

  await discordSdk.commands.authenticate({ access_token: token });
}

async function updateDiscordActivityStatus() {
  if (!discordReady || !discordSdk?.commands?.setActivity) return;

  await discordSdk.commands.setActivity({
    activity: {
      details: "Playing Armed With Wings 3",
      state: "Single player",
      timestamps: { start: Date.now() }
    }
  });
}

function withTimeout(promise, timeoutMs, label) {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })
  ]).finally(() => window.clearTimeout(timer));
}

fullscreenButton?.addEventListener("click", () => {
  runBackgroundTask(enterFullscreen(), "fullscreen");
  focusRufflePlayer();
});

window.addEventListener("load", () => {
  runBackgroundTask(setupDiscordSdk(), "discord setup");
  runBackgroundTask(boot(), "ruffle boot");
});
