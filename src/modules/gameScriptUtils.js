import { settingsApi } from "./settings/settings.js";
import { gameDataAdapter, getVar } from "../adapter/gameInterface.js";
import { escapeHtml } from "./utils.js";
import { drawPlayerNameWithCountryFlags } from "./countryFlagRenderer.js";

// Example usage from game script: __fx.utils.getMaxTroops(...)

function getMaxTroops(playerTerritories, playerID) {
    return (playerTerritories[playerID] * 150).toString();
};
function getDensity(playerID, playerBalances, playerTerritories) {
    const data = gameDataAdapter.getPlayerData(playerID);
    const balanceValue = playerBalances ? playerBalances?.[playerID] : data?.balance;
    const territoryValue = playerTerritories ? playerTerritories?.[playerID] : data?.territories;
    const balance = Number(balanceValue);
    const territories = Number(territoryValue);
    if (balanceValue == null || territoryValue == null || !Number.isFinite(balance) || !Number.isFinite(territories)) return "";
    const safeTerritories = territories === 0 ? 1 : territories;
    if (settingsApi.getString("densityDisplayStyle") === "percentage") return ((balance / (safeTerritories * 150)) * 100).toFixed(1) + "%";
    return (balance / safeTerritories).toFixed(1);
};
function getLobbyPlayerRank(rankValue) {
    const rank = typeof rankValue === "number" ? rankValue : Number(rankValue);
    return Number.isFinite(rank) && rank >= 0 ? rank + 1 : null;
}
const estimatedAttackFormatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
function getEstimatedEliminationAttackData(playerID, remainingBalance, remainingTerritories) {
    if (playerID === getVar("playerId")) return null;
    const target = gameDataAdapter.getPlayerData(playerID);
    if (Number.isFinite(target?.territories) && target.territories <= 0) return null;
    const committedAttack = target?.committed ?? 0;
    const balance = Number.isFinite(remainingBalance)
        ? Math.max(0, remainingBalance)
        : Math.max(0, (target?.balance ?? 0) - committedAttack);
    if (!Number.isFinite(balance) || balance <= 0) return null;
    const territoryCount = Number.isFinite(remainingTerritories)
        ? Math.max(0, remainingTerritories)
        : target?.territories;
    // The multiplier estimates defender losses; the tile cost stays at two units per tile.
    const configuredMultiplier = settingsApi.getNumber("estimatedAttackTroopMultiplier");
    const troopMultiplier = Number.isFinite(configuredMultiplier)
        ? Math.max(1, Math.min(4, configuredMultiplier))
        : 2;
    const estimatedAttack = Math.ceil(balance * troopMultiplier + (Number.isFinite(territoryCount) ? territoryCount * 2 : 0));
    const ownPlayerID = getVar("playerId");
    const ownData = gameDataAdapter.getPlayerData(ownPlayerID);
    const ownBalance = ownData?.balance;
    const ownCommitted = ownData?.committed;
    const ownAvailable = ownBalance - ownCommitted;
    const ownShare = Number.isFinite(ownCommitted) && Number.isFinite(ownAvailable) && ownAvailable > 0
        ? estimatedAttack / ownAvailable * 100
        : null;
    return { estimatedAttack, ownShare };
}
function getEstimatedEliminationAttack(playerID, remainingBalance, remainingTerritories) {
    const estimate = getEstimatedEliminationAttackData(playerID, remainingBalance, remainingTerritories);
    if (!estimate) return "";
    const ownShare = Number.isFinite(estimate.ownShare) ? ` (${Math.ceil(estimate.ownShare)}%)` : "";
    return `\u2248${estimatedAttackFormatter.format(estimate.estimatedAttack)}${ownShare}`;
}
function getEstimatedEliminationAttackColor(playerID, remainingBalance, remainingTerritories) {
    const estimate = getEstimatedEliminationAttackData(playerID, remainingBalance, remainingTerritories);
    if (!Number.isFinite(estimate?.ownShare)) return null;
    const configuredThreshold = settingsApi.getNumber("estimatedAttackGreenThreshold");
    const greenThreshold = Number.isFinite(configuredThreshold)
        ? Math.max(5, Math.min(75, configuredThreshold))
        : 25;
    const redProgress = Math.max(0, Math.min(1, (estimate.ownShare - greenThreshold) / (100 - greenThreshold)));
    const hue = Math.round(120 * (1 - redProgress));
    return `hsl(${hue}, 85%, 55%)`;
}
function drawEstimatedEliminationAttack(ctx, playerID, text, x, y) {
    ctx.save();
    const estimateColor = getEstimatedEliminationAttackColor(playerID);
    if (estimateColor) ctx.fillStyle = estimateColor;
    ctx.lineWidth = Math.max(1, (Number.parseFloat(ctx.font) || 10) * 0.16);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(5, 9, 15, 0.95)";
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
}
function drawPlayerLabelMetrics(ctx, playerID, x, y, nativeFontSize) {
    const showDensity = settingsApi.getBoolean("showPlayerDensity");
    const showAttack = settingsApi.getBoolean("showEstimatedEliminationAttack");
    if (!showDensity && !showAttack) return;
    const baseSize = Number.isFinite(nativeFontSize) && nativeFontSize > 0 ? nativeFontSize : 10;
    const densityScale = Math.max(50, Math.min(200, settingsApi.getNumber("playerDensityFontScale") || 100)) / 100;
    const attackScale = Math.max(50, Math.min(200, settingsApi.getNumber("estimatedAttackFontScale") || 100)) / 100;
    const oldFont = ctx.font;
    const getFont = scale => oldFont.replace(/[\d.]+px/, `${Math.max(5, baseSize * scale)}px`);
    ctx.save();
    if (showDensity) {
        ctx.font = getFont(densityScale);
        if (settingsApi.getBoolean("coloredDensity")) ctx.fillStyle = textStyleBasedOnDensity(playerID);
        ctx.fillText(getDensity(playerID), x, y + baseSize * 0.85);
    }
    if (showAttack) {
        const attack = getEstimatedEliminationAttack(playerID);
        if (attack) {
            ctx.font = getFont(attackScale);
            drawEstimatedEliminationAttack(ctx, playerID, attack, x, y + baseSize * (showDensity ? 1.65 : 0.85));
        }
    }
    ctx.restore();
}
function isPointInRectangle(x, y, rectangleStartX, rectangleStartY, width, height) {
    return x >= rectangleStartX && x <= rectangleStartX + width && y >= rectangleStartY && y <= rectangleStartY + height;
};
/** @param {CanvasRenderingContext2D} canvas @param {string} text */
function fillTextMultiline(canvas, text, x, y, maxWidth) {
    const lineHeight = parseInt(canvas.font.split(" ").find(part => part.endsWith("px")).slice(0, -2));
    text.split("\n").forEach((line, index) => canvas.fillText(line, x, y + index * lineHeight, maxWidth));
}
function textStyleBasedOnDensity(playerID, playerBalances, playerTerritories) {
    const data = gameDataAdapter.getPlayerData(playerID);
    const balance = Number(playerBalances ? playerBalances?.[playerID] : data?.balance);
    const territories = Number(playerTerritories ? playerTerritories?.[playerID] : data?.territories);
    if (!Number.isFinite(balance) || !Number.isFinite(territories) || territories <= 0) {
        return "rgba(255, 255, 255, 1)";
    }
    const hue = balance / (territories * 1.5);
    return Number.isFinite(hue) ? `hsl(${hue}, 100%, 50%, 1)` : "rgba(255, 255, 255, 1)";
}
// specific color pallete so two ips dont have a similar looking color
const duplicateIpColorPalette = [
    "hsla(36, 90%, 52%, 0.5)",
    "hsla(50, 90%, 48%, 0.5)",
    "hsla(72, 70%, 40%, 0.5)",
    "hsla(95, 65%, 40%, 0.5)",
    "hsla(130, 70%, 45%, 0.5)",
    "hsla(150, 65%, 40%, 0.5)",
    "hsla(165, 70%, 38%, 0.5)",
    "hsla(185, 80%, 48%, 0.5)",
    "hsla(200, 85%, 50%, 0.5)",
    "hsla(215, 85%, 55%, 0.5)",
    "hsla(235, 75%, 60%, 0.5)",
    "hsla(255, 60%, 62%, 0.5)",
    "hsla(270, 70%, 60%, 0.5)",
    "hsla(285, 75%, 58%, 0.5)",
    "hsla(300, 75%, 55%, 0.5)",
    "hsla(315, 80%, 58%, 0.5)",
    "hsla(330, 80%, 58%, 0.5)",
];

