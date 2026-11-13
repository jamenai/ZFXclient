import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { mobileKeybinds } from "../../../modules/keybinds.js";
import { settingsApi } from "../../../modules/settings/settings.js";

const POSITION_KEY = "zfx.gameKeybindHud.position.v1";

const GameKeybindHud = defineComponent({
  name: "FxGameKeybindHud",
  setup() {
    const layout = ref(null);
    const enabled = ref(settingsApi.getBoolean("keybindButtons"));
    const inMatch = ref(false);
    const position = ref(null);
    let settingsTimer;
    let drag = null;
    const visible = computed(() => enabled.value && inMatch.value && layout.value?.buttons?.length > 0);
    const getViewportPosition = current => {
      if (!position.value) return { left: current.left, top: current.top };
      return {
        left: Math.max(8, Math.min(window.innerWidth - current.width - 8, position.value.xRatio * Math.max(0, window.innerWidth - current.width - 16) + 8)),
        top: Math.max(8, Math.min(window.innerHeight - current.height - 8, position.value.yRatio * Math.max(0, window.innerHeight - current.height - 16) + 8)),
      };
    };
    const style = computed(() => {
      const current = layout.value;
      if (!current) return {};
      const point = getViewportPosition(current);
      return {
        left: `${Math.round(point.left)}px`,
        top: `${Math.round(point.top)}px`,
        width: `${current.width}px`,
        height: `${current.height}px`,
        gap: `${current.gap}px`,
        "--fx-keybind-base-font-size": `${current.fontSize}px`,
      };
    });
    const receiveLayout = next => {
      if (!next || !Array.isArray(next.buttons)) return;
      const previous = layout.value;
      if (previous
        && previous.left === next.left
        && previous.top === next.top
        && previous.width === next.width
        && previous.height === next.height
        && previous.gap === next.gap
        && previous.fontSize === next.fontSize
        && previous.buttons.map(button => button.label).join("|") === next.buttons.map(button => button.label).join("|")) return;
      layout.value = next;
    };
    const activate = (event, index) => {
      event.preventDefault();
      event.stopPropagation();
      mobileKeybinds.activate(index);
      event.currentTarget.blur();
    };
    const stopGameInput = event => {
      event.preventDefault();
      event.stopPropagation();
    };
    const readPosition = () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(POSITION_KEY) || "null");
        position.value = Number.isFinite(saved?.xRatio) && Number.isFinite(saved?.yRatio) ? saved : null;
      } catch { position.value = null; }
    };
    const savePosition = (left, top) => {
      const current = layout.value;
      if (!current) return;
      const maxLeft = Math.max(0, window.innerWidth - current.width - 16);
      const maxTop = Math.max(0, window.innerHeight - current.height - 16);
      const saved = {
        xRatio: Math.max(0, Math.min(1, (left - 8) / Math.max(1, maxLeft))),
        yRatio: Math.max(0, Math.min(1, (top - 8) / Math.max(1, maxTop))),
      };
      position.value = saved;
      try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(saved)); } catch { /* Storage may be unavailable. */ }
    };
    const moveDrag = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const current = layout.value;
      const left = Math.max(8, Math.min(window.innerWidth - current.width - 8, drag.left + event.clientX - drag.x));
      const top = Math.max(8, Math.min(window.innerHeight - current.height - 8, drag.top + event.clientY - drag.y));
      savePosition(left, top);
    };
    const stopDrag = event => {
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      drag = null;
      window.removeEventListener("pointermove", moveDrag, true);
      window.removeEventListener("pointerup", stopDrag, true);
      window.removeEventListener("pointercancel", stopDrag, true);
    };
    const startDrag = event => {
      if (event.button !== 0 || !layout.value) return;
      event.preventDefault();
      event.stopPropagation();
      const point = getViewportPosition(layout.value);
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: point.left, top: point.top };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", moveDrag, true);
      window.addEventListener("pointerup", stopDrag, true);
      window.addEventListener("pointercancel", stopDrag, true);
    };
    const onLayoutLoaded = () => readPosition();
    const getDiagnostics = () => ({
      enabled: settingsApi.getBoolean("keybindButtons"),
      inMatch: inMatch.value,
      configuredButtons: settingsApi.getArray("attackPercentageKeybinds").length,
      hasNativeLayout: Boolean(window.__fx?.gameKeybindHudLayout),
      layout: window.__fx?.gameKeybindHudLayout ?? null,
    });
    onMounted(() => {
      window.__fx ||= {};
      window.__fx.gameKeybindHudAdapter ||= {};
      window.__fx.gameKeybindHudAdapter.receiveLayout = receiveLayout;
      window.__fx.getGameKeybindHudDiagnostics = getDiagnostics;
      receiveLayout(window.__fx.gameKeybindHudLayout);
      readPosition();
      window.addEventListener("fx-game-hud-layout-loaded", onLayoutLoaded);
      window.addEventListener("resize", readPosition);
      window.addEventListener("orientationchange", readPosition);
      document.addEventListener("fullscreenchange", readPosition);
      settingsTimer = window.setInterval(() => {
        enabled.value = settingsApi.getBoolean("keybindButtons");
        const rawMatchState = window.__fx?.getGameVar?.("gMatchState");
        if (rawMatchState === undefined || rawMatchState === null) return;
        const nextInMatch = Number(rawMatchState) > 0;
        inMatch.value = nextInMatch;
        if (!nextInMatch) {
          layout.value = null;
          if (window.__fx?.gameKeybindHudLayout) window.__fx.gameKeybindHudLayout = null;
        }
      }, 200);
    });
    onBeforeUnmount(() => {
      window.clearInterval(settingsTimer);
      stopDrag();
      window.removeEventListener("fx-game-hud-layout-loaded", onLayoutLoaded);
      window.removeEventListener("resize", readPosition);
      window.removeEventListener("orientationchange", readPosition);
      document.removeEventListener("fullscreenchange", readPosition);
      if (window.__fx?.gameKeybindHudAdapter?.receiveLayout === receiveLayout) {
        delete window.__fx.gameKeybindHudAdapter.receiveLayout;
      }
      if (window.__fx?.getGameKeybindHudDiagnostics === getDiagnostics) {
        delete window.__fx.getGameKeybindHudDiagnostics;
      }
    });
    return { layout, visible, style, activate, startDrag, stopGameInput };
  },
  template: `
    <div v-if="visible" class="fx-game-keybind-hud" :style="style" aria-label="Attack percentage shortcuts">
      <button v-for="button in layout.buttons" :key="button.index" type="button" tabindex="-1" @pointerdown="stopGameInput" @pointerup="activate($event, button.index)" @pointercancel.stop @mousedown="stopGameInput" @click="stopGameInput">{{ button.label }}</button>
      <button class="fx-game-keybind-hud-grip" type="button" tabindex="-1" aria-label="Move keybind buttons" title="Drag to move" @pointerdown="startDrag" @click="stopGameInput"><span></span></button>
    </div>
  `,
});

