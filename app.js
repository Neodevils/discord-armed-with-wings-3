const assetUrl = (path) => new URL(path, document.baseURI).href;

const FILE_PATH = assetUrl("./game.swf?v=20260706-1");
const DISCORD_SDK_MODULE_URL = assetUrl("./vendor/discord-sdk.js");
const DISCORD_READY_TIMEOUT_MS = 3500;
const DISCORD_CLIENT_ID = "1520427674860912660";
const DISCORD_AUTH_TOKEN_URL = "/api/auth/discord/token";
const DISCORD_ACTIVITY_SCOPES = ["identify", "rpc.activities.write"];
const ACTIVITY_STARTED_AT = Date.now();

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

let rufflePlayer = null;
let discordSdk = null;
let discordReady = false;
let discordAuthenticated = false;
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
  setStatus("ready", "Ready");
  runBackgroundTask(updateDiscordActivityStatus(), "discord status update");
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

async function initDiscordActivity() {
  if (!discordClientId) {
    return;
  }

  try {
    const { DiscordSDK } = await import(DISCORD_SDK_MODULE_URL);
    if (!DiscordSDK) throw new Error("Discord SDK export was not found.");

    discordSdk = new DiscordSDK(discordClientId);
    await withTimeout(discordSdk.ready(), DISCORD_READY_TIMEOUT_MS, "Discord SDK ready");
    discordReady = true;
    await authenticateDiscordActivity();
    await updateDiscordActivityStatus();
  } catch (error) {
    discordReady = false;
    discordAuthenticated = false;
    console.warn("Discord Activity init failed:", error);
  }
}

async function authenticateDiscordActivity() {
  if (!discordSdk?.commands?.authorize || !discordSdk?.commands?.authenticate) return;

  try {
    const auth = await discordSdk.commands.authorize({
      client_id: discordClientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: DISCORD_ACTIVITY_SCOPES
    });
    const tokenResponse = await fetch(DISCORD_AUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ code: auth.code })
    });

    if (!tokenResponse.ok) {
      throw new Error(`Discord token exchange failed: ${tokenResponse.status}`);
    }

    const token = await tokenResponse.json();
    if (typeof token.access_token !== "string" || !token.access_token) {
      throw new Error("Discord token exchange did not return an access token");
    }

    const authenticated = await discordSdk.commands.authenticate({ access_token: token.access_token });
    if (!authenticated) {
      throw new Error("Discord authenticate command returned no user");
    }
    discordAuthenticated = true;
  } catch (error) {
    if (!window.__armedWithWingsIsAbortError?.(error)) {
      console.warn("Discord authentication failed:", error);
    }
    discordAuthenticated = false;
  }
}

async function updateDiscordActivityStatus() {
  if (!discordAuthenticated || !discordSdk?.commands?.setActivity) return;

  try {
    await discordSdk.commands.setActivity({
      activity: {
        name: "Armed With Wings 3",
        type: 0,
        application_id: discordClientId,
        details: "Playing Armed With Wings 3",
        state: "Single player",
        timestamps: {
          start: ACTIVITY_STARTED_AT
        },
        party: {
          id: discordSdk.instanceId || "single-player",
          size: [1, 1]
        },
        instance: true
      }
    });
  } catch (error) {
    if (!window.__armedWithWingsIsAbortError?.(error)) {
      console.warn("Discord activity status update failed:", error);
    }
  }
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
  runBackgroundTask(initDiscordActivity(), "discord setup");
  runBackgroundTask(boot(), "ruffle boot");
});
