import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref, watch } from "vue/dist/vue.esm-bundler.js";
import { loadGameHudVisibility } from "../../../modules/gameHudVisibility.js";

const STORAGE_KEY = "zfx.gameMinimap.position.v1";
const COLLAPSED_STORAGE_KEY = "zfx.gameMinimap.collapsed.v1";

const GameMinimapWidget = defineComponent({
  name: "FxGameMinimapWidget",
  setup() {
    const canvas = ref(null);
    const frameCanvas = ref(null);
    const snapshot = ref(null);
    const mapViewport = ref(null);
    const gameReady = ref(false);
    const hudVisibility = ref(loadGameHudVisibility());
    const collapsed = ref(false);
    const visible = computed(() => gameReady.value && hudVisibility.value.minimap);
    const dataError = ref("");
    const mapPanning = ref(false);
    const sidebarOffset = () => {
      const width = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fx-sidebar-width")) || 0;
      return Math.max(18, width + 14);
    };
    const position = ref({ left: sidebarOffset(), bottom: 18 });
    let pollTimer = 0;
    let viewportTimer = 0;
    let drag = null;
    let suppressHeaderClick = false;
    let clearHeaderClickTimer = 0;
    let mapPanPointerId = null;
    let lastMapPanAt = 0;

    const loadPosition = () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
        if (Number.isFinite(saved?.left) && Number.isFinite(saved?.bottom)) position.value = { ...saved, left: Math.max(saved.left, sidebarOffset()) };
      } catch { /* Ignore invalid saved coordinates. */ }
    };
    const loadCollapsed = () => {
      try { collapsed.value = JSON.parse(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) || "false") === true; } catch { collapsed.value = false; }
    };
    const toggleCollapsed = event => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      collapsed.value = !collapsed.value;
      try { window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed.value)); } catch { /* Storage may be unavailable. */ }
      event?.currentTarget?.blur?.();
    };
    const syncLayoutSettings = () => {
      loadPosition();
      loadCollapsed();
      hudVisibility.value = loadGameHudVisibility();
      refresh();
    };
    const syncVisibility = event => {
      if (event.detail && typeof event.detail === "object") hudVisibility.value = { ...hudVisibility.value, ...event.detail };
      refresh();
    };
    const draw = () => {
      const map = snapshot.value;
      const target = canvas.value;
      if (!map || !target) return;
      const ctx = target.getContext("2d", { alpha: false });
      if (!ctx) return;
      target.width = map.width;
      target.height = map.height;
      ctx.fillStyle = "#172333";
      ctx.fillRect(0, 0, map.width, map.height);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          ctx.fillStyle = map.pixels[y * map.width + x] || "#172333";
          ctx.fillRect(x, y, 1, 1);
        }
      }
    };
    const drawViewportFrame = () => {
      const map = snapshot.value;
      const target = frameCanvas.value;
      const viewport = mapViewport.value;
      if (!map || !target) return;
      if (target.width !== map.width || target.height !== map.height) {
        target.width = map.width;
        target.height = map.height;
      }
      const ctx = target.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, map.width, map.height);
      if (!viewport || !viewport.mapWidth || !viewport.mapHeight) return;
      const x = viewport.left / viewport.mapWidth * map.width;
      const y = viewport.top / viewport.mapHeight * map.height;
      const width = viewport.width / viewport.mapWidth * map.width;
      const height = viewport.height / viewport.mapHeight * map.height;
      if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, map.width, map.height);
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,.09)";
      ctx.fillRect(x, y, width, height);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = "rgba(4,10,18,.9)";
      ctx.strokeRect(x, y, width, height);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = "rgba(255,255,255,.98)";
      ctx.strokeRect(x, y, width, height);
      ctx.restore();
    };
    const refresh = () => {
      const adapter = window.__fx?.gameMinimapAdapter;
      gameReady.value = window.__fx?.gameLeaderboardHudReady === true;
      if (!visible.value) {
        snapshot.value = null;
        mapViewport.value = null;
        return;
      }
      if (!adapter?.getSnapshot) {
        snapshot.value = null;
        dataError.value = "Map adapter unavailable";
        return;
      }
      try {
        snapshot.value = adapter.getSnapshot(96, 72);
        mapViewport.value = adapter.getViewport?.() || null;
        dataError.value = "";
      } catch (error) {
        snapshot.value = null;
        mapViewport.value = null;
        dataError.value = "Map data unavailable";
        console.warn("[ZFX Client] Minimap data could not be read:", error);
      }
    };
    const refreshViewport = () => {
      if (!visible.value) return;
      try { mapViewport.value = window.__fx?.gameMinimapAdapter?.getViewport?.() || null; }
      catch { mapViewport.value = null; }
    };
    const focusFromPointer = event => {
      const rect = canvas.value?.getBoundingClientRect();
      if (!rect || !snapshot.value) return;
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      window.__fx?.gameMinimapAdapter?.focus?.(x, y, 0.14);
      lastMapPanAt = performance.now();
    };
    const startMapPan = event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.stopPropagation();
      mapPanPointerId = event.pointerId;
      mapPanning.value = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      focusFromPointer(event);
    };
    const continueMapPan = event => {
      if (mapPanPointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      if (now - lastMapPanAt < 45) return;
      focusFromPointer(event);
    };
    const endMapPan = event => {
      if (mapPanPointerId !== event.pointerId) return;
      mapPanPointerId = null;
      mapPanning.value = false;
    };
    const zoomMainMap = event => {
      event.preventDefault();
      event.stopPropagation();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
      window.__fx?.gameMinimapAdapter?.zoom?.(event.deltaY * unit);
    };
    const startMove = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { x: event.clientX, y: event.clientY, left: position.value.left, bottom: position.value.bottom, moved: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const move = event => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      position.value = {
        left: Math.max(0, Math.min(window.innerWidth - 170, drag.left + dx)),
        bottom: Math.max(0, Math.min(window.innerHeight - 130, drag.bottom - dy)),
      };
    };
    const endMove = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position.value)); } catch { /* Storage may be unavailable. */ }
      if (moved) {
        suppressHeaderClick = true;
        window.clearTimeout(clearHeaderClickTimer);
        clearHeaderClickTimer = window.setTimeout(() => { suppressHeaderClick = false; }, 0);
      }
    };
    const onHeaderClick = event => {
      if (suppressHeaderClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressHeaderClick = false;
        return;
      }
      toggleCollapsed(event);
    };
    const style = () => ({ left: `${position.value.left}px`, bottom: `${position.value.bottom}px` });
    watch(snapshot, draw, { flush: "post" });
    watch([snapshot, mapViewport], drawViewportFrame, { flush: "post" });

    onMounted(() => {
      loadPosition();
      loadCollapsed();
      window.__fx ||= {};
      window.__fx.gameMinimapHud = { reloadPosition: loadPosition };
      window.addEventListener("fx-game-hud-layout-loaded", syncLayoutSettings);
      window.addEventListener("fx-game-hud-visibility-changed", syncVisibility);
      refresh();
      pollTimer = window.setInterval(refresh, 1100);
      viewportTimer = window.setInterval(refreshViewport, 60);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", endMove);
    });
    onBeforeUnmount(() => {
      window.clearInterval(pollTimer);
      window.clearInterval(viewportTimer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", endMove);
      window.removeEventListener("fx-game-hud-layout-loaded", syncLayoutSettings);
      window.removeEventListener("fx-game-hud-visibility-changed", syncVisibility);
      window.clearTimeout(clearHeaderClickTimer);
      if (window.__fx?.gameMinimapHud?.reloadPosition === loadPosition) delete window.__fx.gameMinimapHud;
    });
    return { canvas, frameCanvas, snapshot, visible, collapsed, dataError, mapPanning, style, startMove, startMapPan, continueMapPan, endMapPan, zoomMainMap, onHeaderClick };
  },
  template: `
    <aside v-if="visible" class="fx-game-minimap" :class="{ 'is-collapsed': collapsed }" :style="style()" aria-label="Game minimap">
      <header :aria-expanded="!collapsed" :title="collapsed ? 'Zum Ausklappen klicken oder zum Verschieben ziehen' : 'Zum Einklappen klicken oder zum Verschieben ziehen'" @pointerdown="startMove" @click="onHeaderClick"><span class="fx-game-minimap-icon" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5z"/><path d="M5.5 2v10.5M10.5 3.5V14"/></svg></span><strong>MAP</strong><small v-if="!collapsed">CLICK TO MOVE</small></header>
      <div v-if="!collapsed && snapshot" class="fx-game-minimap-view" :class="{ 'is-panning': mapPanning }" aria-label="Minimap with current game map view">
        <canvas ref="canvas" class="fx-game-minimap-map" @pointerdown="startMapPan" @pointermove="continueMapPan" @pointerup="endMapPan" @pointercancel="endMapPan" @lostpointercapture="endMapPan" @wheel="zoomMainMap" aria-label="Hold and drag to move across the game map; use the wheel to zoom the game map"></canvas>
        <canvas ref="frameCanvas" class="fx-game-minimap-frame" aria-hidden="true"></canvas>
      </div>
      <div v-else-if="!collapsed" class="fx-game-minimap-placeholder">{{ dataError || 'Loading mapâ€¦' }}</div>
    </aside>
  `,
});