export function createVueGameKeybindHud() {
  if (document.getElementById("fx-game-keybind-hud-root")) return () => {};
  const styleId = "fx-game-keybind-hud-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .fx-game-keybind-hud{position:fixed;z-index:61;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));box-sizing:border-box;overflow:hidden;padding:2px;border:1px solid color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 32%,rgba(150,185,225,.17));border-radius:9px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));box-shadow:inset 0 1px rgba(255,255,255,.055),0 4px 12px rgba(0,0,0,.16);backdrop-filter:blur(12px);pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;font-family:var(--fx-game-native-font-family,Arial,sans-serif);font-size:calc(var(--fx-keybind-base-font-size,12px) * var(--fx-game-hud-font-scale,1))}
      .fx-game-keybind-hud button{min-width:0;height:100%;padding:0 3px;border:0;border-right:1px solid color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 30%,rgba(110,180,220,.16));background:transparent;color:#f5f8ff;font:700 1em/1 var(--fx-game-native-font-family,Arial,sans-serif);text-align:center;white-space:nowrap;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
      .fx-game-keybind-hud button:first-child{border-radius:5px 0 0 5px}
      .fx-game-keybind-hud button:last-child{border-right:0;border-radius:0 5px 5px 0}
      .fx-game-keybind-hud button:focus{outline:none}
      .fx-game-keybind-hud button:hover,.fx-game-keybind-hud button:active{background:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 16%,rgba(28,43,58,.86))}
      .fx-game-keybind-hud .fx-game-keybind-hud-grip{position:absolute;z-index:2;top:0;left:50%;display:grid;place-items:center;width:42px;height:12px;transform:translateX(-50%);padding:0;border:0;border-radius:99px;background:transparent;opacity:.55;cursor:move;touch-action:none}
      .fx-game-keybind-hud .fx-game-keybind-hud-grip span{width:28px;height:4px;border-radius:99px;background:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 65%,rgba(245,249,255,.42));box-shadow:0 1px 4px rgba(0,0,0,.3)}
      .fx-game-keybind-hud .fx-game-keybind-hud-grip:hover{opacity:1}
    `;
    document.head.appendChild(style);
  }
  const host = document.createElement("div");
  host.id = "fx-game-keybind-hud-root";
  document.body.appendChild(host);
  const app = createApp(GameKeybindHud);
  app.config.errorHandler = (error, _instance, info) => console.error("[ZFX Client GameKeybindHud] Vue error:", info, error);
  app.mount(host);
  return () => { app.unmount(); host.remove(); };
}