function hashInt(n) {
    n = (n ^ (n >>> 16)) >>> 0;
    n = Math.imul(n, 0x45d9f3b) >>> 0;
    n = (n ^ (n >>> 16)) >>> 0;
    n = Math.imul(n, 0x45d9f3b) >>> 0;
    return (n ^ (n >>> 16)) >>> 0;
}

let cachedEntries = null;
let cachedEntriesKey = null;
let cachedIpColors = null;
const assignedColorIndexes = new Map();

function getIpColors(entries, ipField) {
    const key = ipField + "|" + entries.length;
    if (cachedEntries === entries && cachedEntriesKey === key) return cachedIpColors;

    const counts = new Map();
    entries.forEach(entry => {
        const ip = entry[ipField];
        if (ip === undefined) return;
        counts.set(ip, (counts.get(ip) || 0) + 1);
    });

    const paletteLength = duplicateIpColorPalette.length;
    const duplicates = [...counts.keys()].filter(ip => counts.get(ip) >= 2).sort();
    const duplicateSet = new Set(duplicates);
    assignedColorIndexes.forEach((_, ip) => {
        if (!duplicateSet.has(ip)) assignedColorIndexes.delete(ip);
    });

    const taken = new Set(assignedColorIndexes.values());
    duplicates.forEach(ip => {
        if (assignedColorIndexes.has(ip)) return;
        let index = hashInt(ip) % paletteLength;
        if (taken.size < paletteLength) {
            while (taken.has(index)) index = (index + 1) % paletteLength;
            taken.add(index);
        }
        assignedColorIndexes.set(ip, index);
    });

    const colors = new Map();
    duplicates.forEach(ip => colors.set(ip, duplicateIpColorPalette[assignedColorIndexes.get(ip)]));

    cachedEntries = entries;
    cachedEntriesKey = key;
    cachedIpColors = colors;
    return colors;
}

function getDuplicateIpHighlightColor(player, entries, ipField) {
    const ip = player[ipField];
    if (ip === undefined) return null;
    return getIpColors(entries, ipField).get(ip) || null;
}

function parseAccountId(value) {
    const match = /^[a-zA-Z0-9_-]{1,5}/.exec(value);
    return match ? match[0] : null;
}

export default { getMaxTroops, getDensity, getLobbyPlayerRank, getEstimatedEliminationAttack, drawEstimatedEliminationAttack, drawPlayerLabelMetrics, drawPlayerNameWithCountryFlags, isPointInRectangle, fillTextMultiline, textStyleBasedOnDensity, getDuplicateIpHighlightColor, escapeHtml, parseAccountId }
