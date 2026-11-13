export const GAME_HUD_VISIBILITY_STORAGE_KEY = "zfx.gameHud.visibility.v1";

export const GAME_HUD_VISIBILITY_DEFAULTS = Object.freeze({
  leaderboard: true,
  density: true,
  mapControl: true,
  income: true,
  time: true,
  teamChart: true,
  tickCounter: true,
  minimap: true,
  attackSelector: true,
  actionQueue: true,
  actionQueueFrame: true,
  boatRoutes: true,
  keybindButtons: true,
});

export const GAME_HUD_VISIBILITY_OPTIONS = Object.freeze([
  ["leaderboard", "Leaderboard"],
  ["density", "Density / max troops"],
  ["mapControl", "Map percentage / pixels"],
  ["income", "Income"],
  ["time", "Game time"],
  ["teamChart", "Team chart"],
  ["tickCounter", "Tick counter / balance"],
  ["minimap", "Minimap"],
  ["attackSelector", "Attack selector"],
  ["actionQueue", "Running attacks / boats"],
  ["actionQueueFrame", "Action list frame"],
  ["keybindButtons", "Keybind buttons"],
].map(([key, label]) => Object.freeze({ key, label })));

export function loadGameHudVisibility() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GAME_HUD_VISIBILITY_STORAGE_KEY) || "null");
    return Object.fromEntries(Object.keys(GAME_HUD_VISIBILITY_DEFAULTS).map(key => [
      key,
      typeof saved?.[key] === "boolean" ? saved[key] : GAME_HUD_VISIBILITY_DEFAULTS[key],
    ]));
  } catch {
    return { ...GAME_HUD_VISIBILITY_DEFAULTS };
  }
}

export function saveGameHudVisibility(value) {
  const next = Object.fromEntries(Object.keys(GAME_HUD_VISIBILITY_DEFAULTS).map(key => [
    key,
    typeof value?.[key] === "boolean" ? value[key] : GAME_HUD_VISIBILITY_DEFAULTS[key],
  ]));
  try { window.localStorage.setItem(GAME_HUD_VISIBILITY_STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
  window.dispatchEvent(new CustomEvent("fx-game-hud-visibility-changed", { detail: next }));
  return next;
}
