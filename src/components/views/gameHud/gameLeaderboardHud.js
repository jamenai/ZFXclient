import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { settingsApi } from "../../../modules/settings/settings.js";
import { GameLeaderboardWidget } from "./gameLeaderboardWidget.js";
import { GameStatusWidgets } from "./gameStatusWidgets.js";
import { GameTeamChartWidget } from "./gameTeamChartWidget.js";

const numberFormat = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

const GameLeaderboardHud = defineComponent({
  name: "FxGameLeaderboardHud",
  components: { GameLeaderboardWidget, GameStatusWidgets, GameTeamChartWidget },
  setup() {
    const snapshot = ref(null);
    const now = ref(Date.now());
    const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
    const inMatch = ref(false);
    const collapsed = ref(false);
    const rowsContainer = ref(null);
    const statusSnapshot = ref(null);
    const teamChartSnapshot = ref(null);
    const detailedTeamPercentage = ref(settingsApi.getBoolean("detailedTeamPercentage"));
    const leaderboardPanel = ref(null);
    const teamChartPosition = ref(null);
    const statusCardLayouts = ref({});
    const lockedPlayerId = ref(null);
    const lockedPlayerRank = ref(null);
    const panelPosition = ref(null);
    const panelSize = ref({ width: null, height: null });
    let panelDrag = null;
    let resizeDrag = null;
    let ignoreHeaderClick = false;
    let timer;
    const panelPositionStorageKey = "zfx.gameLeaderboardHud.position.v2";
    const legacyPanelPositionStorageKey = "zfx.gameLeaderboardHud.position.v1";
    const sizeStorageKey = "zfx.gameLeaderboardHud.size.v1";
    const statusCardLayoutsStorageKey = "zfx.gameStatusHud.cards.v2";
    const legacyStatusCardLayoutsStorageKey = "zfx.gameStatusHud.cards.v1";
    const teamChartPositionStorageKey = "zfx.gameTeamChart.position.v1";
    const teamChartWidth = 168;
    const teamChartHeight = 190;
    let teamChartDrag = null;
    let statusCardDrag = null;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const toPositionRatio = (value, max) => max <= 8 ? 0 : clamp((value - 8) / (max - 8), 0, 1);
    const fromPositionRatio = (ratio, max) => Math.round(8 + clamp(ratio, 0, 1) * Math.max(0, max - 8));
    const updateViewport = () => {
      if (viewport.value.width !== window.innerWidth || viewport.value.height !== window.innerHeight) {
        viewport.value = { width: window.innerWidth, height: window.innerHeight };
      }
    };
    const getDefaultStatusCardLayout = (key) => {
      const { width: viewportWidth } = viewport.value;
      const tileWidth = Math.max(150, Math.min(180, (viewportWidth - 40) / 2));
      const width = key === "time" ? 88 : key === "income" || key === "interest" ? 148 : tileWidth;
      const twoColumns = viewportWidth >= 380;
      const column = key === "map-control" || key === "time" ? 0 : 1;
      const row = key === "income" || key === "interest" || key === "time" ? 1 : 0;
      const x = twoColumns
        ? column === 0
          ? viewportWidth - 14 - width
          : viewportWidth - 14 - tileWidth - 8 - width
        : viewportWidth - 14 - width;
      const y = twoColumns ? 14 + row * 128 : 14 + ({ density: 0, "map-control": 1, interest: 2, time: 3 }[key] ?? 0) * 128;
      return { x: Math.max(8, x), y, width, height: key === "time" ? 34 : key === "map-control" ? 114 : key === "density" ? 112 : 98 };
    };
    const resolveStatusCardLayout = key => {
      const defaults = getDefaultStatusCardLayout(key);
      const saved = statusCardLayouts.value[key];
      if (!saved) return defaults;
      const { width: viewportWidth, height: viewportHeight } = viewport.value;
      const maxX = Math.max(8, viewportWidth - defaults.width - 8);
      const maxY = Math.max(8, viewportHeight - defaults.height - 8);
      return {
        ...defaults,
        x: Number.isFinite(saved.xRatio) ? fromPositionRatio(saved.xRatio, maxX) : clamp(saved.x ?? defaults.x, 8, maxX),
        y: Number.isFinite(saved.yRatio) ? fromPositionRatio(saved.yRatio, maxY) : clamp(saved.y ?? defaults.y, 8, maxY),
      };
    };
    const statusCardStyle = key => {
      const layout = resolveStatusCardLayout(key);
      const defaults = getDefaultStatusCardLayout(key);
      return { left: `${layout.x}px`, top: `${layout.y}px`, width: `${defaults.width}px`, height: `${defaults.height}px` };
    };
    const getDefaultTeamChartPosition = () => {
      const sidebarWidth = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fx-sidebar-width")) || 0;
      return { x: Math.max(8, sidebarWidth + 14), y: Math.max(8, viewport.value.height - teamChartHeight - 14) };
    };
    const resolveTeamChartPosition = () => {
      const saved = teamChartPosition.value;
      const defaults = getDefaultTeamChartPosition();
      if (!saved) return defaults;
      const { width: viewportWidth, height: viewportHeight } = viewport.value;
      const maxX = Math.max(8, viewportWidth - teamChartWidth - 8);
      const maxY = Math.max(8, viewportHeight - teamChartHeight - 8);
      return {
        x: Number.isFinite(saved.xRatio) ? fromPositionRatio(saved.xRatio, maxX) : clamp(saved.x ?? defaults.x, 8, maxX),
        y: Number.isFinite(saved.yRatio) ? fromPositionRatio(saved.yRatio, maxY) : clamp(saved.y ?? defaults.y, 8, maxY),
      };
    };
    const teamChartStyle = computed(() => {
      const position = resolveTeamChartPosition();
      return { left: `${position.x}px`, top: `${position.y}px` };
    });
    const moveTeamChart = event => {
      if (!teamChartDrag) return;
      const { width: viewportWidth, height: viewportHeight } = viewport.value;
      const maxX = Math.max(8, viewportWidth - teamChartWidth - 8);
      const maxY = Math.max(8, viewportHeight - teamChartHeight - 8);
      const x = clamp(teamChartDrag.x + event.clientX - teamChartDrag.pointerX, 8, maxX);
      const y = clamp(teamChartDrag.y + event.clientY - teamChartDrag.pointerY, 8, maxY);
      teamChartPosition.value = { xRatio: toPositionRatio(x, maxX), yRatio: toPositionRatio(y, maxY) };
    };
    const stopTeamChartMove = () => {
      if (!teamChartDrag) return;
      teamChartDrag = null;
      window.removeEventListener("pointermove", moveTeamChart);
      window.removeEventListener("pointerup", stopTeamChartMove);
      window.removeEventListener("pointercancel", stopTeamChartMove);
      try { window.localStorage.setItem(teamChartPositionStorageKey, JSON.stringify(teamChartPosition.value)); } catch { /* Storage may be unavailable. */ }
    };
    const startTeamChartMove = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const current = resolveTeamChartPosition();
      teamChartDrag = { ...current, pointerX: event.clientX, pointerY: event.clientY };
      window.addEventListener("pointermove", moveTeamChart);
      window.addEventListener("pointerup", stopTeamChartMove);
      window.addEventListener("pointercancel", stopTeamChartMove);
    };
    const teamChartSegments = computed(() => {
      const teams = (teamChartSnapshot.value?.teams || []).filter(team => team.pixels > 0);
      const total = teams.reduce((sum, team) => sum + team.pixels, 0);
      if (!total) return { teams: [], total: 0, segments: [] };
      let angle = -Math.PI / 2;
      const segments = teams.map(team => {
        const share = team.pixels / total;
        const nextAngle = angle + share * Math.PI * 2;
        const startX = 50 + 45 * Math.cos(angle);
        const startY = 50 + 45 * Math.sin(angle);
        const endX = 50 + 45 * Math.cos(nextAngle);
        const endY = 50 + 45 * Math.sin(nextAngle);
        const largeArc = share > 0.5 ? 1 : 0;
        const labelAngle = angle + (nextAngle - angle) / 2;
        const labelRadius = share > 0.7 ? 27 : 31;
        const result = {
          ...team,
          share,
          color: team.color || "#78869a",
          path: `M50 50 L${startX.toFixed(3)} ${startY.toFixed(3)} A45 45 0 ${largeArc} 1 ${endX.toFixed(3)} ${endY.toFixed(3)} Z`,
          label: `${Math.round(share * 100)}%`,
          labelX: 50 + labelRadius * Math.cos(labelAngle),
          labelY: 50 + labelRadius * Math.sin(labelAngle),
        };
        angle = nextAngle;
        return result;
      });
      return { teams, total, segments };
    });
    const teamChartVisible = computed(() => inMatch.value && teamChartSegments.value.total > 0);
    const receiveTeamChart = value => {
      if (!value || !Array.isArray(value.teams)) return;
      teamChartSnapshot.value = {
        updatedAt: Number(value.updatedAt) || Date.now(),
        teams: value.teams.map(team => ({
          id: Number(team.id),
          pixels: Math.max(0, Number(team.pixels) || 0),
          color: String(team.color || "#78869a"),
        })).filter(team => Number.isInteger(team.id)),
      };
      window.__fx.gameTeamChartReady = true;
    };
    const persistStatusCardLayouts = () => {
      try { window.localStorage.setItem(statusCardLayoutsStorageKey, JSON.stringify(statusCardLayouts.value)); } catch { /* Storage may be unavailable. */ }
    };
    const moveStatusCard = event => {
      if (!statusCardDrag) return;
      const defaults = getDefaultStatusCardLayout(statusCardDrag.key);
      const { width: viewportWidth, height: viewportHeight } = viewport.value;
      const maxX = Math.max(8, viewportWidth - defaults.width - 8);
      const maxY = Math.max(8, viewportHeight - defaults.height - 8);
      const x = clamp(statusCardDrag.x + event.clientX - statusCardDrag.pointerX, 8, maxX);
      const y = clamp(statusCardDrag.y + event.clientY - statusCardDrag.pointerY, 8, maxY);
      statusCardLayouts.value = {
        ...statusCardLayouts.value,
        [statusCardDrag.key]: {
          xRatio: toPositionRatio(x, maxX),
          yRatio: toPositionRatio(y, maxY),
        },
      };
    };
    const stopStatusCardMove = () => {
      if (!statusCardDrag) return;
      statusCardDrag = null;
      window.removeEventListener("pointermove", moveStatusCard);
      window.removeEventListener("pointerup", stopStatusCardMove);
      window.removeEventListener("pointercancel", stopStatusCardMove);
      persistStatusCardLayouts();
    };
    const startStatusCardMove = (event, key) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const current = resolveStatusCardLayout(key);
      statusCardDrag = { key, x: current.x, y: current.y, pointerX: event.clientX, pointerY: event.clientY };
      window.addEventListener("pointermove", moveStatusCard);
      window.addEventListener("pointerup", stopStatusCardMove);
      window.addEventListener("pointercancel", stopStatusCardMove);
    };
    const resolvePanelPosition = saved => {
      if (!saved) return null;
      const { width: viewportWidth, height: viewportHeight } = viewport.value;
      const panelRect = leaderboardPanel.value?.getBoundingClientRect();
      const width = panelSize.value.width || panelRect?.width || Math.min(278, viewportWidth - 28);
      const height = collapsed.value ? (panelRect?.height || 52) : (panelSize.value.height || panelRect?.height || Math.min(420, viewportHeight * 0.8));
      const maxX = Math.max(8, viewportWidth - width - 8);
      const maxY = Math.max(8, viewportHeight - height - 8);
      return {
        x: Number.isFinite(saved.xRatio) ? fromPositionRatio(saved.xRatio, maxX) : clamp(saved.x ?? 8, 8, maxX),
        y: Number.isFinite(saved.yRatio) ? fromPositionRatio(saved.yRatio, maxY) : clamp(saved.y ?? 8, 8, maxY),
      };
    };
    const panelStyle = computed(() => {
      const resolvedPosition = panelPosition.value ? resolvePanelPosition(panelPosition.value) : null;
      const position = resolvedPosition ? { left: `${resolvedPosition.x}px`, top: `${resolvedPosition.y}px` } : null;
      return collapsed.value
        ? { ...position, width: "fit-content", maxWidth: "calc(100vw - var(--fx-sidebar-width, 0px) - 22px)", height: "auto", containerType: "normal" }
        : { ...position, ...(panelSize.value.width && panelSize.value.height ? { width: `${panelSize.value.width}px`, height: `${panelSize.value.height}px` } : {}) };
    });
    const clampPanelSize = (width, height) => {
      const sidebarWidth = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fx-sidebar-width")) || 0;
      return {
        width: Math.round(Math.max(230, Math.min(width, window.innerWidth - sidebarWidth - 28, 620))),
        height: Math.round(Math.max(240, Math.min(height, window.innerHeight * 0.9, 900))),
      };
    };
    const resizePanel = event => {
      if (!resizeDrag) return;
      panelSize.value = clampPanelSize(
        resizeDrag.width + event.clientX - resizeDrag.x,
        resizeDrag.height + event.clientY - resizeDrag.y,
      );
    };
    const stopPanelResize = () => {
      if (!resizeDrag) return;
      resizeDrag = null;
      window.removeEventListener("pointermove", resizePanel);
      window.removeEventListener("pointerup", stopPanelResize);
      window.removeEventListener("pointercancel", stopPanelResize);
      try { window.localStorage.setItem(sizeStorageKey, JSON.stringify(panelSize.value)); } catch { /* Storage may be unavailable. */ }
    };
    const startPanelResize = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.parentElement.getBoundingClientRect();
      const size = clampPanelSize(rect.width, rect.height);
      panelSize.value = size;
      resizeDrag = { x: event.clientX, y: event.clientY, ...size };
      window.addEventListener("pointermove", resizePanel);
      window.addEventListener("pointerup", stopPanelResize);
      window.addEventListener("pointercancel", stopPanelResize);
    };
    const movePanel = event => {
      if (!panelDrag) return;
      const dx = event.clientX - panelDrag.pointerX;
      const dy = event.clientY - panelDrag.pointerY;
      if (Math.abs(dx) + Math.abs(dy) > 3) ignoreHeaderClick = true;
      const { width: viewportWidth, height: viewportHeight } = viewport.value;
      const maxX = Math.max(8, viewportWidth - panelDrag.width - 8);
      const maxY = Math.max(8, viewportHeight - panelDrag.height - 8);
      const x = clamp(panelDrag.x + dx, 8, maxX);
      const y = clamp(panelDrag.y + dy, 8, maxY);
      panelPosition.value = {
        xRatio: toPositionRatio(x, maxX),
        yRatio: toPositionRatio(y, maxY),
      };
    };
    const stopPanelMove = () => {
      if (!panelDrag) return;
      panelDrag = null;
      window.removeEventListener("pointermove", movePanel);
      window.removeEventListener("pointerup", stopPanelMove);
      window.removeEventListener("pointercancel", stopPanelMove);
      if (panelPosition.value) {
        try { window.localStorage.setItem(panelPositionStorageKey, JSON.stringify(panelPosition.value)); } catch { /* Storage may be unavailable. */ }
      }
    };
    const startPanelMove = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      ignoreHeaderClick = false;
      const rect = event.currentTarget.parentElement.getBoundingClientRect();
      const { width: viewportWidth, height: viewportHeight } = viewport.value;
      const maxX = Math.max(8, viewportWidth - rect.width - 8);
      const maxY = Math.max(8, viewportHeight - rect.height - 8);
      if (!panelPosition.value) panelPosition.value = {
        xRatio: toPositionRatio(rect.left, maxX),
        yRatio: toPositionRatio(rect.top, maxY),
      };
      panelDrag = { x: rect.left, y: rect.top, width: rect.width, pointerX: event.clientX, pointerY: event.clientY };
      window.addEventListener("pointermove", movePanel);
      window.addEventListener("pointerup", stopPanelMove);
      window.addEventListener("pointercancel", stopPanelMove);
    };
    const handlePanelHeaderClick = event => {
      if (ignoreHeaderClick) { ignoreHeaderClick = false; event.preventDefault(); return; }
      toggleCollapsed(event);
    };
    const receive = value => {
      if (!value || !Array.isArray(value.players) || value.players.length === 0) return;
      const fx = window.__fx;
      const aliveStates = fx?.getGameVar?.("playerAlive");
      const humanCount = Number(value.humanCount ?? fx?.getGameVar?.("gHumans")) || 0;
      const botCount = Number(value.botCount ?? fx?.getGameVar?.("gBots")) || 0;
      const countAlive = (start, end) => aliveStates
        ? Array.from({ length: Math.max(0, end - start) }, (_, index) => Number(aliveStates[start + index]) !== 0).filter(Boolean).length
        : value.players.filter(player => player.id >= start && player.id < end && player.isAlive !== false).length;
      snapshot.value = {
        ...value,
        humanCount,
        botCount,
        spectatorCount: Number(value.spectatorCount ?? fx?.getGameVar?.("gSpectators")) || 0,
        aliveHumanCount: countAlive(0, humanCount),
        aliveBotCount: countAlive(humanCount, humanCount + botCount),
        players: value.players.map(player => ({
          ...player,
          isBot: player.isBot ?? (player.id >= humanCount && player.id < humanCount + botCount),
          isAlive: player.isAlive !== false,
        })),
        ownPlayer: value.ownPlayer ? { ...value.ownPlayer, isAlive: value.ownPlayer.isAlive !== false } : null,
      };
      inMatch.value = true;
      window.__fx.gameLeaderboardHudReady = true;
      if (lockedPlayerId.value !== null) {
        const locked = snapshot.value.players.find(player => player.id === lockedPlayerId.value);
        if (locked && locked.rank !== lockedPlayerRank.value) {
          lockedPlayerRank.value = locked.rank;
          requestAnimationFrame(() => scrollToPlayer(lockedPlayerId.value, "smooth"));
        }
      }
    };
    const statusMeta = (label, index) => {
      const normalized = String(label || "").toLowerCase();
      // The native status value at slot 6 is the player's owned pixel count,
      // even though this game version labels that slot "Income".
      if (Number(index) === 6) return { key: "pixels", icon: "▦", shortLabel: "Pixels" };
      const metrics = [
        ["humans", ["human", "spieler"], "👥"],
        ["bots", ["bot"], "🤖"],
        ["spectators", ["spectat", "zuschau"], "👁"],
        ["percentage", ["percentage", "prozent"], "%"],
        ["interest", ["interest", "zinsen"], "✦"],
        ["income", ["income", "einkommen"], "💰"],
        ["time", ["time", "zeit"], "⏱"],
        ["max-troops", ["max troops", "truppen"], "⚔"],
        ["density", ["density", "dichte"], "▤"],
      ];
      const fallbackKeys = ["humans", "bots", "spectators", "percentage", "interest", "income", "time", "max-troops", "density"];
      const match = metrics.find(([, words]) => words.some(word => normalized.includes(word))) || metrics.find(([key]) => key === fallbackKeys[index]);
      const key = match?.[0] || `metric-${index}`;
      return { key, icon: match?.[2] || "◆", shortLabel: String(label || "").replace(/\s+/g, " ").trim() };
    };
    const receiveStatus = value => {
      if (!value || !Array.isArray(value.rows)) return;
      const fx = window.__fx;
      let densityColor = null;
      let densityFill = 0;
      try {
        const playerId = Number(fx?.getGameVar?.("playerId"));
        const balance = Number(fx?.getGameVar?.("playerBalances")?.[playerId]);
        const pixels = Number(fx?.getGameVar?.("playerTerritories")?.[playerId]);
        if (Number.isFinite(balance) && Number.isFinite(pixels) && pixels > 0) {
          densityFill = Math.max(0, Math.min(100, balance / (pixels * 150) * 100));
        }
        if (fx?.settingsApi?.getBoolean?.("coloredDensity")) {
          densityColor = Number.isInteger(playerId) ? fx.utils?.textStyleBasedOnDensity?.(playerId) || null : null;
        }
      } catch { /* Keep the default HUD text color when the density adapter is not ready. */ }
      const mappedRows = value.rows
        .filter(row => row.visible && row.label)
        .map(row => ({ ...row, ...statusMeta(row.label, row.index) }));
      const maxTroops = mappedRows.find(row => row.key === "max-troops");
      const interest = mappedRows.find(row => row.key === "interest");
      const percentage = mappedRows.find(row => row.key === "percentage");
      const pixels = mappedRows.find(row => row.key === "pixels");
      const displayRows = mappedRows
        .filter(row => !["humans", "bots", "spectators", "max-troops", "interest", "percentage", "pixels"].includes(row.key))
        .map(row => ({ ...row, densityColor: row.key === "density" ? densityColor : null, densityFill, maxTroops: row.key === "density" ? maxTroops?.value : null, interest: row.key === "density" ? interest?.value : null }));
      if (!displayRows.some(row => row.key === "density") && (maxTroops || interest)) {
        displayRows.push({
          key: "density",
          icon: "â–¤",
          shortLabel: "Density",
          value: "—",
          densityColor,
          densityFill,
          maxTroops: maxTroops?.value,
          interest: interest?.value,
        });
      }
      if (percentage || pixels) {
        displayRows.push({
          key: "map-control",
          metrics: [percentage, pixels].filter(Boolean),
          percentageFill: Math.max(0, Math.min(100, Number.parseFloat(percentage?.value) || 0)),
        });
      }
      const order = { density: 0, "map-control": 1, time: 3 };
      displayRows.sort((left, right) => (order[left.key] ?? 2) - (order[right.key] ?? 2));
      statusSnapshot.value = { ...value, rows: displayRows };
      window.__fx.gameStatusHudReady = statusSnapshot.value.rows.length > 0;
    };
    const syncNativeHudFont = () => {
      const font = settingsApi.getString("native.font");
      if (typeof font === "string" && font.trim()) {
        document.documentElement.style.setProperty("--fx-game-native-font-family", font.trim());
      }
    };
    const syncNativeGameData = () => {
      const fx = window.__fx;
      const matchState = Number(fx?.getGameVar?.("gMatchState"));
      inMatch.value = matchState === 1 || matchState === 2;
      if (!inMatch.value) {
        snapshot.value = null;
        statusSnapshot.value = null;
        teamChartSnapshot.value = null;
        if (fx) {
          fx.gameLeaderboardHudReady = false;
          fx.gameStatusHudReady = false;
          fx.gameTeamChartReady = false;
        }
        return;
      }
      const names = fx?.getGameVar?.("rawPlayerNames");
      const territories = fx?.getGameVar?.("playerTerritories");
      const aliveStates = fx?.getGameVar?.("playerAlive");
      const humanCount = Number(fx?.getGameVar?.("gHumans"));
      const botCount = Number(fx?.getGameVar?.("gBots"));
      const spectatorCount = Number(fx?.getGameVar?.("gSpectators"));
      const ownPlayerId = Number(fx?.getGameVar?.("playerId"));
      if (!names || !territories || !Number.isInteger(ownPlayerId)) return;
      const players = [];
      const count = Math.min(names.length, territories.length);
      for (let id = 0; id < count; id += 1) {
        const territoryValue = Number(territories[id]);
        if (!Number.isFinite(territoryValue)) continue;
        const rawName = String(names[id] ?? "").trim();
        if (!rawName && territoryValue <= 0) continue;
        players.push({
          id,
          name: rawName || `Player ${id + 1}`,
          isBot: id >= (Number.isFinite(humanCount) ? humanCount : 0) && id < (Number.isFinite(humanCount) ? humanCount : 0) + (Number.isFinite(botCount) ? botCount : 0),
          territories: territoryValue,
          isAlive: aliveStates ? Number(aliveStates[id]) !== 0 : territoryValue > 0,
          color: fx?.gameLeaderboardAdapter?.getPlayerColor?.(id) || null,
        });
      }
      if (!players.length) return;
      players.sort((left, right) => right.territories - left.territories || left.id - right.id);
      players.forEach((player, index) => { player.rank = index + 1; });
      const ownPlayer = players.find(player => player.id === ownPlayerId) || null;
      receive({
        updatedAt: Date.now(),
        total: players.length,
        humanCount: Number.isFinite(humanCount) ? humanCount : 0,
        botCount: Number.isFinite(botCount) ? botCount : 0,
        spectatorCount: Number.isFinite(spectatorCount) ? spectatorCount : 0,
        ownPlayerId,
        ownRank: ownPlayer?.rank ?? null,
        players,
        ownPlayer,
      });
    };
    const visible = computed(() => inMatch.value);
    const dataReady = computed(() => !!snapshot.value && now.value - snapshot.value.updatedAt < 1800);
    const rows = computed(() => {
      if (!dataReady.value) return [];
      const all = [...snapshot.value.players];
      const own = snapshot.value.ownPlayer;
      if (own && !all.some(player => player.id === own.id)) all.push({ ...own, isOwn: true });
      return all.map(player => ({ ...player, isOwn: player.id === snapshot.value.ownPlayerId }));
    });
    const formatted = value => Number.isFinite(Number(value)) ? numberFormat.format(Number(value)) : "—";
    const focusPlayer = (player, event) => {
      window.__fx?.gameLeaderboardAdapter?.focusPlayer?.(player.id);
      event?.currentTarget?.blur();
    };
    const aliveHumanCount = computed(() => dataReady.value ? snapshot.value.aliveHumanCount : null);
    const aliveBotCount = computed(() => dataReady.value ? snapshot.value.aliveBotCount : null);
    const scrollToPlayer = (id, behavior = "smooth") => {
      const container = rowsContainer.value;
      const row = container?.querySelector(`[data-player-id="${Number(id)}"]`);
      if (!container || !row) return;
      const rowTop = row.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTo({ top: Math.max(0, rowTop - (container.clientHeight - row.clientHeight) / 2), behavior });
    };
    const unlockPlayer = () => { lockedPlayerId.value = null; lockedPlayerRank.value = null; };
    const findMe = () => {
      const ownPlayerId = snapshot.value?.ownPlayerId;
      if (ownPlayerId === undefined) return;
      const ownPlayer = snapshot.value.players.find(player => player.id === ownPlayerId) || snapshot.value.ownPlayer;
      lockedPlayerId.value = ownPlayerId;
      lockedPlayerRank.value = ownPlayer?.rank ?? snapshot.value.ownRank ?? null;
      scrollToPlayer(ownPlayerId);
    };
    const goTop = () => { unlockPlayer(); rowsContainer.value?.scrollTo({ top: 0, behavior: "smooth" }); };
    const togglePlayerLock = (player, event) => {
      if (lockedPlayerId.value === player.id) unlockPlayer();
      else {
        lockedPlayerId.value = player.id;
        lockedPlayerRank.value = player.rank;
        scrollToPlayer(player.id);
      }
      event.currentTarget.blur();
    };
    const handleManualScroll = event => {
      if (event.type === "pointerdown" && event.target !== event.currentTarget) return;
      unlockPlayer();
    };
    const toggleCollapsed = event => {
      collapsed.value = !collapsed.value;
      event.currentTarget.blur();
    };
    const setLeaderboardPanel = element => { leaderboardPanel.value = element; };
    const setRowsContainer = element => { rowsContainer.value = element; };
    let gameCanvasMouseDrag = false;
    const isGameHudTarget = target => target instanceof Element && Boolean(target.closest(".fx-game-hud-container,.fx-game-keybind-hud"));
    const forwardCanvasMouseEvent = (type, source, canvas) => {
      canvas.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: source.detail,
        screenX: source.screenX,
        screenY: source.screenY,
        clientX: source.clientX,
        clientY: source.clientY,
        button: source.button,
        buttons: source.buttons,
        ctrlKey: source.ctrlKey,
        shiftKey: source.shiftKey,
        altKey: source.altKey,
        metaKey: source.metaKey,
      }));
    };
    const beginCanvasMouseDrag = event => {
      if (event.button === 0 && event.target === document.getElementById("canvasA")) gameCanvasMouseDrag = true;
    };
    const continueCanvasMouseDrag = event => {
      if (!gameCanvasMouseDrag) return;
      const canvas = document.getElementById("canvasA");
      if (!canvas || event.target === canvas || !isGameHudTarget(event.target)) return;
      forwardCanvasMouseEvent("mousemove", event, canvas);
    };
    const finishCanvasMouseDrag = event => {
      if (!gameCanvasMouseDrag) return;
      const canvas = document.getElementById("canvasA");
      if (canvas && event.target !== canvas && isGameHudTarget(event.target)) forwardCanvasMouseEvent("mouseup", event, canvas);
      gameCanvasMouseDrag = false;
    };
    const cancelCanvasMouseDrag = () => { gameCanvasMouseDrag = false; };
    const captureGameCanvasPointer = event => {
      const canvas = document.getElementById("canvasA");
      if (event.target !== canvas || event.button !== 0 || !Number.isInteger(event.pointerId) || typeof canvas?.setPointerCapture !== "function") return;
      try { canvas.setPointerCapture(event.pointerId); } catch { /* The browser may already have ended this pointer. */ }
    };

    onMounted(() => {
      window.__fx ||= {};
      window.__fx.gameLeaderboardAdapter ||= {};
      try {
        const savedSize = JSON.parse(window.localStorage.getItem(sizeStorageKey) || "null");
        if (Number.isFinite(savedSize?.width) && Number.isFinite(savedSize?.height)) panelSize.value = clampPanelSize(savedSize.width, savedSize.height);
        const savedPosition = JSON.parse(window.localStorage.getItem(panelPositionStorageKey) || window.localStorage.getItem(legacyPanelPositionStorageKey) || "null");
        if (Number.isFinite(savedPosition?.xRatio) && Number.isFinite(savedPosition?.yRatio)) panelPosition.value = savedPosition;
        else if (Number.isFinite(savedPosition?.x) && Number.isFinite(savedPosition?.y)) {
          const maxX = Math.max(8, viewport.value.width - (panelSize.value.width || 278) - 8);
          const maxY = Math.max(8, viewport.value.height - (panelSize.value.height || Math.min(420, viewport.value.height * 0.8)) - 8);
          panelPosition.value = {
            xRatio: toPositionRatio(clamp(savedPosition.x, 8, maxX), maxX),
            yRatio: toPositionRatio(clamp(savedPosition.y, 8, maxY), maxY),
          };
        }
        const savedTeamChartPosition = JSON.parse(window.localStorage.getItem(teamChartPositionStorageKey) || "null");
        if (Number.isFinite(savedTeamChartPosition?.xRatio) && Number.isFinite(savedTeamChartPosition?.yRatio)) teamChartPosition.value = savedTeamChartPosition;
        const savedStatusCards = JSON.parse(window.localStorage.getItem(statusCardLayoutsStorageKey) || window.localStorage.getItem(legacyStatusCardLayoutsStorageKey) || "{}");
        if (savedStatusCards && typeof savedStatusCards === "object") {
          statusCardLayouts.value = Object.fromEntries(Object.entries(savedStatusCards)
            .filter(([, layout]) => (Number.isFinite(layout?.xRatio) && Number.isFinite(layout?.yRatio)) || (Number.isFinite(layout?.x) && Number.isFinite(layout?.y)))
            .map(([key, layout]) => {
              if (Number.isFinite(layout.xRatio) && Number.isFinite(layout.yRatio)) return [key, { xRatio: layout.xRatio, yRatio: layout.yRatio }];
              const defaults = getDefaultStatusCardLayout(key);
              const maxX = Math.max(8, viewport.value.width - defaults.width - 8);
              const maxY = Math.max(8, viewport.value.height - defaults.height - 8);
              return [key, {
                xRatio: toPositionRatio(clamp(layout.x, 8, maxX), maxX),
                yRatio: toPositionRatio(clamp(layout.y, 8, maxY), maxY),
              }];
            }));
        }
      } catch { /* Ignore invalid or unavailable local storage. */ }
      window.addEventListener("resize", updateViewport);
      window.addEventListener("orientationchange", updateViewport);
      document.addEventListener("fullscreenchange", updateViewport);
      document.addEventListener("pointerdown", captureGameCanvasPointer, true);
      document.addEventListener("mousedown", beginCanvasMouseDrag, true);
      document.addEventListener("mousemove", continueCanvasMouseDrag, true);
      document.addEventListener("mouseup", finishCanvasMouseDrag, true);
      window.addEventListener("blur", cancelCanvasMouseDrag);
      syncNativeHudFont();
      window.__fx.gameLeaderboardAdapter.receiveNativeSnapshot = receive;
      window.__fx.gameStatusHudAdapter ||= {};
      window.__fx.gameStatusHudAdapter.receiveNativeSnapshot = receiveStatus;
      window.__fx.gameTeamChartAdapter ||= {};
      window.__fx.gameTeamChartAdapter.receiveNativeSnapshot = receiveTeamChart;
      syncNativeGameData();
      timer = window.setInterval(() => { now.value = Date.now(); detailedTeamPercentage.value = settingsApi.getBoolean("detailedTeamPercentage"); syncNativeGameData(); syncNativeHudFont(); }, 250);
    });
    onBeforeUnmount(() => {
      window.clearInterval(timer);
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      document.removeEventListener("fullscreenchange", updateViewport);
      document.removeEventListener("pointerdown", captureGameCanvasPointer, true);
      document.removeEventListener("mousedown", beginCanvasMouseDrag, true);
      document.removeEventListener("mousemove", continueCanvasMouseDrag, true);
      document.removeEventListener("mouseup", finishCanvasMouseDrag, true);
      window.removeEventListener("blur", cancelCanvasMouseDrag);
      stopPanelMove();
      stopPanelResize();
      stopStatusCardMove();
      stopTeamChartMove();
      if (window.__fx?.gameLeaderboardAdapter?.receiveNativeSnapshot === receive) {
        delete window.__fx.gameLeaderboardAdapter.receiveNativeSnapshot;
      }
      if (window.__fx?.gameStatusHudAdapter?.receiveNativeSnapshot === receiveStatus) {
        delete window.__fx.gameStatusHudAdapter.receiveNativeSnapshot;
      }
      if (window.__fx?.gameTeamChartAdapter?.receiveNativeSnapshot === receiveTeamChart) {
        delete window.__fx.gameTeamChartAdapter.receiveNativeSnapshot;
      }
      if (window.__fx) window.__fx.gameLeaderboardHudReady = false;
      if (window.__fx) window.__fx.gameStatusHudReady = false;
      if (window.__fx) window.__fx.gameTeamChartReady = false;
    });

    return { snapshot, visible, dataReady, rows, collapsed, formatted, focusPlayer, toggleCollapsed, rowsContainer, aliveHumanCount, aliveBotCount, findMe, goTop, panelStyle, startPanelMove, startPanelResize, handlePanelHeaderClick, setLeaderboardPanel, setRowsContainer, statusSnapshot, lockedPlayerId, togglePlayerLock, handleManualScroll, statusCardStyle, startStatusCardMove, leaderboardPanel, teamChartVisible, teamChartStyle, teamChartSegments, detailedTeamPercentage, startTeamChartMove };
  },
  template: `
    <div v-if="visible" class="fx-game-hud-container">
      <GameLeaderboardWidget
        :panel-style="panelStyle"
        :collapsed="collapsed"
        :data-ready="dataReady"
        :snapshot="snapshot"
        :rows="rows"
        :formatted="formatted"
        :alive-human-count="aliveHumanCount"
        :alive-bot-count="aliveBotCount"
        :locked-player-id="lockedPlayerId"
        @start-move="startPanelMove"
        @header-click="handlePanelHeaderClick"
        @toggle-collapsed="toggleCollapsed"
        @find-me="findMe"
        @go-top="goTop"
        @manual-scroll="handleManualScroll"
        @focus-player="focusPlayer"
        @toggle-player-lock="togglePlayerLock"
        @resize="startPanelResize"
        @rows-container="setRowsContainer"
        @panel-element="setLeaderboardPanel"
      />
      <GameTeamChartWidget
        :visible="teamChartVisible"
        :position-style="teamChartStyle"
        :segments="teamChartSegments"
        :detailed-team-percentage="detailedTeamPercentage"
        @start-move="startTeamChartMove"
      />
      <GameStatusWidgets
        :rows="statusSnapshot?.rows || []"
        :status-card-style="statusCardStyle"
        :formatted="formatted"
        @start-move="startStatusCardMove"
      />
    </div>`,
});

