import { settingsApi } from "./settings/settings.js";

const diagnostics = { renderCalls: 0, rebuilds: 0, lastPlayerId: null, lastOwnCellCount: 0 };
let cachedBoundary = null;
let cachedKey = "";
let cachedOwned = null;
let cachedEdges = new Set();
let cachedWidth = 0;
let cachedHeight = 0;
let cachedPlayerId = -1;
let boundaryDirty = true;

function refreshEdge(x, y, horizontal, owned) {
  const key = horizontal
    ? y * cachedWidth + x
    : (cachedHeight + 1) * cachedWidth + y * (cachedWidth + 1) + x;
  if (owned) cachedEdges.add(key);
  else cachedEdges.delete(key);
}

function rebuildBoundaryPath() {
  const path = new Path2D();
  const horizontalCount = (cachedHeight + 1) * cachedWidth;
  for (const key of cachedEdges) {
    if (key < horizontalCount) {
      const y = Math.floor(key / cachedWidth), x = key % cachedWidth;
      path.moveTo(x, y); path.lineTo(x + 1, y);
    } else {
      const edge = key - horizontalCount;
      const y = Math.floor(edge / (cachedWidth + 1)), x = edge % (cachedWidth + 1);
      path.moveTo(x, y); path.lineTo(x, y + 1);
    }
  }
  cachedBoundary = path;
  boundaryDirty = false;
}

function setOwnedCell(x, y, isOwned) {
  if (x < 0 || y < 0 || x >= cachedWidth || y >= cachedHeight) return false;
  const index = y * cachedWidth + x;
  if (cachedOwned[index] === Number(isOwned)) return false;
  cachedOwned[index] = Number(isOwned);
  const valueAt = (cellX, cellY) => cellX < 0 || cellY < 0 || cellX >= cachedWidth || cellY >= cachedHeight
    ? 0 : cachedOwned[cellY * cachedWidth + cellX];
  refreshEdge(x, y, true, cachedOwned[index] !== valueAt(x, y - 1));
  refreshEdge(x, y + 1, true, cachedOwned[index] !== valueAt(x, y + 1));
  refreshEdge(x, y, false, cachedOwned[index] !== valueAt(x - 1, y));
  refreshEdge(x + 1, y, false, cachedOwned[index] !== valueAt(x + 1, y));
  diagnostics.lastOwnCellCount += cachedOwned[index] ? 1 : -1;
  boundaryDirty = true;
  return true;
}

/** Draw the cached owner boundary over Terri's live map layer each frame. */
export function drawSelfTerritoryHighlightOnGameMap(context, mapAccess, mapSize, offsetMethod, isPlayerCellMethod, playerId, translateX, translateY, zoom) {
  diagnostics.renderCalls++;
  if (!context || !mapAccess || !settingsApi.getBoolean("highlightSelfTerritory") || !Number.isInteger(playerId)) return;
  const width = mapSize?.fr ?? mapSize?.fn;
  const height = mapSize?.fs ?? mapSize?.fo;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3) return;

  const key = `${playerId}:${width}:${height}`;
  if (!cachedOwned || cachedKey !== key) {
    cachedWidth = width;
    cachedHeight = height;
    cachedPlayerId = playerId;
    cachedOwned = new Uint8Array(width * height);
    cachedEdges = new Set();
    cachedBoundary = null;
    let count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const owned = mapAccess[isPlayerCellMethod](playerId, mapAccess[offsetMethod](x, y));
        cachedOwned[y * width + x] = Number(owned);
        if (owned) count++;
      }
    }
    const valueAt = (x, y) => x < 0 || y < 0 || x >= width || y >= height ? 0 : cachedOwned[y * width + x];
    for (let y = 0; y <= height; y++) for (let x = 0; x < width; x++) {
      if (valueAt(x, y - 1) !== valueAt(x, y)) refreshEdge(x, y, true, true);
    }
    for (let y = 0; y < height; y++) for (let x = 0; x <= width; x++) {
      if (valueAt(x - 1, y) !== valueAt(x, y)) refreshEdge(x, y, false, true);
    }
    diagnostics.lastOwnCellCount = count;
    cachedKey = key;
    boundaryDirty = true;
  }
  if (boundaryDirty) {
    rebuildBoundaryPath();
    diagnostics.rebuilds++;
    diagnostics.lastPlayerId = playerId;
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
  cachedKey = "";
}

/** Apply a single native map-cell ownership update without rescanning the map. */
export function updateSelfTerritoryHighlightCell(cellOffset, territoryMap, mapSize, playerId) {
  if (!cachedOwned || cachedPlayerId !== playerId || cachedWidth !== mapSize?.fr || cachedHeight !== mapSize?.fs) return;
  const index = Math.floor(Number(cellOffset) / 4);
  if (!Number.isInteger(index) || index < 0 || index >= cachedOwned.length) return;
  const x = index % cachedWidth, y = Math.floor(index / cachedWidth);
  const isOwned = territoryMap.hG(cellOffset) && territoryMap.fY(cellOffset) === playerId;
  setOwnedCell(x, y, isOwned);
}

export function getSelfTerritoryHighlightDiagnostics() {
  return { ...diagnostics, boundaryCached: Boolean(cachedBoundary), revision: window.__fx?.selfTerritoryHighlightRevision ?? 0 };
}
