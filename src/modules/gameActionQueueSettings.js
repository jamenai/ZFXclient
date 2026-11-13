export const GAME_ACTION_QUEUE_SETTINGS_KEY = "zfx.gameActionQueue.settings.v1";

export const GAME_ACTION_QUEUE_SETTINGS_DEFAULTS = Object.freeze({
  stopButtonPosition: "left",
  showWhenEmpty: false,
});

export function loadGameActionQueueSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GAME_ACTION_QUEUE_SETTINGS_KEY) || "null");
    return {
      stopButtonPosition: saved?.stopButtonPosition === "right" ? "right" : "left",
      showWhenEmpty: typeof saved?.showWhenEmpty === "boolean" ? saved.showWhenEmpty : GAME_ACTION_QUEUE_SETTINGS_DEFAULTS.showWhenEmpty,
    };
  } catch {
    return { ...GAME_ACTION_QUEUE_SETTINGS_DEFAULTS };
  }
}

export function saveGameActionQueueSettings(value) {
  const next = {
    stopButtonPosition: value?.stopButtonPosition === "right" ? "right" : "left",
    showWhenEmpty: typeof value?.showWhenEmpty === "boolean" ? value.showWhenEmpty : GAME_ACTION_QUEUE_SETTINGS_DEFAULTS.showWhenEmpty,
  };
  try { window.localStorage.setItem(GAME_ACTION_QUEUE_SETTINGS_KEY, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
  window.dispatchEvent(new CustomEvent("fx-game-action-queue-settings-changed", { detail: next }));
  return next;
}
