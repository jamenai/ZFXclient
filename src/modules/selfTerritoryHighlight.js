import { settingsApi } from "./settings/settings.js";

const diagnostics = { renderCalls: 0, rebuilds: 0, lastPlayerId: null, lastOwnCellCount: 0 };
let cachedBoundary = null;
let cachedKey = "";
let cachedAt = 0;

/** Draw the cached owner boundary over Terri's live map layer each frame. */
export function drawSelfTerritoryHighlightOnGameMap(context, mapAccess, mapSize, offsetMethod, isPlayerCellMethod, playerId, translateX, translateY, zoom) {
  diagnostics.renderCalls++;
  if (!context || !mapAccess || !settingsApi.getBoolean("highlightSelfTerritory") || !Number.isInteger(playerId)) return;
  const width = mapSize?.fn;
  const height = mapSize?.fo;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3) return;

  const revision = window.__fx?.selfTerritoryHighlightRevision ?? 0;
  const key = `${playerId}:${width}:${height}:${revision}`;
  const now = performance.now();
  if (!cachedBoundary || (cachedKey !== key && now - cachedAt >= 100)) {
    const path = new Path2D();
    const owned = new Uint8Array(width * height);
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (!mapAccess[isPlayerCellMethod](playerId, mapAccess[offsetMethod](x, y))) continue;
        owned[y * width + x] = 1;
        count++;
      }
    }
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const cell = y * width + x;
        if (!owned[cell]) continue;
        if (!owned[cell - width]) { path.moveTo(x, y); path.lineTo(x + 1, y); }
        if (!owned[cell + 1]) { path.moveTo(x + 1, y); path.lineTo(x + 1, y + 1); }
        if (!owned[cell + width]) { path.moveTo(x + 1, y + 1); path.lineTo(x, y + 1); }
        if (!owned[cell - 1]) { path.moveTo(x, y + 1); path.lineTo(x, y); }
      }
    }
    cachedBoundary = path;
    cachedKey = key;
    cachedAt = now;
    diagnostics.rebuilds++;
    diagnostics.lastPlayerId = playerId;
    diagnostics.lastOwnCellCount = count;
  }
  if (!diagnostics.lastOwnCellCount) return;

  const lineWidth = Math.max(1, Math.min(6, settingsApi.getNumber("selfTerritoryOutlineWidth", 3)));
  const glow = Math.max(0, Math.min(12, settingsApi.getNumber("selfTerritoryGlow", 0)));
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  context.save();
  context.translate(translateX || 0, translateY || 0);
  context.lineJoin = "round";
  context.lineWidth = lineWidth / scale;
  context.strokeStyle = "#111111";
  context.stroke(cachedBoundary);
  context.lineWidth = Math.max(1, lineWidth * 0.6) / scale;
  context.strokeStyle = "#42e8ff";
  context.shadowColor = glow ? "rgba(66,232,255,.9)" : "transparent";
  context.shadowBlur = glow / scale;
  context.stroke(cachedBoundary);
  context.shadowBlur = 0;
  context.lineWidth = Math.max(.5, lineWidth / 3) / scale;
  context.strokeStyle = "#ffffff";
  context.stroke(cachedBoundary);
  context.restore();
}

export function refreshSelfTerritoryHighlights() {
  window.__fx ||= {};
  window.__fx.selfTerritoryHighlightRevision = (window.__fx.selfTerritoryHighlightRevision || 0) + 1;
}

export function getSelfTerritoryHighlightDiagnostics() {
  return { ...diagnostics, boundaryCached: Boolean(cachedBoundary), revision: window.__fx?.selfTerritoryHighlightRevision ?? 0 };
}