export function createVueGameMinimapWidget() {
  if (document.getElementById("fx-game-minimap-root")) return () => {};
  if (!document.getElementById("fx-game-minimap-style")) {
    const style = document.createElement("style");
    style.id = "fx-game-minimap-style";
    style.textContent = `
      .fx-game-minimap{position:fixed;z-index:200;box-sizing:border-box;width:176px;padding:10px 12px;border:1px solid rgba(150,185,225,.17);border-radius:10px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:inset 0 1px rgba(255,255,255,.055),0 4px 12px rgba(0,0,0,.12);backdrop-filter:blur(14px);color:#edf4ff;font:11px/1.25 var(--fx-game-native-font-family,Arial,sans-serif);user-select:none;contain:layout paint}
      .fx-game-minimap.is-collapsed{padding:8px 10px}
      .fx-game-minimap header{display:flex;align-items:center;gap:8px;box-sizing:border-box;padding:0 0 6px;margin-bottom:6px;border-bottom:1px solid rgba(150,185,225,.14);color:#9fb2cb;cursor:grab;touch-action:none;letter-spacing:.08em}.fx-game-minimap header:active{cursor:grabbing}.fx-game-minimap.is-collapsed header{padding-bottom:0;margin-bottom:0;border-bottom:0}.fx-game-minimap header .fx-game-minimap-icon{display:grid;place-items:center;flex:0 0 18px;width:18px;height:18px;border-radius:5px;background:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 20%,rgba(130,180,240,.13));color:var(--fx-game-team-accent,#a8d0ff);line-height:1}.fx-game-minimap header .fx-game-minimap-icon svg{display:block;width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.fx-game-minimap header strong{font-size:10px;font-weight:750;letter-spacing:.08em}.fx-game-minimap header small{margin-left:auto;color:#99abc0;font-size:9px;letter-spacing:.04em;white-space:nowrap}
      .fx-game-minimap-view{position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:5px}.fx-game-minimap-view canvas{position:absolute;inset:0;display:block;width:100%;height:100%;border-radius:5px;touch-action:none}.fx-game-minimap-map{cursor:grab;image-rendering:pixelated}.fx-game-minimap-view.is-panning .fx-game-minimap-map{cursor:grabbing}.fx-game-minimap-frame{pointer-events:none}
      .fx-game-minimap-placeholder{display:grid;place-items:center;min-height:72px;border-radius:5px;background:rgba(20,31,46,.8);color:#a9b8ca;font-size:10px}
    `.replace(/font-size:\s*([^;}]+)/g, (_match, declaration) => `font-size:${declaration.replace(/(\d+(?:\.\d+)?)px/g, "calc($1px * var(--fx-game-hud-font-scale,1))")}`)
      .replace(/(font:\s*(?:\d+\s+)?)(\d+(?:\.\d+)?)px(?=\/)/g, "$1calc($2px * var(--fx-game-hud-font-scale,1))");
    document.head.appendChild(style);
  }
  const host = document.createElement("div");
  host.id = "fx-game-minimap-root";
  document.body.appendChild(host);
  const app = createApp(GameMinimapWidget);
  app.config.errorHandler = (error, _instance, info) => console.error("[ZFX Client GameMinimap] Vue error:", info, error);
  app.mount(host);
  return () => { app.unmount(); host.remove(); };
}
