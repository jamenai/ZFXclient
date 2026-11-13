import { computed, createApp, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue/dist/vue.esm-bundler.js";
import { saveSettings, settingsApi } from "../../../modules/settings/settings.js";
import { GameLeaderboardWidget } from "./gameLeaderboardWidget.js";
import { GameStatusWidgets } from "./gameStatusWidgets.js";
import { GameTeamChartWidget } from "./gameTeamChartWidget.js";
import { GameTickCounterWidget } from "./gameTickCounterWidget.js";

const numberFormat = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const LEADERBOARD_ROW_HEIGHT = 31;
const LEADERBOARD_ROW_GAP = 2;
const LEADERBOARD_ROW_STRIDE = LEADERBOARD_ROW_HEIGHT + LEADERBOARD_ROW_GAP;
const LEADERBOARD_OVERSCAN = 8;
const NATIVE_TEAM_COLOR_NAMES = ["Dunkelgrau", "Rot", "Grün", "Blau", "Oliv", "Violett", "Türkis", "Grau", "Schwarz"];

const GameLeaderboardHud = defineComponent({
  name: "FxGameLeaderboardHud",
  components: { GameLeaderboardWidget, GameStatusWidgets, GameTeamChartWidget, GameTickCounterWidget },
  setup() {
    const snapshot = ref(null);
    const now = ref(Date.now());
    const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
    const inMatch = ref(false);
    const collapsed = ref(false);
    const showEliminated = ref(true);
    const showBots = ref(true);
    const activeTab = ref("players");
    const playerFilter = ref("all");
    const virtualWindow = ref({ start: 0, end: 32 });
    const rowsContainer = ref(null);
    let rowsResizeObserver = null;
    const statusSnapshot = ref(null);
    const teamChartSnapshot = ref(null);
    const tickHudSnapshot = ref(null);
    let lastNativeDisplayTick = null;
    let nativeDisplayCycles = 0;
    const resolveTeamColor = (playerId, teamId, fx = window.__fx) => {
      if (teamId === null || teamId === undefined) return null;
      const nativeColor = fx?.getNativePlayerTeamColor?.(playerId);
      if (nativeColor) return String(nativeColor);
      const chartColor = teamChartSnapshot.value?.teams?.find(team => team.id === Number(teamId))?.color;
      return chartColor ? String(chartColor) : null;
    };
    const detailedTeamPercentage = ref(settingsApi.getBoolean("detailedTeamPercentage"));
    const leaderboardPanel = ref(null);
    const teamChartPosition = ref(null);
    const tickHudPosition = ref(null);
    const statusCardLayouts = ref({});
    const statusCardsCollapsed = ref({});
    const lockedPlayerId = ref(null);
    const lockedPlayerRank = ref(null);
    const panelPosition = ref(null);
    const panelSize = ref({ width: null, height: null });
    const gameHudSettingsOpen = ref(false);
    const gameHudFontScale = ref(100);
    const gameHudTransparency = ref(settingsApi.getNumber("gameHudTransparency", 15));
    const gameHudLayoutSlots = ref([null, null, null, null]);
    const gameHudLayoutSlot = ref(0);
    const gameHudSettingsTab = ref("layout");
    const gameMapProfileSettings = ref({});
    const gameMapSettingsSlots = ref([null, null, null, null]);
    const gameMapSettingsSlot = ref(0);
    const gameHudSettingsStorageKey = "zfx.gameHud.settings.v1";
    const gameHudLayoutSlotsStorageKey = "zfx.gameHud.layoutSlots.v1";
    const gameMapSettingsSlotsStorageKey = "zfx.gameMap.settingsProfiles.v1";
    const gameMapSettingKeys = ["showPlayerDensity", "coloredDensity", "densityDisplayStyle", "displayTickNumber", "showEstimatedEliminationAttack", "estimatedAttackTroopMultiplier", "estimatedAttackGreenThreshold", "hoveringTooltip", "highlightSelfTerritory", "selfTerritoryOutlineWidth", "selfTerritoryGlow", "highlightClanSpawns", "showCountryFlagsOnLand", "hideBotNames"];
    const getGameMapProfileSettings = () => Object.fromEntries(gameMapSettingKeys.map(key => {
      if (["densityDisplayStyle"].includes(key)) return [key, settingsApi.getString(key, "absoluteQuotient")];
      if (["selfTerritoryOutlineWidth", "selfTerritoryGlow", "estimatedAttackTroopMultiplier", "estimatedAttackGreenThreshold"].includes(key)) return [key, settingsApi.getNumber(key, key === "selfTerritoryOutlineWidth" ? 3 : key === "selfTerritoryGlow" ? 6 : key === "estimatedAttackTroopMultiplier" ? 2 : 25)];
      return [key, settingsApi.getBoolean(key)];
    }));
    let panelDrag = null;
    let resizeDrag = null;
    let suppressStatusHeaderClick = false;
    let suppressStatusHeaderClickTimer = 0;
    let ignoreHeaderClick = false;
    let timer;
    const lastAliveByPlayerId = new Map();
    const eliminationOrderByPlayerId = new Map();
    let eliminationSequence = 0;
    const panelPositionStorageKey = "zfx.gameLeaderboardHud.position.v2";
    const showEliminatedStorageKey = "zfx.gameLeaderboardHud.showEliminated.v1";
    const showBotsStorageKey = "zfx.gameLeaderboardHud.showBots.v1";
    const leaderboardCollapsedStorageKey = "zfx.gameLeaderboardHud.collapsed.v1";
    const legacyPanelPositionStorageKey = "zfx.gameLeaderboardHud.position.v1";
    const sizeStorageKey = "zfx.gameLeaderboardHud.size.v1";
    const statusCardLayoutsStorageKey = "zfx.gameStatusHud.cards.v2";
    const legacyStatusCardLayoutsStorageKey = "zfx.gameStatusHud.cards.v1";
    const statusCardsCollapsedStorageKey = "zfx.gameStatusHud.collapsed.v1";
    const teamChartPositionStorageKey = "zfx.gameTeamChart.position.v1";
    const tickHudPositionStorageKey = "zfx.gameTickHud.position.v1";
    const attackSelectorPositionStorageKey = "zfx.gameAttackSelector.position.v1";
    const teamChartWidth = 168;
    const teamChartHeight = 190;
    const tickHudWidth = 312;
    const tickHudHeight = 60;
    const applyGameHudSettings = () => {
      const scale = clamp(Number(gameHudFontScale.value) || 100, 75, 150);
      const transparency = clamp(Number(gameHudTransparency.value) || 0, 0, 70);
      document.documentElement.style.setProperty("--fx-game-hud-font-scale", String(scale / 100));
      document.documentElement.style.setProperty("--fx-game-hud-panel-alpha", String(.96 - transparency / 100));
      try { window.localStorage.setItem(gameHudSettingsStorageKey, JSON.stringify({ fontScale: scale, transparency })); } catch { /* Storage may be unavailable. */ }
    };
    const applyGameMapSettings = () => {
      const rejected = [];
      for (const [key, value] of Object.entries(gameMapProfileSettings.value)) {
        if (!settingsApi.set(key, value)) rejected.push(key);
      }
      saveSettings();
      window.__fx?.refreshSelfTerritoryHighlights?.();
      if (rejected.length) console.warn("[ZFX Client] Could not apply map settings:", rejected);
    };
    const saveGameMapSettings = () => {
      const slots = [...gameMapSettingsSlots.value];
      slots[gameMapSettingsSlot.value] = { savedAt: Date.now(), settings: getGameMapProfileSettings() };
      gameMapSettingsSlots.value = slots;
      try { window.localStorage.setItem(gameMapSettingsSlotsStorageKey, JSON.stringify(slots)); } catch { /* Storage may be unavailable. */ }
    };
    const deleteGameMapSettings = () => {
      const slots = [...gameMapSettingsSlots.value];
      slots[gameMapSettingsSlot.value] = null;
      gameMapSettingsSlots.value = slots;
      try { window.localStorage.setItem(gameMapSettingsSlotsStorageKey, JSON.stringify(slots)); } catch { /* Storage may be unavailable. */ }
    };
    const loadGameMapSettings = () => {
      const settings = gameMapSettingsSlots.value[gameMapSettingsSlot.value]?.settings;
      if (!settings) return;
      gameMapProfileSettings.value = { ...getGameMapProfileSettings(), ...settings };
      applyGameMapSettings();
    };
    const getGameHudLayoutSnapshot = () => Object.fromEntries([
      panelPositionStorageKey, sizeStorageKey, leaderboardCollapsedStorageKey, statusCardLayoutsStorageKey, statusCardsCollapsedStorageKey, teamChartPositionStorageKey, tickHudPositionStorageKey, attackSelectorPositionStorageKey, "zfx.gameKeybindHud.position.v1", gameHudSettingsStorageKey, "zfx.gameMinimap.position.v1",
    ].map(key => [key, window.localStorage.getItem(key)]));
    const saveGameHudLayout = () => {
      const slots = [...gameHudLayoutSlots.value];
      slots[gameHudLayoutSlot.value] = { savedAt: Date.now(), layout: getGameHudLayoutSnapshot() };
      gameHudLayoutSlots.value = slots;
      try { window.localStorage.setItem(gameHudLayoutSlotsStorageKey, JSON.stringify(slots)); } catch { /* Storage may be unavailable. */ }
    };
    const deleteGameHudLayout = () => {
      const slots = [...gameHudLayoutSlots.value];
      slots[gameHudLayoutSlot.value] = null;
      gameHudLayoutSlots.value = slots;
      try { window.localStorage.setItem(gameHudLayoutSlotsStorageKey, JSON.stringify(slots)); } catch { /* Storage may be unavailable. */ }
    };
    const loadGameHudLayout = () => {
      const slot = gameHudLayoutSlots.value[gameHudLayoutSlot.value];
      if (!slot?.layout) return;
      for (const [key, value] of Object.entries(slot.layout)) {
        if (typeof value === "string") window.localStorage.setItem(key, value);
        else window.localStorage.removeItem(key);
      }
      try {
        const savedHudSettings = JSON.parse(window.localStorage.getItem(gameHudSettingsStorageKey) || "null");
        gameHudFontScale.value = clamp(savedHudSettings?.fontScale ?? 100, 75, 150);
        gameHudTransparency.value = clamp(savedHudSettings?.transparency ?? settingsApi.getNumber("gameHudTransparency", 15), 0, 70);
        applyGameHudSettings();
      } catch { /* Ignore invalid saved HUD settings. */ }
      try { collapsed.value = JSON.parse(window.localStorage.getItem(leaderboardCollapsedStorageKey) || "false") === true; } catch { collapsed.value = false; }
      try {
        const savedSize = JSON.parse(window.localStorage.getItem(sizeStorageKey) || "null");
        if (Number.isFinite(savedSize?.width) && Number.isFinite(savedSize?.height)) panelSize.value = clampPanelSize(savedSize.width, savedSize.height);
        panelPosition.value = JSON.parse(window.localStorage.getItem(panelPositionStorageKey) || "null");
        teamChartPosition.value = JSON.parse(window.localStorage.getItem(teamChartPositionStorageKey) || "null");
        tickHudPosition.value = JSON.parse(window.localStorage.getItem(tickHudPositionStorageKey) || "null");
        statusCardLayouts.value = JSON.parse(window.localStorage.getItem(statusCardLayoutsStorageKey) || "{}");
        statusCardsCollapsed.value = JSON.parse(window.localStorage.getItem(statusCardsCollapsedStorageKey) || "{}");
      } catch { /* Ignore invalid saved layouts. */ }
      window.__fx?.gameMinimapHud?.reloadPosition?.();
      window.dispatchEvent(new Event("fx-game-hud-layout-loaded"));
    };
    let teamChartDrag = null;
    let tickHudDrag = null;
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
      const scale = clamp((Number(gameHudFontScale.value) || 100) / 100, 0.75, 1.5);
      const collapsed = statusCardsCollapsed.value[key] === true;
      const baseTileWidth = Math.max(150, Math.min(180, (viewportWidth - 40) / 2));
      const tileWidth = Math.round(baseTileWidth * scale);
      const baseWidth = collapsed && key === "density" ? 116 : collapsed && key === "map-control" ? 128 : key === "time" ? 88 : key === "income" || key === "interest" ? 148 : baseTileWidth;
      const width = Math.round(baseWidth * scale);
      const twoColumns = viewportWidth >= 380 * scale;
      const column = key === "map-control" || key === "time" ? 0 : 1;
      const row = key === "income" || key === "interest" || key === "time" ? 1 : 0;
      const x = twoColumns
        ? column === 0
          ? viewportWidth - 14 - width
          : viewportWidth - 14 - tileWidth - 8 * scale - width
        : viewportWidth - 14 - width;
      const y = twoColumns
        ? 14 + row * 128 * scale
        : key === "map-control"
          ? 14 + (statusCardsCollapsed.value.density ? 78 : 154) * scale + 10 * scale
          : 14 + ({ density: 0, interest: 2, time: 3 }[key] ?? 0) * 128 * scale;
      const height = Math.round((collapsed && (key === "density" || key === "map-control") ? 78 : key === "time" ? 34 : key === "map-control" ? 114 : key === "density" ? 154 : 98) * scale);
      return { x: Math.max(8, x), y, width, height };
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
    const getDefaultTickHudPosition = () => ({ x: Math.max(8, Math.round((viewport.value.width - tickHudWidth) / 2)), y: 12 });
    const resolveTickHudPosition = () => {
      const saved = tickHudPosition.value;
      const defaults = getDefaultTickHudPosition();
      if (!saved) return defaults;
      const { width: viewportWidth, height: viewportHeight } = viewport.value;
      const maxX = Math.max(8, viewportWidth - tickHudWidth - 8);
      const maxY = Math.max(8, viewportHeight - tickHudHeight - 8);
      return {
        x: Number.isFinite(saved.xRatio) ? fromPositionRatio(saved.xRatio, maxX) : clamp(saved.x ?? defaults.x, 8, maxX),
        y: Number.isFinite(saved.yRatio) ? fromPositionRatio(saved.yRatio, maxY) : clamp(saved.y ?? defaults.y, 8, maxY),
      };
    };
    const tickHudStyle = computed(() => {
      const position = resolveTickHudPosition();
      return { left: `${position.x}px`, top: `${position.y}px` };
    });
    const moveTickHud = event => {
      if (!tickHudDrag) return;
      const { width: viewportWidth, height: viewportHeight } = viewport.value;
      const maxX = Math.max(8, viewportWidth - tickHudWidth - 8);
      const maxY = Math.max(8, viewportHeight - tickHudHeight - 8);
      const x = clamp(tickHudDrag.x + event.clientX - tickHudDrag.pointerX, 8, maxX);
      const y = clamp(tickHudDrag.y + event.clientY - tickHudDrag.pointerY, 8, maxY);
      tickHudPosition.value = { xRatio: toPositionRatio(x, maxX), yRatio: toPositionRatio(y, maxY) };
    };
    const stopTickHudMove = () => {
      if (!tickHudDrag) return;
      tickHudDrag = null;
      window.removeEventListener("pointermove", moveTickHud);
      window.removeEventListener("pointerup", stopTickHudMove);
      window.removeEventListener("pointercancel", stopTickHudMove);
      try { window.localStorage.setItem(tickHudPositionStorageKey, JSON.stringify(tickHudPosition.value)); } catch { /* Storage may be unavailable. */ }
    };
    const startTickHudMove = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const current = resolveTickHudPosition();
      tickHudDrag = { ...current, pointerX: event.clientX, pointerY: event.clientY };
      window.addEventListener("pointermove", moveTickHud);
      window.addEventListener("pointerup", stopTickHudMove);
      window.addEventListener("pointercancel", stopTickHudMove);
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
        const label = `${(share * 100).toFixed(detailedTeamPercentage.value ? 2 : 0)}%`;
        const labelChord = Math.max(0, 2 * labelRadius * Math.sin(Math.min(Math.PI, share * Math.PI * 2) / 2) - 4);
        const labelFontSize = Math.max(4.5, Math.min(10.5, labelChord / (label.length * 0.46)));
        const result = {
          ...team,
          share,
          color: team.color || "#78869a",
          path: `M50 50 L${startX.toFixed(3)} ${startY.toFixed(3)} A45 45 0 ${largeArc} 1 ${endX.toFixed(3)} ${endY.toFixed(3)} Z`,
          label,
          labelFontSize,
          labelX: 50 + labelRadius * Math.cos(labelAngle),
          labelY: 50 + labelRadius * Math.sin(labelAngle),
        };
        angle = nextAngle;
        return result;
      });
      return { teams, total, segments };
    });
    const teamChartVisible = computed(() => inMatch.value && teamChartSegments.value.total > 0);
    const ownTeamColor = computed(() => {
      if (!inMatch.value) return null;
      const ownPlayer = snapshot.value?.ownPlayer
        ?? snapshot.value?.players?.find(player => player.id === snapshot.value?.ownPlayerId);
      if (!ownPlayer) return null;
      if (ownPlayer.teamId !== null && ownPlayer.teamId !== undefined) {
        const nativeTeamColor = window.__fx?.getNativePlayerTeamColor?.(ownPlayer.id);
        if (nativeTeamColor) return String(nativeTeamColor);
        const teamId = Number(ownPlayer.teamId);
        const chartColor = teamChartSnapshot.value?.teams?.find(team => team.id === teamId)?.color;
        if (chartColor) return chartColor;
      }
      return ownPlayer.color ? String(ownPlayer.color) : null;
    });
    const gameHudAccentStyle = computed(() => ownTeamColor.value ? { "--fx-game-team-accent": ownTeamColor.value } : {});
    watch(ownTeamColor, color => {
      if (color) document.documentElement.style.setProperty("--fx-game-team-accent", color);
      else document.documentElement.style.removeProperty("--fx-game-team-accent");
    }, { immediate: true });
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
    const receiveTickHud = value => {
      if (!value || !Number.isFinite(Number(value.tick))) return;
      const previous = tickHudSnapshot.value || {};
      const nativeDisplayTick = Number(value.displayTick);
      const hasNativeDisplayTick = Number.isInteger(nativeDisplayTick) && nativeDisplayTick >= 0 && nativeDisplayTick <= 9;
      if (hasNativeDisplayTick) {
        if (lastNativeDisplayTick !== null && nativeDisplayTick > lastNativeDisplayTick) nativeDisplayCycles += 1;
        lastNativeDisplayTick = nativeDisplayTick;
      }
      const displayCycleLength = 10;
      const cycleTick = hasNativeDisplayTick ? displayCycleLength - nativeDisplayTick : Number(previous.cycleTick ?? value.cycleTick ?? value.tick) || 0;
      const totalCycles = hasNativeDisplayTick ? nativeDisplayCycles : Math.max(0, Number(previous.totalCycles ?? value.totalCycles) || 0);
      const totalTicks = hasNativeDisplayTick
        ? totalCycles * displayCycleLength + cycleTick
        : Math.max(0, Number(previous.totalTicks ?? value.totalTicks ?? value.tick) || 0);
      tickHudSnapshot.value = {
        updatedAt: Number(value.updatedAt) || Date.now(),
        tick: hasNativeDisplayTick ? cycleTick : Number(value.tick),
        cycleTick,
        cycle: displayCycleLength,
        totalTicks,
        totalCycles,
        tickProgress: clamp(Number(value.tickProgress ?? previous.tickProgress) || 0, 0, 1),
        balance: String(value.balance ?? previous.balance ?? "0"),
        income: String(value.income ?? previous.income ?? "0"),
        balanceRatio: clamp(Number(value.balanceRatio ?? previous.balanceRatio) || 0, 0, 1),
        isGrowing: Boolean(value.isGrowing ?? previous.isGrowing),
        visible: value.visible ?? previous.visible ?? true,
      };
      window.__fx.gameTickHudReady = inMatch.value && tickHudSnapshot.value.visible;
    };
    // The simulation's 30/40/50 update batches differ from the native ten-step
    // indicator. Only the native displayTick snapshot drives the visible HUD.
    const receiveTickCycle = () => {};
    const persistStatusCardLayouts = () => {
      try { window.localStorage.setItem(statusCardLayoutsStorageKey, JSON.stringify(statusCardLayouts.value)); } catch { /* Storage may be unavailable. */ }
    };
    const toggleStatusCardCollapsed = (key, event) => {
      if (key !== "density" && key !== "map-control") return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (suppressStatusHeaderClick) {
        suppressStatusHeaderClick = false;
        window.clearTimeout(suppressStatusHeaderClickTimer);
        return;
      }
      statusCardsCollapsed.value = { ...statusCardsCollapsed.value, [key]: !statusCardsCollapsed.value[key] };
      try { window.localStorage.setItem(statusCardsCollapsedStorageKey, JSON.stringify(statusCardsCollapsed.value)); } catch { /* Storage may be unavailable. */ }
    };
    const moveStatusCard = event => {
      if (!statusCardDrag) return;
      if (Math.hypot(event.clientX - statusCardDrag.pointerX, event.clientY - statusCardDrag.pointerY) > 4) statusCardDrag.moved = true;
      if (!statusCardDrag.moved) return;
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
      const moved = statusCardDrag.moved;
      statusCardDrag = null;
      window.removeEventListener("pointermove", moveStatusCard);
      window.removeEventListener("pointerup", stopStatusCardMove);
      window.removeEventListener("pointercancel", stopStatusCardMove);
      if (moved) {
        suppressStatusHeaderClick = true;
        window.clearTimeout(suppressStatusHeaderClickTimer);
        suppressStatusHeaderClickTimer = window.setTimeout(() => { suppressStatusHeaderClick = false; }, 80);
        persistStatusCardLayouts();
      }
    };
    const startStatusCardMove = (event, key) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const current = resolveStatusCardLayout(key);
      statusCardDrag = { key, x: current.x, y: current.y, pointerX: event.clientX, pointerY: event.clientY, moved: false };
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
      const rect = leaderboardPanel.value?.getBoundingClientRect();
      if (rect) {
        const maxX = Math.max(8, viewport.value.width - rect.width - 8);
        const maxY = Math.max(8, viewport.value.height - rect.height - 8);
        panelPosition.value = {
          xRatio: toPositionRatio(clamp(rect.left, 8, maxX), maxX),
          yRatio: toPositionRatio(clamp(rect.top, 8, maxY), maxY),
        };
      }
      try {
        window.localStorage.setItem(sizeStorageKey, JSON.stringify(panelSize.value));
        if (panelPosition.value) window.localStorage.setItem(panelPositionStorageKey, JSON.stringify(panelPosition.value));
      } catch { /* Storage may be unavailable. */ }
    };
    const startPanelResize = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.parentElement.getBoundingClientRect();
      // Freeze the panel's top-left corner while its size changes. Keeping a
      // viewport ratio here makes Y drift toward the top as the panel grows.
      panelPosition.value = { x: rect.left, y: rect.top };
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
      panelDrag = { x: rect.left, y: rect.top, width: rect.width, height: rect.height, pointerX: event.clientX, pointerY: event.clientY };
      window.addEventListener("pointermove", movePanel);
      window.addEventListener("pointerup", stopPanelMove);
      window.addEventListener("pointercancel", stopPanelMove);
    };
    const handlePanelHeaderClick = event => {
      if (ignoreHeaderClick) { ignoreHeaderClick = false; event.preventDefault(); return; }
      toggleCollapsed(event);
    };
    const observeEliminations = players => {
      for (const player of players) {
        const wasAlive = lastAliveByPlayerId.get(player.id);
        if (player.isAlive) eliminationOrderByPlayerId.delete(player.id);
        else if (wasAlive === true) eliminationOrderByPlayerId.set(player.id, ++eliminationSequence);
        else if (wasAlive === undefined && !eliminationOrderByPlayerId.has(player.id)) eliminationOrderByPlayerId.set(player.id, 0);
        lastAliveByPlayerId.set(player.id, player.isAlive);
      }
    };
    const rankPlayersByPlacement = players => {
      players.sort((left, right) => {
        if (left.isAlive !== right.isAlive) return left.isAlive ? -1 : 1;
        if (left.isAlive) return right.territories - left.territories || left.id - right.id;
        return (eliminationOrderByPlayerId.get(right.id) ?? 0) - (eliminationOrderByPlayerId.get(left.id) ?? 0) || left.id - right.id;
      });
      players.forEach((player, index) => { player.rank = index + 1; });
      return players;
    };
    const receive = value => {
      if (!value || !Array.isArray(value.players) || value.players.length === 0) return;
      const incomingTotal = Number(value.total);
      const currentTotal = Number(snapshot.value?.total);
      const incomingIsPartial = Number.isFinite(incomingTotal) && value.players.length < incomingTotal;
      const currentIsFull = snapshot.value && Number.isFinite(currentTotal) && snapshot.value.players.length >= currentTotal;
      if (incomingIsPartial && currentIsFull) return;
      const list = rowsContainer.value;
      const oldRows = list && lockedPlayerId.value === null ? rows.value : [];
      const oldAnchorIndex = list ? Math.floor(list.scrollTop / LEADERBOARD_ROW_STRIDE) : 0;
      const anchorId = oldRows[oldAnchorIndex]?.id;
      const anchorOffset = list ? list.scrollTop - oldAnchorIndex * LEADERBOARD_ROW_STRIDE : 0;
      const fx = window.__fx;
      const aliveStates = fx?.getGameVar?.("playerAlive");
      const playerStates = fx?.getGameVar?.("playerStates");
      const rawPlayerNames = fx?.getGameVar?.("rawPlayerNames");
      const parseClan = name => {
        try { return fx?.leaderboardFilter?.parseClanFromPlayerName?.(String(name ?? "")) || null; }
        catch { return null; }
      };
      const ownPlayerId = Number(value.ownPlayerId ?? fx?.getGameVar?.("playerId"));
      const ownClan = parseClan(rawPlayerNames?.[ownPlayerId] ?? value.ownPlayer?.name);
      const humanCount = Number(value.humanCount ?? fx?.getGameVar?.("gHumans")) || 0;
      const botCount = Number(value.botCount ?? fx?.getGameVar?.("gBots")) || 0;
      const isNativeBot = id => id >= humanCount || Number(playerStates?.[id]) === 2;
      const countAlive = isBot => aliveStates
        ? Array.from({ length: aliveStates.length }, (_, id) => Number(aliveStates[id]) !== 0 && isNativeBot(id) === isBot).filter(Boolean).length
        : value.players.filter(player => player.isAlive !== false && Boolean(player.isBot ?? isNativeBot(player.id)) === isBot).length;
      const normalizedPlayers = value.players.map(player => {
        const clanTag = parseClan(rawPlayerNames?.[player.id] ?? player.name);
        const teamId = player.teamId ?? fx?.getNativePlayerTeamId?.(player.id) ?? null;
        const teamColor = resolveTeamColor(player.id, teamId, fx);
        return {
          ...player,
          isBot: player.isBot ?? isNativeBot(player.id),
          isAlive: player.isAlive !== false,
          teamId,
          // In team modes the native per-player color can be a stale territory
          // color. Use the authoritative team palette for rows and aggregates.
          color: teamColor || player.color || fx?.gameLeaderboardAdapter?.getPlayerColor?.(player.id) || fx?.getNativePlayerColor?.(player.id) || null,
          clanTag,
          isOwn: player.id === ownPlayerId,
          isClanMate: player.id !== ownPlayerId && ownClan !== null && clanTag === ownClan,
        };
      });
      observeEliminations(normalizedPlayers);
      if (!incomingIsPartial) rankPlayersByPlacement(normalizedPlayers);
      const rankedOwnPlayer = normalizedPlayers.find(player => player.id === ownPlayerId);
      snapshot.value = {
        ...value,
        ownRank: rankedOwnPlayer?.rank ?? value.ownRank,
        humanCount,
        botCount,
        spectatorCount: Number(value.spectatorCount ?? fx?.getGameVar?.("gSpectators")) || 0,
        aliveHumanCount: countAlive(false),
        aliveBotCount: countAlive(true),
        players: normalizedPlayers,
        ownPlayer: rankedOwnPlayer
          ? { ...rankedOwnPlayer, isOwn: true, clanTag: ownClan, isClanMate: false }
          : value.ownPlayer ? { ...value.ownPlayer, color: resolveTeamColor(ownPlayerId, value.ownPlayer.teamId, fx) || value.ownPlayer.color || null, isAlive: value.ownPlayer.isAlive !== false, isOwn: true, clanTag: ownClan, isClanMate: false } : null,
      };
      inMatch.value = true;
      window.__fx.gameLeaderboardHudReady = true;
      if (list && lockedPlayerId.value === null) {
        nextTick(() => {
          if (anchorId == null) {
            list.scrollTop = Math.min(list.scrollTop, Math.max(0, rows.value.length * LEADERBOARD_ROW_STRIDE - list.clientHeight));
          } else {
            const nextIndex = rows.value.findIndex(player => player.id === anchorId);
            if (nextIndex >= 0) list.scrollTop = nextIndex * LEADERBOARD_ROW_STRIDE + anchorOffset;
          }
          updateVirtualWindow();
        });
      }
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
      const playerId = Number(fx?.getGameVar?.("playerId"));
      const playerTerritories = fx?.getGameVar?.("playerTerritories");
      const densityValue = Number.isInteger(playerId) ? fx?.utils?.getDensity?.(playerId) : null;
      const maxTroopsValue = Number.isInteger(playerId) && playerTerritories
        ? fx?.utils?.getMaxTroops?.(playerTerritories, playerId)
        : null;
      let densityColor = null;
      let densityFill = 0;
      try {
        const balance = Number(fx?.getGameVar?.("playerBalances")?.[playerId]);
        const pixels = Number(playerTerritories?.[playerId]);
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
      const maxTroops = mappedRows.find(row => row.key === "max-troops")
        || (maxTroopsValue != null ? { key: "max-troops", value: String(maxTroopsValue) } : null);
      const interest = mappedRows.find(row => row.key === "interest");
      const percentage = mappedRows.find(row => row.key === "percentage");
      const pixels = mappedRows.find(row => row.key === "pixels");
      const density = mappedRows.find(row => row.key === "density")
        || (densityValue != null && densityValue !== "" ? { key: "density", icon: "â–¤", shortLabel: "Density", value: String(densityValue) } : null);
      const displayRows = mappedRows
        .filter(row => !["humans", "bots", "spectators", "max-troops", "interest", "percentage", "pixels"].includes(row.key))
        .map(row => ({ ...row, densityColor: row.key === "density" ? densityColor : null, densityFill, maxTroops: row.key === "density" ? maxTroops?.value : null, interest: row.key === "density" ? interest?.value : null }));
      if (!displayRows.some(row => row.key === "density") && (density || maxTroops || interest)) {
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
        if (density?.value != null) displayRows[displayRows.length - 1].value = density.value;
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
        lastAliveByPlayerId.clear();
        eliminationOrderByPlayerId.clear();
        eliminationSequence = 0;
        snapshot.value = null;
        statusSnapshot.value = null;
        tickHudSnapshot.value = null;
        lastNativeDisplayTick = null;
        nativeDisplayCycles = 0;
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
      const playerStates = fx?.getGameVar?.("playerStates");
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
        const isAlive = aliveStates ? Number(aliveStates[id]) !== 0 : territoryValue > 0;
        players.push({
          id,
          name: rawName || `Player ${id + 1}`,
          isBot: id >= (Number.isFinite(humanCount) ? humanCount : 0) || Number(playerStates?.[id]) === 2,
          territories: territoryValue,
          isAlive,
          teamId: fx?.getNativePlayerTeamId?.(id) ?? null,
          color: resolveTeamColor(id, fx?.getNativePlayerTeamId?.(id), fx) || fx?.gameLeaderboardAdapter?.getPlayerColor?.(id) || fx?.getNativePlayerColor?.(id) || null,
        });
      }
      if (!players.length) return;
      observeEliminations(players);
      rankPlayersByPlacement(players);
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
    const canFilterClan = computed(() => !!snapshot.value?.players?.some(player => player.isOwn && player.clanTag));
    const canFilterTeam = computed(() => snapshot.value?.players?.some(player => player.isOwn && player.teamId !== null && player.teamId !== undefined) === true);
    const playerRows = computed(() => {
      if (!dataReady.value) return [];
      const all = [...snapshot.value.players];
      const own = snapshot.value.ownPlayer;
      if (own && !all.some(player => player.id === own.id)) all.push({ ...own, isOwn: true });
      return all
        .filter(player => showEliminated.value || player.isAlive)
        .filter(player => showBots.value || !player.isBot)
        .filter(player => {
          if (playerFilter.value === "clan") return player.isOwn || player.isClanMate;
          if (playerFilter.value === "team") return player.isOwn || (own?.teamId != null && player.teamId === own.teamId);
          return true;
        })
        .map(player => ({ ...player, isOwn: player.id === snapshot.value.ownPlayerId }));
    });
    const rivalRows = computed(() => {
      if (!dataReady.value) return [];
      const clans = new Map();
      for (const player of snapshot.value.players) {
        if (!player.clanTag) continue;
        const clan = clans.get(player.clanTag) || { id: player.clanTag, name: `[${player.clanTag}]`, territories: 0, memberCount: 0, teamCounts: new Map(), teamColors: new Map() };
        clan.territories += Number(player.territories) || 0;
        clan.memberCount += 1;
        if (player.teamId !== null && player.teamId !== undefined) {
          const teamId = String(player.teamId);
          clan.teamCounts.set(teamId, (clan.teamCounts.get(teamId) || 0) + 1);
          if (!clan.teamColors.has(teamId) && player.color) clan.teamColors.set(teamId, player.color);
        }
        clans.set(player.clanTag, clan);
      }
      return [...clans.values()]
        .sort((left, right) => right.territories - left.territories || left.name.localeCompare(right.name))
        .map((clan, index) => {
          const dominantTeam = [...clan.teamCounts.entries()]
            .sort((left, right) => right[1] - left[1] || Number(left[0]) - Number(right[0]))[0]?.[0];
          return { id: clan.id, name: clan.name, territories: clan.territories, memberCount: clan.memberCount, rank: index + 1, teamId: dominantTeam ?? null, color: dominantTeam ? clan.teamColors.get(dominantTeam) || null : null };
        });
    });
    const ownClanRank = computed(() => {
      const ownClan = snapshot.value?.ownPlayer?.clanTag
        ?? snapshot.value?.players?.find(player => player.id === snapshot.value?.ownPlayerId)?.clanTag;
      if (!ownClan) return null;
      return rivalRows.value.find(clan => clan.id === ownClan)?.rank ?? null;
    });
    const tabLabels = computed(() => {
      now.value;
      const translate = (key, fallback) => {
        const label = window.__fx?.translateFX?.(key);
        return label && label !== key ? label : fallback;
      };
      return {
        players: translate("gameLeaderboardTabPlayers", "Players"),
        rivals: translate("gameLeaderboardTabRivals", "Rivals"),
        teams: translate("gameLeaderboardTabTeams", "Teams"),
      };
    });
    const teamRows = computed(() => {
      if (!dataReady.value) return [];
      const teams = new Map();
      for (const player of snapshot.value.players) {
        if (player.teamId === null || player.teamId === undefined) continue;
        const key = String(player.teamId);
        const team = teams.get(key) || {
          id: key,
          name: `Team ${NATIVE_TEAM_COLOR_NAMES[Number(player.teamId)] || key}`,
          territories: 0,
          memberCount: 0,
          color: player.color || null,
        };
        team.territories += Number(player.territories) || 0;
        team.memberCount += 1;
        if (!team.color && player.color) team.color = player.color;
        teams.set(key, team);
      }
      return [...teams.values()]
        .sort((left, right) => right.territories - left.territories || left.name.localeCompare(right.name))
        .map((team, index) => ({ ...team, rank: index + 1 }));
    });
    const rows = computed(() => activeTab.value === "rivals" ? rivalRows.value : activeTab.value === "teams" ? teamRows.value : playerRows.value);
    const visibleRows = computed(() => rows.value.slice(virtualWindow.value.start, virtualWindow.value.end));
    const topSpacerHeight = computed(() => virtualWindow.value.start * LEADERBOARD_ROW_STRIDE);
    const bottomSpacerHeight = computed(() => Math.max(0, rows.value.length - virtualWindow.value.end) * LEADERBOARD_ROW_STRIDE);
    const updateVirtualWindow = () => {
      const list = rowsContainer.value;
      if (!list) {
        virtualWindow.value = { start: 0, end: Math.min(32, rows.value.length) };
        return;
      }
      const firstVisible = Math.floor(list.scrollTop / LEADERBOARD_ROW_STRIDE);
      const lastVisible = Math.ceil((list.scrollTop + list.clientHeight) / LEADERBOARD_ROW_STRIDE);
      const start = Math.max(0, firstVisible - LEADERBOARD_OVERSCAN);
      const end = Math.min(rows.value.length, lastVisible + LEADERBOARD_OVERSCAN);
      if (start !== virtualWindow.value.start || end !== virtualWindow.value.end) virtualWindow.value = { start, end };
    };
    const resetListScroll = () => {
      if (rowsContainer.value) rowsContainer.value.scrollTop = 0;
      virtualWindow.value = { start: 0, end: Math.min(32, rows.value.length) };
    };
    const setPlayerFilter = (filter, event) => {
      event?.preventDefault();
      if (filter === "clan" && !canFilterClan.value) return;
      if (filter === "team" && !canFilterTeam.value) return;
      playerFilter.value = playerFilter.value === filter ? "all" : filter;
      resetListScroll();
      event?.currentTarget?.blur();
    };
    const setActiveTab = (tab, event) => {
      event?.preventDefault();
      if (!["players", "rivals", "teams"].includes(tab)) return;
      activeTab.value = tab;
      if (tab !== "players") unlockPlayer();
      resetListScroll();
      event?.currentTarget?.blur();
    };
    const toggleEliminatedVisibility = event => {
      event?.preventDefault();
      showEliminated.value = !showEliminated.value;
      resetListScroll();
      event?.currentTarget?.blur();
      try { window.localStorage.setItem(showEliminatedStorageKey, JSON.stringify(showEliminated.value)); } catch { /* Storage may be unavailable. */ }
    };
    const toggleBotVisibility = event => {
      event?.preventDefault();
      showBots.value = !showBots.value;
      resetListScroll();
      event?.currentTarget?.blur();
      try { window.localStorage.setItem(showBotsStorageKey, JSON.stringify(showBots.value)); } catch { /* Storage may be unavailable. */ }
    };
    const formatted = value => Number.isFinite(Number(value)) ? numberFormat.format(Number(value)) : "—";
    const focusPlayer = (player, event) => {
      window.__fx?.gameLeaderboardAdapter?.focusPlayer?.(player.id);
      event?.currentTarget?.blur();
    };
    const aliveHumanCount = computed(() => dataReady.value ? snapshot.value.aliveHumanCount : null);
    const aliveBotCount = computed(() => dataReady.value ? snapshot.value.aliveBotCount : null);
    const scrollToPlayer = (id, behavior = "smooth") => {
      const container = rowsContainer.value;
      const index = rows.value.findIndex(player => player.id === Number(id));
      if (!container || index < 0) return;
      const top = 6 + index * LEADERBOARD_ROW_STRIDE - (container.clientHeight - LEADERBOARD_ROW_HEIGHT) / 2;
      container.scrollTo({ top: Math.max(0, top), behavior });
      if (behavior !== "smooth") updateVirtualWindow();
    };
    const unlockPlayer = () => { lockedPlayerId.value = null; lockedPlayerRank.value = null; };
    const toggleOwnPlayerLock = event => {
      const ownPlayerId = snapshot.value?.ownPlayerId;
      if (ownPlayerId === undefined) return;
      if (lockedPlayerId.value === ownPlayerId) unlockPlayer();
      else {
        const ownPlayer = snapshot.value.players.find(player => player.id === ownPlayerId) || snapshot.value.ownPlayer;
        lockedPlayerId.value = ownPlayerId;
        lockedPlayerRank.value = ownPlayer?.rank ?? snapshot.value.ownRank ?? null;
        scrollToPlayer(ownPlayerId);
      }
      event?.currentTarget?.blur();
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
      try { window.localStorage.setItem(leaderboardCollapsedStorageKey, JSON.stringify(collapsed.value)); } catch { /* Storage may be unavailable. */ }
      event.currentTarget.blur();
    };
    const setLeaderboardPanel = element => { leaderboardPanel.value = element; };
    const setRowsContainer = element => {
      if (rowsContainer.value === element) return;
      rowsResizeObserver?.disconnect();
      rowsContainer.value = element;
      if (element && typeof ResizeObserver === "function") {
        rowsResizeObserver = new ResizeObserver(updateVirtualWindow);
        rowsResizeObserver.observe(element);
      }
      updateVirtualWindow();
    };
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
        const savedHudSettings = JSON.parse(window.localStorage.getItem(gameHudSettingsStorageKey) || "null");
        if (Number.isFinite(savedHudSettings?.fontScale)) gameHudFontScale.value = clamp(savedHudSettings.fontScale, 75, 150);
        if (Number.isFinite(savedHudSettings?.transparency)) gameHudTransparency.value = clamp(savedHudSettings.transparency, 0, 70);
        const slots = JSON.parse(window.localStorage.getItem(gameHudLayoutSlotsStorageKey) || "[]");
        gameHudLayoutSlots.value = Array.from({ length: 4 }, (_, index) => slots[index] || null);
        const mapSlots = JSON.parse(window.localStorage.getItem(gameMapSettingsSlotsStorageKey) || "[]");
        gameMapSettingsSlots.value = Array.from({ length: 4 }, (_, index) => mapSlots[index] || null);
        gameMapProfileSettings.value = getGameMapProfileSettings();
        collapsed.value = JSON.parse(window.localStorage.getItem(leaderboardCollapsedStorageKey) || "false") === true;
        const savedShowEliminated = JSON.parse(window.localStorage.getItem(showEliminatedStorageKey) || "true");
        showEliminated.value = savedShowEliminated === true;
        const savedShowBots = JSON.parse(window.localStorage.getItem(showBotsStorageKey) || "true");
        showBots.value = savedShowBots === true;
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
        const savedTickHudPosition = JSON.parse(window.localStorage.getItem(tickHudPositionStorageKey) || "null");
        if (Number.isFinite(savedTickHudPosition?.xRatio) && Number.isFinite(savedTickHudPosition?.yRatio)) tickHudPosition.value = savedTickHudPosition;
        else if (Number.isFinite(savedTickHudPosition?.x) && Number.isFinite(savedTickHudPosition?.y)) tickHudPosition.value = savedTickHudPosition;
        const savedStatusCards = JSON.parse(window.localStorage.getItem(statusCardLayoutsStorageKey) || window.localStorage.getItem(legacyStatusCardLayoutsStorageKey) || "{}");
        const savedCollapsedCards = JSON.parse(window.localStorage.getItem(statusCardsCollapsedStorageKey) || "{}");
        if (savedCollapsedCards && typeof savedCollapsedCards === "object") statusCardsCollapsed.value = savedCollapsedCards;
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
      applyGameHudSettings();
      applyGameMapSettings();
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
      window.__fx.gameTickHudAdapter ||= {};
      window.__fx.gameTickHudAdapter.receiveNativeSnapshot = receiveTickHud;
      window.__fx.gameTickHudAdapter.receiveCycleSnapshot = receiveTickCycle;
      window.__fx.gameTeamChartAdapter ||= {};
      window.__fx.gameTeamChartAdapter.receiveNativeSnapshot = receiveTeamChart;
      syncNativeGameData();
      timer = window.setInterval(() => { now.value = Date.now(); detailedTeamPercentage.value = settingsApi.getBoolean("detailedTeamPercentage"); syncNativeGameData(); syncNativeHudFont(); }, 250);
    });
    onBeforeUnmount(() => {
      window.clearInterval(timer);
      document.documentElement.style.removeProperty("--fx-game-team-accent");
      rowsResizeObserver?.disconnect();
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
      stopTickHudMove();
      if (window.__fx?.gameLeaderboardAdapter?.receiveNativeSnapshot === receive) {
        delete window.__fx.gameLeaderboardAdapter.receiveNativeSnapshot;
      }
      if (window.__fx?.gameStatusHudAdapter?.receiveNativeSnapshot === receiveStatus) {
        delete window.__fx.gameStatusHudAdapter.receiveNativeSnapshot;
      }
      if (window.__fx?.gameTickHudAdapter?.receiveNativeSnapshot === receiveTickHud) {
        delete window.__fx.gameTickHudAdapter.receiveNativeSnapshot;
      }
      if (window.__fx?.gameTickHudAdapter?.receiveCycleSnapshot === receiveTickCycle) {
        delete window.__fx.gameTickHudAdapter.receiveCycleSnapshot;
      }
      if (window.__fx) window.__fx.gameTickHudReady = false;
      if (window.__fx?.gameTeamChartAdapter?.receiveNativeSnapshot === receiveTeamChart) {
        delete window.__fx.gameTeamChartAdapter.receiveNativeSnapshot;
      }
      if (window.__fx) window.__fx.gameLeaderboardHudReady = false;
      if (window.__fx) window.__fx.gameStatusHudReady = false;
      if (window.__fx) window.__fx.gameTeamChartReady = false;
    });

    return { snapshot, visible, dataReady, rows, visibleRows, topSpacerHeight, bottomSpacerHeight, updateVirtualWindow, collapsed, showEliminated, toggleEliminatedVisibility, showBots, toggleBotVisibility, activeTab, setActiveTab, ownClanRank, tabLabels, playerFilter, canFilterClan, canFilterTeam, setPlayerFilter, formatted, focusPlayer, toggleCollapsed, rowsContainer, aliveHumanCount, aliveBotCount, toggleOwnPlayerLock, goTop, panelStyle, startPanelMove, startPanelResize, handlePanelHeaderClick, setLeaderboardPanel, setRowsContainer, statusSnapshot, lockedPlayerId, togglePlayerLock, handleManualScroll, statusCardStyle, statusCardsCollapsed, toggleStatusCardCollapsed, startStatusCardMove, leaderboardPanel, teamChartVisible, teamChartStyle, teamChartSegments, detailedTeamPercentage, startTeamChartMove, tickHudSnapshot, tickHudStyle, startTickHudMove, gameHudSettingsOpen, gameHudSettingsTab, gameHudFontScale, gameHudTransparency, gameMapProfileSettings, gameMapSettingsSlots, gameMapSettingsSlot, applyGameMapSettings, saveGameMapSettings, deleteGameMapSettings, loadGameMapSettings, gameHudLayoutSlots, gameHudLayoutSlot, applyGameHudSettings, saveGameHudLayout, deleteGameHudLayout, loadGameHudLayout, gameHudAccentStyle };
  },
  template: `
    <div v-if="visible" class="fx-game-hud-container" :style="gameHudAccentStyle">
      <GameTickCounterWidget
        :snapshot="tickHudSnapshot"
        :position-style="tickHudStyle"
        :show-tick="Boolean(gameMapProfileSettings.displayTickNumber)"
        :font-scale="gameHudFontScale"
        @start-move="startTickHudMove"
      />
      <button class="fx-game-settings-opener" type="button" aria-label="Game HUD settings" title="Game HUD settings" @pointerdown.stop @click.stop="gameHudSettingsOpen = !gameHudSettingsOpen; $event.currentTarget.blur()">⚙</button>
      <nav v-if="!gameHudSettingsOpen && gameHudLayoutSlots.some(slot => slot !== null)" class="fx-game-layout-quick-buttons" aria-label="Load saved Game HUD layout">
        <template v-for="(slot, index) in gameHudLayoutSlots" :key="index"><button v-if="slot" type="button" :aria-label="'Load Game HUD layout ' + (index + 1)" :title="'Load layout L' + (index + 1)" @pointerdown.prevent.stop @click.stop="gameHudLayoutSlot = index; loadGameHudLayout(); $event.currentTarget.blur()">L{{ index + 1 }}</button></template>
      </nav>
      <nav v-if="!gameHudSettingsOpen && gameMapSettingsSlots.some(slot => slot !== null)" class="fx-game-map-quick-buttons" :style="{ top: (56 + (gameHudLayoutSlots.filter(slot => slot !== null).length * 35) + 6) + 'px' }" aria-label="Load saved game map settings">
        <template v-for="(slot, index) in gameMapSettingsSlots" :key="index"><button v-if="slot" type="button" :aria-label="'Load game map settings ' + (index + 1)" :title="'Load map settings M' + (index + 1)" @pointerdown.prevent.stop @click.stop="gameMapSettingsSlot = index; loadGameMapSettings(); $event.currentTarget.blur()">M{{ index + 1 }}</button></template>
      </nav>
      <section v-if="gameHudSettingsOpen" class="fx-hud-settings-panel" @pointerdown.stop>
        <header><strong>HUD Settings</strong><button type="button" aria-label="Close" @click="gameHudSettingsOpen = false; $event.currentTarget.blur()">×</button></header>
        <nav class="fx-game-settings-tabs" aria-label="HUD settings sections"><button type="button" :class="{ 'is-active': gameHudSettingsTab === 'layout' }" @click="gameHudSettingsTab = 'layout'; $event.currentTarget.blur()">LAYOUT</button><button type="button" :class="{ 'is-active': gameHudSettingsTab === 'map' }" @click="gameHudSettingsTab = 'map'; $event.currentTarget.blur()">MAP</button></nav>
        <div v-if="gameHudSettingsTab === 'layout'">
          <label>Font size <output>{{ gameHudFontScale }}%</output><input v-model.number="gameHudFontScale" type="range" min="75" max="150" step="5" @input="applyGameHudSettings"></label>
          <label>Transparency <output>{{ gameHudTransparency }}%</output><input v-model.number="gameHudTransparency" type="range" min="0" max="70" step="1" @input="applyGameHudSettings"></label>
          <label>Layout slot<select v-model.number="gameHudLayoutSlot"><option v-for="(slot, index) in gameHudLayoutSlots" :key="index" :value="index">{{ index + 1 }}{{ slot ? ' · saved' : ' · empty' }}</option></select></label>
          <div class="fx-game-settings-actions"><button type="button" @click="saveGameHudLayout(); $event.currentTarget.blur()">Save</button><button type="button" :disabled="!gameHudLayoutSlots[gameHudLayoutSlot]" @click="loadGameHudLayout(); $event.currentTarget.blur()">Load</button><button type="button" class="is-danger" :disabled="!gameHudLayoutSlots[gameHudLayoutSlot]" @click="deleteGameHudLayout(); $event.currentTarget.blur()">Delete</button></div>
        </div>
        <div v-else>
          <label class="fx-game-settings-check"><span>Show tick number</span><input v-model="gameMapProfileSettings.displayTickNumber" type="checkbox" @change="applyGameMapSettings"></label>
          <label class="fx-game-settings-check"><span>Show player density</span><input v-model="gameMapProfileSettings.showPlayerDensity" type="checkbox" @change="applyGameMapSettings"></label>
          <label class="fx-game-settings-check"><span>Colored density</span><input v-model="gameMapProfileSettings.coloredDensity" type="checkbox" @change="applyGameMapSettings"></label>
          <label>Density display<select v-model="gameMapProfileSettings.densityDisplayStyle" @change="applyGameMapSettings"><option value="absoluteQuotient">Value</option><option value="percentage">Percentage</option></select></label>
          <label class="fx-game-settings-check"><span>Attack estimate</span><input v-model="gameMapProfileSettings.showEstimatedEliminationAttack" type="checkbox" @change="applyGameMapSettings"></label>
          <label>Enemy troop multiplier <output>{{ Number(gameMapProfileSettings.estimatedAttackTroopMultiplier).toFixed(1) }}×</output><input v-model.number="gameMapProfileSettings.estimatedAttackTroopMultiplier" type="range" min="1" max="4" step="0.1" @input="applyGameMapSettings"></label>
          <label>Estimate turns green at <output>{{ gameMapProfileSettings.estimatedAttackGreenThreshold }}%</output><input v-model.number="gameMapProfileSettings.estimatedAttackGreenThreshold" type="range" min="5" max="75" step="1" @input="applyGameMapSettings"></label>
          <label class="fx-game-settings-check"><span>Hover territory details</span><input v-model="gameMapProfileSettings.hoveringTooltip" type="checkbox" @change="applyGameMapSettings"></label>
          <label class="fx-game-settings-check"><span>Highlight own territory</span><input v-model="gameMapProfileSettings.highlightSelfTerritory" type="checkbox" @change="applyGameMapSettings"></label>
          <label>Territory outline <output>{{ gameMapProfileSettings.selfTerritoryOutlineWidth }} px</output><input v-model.number="gameMapProfileSettings.selfTerritoryOutlineWidth" type="range" min="1" max="6" step="0.5" @input="applyGameMapSettings"></label>
          <label>Territory glow <output>{{ gameMapProfileSettings.selfTerritoryGlow }} px</output><input v-model.number="gameMapProfileSettings.selfTerritoryGlow" type="range" min="0" max="12" step="1" @input="applyGameMapSettings"></label>
          <label class="fx-game-settings-check"><span>Highlight clan spawnpoints</span><input v-model="gameMapProfileSettings.highlightClanSpawns" type="checkbox" @change="applyGameMapSettings"></label>
          <label class="fx-game-settings-check"><span>Show country flags</span><input v-model="gameMapProfileSettings.showCountryFlagsOnLand" type="checkbox" @change="applyGameMapSettings"></label>
          <label class="fx-game-settings-check"><span>Hide bot names</span><input v-model="gameMapProfileSettings.hideBotNames" type="checkbox" @change="applyGameMapSettings"></label>
          <label>Map settings slot<select v-model.number="gameMapSettingsSlot"><option v-for="(slot, index) in gameMapSettingsSlots" :key="index" :value="index">{{ index + 1 }}{{ slot ? ' · saved' : ' · empty' }}</option></select></label>
          <div class="fx-game-settings-actions"><button type="button" @click="saveGameMapSettings(); $event.currentTarget.blur()">Save</button><button type="button" :disabled="!gameMapSettingsSlots[gameMapSettingsSlot]" @click="loadGameMapSettings(); $event.currentTarget.blur()">Load</button><button type="button" class="is-danger" :disabled="!gameMapSettingsSlots[gameMapSettingsSlot]" @click="deleteGameMapSettings(); $event.currentTarget.blur()">Delete</button></div>
        </div>
      </section>
      <GameLeaderboardWidget
        :panel-style="panelStyle"
        :collapsed="collapsed"
        :data-ready="dataReady"
        :show-eliminated="showEliminated"
        :show-bots="showBots"
        :active-tab="activeTab"
        :own-clan-rank="ownClanRank"
        :tab-labels="tabLabels"
        :visible-rows="visibleRows"
        :top-spacer-height="topSpacerHeight"
        :bottom-spacer-height="bottomSpacerHeight"
        :player-filter="playerFilter"
        :can-filter-clan="canFilterClan"
        :can-filter-team="canFilterTeam"
        :snapshot="snapshot"
        :rows="rows"
        :formatted="formatted"
        :alive-human-count="aliveHumanCount"
        :alive-bot-count="aliveBotCount"
        :locked-player-id="lockedPlayerId"
        @start-move="startPanelMove"
        @header-click="handlePanelHeaderClick"
        @toggle-collapsed="toggleCollapsed"
        @go-top="goTop"
        @set-active-tab="setActiveTab"
        @toggle-own-player-lock="toggleOwnPlayerLock"
        @toggle-eliminated="toggleEliminatedVisibility"
        @toggle-bots="toggleBotVisibility"
        @rows-scroll="updateVirtualWindow"
        @set-player-filter="setPlayerFilter"
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
        :collapsed-cards="statusCardsCollapsed"
        :status-card-style="statusCardStyle"
        :formatted="formatted"
        @start-move="startStatusCardMove"
        @toggle-collapse="toggleStatusCardCollapsed"
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
      .fx-game-tick-hud{position:fixed;z-index:59;display:flex;align-items:stretch;gap:4px;width:312px;height:60px;pointer-events:none;user-select:none;-webkit-user-select:none}
      .fx-game-tick-counter{display:grid;grid-template-rows:minmax(0,1fr) 20px;align-content:center;gap:0;flex:0 0 76px;min-width:0;box-sizing:border-box;padding:3px 5px;border:1px solid rgba(150,185,225,.17);border-radius:10px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:inset 0 1px rgba(255,255,255,.055),0 4px 12px rgba(0,0,0,.12);color:#fff;font-family:var(--fx-game-native-font-family,Arial,sans-serif);font-variant-numeric:tabular-nums;pointer-events:auto;cursor:move;touch-action:none}
      .fx-game-tick-hud.is-growing .fx-game-tick-counter{border-color:rgba(80,238,125,.66);background:linear-gradient(145deg,color-mix(in srgb,#0bab43 42%,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81))),color-mix(in srgb,#087d37 34%,rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81))));box-shadow:inset 0 1px rgba(190,255,203,.12),0 0 12px rgba(28,220,86,.12),0 4px 12px rgba(0,0,0,.12)}
      .fx-game-tick-hud.is-falling .fx-game-tick-counter{border-color:rgba(255,105,105,.68);background:linear-gradient(145deg,color-mix(in srgb,#c51726 44%,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81))),color-mix(in srgb,#80111b 38%,rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81))));box-shadow:inset 0 1px rgba(255,202,202,.12),0 0 12px rgba(235,44,58,.13),0 4px 12px rgba(0,0,0,.12)}
      .fx-game-tick-cycle{display:grid;place-items:center;min-width:0;line-height:1}.fx-game-tick-cycle strong{font-weight:850}
      .fx-game-tick-totals{display:grid;grid-template-columns:1fr 1fr;min-width:0;overflow:hidden;border-top:1px solid rgba(240,255,240,.2);color:rgba(240,255,240,.78);font-weight:700;line-height:1;text-align:center}.fx-game-tick-total{display:flex;min-width:0;flex-direction:column;align-items:center;justify-content:center;gap:1px;overflow:hidden}.fx-game-tick-total.is-cycles{border-left:1px solid rgba(240,255,240,.2)}.fx-game-tick-total small{color:rgba(240,255,240,.58);font-size:.58em;font-weight:650;line-height:1;white-space:nowrap}.fx-game-tick-total strong{max-width:100%;overflow:hidden;font-size:1em;line-height:1;white-space:nowrap}
      .fx-game-tick-widget{position:relative;display:grid;grid-template-columns:6px minmax(0,1fr) 6px;grid-template-rows:minmax(0,1fr) 5px;gap:0;flex:1 1 0;min-width:0;height:60px;box-sizing:border-box;overflow:hidden;padding:0;border:1px solid rgba(150,185,225,.17);border-radius:10px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:inset 0 1px rgba(255,255,255,.055),0 4px 12px rgba(0,0,0,.12);color:#f7fff6;font:13px/1 var(--fx-game-native-font-family,Arial,sans-serif);font-variant-numeric:tabular-nums;pointer-events:auto;user-select:none;-webkit-user-select:none}
      .fx-game-tick-hud.is-growing .fx-game-tick-widget{border-color:rgba(80,238,125,.66);background:linear-gradient(145deg,color-mix(in srgb,#0bab43 42%,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81))),color-mix(in srgb,#087d37 34%,rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81))));box-shadow:inset 0 1px rgba(190,255,203,.12),0 0 12px rgba(28,220,86,.12),0 4px 12px rgba(0,0,0,.12)}
      .fx-game-tick-hud.is-falling .fx-game-tick-widget{border-color:rgba(255,105,105,.68);background:linear-gradient(145deg,color-mix(in srgb,#c51726 44%,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81))),color-mix(in srgb,#80111b 38%,rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81))));box-shadow:inset 0 1px rgba(255,202,202,.12),0 0 12px rgba(235,44,58,.13),0 4px 12px rgba(0,0,0,.12)}
      .fx-game-tick-widget-head{position:relative;grid-column:2;grid-row:1;display:block;min-width:0;padding:2px 10px;cursor:move;touch-action:none;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.55)}
      .fx-game-tick-number{color:#efffe9;font-size:calc(clamp(12px,1.25vw,18px) * var(--fx-game-hud-font-scale,1));font-weight:800}
      .fx-game-tick-balance{position:absolute;top:56%;left:0;right:0;display:block;min-width:0;overflow:hidden;transform:translateY(-50%);font-size:calc(clamp(22px,2.1vw,32px) * var(--fx-game-hud-font-scale,1));font-weight:800;letter-spacing:.015em;line-height:1;text-align:center;white-space:nowrap}
      .fx-game-tick-income{position:absolute;top:1px;right:5px;color:#e9ffe1;font-size:calc(clamp(11px,1.1vw,16px) * var(--fx-game-hud-font-scale,1));font-weight:750;line-height:1;white-space:nowrap}
      .fx-game-tick-meter{grid-column:2;grid-row:2;position:relative;overflow:hidden;background:rgba(0,0,0,.45)}.fx-game-tick-meter span{display:block;height:100%;background:linear-gradient(90deg,rgba(120,245,126,.28),rgba(162,255,136,.9));box-shadow:0 0 8px rgba(138,255,145,.55);transition:width .2s linear}
      .fx-game-tick-hud.is-falling .fx-game-tick-meter span{background:linear-gradient(90deg,rgba(255,95,95,.3),rgba(255,140,112,.9));box-shadow:0 0 8px rgba(255,100,90,.45)}
      .fx-game-tick-rail{position:relative;grid-row:1/3;display:block;overflow:hidden;background:rgba(0,0,0,.14)}.fx-game-tick-rail i{position:absolute;right:0;bottom:0;left:0;display:block;background:rgba(225,255,214,.9);box-shadow:0 0 6px rgba(210,255,200,.5);transition:height .2s linear}
      .fx-game-leaderboard-hud{position:fixed;z-index:60;top:clamp(12px,2vh,24px);left:calc(var(--fx-sidebar-width, 0px) + 14px);width:min(278px,calc(100vw - var(--fx-sidebar-width, 0px) - 28px));max-height:min(90vh,900px);container-type:inline-size;container-name:fx-game-leaderboard;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;border:1px solid rgba(160,190,225,.24);border-radius:12px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:0 12px 36px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(14px);color:#eef4ff;font:13px/1.35 var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:auto}
      .fx-game-leaderboard-hud{position:fixed;z-index:60;top:clamp(12px,2vh,24px);left:calc(var(--fx-sidebar-width, 0px) + 14px);width:min(278px,calc(100vw - var(--fx-sidebar-width, 0px) - 28px));max-height:min(90vh,900px);container-type:inline-size;container-name:fx-game-leaderboard;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;border:1px solid rgba(160,190,225,.24);border-radius:12px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:0 12px 36px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(14px);color:#eef4ff;font:13px/1.35 var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:auto}
      .fx-game-team-chart{position:fixed;z-index:58;display:flex;flex-direction:column;align-items:center;gap:5px;width:168px;box-sizing:border-box;padding:10px 12px;border:1px solid rgba(150,185,225,.17);border-radius:10px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:inset 0 1px rgba(255,255,255,.055),0 4px 12px rgba(0,0,0,.12);backdrop-filter:blur(14px);color:#eef4ff;font:11px/1.2 var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:none;user-select:none;-webkit-user-select:none}
      .fx-game-team-chart header{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding-bottom:6px;border-bottom:1px solid rgba(150,185,225,.14);color:#9fb2cb;font-size:10px;font-weight:750;letter-spacing:.08em;pointer-events:auto;touch-action:none;cursor:grab}.fx-game-team-chart header:active{cursor:grabbing}
      .fx-game-team-chart header span{display:grid;place-items:center;width:18px;height:18px;border-radius:5px;background:rgba(130,180,240,.13);color:#a8d0ff;font-size:13px}
      .fx-game-team-chart-pie{display:block;width:148px;height:148px;overflow:visible}
      .fx-game-team-chart-pie text{fill:#fff;font:700 7px/1 var(--fx-game-native-font-family,Arial,sans-serif);paint-order:stroke;stroke:rgba(0,0,0,.42);stroke-width:.75px;stroke-linejoin:round}
      .fx-game-leaderboard-head{display:flex;align-items:center;gap:8px;min-width:0;padding:11px 12px;border-bottom:1px solid rgba(160,190,225,.15);cursor:grab;touch-action:none;user-select:none}
      .fx-game-leaderboard-icon{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;box-sizing:border-box;border-radius:9px;background:rgba(99,160,255,.14);color:#9bc4ff;font-size:18px;line-height:1}
      .fx-game-leaderboard-title{display:grid;gap:1px;flex:1 1 auto;min-width:0;overflow:hidden}.fx-game-leaderboard-title small{overflow:hidden;color:#8da2bd;font-size:9px;font-weight:700;letter-spacing:.13em;text-overflow:ellipsis;white-space:nowrap}.fx-game-leaderboard-title strong{overflow:hidden;font-size:14px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
      .fx-game-leaderboard-count{padding:3px 7px;border:1px solid rgba(160,190,225,.17);border-radius:99px;color:#b7c7dc;font-size:10px}
      .fx-game-leaderboard-counts{display:flex;flex:0 0 auto;gap:5px}.fx-game-placement-badge{display:flex;align-items:center;gap:4px;padding:5px 7px;border:1px solid rgba(160,190,225,.2);border-radius:99px;background:rgba(255,255,255,.035);color:#dce8f7;font-size:12px;font-weight:750;line-height:1.2;font-variant-numeric:tabular-nums;white-space:nowrap}.fx-game-placement-badge strong{color:#aebdd0;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.fx-game-placement-badge em{color:inherit;font-style:normal}.fx-game-placement-badge.is-clan-rank{border-color:rgba(190,200,214,.24);color:#d2d9e3}.fx-game-leaderboard-count{display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid rgba(160,190,225,.2);border-radius:99px;color:#dce8f7;font-size:14px;font-weight:750;line-height:1.2;white-space:nowrap}.fx-game-leaderboard-count span{font-size:16px}
      .fx-game-leaderboard-tabs{display:flex;gap:2px;margin:0;padding:0 22px 0 12px;border-top:1px solid rgba(160,190,225,.16)}.fx-game-leaderboard-tabs button{position:relative;flex:1;margin-top:-1px;padding:8px 8px 7px;border:1px solid transparent;border-top-color:transparent;border-radius:0 0 7px 7px;background:transparent;color:#93a5bc;font:11px/1.2 var(--fx-game-native-font-family,Arial,sans-serif);font-weight:750;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:color .15s ease,background .15s ease,border-color .15s ease}.fx-game-leaderboard-tabs button:hover:not(.is-active){background:rgba(255,255,255,.035);color:#d4deeb}.fx-game-leaderboard-tabs button.is-active{border-color:rgba(112,240,208,.28);border-top-color:#63e6d2;background:linear-gradient(0deg,rgba(55,205,180,.12),rgba(55,205,180,.045));color:#b8f2e8;box-shadow:inset 0 -1px rgba(255,255,255,.04)}.fx-game-leaderboard-tools{display:flex;gap:5px;padding:6px 7px 2px}.fx-game-leaderboard-tools button{flex:1;padding:4px 6px;border:1px solid rgba(160,190,225,.16);border-radius:6px;background:rgba(255,255,255,.045);color:#b9c9dc;font:10px/1.3 system-ui,sans-serif;cursor:pointer}.fx-game-leaderboard-tools button:hover{background:rgba(99,160,255,.14);color:#eef4ff}.fx-game-leaderboard-tools button.is-active{border-color:rgba(255,227,110,.44);background:rgba(255,210,82,.13);color:#ffe88d}.fx-game-leaderboard-tools button.fx-game-bots-toggle,.fx-game-leaderboard-tools button.fx-game-eliminated-toggle{position:relative;flex:0 0 34px;height:26px;padding:2px!important;border-color:rgba(160,190,225,.12);background:rgba(255,255,255,.025);color:#b9c9dc;font-size:14px!important;line-height:1;opacity:.8}.fx-game-leaderboard-tools button.fx-game-bots-toggle:hover,.fx-game-leaderboard-tools button.fx-game-eliminated-toggle:hover{background:rgba(99,160,255,.08);color:#dce8f7;opacity:1}.fx-game-leaderboard-tools button.fx-game-bots-toggle.is-active,.fx-game-leaderboard-tools button.fx-game-eliminated-toggle.is-active{border-color:rgba(160,190,225,.2);background:rgba(99,160,255,.08);color:#dce8f7}.fx-game-bots-toggle i,.fx-game-eliminated-toggle i{position:absolute;right:-3px;bottom:-3px;display:grid;place-items:center;width:11px;height:11px;border:1px solid rgba(10,17,28,.9);border-radius:50%;background:#73849a;color:#fff;font:800 8px/1 Arial,sans-serif;font-style:normal}.fx-game-bots-toggle.is-active i,.fx-game-eliminated-toggle.is-active i{background:#76c7a0;color:#10251d}
      .fx-game-leaderboard-filters{display:flex;gap:4px;padding:3px 7px 2px}.fx-game-leaderboard-filters button{flex:1;padding:3px 5px;border:1px solid rgba(160,190,225,.15);border-radius:5px;background:rgba(255,255,255,.035);color:#aebdd0;font:9px/1.25 var(--fx-game-native-font-family,Arial,sans-serif);cursor:pointer}.fx-game-leaderboard-filters button.is-active{border-color:rgba(112,240,208,.45);background:rgba(55,205,180,.14);color:#a7f2e3}.fx-game-leaderboard-filters button:disabled{opacity:.4;cursor:default}
      .fx-game-leaderboard-rows{display:block;flex:1 1 auto;min-height:0;padding:6px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(155,190,235,.55) rgba(255,255,255,.06)}.fx-game-leaderboard-spacer{width:1px;pointer-events:none}
      .fx-game-leaderboard-row-wrap.is-aggregate{grid-template-columns:minmax(0,1fr)}.fx-game-leaderboard-aggregate-row{display:grid;grid-template-columns:23px 4px minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;height:29px;box-sizing:border-box;padding:0 7px;color:#d7e1ef}.fx-game-leaderboard-aggregate-name{display:flex;flex-direction:column;justify-content:center;min-width:0;overflow:hidden;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.fx-game-leaderboard-aggregate-name small{margin-top:1px;color:#91a3ba;font-size:9px;font-weight:500}.fx-game-leaderboard-rows::-webkit-scrollbar{width:8px}.fx-game-leaderboard-rows::-webkit-scrollbar-track{background:rgba(255,255,255,.05);border-radius:8px}.fx-game-leaderboard-rows::-webkit-scrollbar-thumb{background:rgba(155,190,235,.45);border:2px solid rgba(9,15,26,.75);border-radius:8px}
      .fx-game-leaderboard-loading{padding:16px 12px;color:#aebdd0;text-align:center;font-size:11px}.fx-game-leaderboard-empty{padding:18px 10px;color:#91a3ba;text-align:center;font-size:11px}
      .fx-game-leaderboard-row{display:grid;grid-template-columns:23px 4px minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;min-height:29px;padding:0 7px;border:1px solid color-mix(in srgb,var(--fx-game-player-color,rgba(158,194,229,.2)) 24%,transparent);border-left:4px solid var(--fx-game-player-color,rgba(158,194,229,.22));border-radius:7px;background:linear-gradient(110deg,color-mix(in srgb,var(--fx-game-player-color,#193047) 18%,rgba(15,32,49,var(--fx-game-hud-panel-alpha,.81))),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)) 80%);color:#d7e1ef;font:inherit;text-align:left;cursor:pointer;transition:background .16s ease,border-color .16s ease}
      .fx-game-leaderboard-row:hover{background:linear-gradient(110deg,color-mix(in srgb,var(--fx-game-player-color,#224556) 27%,rgba(22,46,63,var(--fx-game-hud-panel-alpha,.81))),rgba(11,27,38,var(--fx-game-hud-panel-alpha,.81)) 80%)}
      .fx-game-leaderboard-row.is-own{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--fx-game-player-color,#70f49c) 42%,transparent);color:#fff}
      .fx-game-leaderboard-row.is-eliminated{opacity:.62}.fx-game-leaderboard-row.is-eliminated .fx-game-leaderboard-name{text-decoration:line-through;text-decoration-color:#ff8b8b;text-decoration-thickness:1.5px;color:#9ba8b9}
      .fx-game-leaderboard-rank{color:#8fa2ba;font-size:11px;font-variant-numeric:tabular-nums;text-align:right}.fx-game-leaderboard-player-color{width:4px;height:17px;border-radius:4px;background:#7893b8}
      .fx-game-leaderboard-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}.fx-game-leaderboard-type{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-right:5px;font-size:12px;line-height:1;vertical-align:-2px}.fx-game-leaderboard-type svg{display:block;width:13px;height:13px;fill:currentColor}.fx-game-leaderboard-type.is-human{color:#cbd5e1}.fx-game-leaderboard-type.is-bot{color:#ffd17a}.fx-game-leaderboard-territory{color:#e0e9f5;font-size:13px;font-weight:750;font-variant-numeric:tabular-nums}
      .fx-game-leaderboard-foot{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-top:1px solid rgba(160,190,225,.15);color:#9badc4;font-size:11px}.fx-game-leaderboard-go-top{padding:4px 8px;border:1px solid rgba(160,190,225,.16);border-radius:6px;background:rgba(255,255,255,.045);color:#b9c9dc;font:11px/1.2 var(--fx-game-native-font-family,Arial,sans-serif);cursor:pointer}.fx-game-leaderboard-go-top:hover:not(:disabled){background:rgba(99,160,255,.12);color:#eef4ff}.fx-game-leaderboard-go-top:disabled{opacity:.4;cursor:default}.fx-game-own-rank-lock{display:flex;align-items:center;justify-content:center;gap:5px}.fx-game-own-rank-lock strong{font:700 11px/1 var(--fx-game-native-font-family,Arial,sans-serif);font-variant-numeric:tabular-nums}.fx-game-own-rank-lock i{font-style:normal}.fx-game-own-rank-lock .fx-game-own-color,.fx-game-placement-badge .fx-game-own-color{display:inline-block;width:10px;height:10px;flex:0 0 10px;box-sizing:border-box;border:1px solid rgba(255,255,255,.75);border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.55)}.fx-game-placement-badge .fx-game-own-color{width:9px;height:9px;flex-basis:9px}
      .fx-game-leaderboard-resize{position:absolute;right:3px;bottom:3px;width:12px;height:12px;padding:0;border:0;border-radius:0 0 7px 0;background:linear-gradient(135deg,transparent 0 58%,rgba(174,199,231,.3) 59% 65%,transparent 66% 75%,rgba(174,199,231,.42) 76% 82%,transparent 83%);cursor:nwse-resize;touch-action:none;z-index:2;opacity:.35;transition:opacity .15s ease}.fx-game-leaderboard-resize:hover{opacity:.9}
      .fx-game-leaderboard-row-wrap{display:grid;grid-template-columns:minmax(0,1fr) 30px;align-items:stretch;gap:2px;border:1px solid color-mix(in srgb,var(--fx-game-player-color,rgba(158,194,229,.2)) 24%,transparent);border-left:4px solid var(--fx-game-player-color,rgba(158,194,229,.22));border-radius:7px;background:linear-gradient(110deg,color-mix(in srgb,var(--fx-game-player-color,#193047) 18%,rgba(15,32,49,var(--fx-game-hud-panel-alpha,.81))),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)) 80%);transition:background .16s ease,border-color .16s ease}
      .fx-game-leaderboard-row-wrap{height:31px;box-sizing:border-box;margin-bottom:2px}
      .fx-game-leaderboard-row-wrap:hover{background:linear-gradient(110deg,color-mix(in srgb,var(--fx-game-player-color,#224556) 27%,rgba(22,46,63,var(--fx-game-hud-panel-alpha,.81))),rgba(11,27,38,var(--fx-game-hud-panel-alpha,.81)) 80%)}
      .fx-game-leaderboard-row-wrap.is-own{position:relative;z-index:1;border-color:#ffe36e;box-shadow:inset 0 0 0 1px rgba(255,227,110,.8),0 0 12px rgba(255,208,72,.32)}.fx-game-leaderboard-row-wrap.is-own .fx-game-leaderboard-row{background:linear-gradient(90deg,rgba(255,210,82,.24),rgba(255,210,82,.08) 64%,transparent)!important}.fx-game-leaderboard-row-wrap.is-clanmate{outline:1px dashed rgba(205,215,228,.42);outline-offset:-2px;background:transparent}.fx-game-leaderboard-row-wrap.is-clanmate .fx-game-leaderboard-row{background:transparent!important}.fx-game-leaderboard-player-badge{display:inline-flex;align-items:center;vertical-align:1px;margin-right:5px;padding:1px 4px;border-radius:4px;font-size:8px;font-weight:900;letter-spacing:.04em;line-height:1.35}.fx-game-leaderboard-player-badge.is-you{background:#ffe36e;color:#18202a}.fx-game-leaderboard-player-badge.is-clan{background:rgba(190,200,214,.12);color:#d2d9e3;border:1px solid rgba(190,200,214,.24)}
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
      @container fx-game-leaderboard (max-width:420px){.fx-game-leaderboard-head{gap:6px;padding:9px}.fx-game-leaderboard-title small{display:none}.fx-game-leaderboard-title strong{font-size:13px}.fx-game-leaderboard-counts{gap:3px;flex-wrap:wrap;min-width:0;justify-content:flex-end}.fx-game-leaderboard-count{gap:3px;padding:4px 5px;font-size:11px}.fx-game-placement-badge{gap:3px;padding:4px 5px;font-size:11px}.fx-game-placement-badge strong{font-size:9px}.fx-game-leaderboard-count span{font-size:13px}}
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
      .fx-game-status-card{gap:calc(8px * var(--fx-game-hud-font-scale,1));padding:calc(10px * var(--fx-game-hud-font-scale,1)) calc(12px * var(--fx-game-hud-font-scale,1))!important}
      .fx-game-status-item.is-map-control{padding:calc(10px * var(--fx-game-hud-font-scale,1)) calc(12px * var(--fx-game-hud-font-scale,1))!important}
      .fx-game-status-map-pair,.fx-game-status-density-values{gap:calc(5px * var(--fx-game-hud-font-scale,1))}
      .fx-game-status-card.is-density .fx-game-status-card-head,.fx-game-status-card.is-map-control .fx-game-status-card-head{box-sizing:border-box;grid-area:head!important;gap:calc(8px * var(--fx-game-hud-font-scale,1));padding-bottom:calc(6px * var(--fx-game-hud-font-scale,1));border-bottom:1px solid rgba(150,185,225,.14);cursor:grab}
      .fx-game-status-card.is-density .fx-game-status-card-head:active,.fx-game-status-card.is-map-control .fx-game-status-card-head:active{cursor:grabbing}
      .fx-game-status-collapse-mark{display:grid;place-items:center;flex:0 0 auto;width:calc(18px * var(--fx-game-hud-font-scale,1));height:calc(18px * var(--fx-game-hud-font-scale,1));margin-left:auto;border:1px solid rgba(160,190,225,.16);border-radius:5px;background:rgba(255,255,255,.04);color:#9fb2cb;font-size:calc(12px * var(--fx-game-hud-font-scale,1));line-height:1}
      .fx-game-status-card.is-collapsed{grid-template-areas:"head" "value"!important;align-content:center;gap:calc(6px * var(--fx-game-hud-font-scale,1));min-height:0!important;padding:calc(8px * var(--fx-game-hud-font-scale,1))!important}
      .fx-game-status-card.is-collapsed.is-density{grid-template-areas:"head" "value"!important}
      .fx-game-status-card.is-collapsed .fx-game-status-value{grid-area:value!important;overflow:visible;text-overflow:clip}
      .fx-game-status-card.is-collapsed .fx-game-status-map-pair{grid-template-areas:"head";gap:0}
      .fx-game-status-card.is-collapsed .fx-game-status-map-main{grid-template-areas:"head" "value";gap:calc(4px * var(--fx-game-hud-font-scale,1))}
      .fx-game-status-card.is-collapsed .fx-game-status-map-main .fx-game-status-value{grid-area:value!important}
      .fx-game-status-card.is-density,.fx-game-status-card.is-map-control{align-content:start!important}
      .fx-game-status-card.is-collapsed{align-content:start!important;grid-template-rows:auto 1fr}
      .fx-game-status-card.is-collapsed.is-density>.fx-game-status-value,.fx-game-status-card.is-collapsed.is-map-control .fx-game-status-map-main>.fx-game-status-value{display:flex;align-items:center;justify-content:center;align-self:stretch;width:100%;min-width:0;box-sizing:border-box;font-size:calc(28px * var(--fx-game-hud-font-scale,1))!important;line-height:1.05;text-align:center}
      .fx-game-settings-opener{position:fixed;right:14px;top:14px;z-index:80;width:34px;height:34px;border:1px solid rgba(160,190,225,.24);border-radius:9px;background:rgba(14,22,34,.88);color:#dce8f7;font:18px/1 Arial,sans-serif;cursor:pointer;pointer-events:auto;backdrop-filter:blur(10px)}
      .fx-game-layout-quick-buttons,.fx-game-map-quick-buttons{position:fixed;right:14px;top:56px;z-index:80;display:flex;flex-direction:column;gap:5px;pointer-events:auto}
      .fx-game-layout-quick-buttons button,.fx-game-map-quick-buttons button{display:grid;place-items:center;width:34px;height:30px;border:1px solid rgba(160,190,225,.18);border-radius:8px;background:rgba(14,22,34,.84);color:#b9c9dc;font:700 10px/1 var(--fx-game-native-font-family,Arial,sans-serif);cursor:pointer;backdrop-filter:blur(8px);transition:background .15s ease,border-color .15s ease,color .15s ease}
      .fx-game-layout-quick-buttons button:hover,.fx-game-map-quick-buttons button:hover{border-color:color-mix(in srgb,var(--fx-game-team-accent,#63e6d2) 55%,transparent);background:rgba(27,57,58,.94);color:#d9fff1}
      .fx-hud-settings-panel{position:fixed;right:14px;top:56px;z-index:80;width:min(260px,calc(100vw - 28px));max-height:calc(100vh - 70px);overflow-y:auto;scrollbar-width:thin;box-sizing:border-box;padding:12px;border:1px solid rgba(160,190,225,.24);border-radius:12px;background:linear-gradient(145deg,rgba(20,30,45,.96),rgba(9,15,26,.96));box-shadow:0 12px 36px rgba(0,0,0,.4);color:#eef4ff;font:12px/1.4 var(--fx-game-native-font-family,Arial,sans-serif);backdrop-filter:blur(14px);pointer-events:auto}
      .fx-hud-settings-panel header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.fx-hud-settings-panel header button{border:0;background:transparent;color:#b9c9dc;font-size:19px;cursor:pointer}
      .fx-game-settings-tabs{display:flex;gap:4px;margin:0 -2px 12px;padding-bottom:6px;border-bottom:1px solid rgba(160,190,225,.16)}.fx-game-settings-tabs button{flex:1;padding:7px 8px;border:0;border-bottom:2px solid transparent;background:transparent;color:#91a2b8;font:inherit;font-size:10px;font-weight:700;letter-spacing:.1em;cursor:pointer}.fx-game-settings-tabs button.is-active{border-bottom-color:var(--fx-game-team-accent,#68cdb0);color:#eaf3ff}.fx-hud-settings-panel .fx-game-settings-check{display:flex;align-items:center;justify-content:space-between;gap:10px}.fx-hud-settings-panel input[type=checkbox]{accent-color:var(--fx-game-team-accent,#68cdb0)}
      .fx-hud-settings-panel label{display:grid;grid-template-columns:1fr auto;gap:5px;margin:9px 0;color:#c5d3e5}.fx-hud-settings-panel output{color:#8fdeb9;font-variant-numeric:tabular-nums}.fx-hud-settings-panel input[type=range]{grid-column:1/-1;width:100%;accent-color:#67d9b2}.fx-hud-settings-panel select{grid-column:1/-1;padding:5px;border:1px solid rgba(160,190,225,.2);border-radius:6px;background:#101b2a;color:#eef4ff;font:inherit}
      .fx-game-settings-actions{display:flex;gap:7px;margin-top:10px}.fx-game-settings-actions button{flex:1;padding:7px;border:1px solid rgba(160,190,225,.2);border-radius:7px;background:rgba(99,160,255,.12);color:#e7f0ff;font:inherit;cursor:pointer}.fx-game-settings-actions button.is-danger{border-color:rgba(235,130,130,.24);background:rgba(160,60,65,.12);color:#ffc6c6}.fx-game-settings-actions button:disabled{opacity:.4;cursor:default}
      .fx-game-leaderboard-hud{border-color:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 32%,rgba(160,190,225,.24))}
      .fx-game-leaderboard-icon,.fx-game-status-card-head .fx-game-status-icon,.fx-game-team-chart header span{background:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 20%,rgba(130,180,240,.13));color:var(--fx-game-team-accent,#a8d0ff)}
      .fx-game-leaderboard-tabs button.is-active{border-color:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 36%,transparent);border-top-color:var(--fx-game-team-accent,#63e6d2);background:linear-gradient(0deg,color-mix(in srgb,var(--fx-game-team-accent,#63e6d2) 15%,transparent),color-mix(in srgb,var(--fx-game-team-accent,#63e6d2) 5%,transparent));color:color-mix(in srgb,var(--fx-game-team-accent,#b8f2e8) 48%,white)}
      .fx-game-status-card:not(.is-density){border-color:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 34%,rgba(150,185,225,.17))}
      .fx-game-status-card.is-density{border-color:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 36%,var(--fx-game-density-color,#78a9ff))}
      .fx-game-team-chart{border-color:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 32%,rgba(160,190,225,.24))}
      .fx-game-keybind-hud{outline:1px solid color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 40%,transparent);outline-offset:1px}
      .fx-game-keybind-hud button{border-right-color:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 48%,rgba(110,180,220,.3))}
      .fx-game-debug-hud{border-color:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 34%,rgba(155,190,225,.3))}
    `.replace(/font-size:\s*([^;}]+)/g, (_match, declaration) => `font-size:${declaration.replace(/(\d+(?:\.\d+)?)px/g, "calc($1px * var(--fx-game-hud-font-scale,1))")}`)
      .replace(/(font:\s*(?:\d+\s+)?)(\d+(?:\.\d+)?)px(?=\/)/g, "$1calc($2px * var(--fx-game-hud-font-scale,1))");
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