export function createVueGameLeaderboardHud() {
  if (document.getElementById("fx-game-leaderboard-hud-root")) return () => {};
  const styleId = "fx-game-leaderboard-hud-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .fx-game-hud-container,.fx-game-hud-container *{user-select:none!important;-webkit-user-select:none!important}
      .fx-game-leaderboard-hud{position:fixed;z-index:60;top:clamp(12px,2vh,24px);left:calc(var(--fx-sidebar-width, 0px) + 14px);width:min(278px,calc(100vw - var(--fx-sidebar-width, 0px) - 28px));max-height:min(90vh,900px);container-type:inline-size;container-name:fx-game-leaderboard;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;border:1px solid rgba(160,190,225,.24);border-radius:12px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:0 12px 36px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(14px);color:#eef4ff;font:13px/1.35 var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:auto}
      .fx-game-leaderboard-hud{position:fixed;z-index:60;top:clamp(12px,2vh,24px);left:calc(var(--fx-sidebar-width, 0px) + 14px);width:min(278px,calc(100vw - var(--fx-sidebar-width, 0px) - 28px));max-height:min(90vh,900px);container-type:inline-size;container-name:fx-game-leaderboard;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;border:1px solid rgba(160,190,225,.24);border-radius:12px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:0 12px 36px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(14px);color:#eef4ff;font:13px/1.35 var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:auto}
      .fx-game-team-chart{position:fixed;z-index:58;display:flex;flex-direction:column;align-items:center;gap:5px;width:168px;box-sizing:border-box;padding:8px;border:1px solid rgba(160,190,225,.24);border-radius:12px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:0 12px 36px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(14px);color:#eef4ff;font:11px/1.2 var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:none;user-select:none;-webkit-user-select:none}
      .fx-game-team-chart header{display:flex;align-items:center;gap:7px;width:100%;color:#9fb2cb;font-size:8px;font-weight:750;letter-spacing:.08em;pointer-events:auto;touch-action:none;cursor:move}
      .fx-game-team-chart header span{display:grid;place-items:center;width:18px;height:18px;border-radius:5px;background:rgba(130,180,240,.13);color:#a8d0ff;font-size:13px}
      .fx-game-team-chart-pie{display:block;width:148px;height:148px;overflow:visible}
      .fx-game-team-chart-pie text{fill:#fff;font:700 5px/1 var(--fx-game-native-font-family,Arial,sans-serif);paint-order:stroke;stroke:rgba(0,0,0,.42);stroke-width:.75px;stroke-linejoin:round}
      .fx-game-leaderboard-head{display:flex;align-items:center;gap:8px;min-width:0;padding:11px 12px;border-bottom:1px solid rgba(160,190,225,.15);cursor:grab;touch-action:none;user-select:none}
      .fx-game-leaderboard-icon{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;box-sizing:border-box;border-radius:9px;background:rgba(99,160,255,.14);color:#9bc4ff;font-size:18px;line-height:1}
      .fx-game-leaderboard-title{display:grid;gap:1px;flex:1 1 auto;min-width:0;overflow:hidden}.fx-game-leaderboard-title small{overflow:hidden;color:#8da2bd;font-size:9px;font-weight:700;letter-spacing:.13em;text-overflow:ellipsis;white-space:nowrap}.fx-game-leaderboard-title strong{overflow:hidden;font-size:14px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
      .fx-game-leaderboard-count{padding:3px 7px;border:1px solid rgba(160,190,225,.17);border-radius:99px;color:#b7c7dc;font-size:10px}
      .fx-game-leaderboard-counts{display:flex;flex:0 0 auto;gap:5px}.fx-game-leaderboard-count{display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid rgba(160,190,225,.2);border-radius:99px;color:#dce8f7;font-size:14px;font-weight:750;line-height:1.2;white-space:nowrap}.fx-game-leaderboard-count span{font-size:16px}
      .fx-game-leaderboard-tools{display:flex;gap:5px;padding:6px 7px 2px}.fx-game-leaderboard-tools button{flex:1;padding:4px 6px;border:1px solid rgba(160,190,225,.16);border-radius:6px;background:rgba(255,255,255,.045);color:#b9c9dc;font:10px/1.3 system-ui,sans-serif;cursor:pointer}.fx-game-leaderboard-tools button:hover{background:rgba(99,160,255,.14);color:#eef4ff}
      .fx-game-leaderboard-rows{display:grid;flex:1 1 auto;gap:2px;min-height:0;padding:6px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(155,190,235,.55) rgba(255,255,255,.06)}
      .fx-game-leaderboard-rows::-webkit-scrollbar{width:8px}.fx-game-leaderboard-rows::-webkit-scrollbar-track{background:rgba(255,255,255,.05);border-radius:8px}.fx-game-leaderboard-rows::-webkit-scrollbar-thumb{background:rgba(155,190,235,.45);border:2px solid rgba(9,15,26,.75);border-radius:8px}
      .fx-game-leaderboard-loading{padding:16px 12px;color:#aebdd0;text-align:center;font-size:11px}
      .fx-game-leaderboard-row{display:grid;grid-template-columns:23px 4px minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;min-height:29px;padding:0 7px;border:1px solid color-mix(in srgb,var(--fx-game-player-color,rgba(158,194,229,.2)) 24%,transparent);border-left:4px solid var(--fx-game-player-color,rgba(158,194,229,.22));border-radius:7px;background:linear-gradient(110deg,color-mix(in srgb,var(--fx-game-player-color,#193047) 18%,rgba(15,32,49,var(--fx-game-hud-panel-alpha,.81))),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)) 80%);color:#d7e1ef;font:inherit;text-align:left;cursor:pointer;transition:background .16s ease,border-color .16s ease}
      .fx-game-leaderboard-row:hover{background:linear-gradient(110deg,color-mix(in srgb,var(--fx-game-player-color,#224556) 27%,rgba(22,46,63,var(--fx-game-hud-panel-alpha,.81))),rgba(11,27,38,var(--fx-game-hud-panel-alpha,.81)) 80%)}
      .fx-game-leaderboard-row.is-own{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--fx-game-player-color,#70f49c) 42%,transparent);color:#fff}
      .fx-game-leaderboard-row.is-eliminated{opacity:.62}.fx-game-leaderboard-row.is-eliminated .fx-game-leaderboard-name{text-decoration:line-through;text-decoration-color:#ff8b8b;text-decoration-thickness:1.5px;color:#9ba8b9}
      .fx-game-leaderboard-rank{color:#8fa2ba;font-size:11px;font-variant-numeric:tabular-nums;text-align:right}.fx-game-leaderboard-player-color{width:4px;height:17px;border-radius:4px;background:#7893b8}
      .fx-game-leaderboard-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}.fx-game-leaderboard-type{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-right:5px;font-size:12px;line-height:1;vertical-align:-2px}.fx-game-leaderboard-type svg{display:block;width:13px;height:13px;fill:currentColor}.fx-game-leaderboard-type.is-human{color:#cbd5e1}.fx-game-leaderboard-type.is-bot{color:#ffd17a}.fx-game-leaderboard-territory{color:#aebdd0;font-size:11px;font-variant-numeric:tabular-nums}
      .fx-game-leaderboard-foot{display:flex;justify-content:space-between;padding:9px 14px;border-top:1px solid rgba(160,190,225,.15);color:#9badc4;font-size:11px}.fx-game-leaderboard-foot strong{color:#cfe0f8;font-variant-numeric:tabular-nums}
      .fx-game-leaderboard-resize{position:absolute;right:2px;bottom:2px;width:17px;height:17px;padding:0;border:0;border-radius:0 0 9px 0;background:linear-gradient(135deg,transparent 45%,rgba(174,199,231,.25) 46%,rgba(174,199,231,.25) 53%,transparent 54%,transparent 65%,rgba(174,199,231,.38) 66%,rgba(174,199,231,.38) 73%,transparent 74%);cursor:nwse-resize;touch-action:none;z-index:2}
      .fx-game-leaderboard-row-wrap{display:grid;grid-template-columns:minmax(0,1fr) 30px;align-items:stretch;gap:2px;border:1px solid color-mix(in srgb,var(--fx-game-player-color,rgba(158,194,229,.2)) 24%,transparent);border-left:4px solid var(--fx-game-player-color,rgba(158,194,229,.22));border-radius:7px;background:linear-gradient(110deg,color-mix(in srgb,var(--fx-game-player-color,#193047) 18%,rgba(15,32,49,var(--fx-game-hud-panel-alpha,.81))),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)) 80%);transition:background .16s ease,border-color .16s ease}
      .fx-game-leaderboard-row-wrap:hover{background:linear-gradient(110deg,color-mix(in srgb,var(--fx-game-player-color,#224556) 27%,rgba(22,46,63,var(--fx-game-hud-panel-alpha,.81))),rgba(11,27,38,var(--fx-game-hud-panel-alpha,.81)) 80%)}
      .fx-game-leaderboard-row-wrap.is-own{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--fx-game-player-color,#70f49c) 42%,transparent)}
      .fx-game-leaderboard-row-wrap.is-eliminated{opacity:.62}.fx-game-leaderboard-row-wrap.is-eliminated .fx-game-leaderboard-name{text-decoration:line-through;text-decoration-color:#ff8b8b;text-decoration-thickness:1.5px;color:#9ba8b9}
      .fx-game-leaderboard-row-wrap .fx-game-leaderboard-row{border:0;border-radius:6px;background:transparent;min-width:0}.fx-game-leaderboard-row-wrap .fx-game-leaderboard-row:hover{background:transparent}
      .fx-game-leaderboard-lock{align-self:center;justify-self:center;width:25px;height:25px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:#9fb2ca;font:13px/1 system-ui,sans-serif;cursor:pointer}
      .fx-game-leaderboard-lock:hover,.fx-game-leaderboard-lock.is-locked{border-color:rgba(155,190,235,.25);background:rgba(99,160,255,.14);color:#dbeaff}
      .fx-game-status-hud{position:fixed;z-index:59;top:clamp(12px,2vh,24px);right:14px;width:min(300px,calc(100vw - 28px));max-height:min(90vh,900px);container-type:inline-size;container-name:fx-status-hud;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr));grid-auto-rows:min-content;align-content:start;gap:8px;overflow:auto;box-sizing:border-box;padding:10px 10px 20px;border:1px solid rgba(160,190,225,.24);border-radius:12px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:0 16px 42px rgba(0,0,0,.36),inset 0 1px rgba(255,255,255,.055);backdrop-filter:blur(16px);color:#eef4ff;font:13px/1.3 var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:auto;scrollbar-width:thin}
      .fx-game-status-item{position:relative;display:grid;grid-template-columns:22px minmax(0,1fr);grid-template-areas:"icon label" "value value";align-items:center;gap:5px 6px;min-width:0;min-height:67px;padding:9px;border:1px solid rgba(150,185,225,.17);border-radius:10px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:inset 0 1px rgba(255,255,255,.055),0 4px 12px rgba(0,0,0,.12)}
      .fx-game-status-card{position:fixed;z-index:59;display:grid !important;grid-template-columns:minmax(0,1fr);grid-template-areas:"head" "value";align-content:center;gap:8px;min-height:0;overflow:hidden;box-sizing:border-box;padding:10px 12px;font-family:var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:auto}
      .fx-game-status-card-head{grid-area:head;display:flex;align-items:center;gap:8px;min-width:0;touch-action:none;cursor:move;user-select:none}
      .fx-game-status-item.is-map-control{display:grid !important;grid-template-areas:"head" "pixels" "meter";align-content:center;min-width:0;min-height:0;padding:10px 12px}
      .fx-game-status-map-pair{grid-area:1 / 1;display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"head" "pixels" "meter";gap:5px;min-width:0}
      .fx-game-status-map-main{grid-area:head;display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"head" "value";align-items:center;gap:4px;min-width:0;touch-action:none;cursor:move;user-select:none}
      .fx-game-status-map-main .fx-game-status-value{grid-area:value;overflow:visible;color:#6ef0ae;font-size:clamp(22px,5cqi,30px);line-height:1.05;text-overflow:clip;white-space:nowrap}
      .fx-game-status-map-pixels{display:flex;align-items:center;gap:6px;min-width:0;padding-top:5px;border-top:1px solid rgba(150,185,225,.14)}.fx-game-status-map-pixels .fx-game-status-icon{flex:0 0 18px;width:18px;height:18px;font-size:12px}.fx-game-status-map-pixels small{color:#8094af;font-size:7px;font-weight:750;letter-spacing:.05em;white-space:nowrap}.fx-game-status-map-pixels strong{margin-left:auto;overflow:hidden;color:#9dbbff;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}
      .fx-game-status-icon{grid-area:icon;display:grid;place-items:center;width:18px;height:18px;border-radius:5px;background:rgba(130,180,240,.13);color:#a8d0ff;font-size:13px;font-weight:800}
      .fx-game-status-label{grid-area:label;overflow:hidden;color:#9fb2cb;font-size:8px;font-weight:750;letter-spacing:.07em;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}
      .fx-game-status-value{grid-area:value;overflow:hidden;color:#f4f8ff;font-size:clamp(15px,1.4vw,19px);font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}
      .fx-game-status-item.is-humans .fx-game-status-value{color:#8bd1ff}.fx-game-status-item.is-bots .fx-game-status-value{color:#ffd17a}.fx-game-status-item.is-percentage .fx-game-status-value{color:#6ef0ae;font-size:clamp(17px,1.7vw,22px)}.fx-game-status-item.is-time .fx-game-status-value{color:#ffd479}.fx-game-status-item.is-pixels .fx-game-status-value{color:#9dbbff}
      .fx-game-status-item.is-density .fx-game-status-value{color:var(--fx-game-density-color,#f4f8ff)}
      .fx-game-status-density-values{grid-area:value;display:grid;grid-template-columns:minmax(0,1fr);gap:5px;min-width:0}.fx-game-status-density-main{display:flex;align-items:baseline;gap:6px;min-width:0}.fx-game-status-density-main .fx-game-status-value{overflow:visible;font-size:clamp(20px,5cqi,28px);line-height:1;text-overflow:clip}.fx-game-status-density-main small{color:#9eb1ca;font-size:8px;font-weight:650;white-space:nowrap}.fx-game-status-max-troops{display:flex;align-items:baseline;justify-content:space-between;gap:6px;min-width:0;padding-top:4px;border-top:1px solid rgba(150,185,225,.14)}.fx-game-status-max-troops>span:first-child{display:flex;align-items:baseline;gap:6px;min-width:0}.fx-game-status-max-troops small{color:#8094af;font-size:7px;font-weight:750;letter-spacing:.05em;white-space:nowrap}.fx-game-status-max-troops strong{overflow:hidden;color:#dce9fb;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}.fx-game-status-meter{height:3px;overflow:hidden;border-radius:99px;background:rgba(154,180,213,.16);box-shadow:inset 0 1px 2px rgba(0,0,0,.4)}.fx-game-status-meter span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--fx-game-density-color,#78a9ff) 65%,#39dfae),var(--fx-game-density-color,#78a9ff));box-shadow:0 0 9px color-mix(in srgb,var(--fx-game-density-color,#78a9ff) 55%,transparent);transition:width .25s ease}
      .fx-game-status-item.is-time{grid-column:auto;display:grid;grid-template-columns:22px minmax(0,1fr);grid-template-areas:"head value";align-items:center;gap:8px;min-height:0;min-width:0;padding:10px 12px}.fx-game-status-item.is-time .fx-game-status-icon{flex:0 0 18px}.fx-game-status-item.is-time .fx-game-status-value{font-size:16px}
      :root[data-fx-game-status-style="strip"] .fx-game-status-hud{display:flex;flex-wrap:wrap;gap:5px;width:min(430px,calc(100vw - 28px));padding:7px}
      :root[data-fx-game-status-style="strip"] .fx-game-status-item{display:grid;grid-template-columns:17px minmax(0,1fr) auto;grid-template-areas:"icon label value";flex:1 1 118px;min-height:35px;padding:5px 7px;gap:5px}
      :root[data-fx-game-status-style="strip"] .fx-game-status-value{font-size:14px;text-align:right}
      :root[data-fx-game-status-style="strip"] .fx-game-status-item.is-time{order:99;grid-column:auto;flex:0 1 94px;min-height:35px}
      :root[data-fx-game-status-style="strip"] .fx-game-status-item.is-time{display:flex}
      :root[data-fx-game-status-style="rows"] .fx-game-status-hud{grid-template-columns:1fr;gap:2px;padding:8px 10px}
      :root[data-fx-game-status-style="rows"] .fx-game-status-item{display:grid;grid-template-columns:22px minmax(0,1fr) auto;grid-template-areas:"icon label value";min-height:30px;padding:3px 4px;border:0;border-bottom:1px solid rgba(160,190,225,.1);border-radius:0;background:transparent;box-shadow:none}
      :root[data-fx-game-status-style="rows"] .fx-game-status-item:last-child{border-bottom:0}
      :root[data-fx-game-status-style="rows"] .fx-game-status-value,:root[data-fx-game-status-style="strip"] .fx-game-status-item.is-percentage .fx-game-status-value{font-size:14px;text-align:right}
      :root[data-fx-game-status-style="rows"] .fx-game-status-item.is-time{display:flex;grid-column:auto;min-height:34px}
      @container fx-status-hud (min-width:360px){.fx-game-status-item.is-density{grid-column:auto;min-height:88px;padding:8px;background:radial-gradient(ellipse at 8% 0%,color-mix(in srgb,var(--fx-game-density-color,#78a9ff) 16%,transparent),transparent 58%),linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));border-color:color-mix(in srgb,var(--fx-game-density-color,#78a9ff) 38%,rgba(150,185,225,.17));box-shadow:inset 0 1px rgba(255,255,255,.08),0 8px 20px rgba(0,0,0,.2)}.fx-game-status-item.is-density .fx-game-status-icon{background:color-mix(in srgb,var(--fx-game-density-color,#78a9ff) 24%,rgba(130,180,240,.13));color:var(--fx-game-density-color,#a8d0ff)}}
      @container fx-status-hud (max-width:359px){.fx-game-status-max-troops{align-items:flex-start;flex-direction:column;gap:4px}.fx-game-status-density-main .fx-game-status-value{font-size:22px}.fx-game-status-density-main small{display:none}}
      .fx-game-status-item.is-map-control{background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));border-color:rgba(150,185,225,.17);box-shadow:inset 0 1px rgba(255,255,255,.055),0 4px 12px rgba(0,0,0,.12)}
      :root[data-fx-game-status-style="rows"] .fx-game-status-item.is-density{grid-column:auto;min-height:110px}
      :root[data-fx-game-status-style="strip"] .fx-game-status-item.is-density{flex:2 1 230px;min-height:110px}
      @media(max-width:600px){.fx-game-leaderboard-hud{top:8px;left:calc(var(--fx-sidebar-width, 0px) + 8px);width:min(230px,calc(100vw - var(--fx-sidebar-width, 0px) - 16px));max-height:65vh;font-size:12px}.fx-game-leaderboard-row{min-height:26px}}
      @media(max-width:600px){.fx-game-status-hud{top:auto;right:8px;bottom:8px;width:min(230px,calc(100vw - 16px));max-height:42vh;grid-template-columns:repeat(auto-fit,minmax(min(100%,108px),1fr));gap:5px;padding:7px 7px 18px}.fx-game-status-item{min-height:58px;padding:7px}.fx-game-status-value{font-size:16px}:root[data-fx-game-status-style="strip"] .fx-game-status-hud{width:min(300px,calc(100vw - 16px))}:root[data-fx-game-status-style="rows"] .fx-game-status-item.is-density{min-height:108px}}
      @container fx-game-leaderboard (max-width:420px){.fx-game-leaderboard-head{gap:6px;padding:9px}.fx-game-leaderboard-title small{display:none}.fx-game-leaderboard-title strong{font-size:13px}.fx-game-leaderboard-counts{gap:3px}.fx-game-leaderboard-count{gap:3px;padding:4px 5px;font-size:11px}.fx-game-leaderboard-count span{font-size:13px}}
      @container fx-game-leaderboard (max-width:330px){.fx-game-leaderboard-title{display:none}.fx-game-leaderboard-head{justify-content:space-between}.fx-game-leaderboard-counts{flex:1;justify-content:flex-end}}
      .fx-game-status-card{grid-template-areas:"head" "value"!important;min-height:0!important;padding:10px 12px!important}
      .fx-game-leaderboard-hud *,.fx-game-status-card *{font-family:inherit}
      .fx-game-leaderboard-hud .fx-game-leaderboard-tools button,.fx-game-leaderboard-hud .fx-game-leaderboard-lock{font-family:inherit}
      .fx-game-status-card-head{grid-area:head!important}
      .fx-game-status-card-head .fx-game-status-icon{box-sizing:border-box;flex:0 0 18px;width:18px;height:18px}
      .fx-game-status-card-head .fx-game-status-label{display:flex;align-items:center;height:18px;line-height:1}
      .fx-game-status-item.is-map-control{grid-template-areas:"head" "pixels" "meter"!important;padding:10px 12px!important}
      .fx-game-status-map-pair .fx-game-status-meter{grid-area:meter}
      .fx-game-status-item.is-time{grid-template-columns:16px minmax(0,1fr)!important;grid-template-areas:"head value"!important;gap:4px!important;padding:5px 8px!important;border-radius:8px!important}.fx-game-status-item.is-time .fx-game-status-icon{flex-basis:14px;font-size:12px}.fx-game-status-item.is-time .fx-game-status-value{font-size:13px!important}
      .fx-game-status-item.is-density{background:radial-gradient(ellipse at 8% 0%,color-mix(in srgb,var(--fx-game-density-color,#78a9ff) 16%,transparent),transparent 58%),linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));border-color:color-mix(in srgb,var(--fx-game-density-color,#78a9ff) 38%,rgba(150,185,225,.17));box-shadow:inset 0 1px rgba(255,255,255,.08),0 8px 20px rgba(0,0,0,.2)}
    `;
    document.head.appendChild(style);
  }
  const host = document.createElement("div");
  host.id = "fx-game-leaderboard-hud-root";
  document.body.appendChild(host);
  const app = createApp(GameLeaderboardHud);
  app.config.errorHandler = (error, _instance, info) => console.error("[ZFX Client GameLeaderboardHud] Vue error:", info, error);
  app.mount(host);
  return () => { app.unmount(); host.remove(); };
}
