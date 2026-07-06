window.__armedWithWingsIsAbortError = (error) => {
  return error?.name === "AbortError" || String(error?.message || error).toLowerCase().includes("aborted");
};

window.addEventListener(
  "unhandledrejection",
  (event) => {
    if (window.__armedWithWingsIsAbortError(event.reason)) {
      event.preventDefault();
    }
  },
  true
);

window.RufflePlayer = window.RufflePlayer || {};
window.RufflePlayer.config = {
  autoplay: "on",
  unmuteOverlay: "hidden",
  contextMenu: false,
  letterbox: "fullscreen",
  scale: "showAll",
  allowScriptAccess: true,
  warnOnUnsupportedContent: true,
  storage: "persistent"
};
