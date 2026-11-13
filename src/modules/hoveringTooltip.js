import { settingsApi } from "./settings/settings.js";
import { gameDataAdapter, getVar } from "../adapter/gameInterface.js";

const hoveringTooltip = new (function() {
    let tooltip = null;
    let attachedCanvas = null;
    let lastContextPoint = null;
    let clearContextTimer = 0;
    this.active = false;
    this.onTerritoryHover = () => {};

    const ensureStyles = () => {
        if (document.getElementById("fx-territory-card-style")) return;
        const style = document.createElement("style");
        style.id = "fx-territory-card-style";
        style.textContent = `
          .fx-territory-hover-tooltip{position:fixed;z-index:10000;display:none;width:min(276px,calc(100vw - 20px));box-sizing:border-box;padding:10px;border:1px solid color-mix(in srgb,var(--fx-territory-color,#9bc4ff) 35%,rgba(150,185,225,.17));border-left:3px solid var(--fx-territory-color,#9bc4ff);border-radius:10px;background:radial-gradient(ellipse at 0 0,color-mix(in srgb,var(--fx-territory-color,#9bc4ff) 15%,transparent),transparent 58%),linear-gradient(145deg,rgba(20,30,45,.97),rgba(9,15,26,.97));box-shadow:0 10px 28px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(14px);color:#edf4ff;font:12px/1.25 var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:none;user-select:none}
          .fx-territory-card-head{display:flex;align-items:center;gap:8px;min-width:0;padding:1px 1px 8px;border-bottom:1px solid rgba(150,185,225,.15)}
          .fx-territory-card-avatar{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border:1px solid color-mix(in srgb,var(--fx-territory-color,#9bc4ff) 42%,transparent);border-radius:7px;background:color-mix(in srgb,var(--fx-territory-color,#9bc4ff) 20%,rgba(130,180,240,.11));color:var(--fx-territory-color,#b9d7ff)}
          .fx-territory-card-avatar svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
          .fx-territory-card-identity{display:flex;flex:1;flex-direction:column;gap:3px;min-width:0}.fx-territory-card-name{overflow:hidden;color:#f4f7ff;font-size:14px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.fx-territory-card-clan{color:#9fb2cb;font-size:10px;line-height:1.1}
          .fx-territory-card-kind{flex:0 0 auto;padding:3px 5px;border:1px solid rgba(160,190,225,.17);border-radius:5px;background:rgba(255,255,255,.045);color:#aebed1;font-size:8px;font-weight:800;letter-spacing:.08em}
          .fx-territory-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.fx-territory-card-metric{display:flex;flex-direction:column;justify-content:space-between;gap:5px;min-width:0;min-height:55px;box-sizing:border-box;padding:7px 8px;border:1px solid rgba(150,185,225,.14);border-radius:8px;background:linear-gradient(145deg,rgba(20,30,45,.82),rgba(9,15,26,.82))}.fx-territory-card-metric.is-density{border-color:color-mix(in srgb,var(--fx-density-color,#78a9ff) 35%,rgba(150,185,225,.14));background:radial-gradient(ellipse at 0 0,color-mix(in srgb,var(--fx-density-color,#78a9ff) 18%,transparent),transparent 75%),linear-gradient(145deg,rgba(20,30,45,.85),rgba(9,15,26,.88))}
          .fx-territory-card-label{display:flex;align-items:center;gap:5px;color:#93a8c1;font-size:9px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.fx-territory-card-icon{display:grid;place-items:center;width:14px;height:14px;border-radius:4px;background:rgba(255,255,255,.055);color:#bbcade;font-size:10px;line-height:1}
          .fx-territory-card-value{overflow:hidden;color:#f0f5ff;font-size:20px;font-weight:750;line-height:1.05;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}.fx-territory-card-metric.is-density .fx-territory-card-value{color:var(--fx-density-color,#b8d7ff);font-size:22px}.fx-territory-card-metric.is-secondary{min-height:43px}.fx-territory-card-metric.is-secondary .fx-territory-card-value{font-size:14px}
          .fx-territory-card-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;padding:6px 2px 0;border-top:1px solid rgba(150,185,225,.12);color:#8195ae;font-size:9px;font-variant-numeric:tabular-nums}.fx-territory-card-footer span{display:flex;align-items:center;gap:4px}
          @media(max-width:360px){.fx-territory-hover-tooltip{width:min(250px,calc(100vw - 16px))}.fx-territory-card-value{font-size:18px}}
        `;
        document.head.appendChild(style);
    };

    const ensureTooltip = () => {
        ensureStyles();
        if (tooltip?.isConnected) return tooltip;
        tooltip = document.createElement("div");
        tooltip.className = "fx-territory-hover-tooltip";
        tooltip.setAttribute("role", "status");
        document.body.appendChild(tooltip);
        return tooltip;
    };
    const hideTooltip = () => {
        if (tooltip) tooltip.style.display = "none";
    };
    const formatNumber = value => value != null && value !== "" && Number.isFinite(Number(value))
        ? new Intl.NumberFormat().format(Number(value))
        : "—";
    const createMetric = (label, value, icon, extraClass = "") => {
        const metric = document.createElement("div");
        metric.className = `fx-territory-card-metric ${extraClass}`.trim();
        const heading = document.createElement("div");
        heading.className = "fx-territory-card-label";
        const mark = document.createElement("span");
        mark.className = "fx-territory-card-icon";
        mark.textContent = icon;
        const caption = document.createElement("span");
        caption.textContent = label;
        heading.append(mark, caption);
        const output = document.createElement("strong");
        output.className = "fx-territory-card-value";
        output.textContent = value == null || value === "" ? "—" : String(value);
        metric.append(heading, output);
        return metric;
    };
    const showNativeTerritory = (playerId, mapX, mapY) => {
        if (!settingsApi.getBoolean("territoryOwnerTooltip")) return false;
        if (!Number.isInteger(playerId) || playerId < 0) return false;
        const player = gameDataAdapter.getPlayerData(playerId);
        const rawName = getVar("rawPlayerNames")?.[playerId];
        const territories = player?.territories;
        const balance = player?.balance;
        const committed = player?.committed ?? 0;
        const clan = window.__fx?.leaderboardFilter?.parseClanFromPlayerName?.(String(rawName ?? "")) || null;
        const availableTroops = Number.isFinite(balance) ? Math.max(0, balance - (Number.isFinite(committed) ? committed : 0)) : null;
        const density = window.__fx?.utils?.getDensity?.(playerId) || null;
        const densityColor = window.__fx?.utils?.textStyleBasedOnDensity?.(playerId) || "#8fbaff";
        const attack = settingsApi.getBoolean("showEstimatedEliminationAttack")
            ? window.__fx?.utils?.getEstimatedEliminationAttack?.(playerId, availableTroops, territories)
            : null;
        const playerColor = window.__fx?.gameMinimapAdapter?.getPlayerColor?.(playerId) || "#9bc4ff";
        const humanCount = Number(getVar("gHumans"));
        const isBot = Number.isFinite(humanCount) && humanCount > 0 && playerId >= humanCount;

        const element = ensureTooltip();
        element.replaceChildren();
        element.style.setProperty("--fx-territory-color", playerColor);
        element.style.setProperty("--fx-density-color", densityColor);

        const header = document.createElement("header");
        header.className = "fx-territory-card-head";
        const avatar = document.createElement("span");
        avatar.className = "fx-territory-card-avatar";
        avatar.innerHTML = isBot
            ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v3M7 2h6M5 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><path d="M7 11h.01M13 11h.01M7 14h6"/></svg>'
            : '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6" r="3"/><path d="M4 17a6 6 0 0 1 12 0"/></svg>';
        const identity = document.createElement("div");
        identity.className = "fx-territory-card-identity";
        const title = document.createElement("strong");
        title.className = "fx-territory-card-name";
        title.textContent = String(rawName || `Player ${playerId + 1}`);
        const clanLabel = document.createElement("span");
        clanLabel.className = "fx-territory-card-clan";
        clanLabel.textContent = clan ? `[${clan}]` : `Player ${playerId + 1}`;
        identity.append(title, clanLabel);
        const kind = document.createElement("span");
        kind.className = "fx-territory-card-kind";
        kind.textContent = isBot ? "BOT" : "HUMAN";
        header.append(avatar, identity, kind);
        element.appendChild(header);

        const metrics = document.createElement("div");
        metrics.className = "fx-territory-card-grid";
        metrics.append(createMetric("Troops", formatNumber(availableTroops), "⚔"));
        metrics.append(createMetric("Density", density || "—", "◉", "is-density"));
        metrics.append(createMetric("Territory size", formatNumber(territories), "▦", "is-secondary"));
        if (attack) metrics.append(createMetric("Attack estimate", attack, "↗", "is-secondary"));
        element.appendChild(metrics);

        const footer = document.createElement("footer");
        footer.className = "fx-territory-card-footer";
        const coordinateLabel = document.createElement("span");
        coordinateLabel.textContent = Number.isFinite(mapX) && Number.isFinite(mapY) ? `⌖  ${mapX}, ${mapY}` : "Territory";
        footer.appendChild(coordinateLabel);
        element.appendChild(footer);

        const point = lastContextPoint || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        element.style.display = "block";
        const bounds = element.getBoundingClientRect();
        let x = point.x + 12;
        let y = point.y + 12;
        if (x + bounds.width > window.innerWidth - 8) x = Math.max(8, point.x - bounds.width - 12);
        if (y + bounds.height > window.innerHeight - 8) y = Math.max(8, point.y - bounds.height - 12);
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        window.clearTimeout(clearContextTimer);
        lastContextPoint = null;
        return true;
    };
    this.showNativeTerritory = showNativeTerritory;

    const captureRightClick = event => {
        if (event.button !== 2 && event.type !== "contextmenu") return;
        lastContextPoint = { x: event.clientX, y: event.clientY };
        window.clearTimeout(clearContextTimer);
        clearContextTimer = window.setTimeout(() => { lastContextPoint = null; }, 1500);
    };
    const attachCanvas = () => {
        const canvas = document.getElementById("canvasA");
        if (canvas === attachedCanvas) return;
        attachedCanvas?.removeEventListener("pointerdown", captureRightClick);
        attachedCanvas?.removeEventListener("contextmenu", captureRightClick);
        attachedCanvas = canvas;
        attachedCanvas?.addEventListener("pointerdown", captureRightClick);
        attachedCanvas?.addEventListener("contextmenu", captureRightClick);
    };
    document.addEventListener("pointerdown", event => {
        if (event.button !== 2 || !attachedCanvas?.contains(event.target)) hideTooltip();
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") hideTooltip(); });
    attachCanvas();
    if (document.documentElement && typeof MutationObserver !== "undefined") {
        new MutationObserver(attachCanvas).observe(document.documentElement, { childList: true, subtree: true });
    } else {
        document.addEventListener("DOMContentLoaded", attachCanvas, { once: true });
    }
})();
export default hoveringTooltip;
