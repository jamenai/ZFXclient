import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { gameAttackSelectorAdapter, keybindFunctions } from "../../../modules/keybinds.js";

const POSITION_KEY = "zfx.gameAttackSelector.position.v1";

const GameAttackSelectorWidget = defineComponent({
  name: "FxGameAttackSelectorWidget",
  setup() {
    const nativeLayout = ref(null);
    const state = ref({ unitsLabel: "", percentageLabel: "", percentage: 0.5 });
    const position = ref(null);
    const ready = ref(false);
    const inMatch = ref(false);
    let drag = null;
    let stopDragging;

    const getViewportPosition = layout => {
      const saved = position.value;
      if (!saved) return { left: layout.left, top: layout.top };
      return {
        left: Math.max(8, Math.min(window.innerWidth - layout.width - 8, saved.xRatio * Math.max(0, window.innerWidth - layout.width - 16) + 8)),
        top: Math.max(8, Math.min(window.innerHeight - layout.height - 8, saved.yRatio * Math.max(0, window.innerHeight - layout.height - 16) + 8)),
      };
    };
    const style = computed(() => {
      const layout = nativeLayout.value;
      if (!layout) return {};
      const point = getViewportPosition(layout);
      return {
        left: `${Math.round(point.left)}px`,
        top: `${Math.round(point.top)}px`,
        width: `${Math.round(layout.width)}px`,
        height: `${Math.round(layout.height)}px`,
        "--fx-attack-fill": `${Math.max(0, Math.min(1, state.value.percentage)) * 100}%`,
        "--fx-attack-fill-color": state.value.percentage < 1 / 3
          ? `rgb(${Math.floor(390 * state.value.percentage)},130,0)`
          : state.value.percentage < 2 / 3
            ? `rgb(130,${130 - Math.floor(390 * (state.value.percentage - 1 / 3))},0)`
            : `rgb(130,0,${Math.floor(390 * (state.value.percentage - 2 / 3))})`,
      };
    });
    const receiveLayout = layout => {
      if (!layout || ![layout.left, layout.top, layout.width, layout.height].every(Number.isFinite)) return;
      nativeLayout.value = layout;
      ready.value = true;
    };
    const receiveState = next => {
      if (!next || !Number.isFinite(next.percentage)) return;
      state.value = next;
    };
    const readPosition = () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(POSITION_KEY) || "null");
        position.value = Number.isFinite(saved?.xRatio) && Number.isFinite(saved?.yRatio) ? saved : null;
      } catch { /* Ignore invalid saved positions. */ }
    };
    const savePosition = (left, top) => {
      const layout = nativeLayout.value;
      if (!layout) return;
      const maxLeft = Math.max(0, window.innerWidth - layout.width - 16);
      const maxTop = Math.max(0, window.innerHeight - layout.height - 16);
      const saved = {
        xRatio: Math.max(0, Math.min(1, (left - 8) / Math.max(1, maxLeft))),
        yRatio: Math.max(0, Math.min(1, (top - 8) / Math.max(1, maxTop))),
      };
      position.value = saved;
      try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(saved)); } catch { /* Storage may be unavailable. */ }
    };
    const startDrag = event => {
      if (event.button !== 0 || !nativeLayout.value) return;
      event.preventDefault();
      event.stopPropagation();
      const point = getViewportPosition(nativeLayout.value);
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: point.left, top: point.top };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", moveDrag, true);
      window.addEventListener("pointerup", stopDrag, true);
      window.addEventListener("pointercancel", stopDrag, true);
    };
    const moveDrag = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const layout = nativeLayout.value;
      const left = Math.max(8, Math.min(window.innerWidth - layout.width - 8, drag.left + event.clientX - drag.x));
      const top = Math.max(8, Math.min(window.innerHeight - layout.height - 8, drag.top + event.clientY - drag.y));
      savePosition(left, top);
    };
    const stopDrag = event => {
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      drag = null;
      window.removeEventListener("pointermove", moveDrag, true);
      window.removeEventListener("pointerup", stopDrag, true);
      window.removeEventListener("pointercancel", stopDrag, true);
    };
    const setPercentageAt = event => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width) return;
      const percent = Math.max(1 / 1024, Math.min(1, (event.clientX - rect.left) / rect.width));
      keybindFunctions.setAbsolute(percent);
      keybindFunctions.repaintAttackPercentageBar();
    };
    const onSliderPointerDown = event => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setPercentageAt(event);
    };
    const onSliderPointerMove = event => {
      if (event.buttons !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      setPercentageAt(event);
    };
    const adjust = factor => {
      keybindFunctions.setRelative(factor);
      keybindFunctions.repaintAttackPercentageBar();
    };
    const activateAdjust = (event, factor) => {
      event.preventDefault();
      event.stopPropagation();
      adjust(factor);
      event.currentTarget.blur();
    };
    const stopNativeInput = event => {
      event.preventDefault();
      event.stopPropagation();
    };
    const onLayoutLoaded = () => readPosition();
    const clearNativeSnapshot = () => {
      const hadSnapshot = nativeLayout.value !== null || state.value.unitsLabel !== "" || ready.value;
      nativeLayout.value = null;
      if (hadSnapshot) state.value = { unitsLabel: "", percentageLabel: "", percentage: 0.5 };
      ready.value = false;
      if (window.__fx) {
        window.__fx.gameAttackSelectorLayout = null;
        window.__fx.gameAttackSelectorState = null;
      }
    };
    const syncMatchState = () => {
      const rawMatchState = window.__fx?.getGameVar?.("gMatchState");
      if (rawMatchState === undefined || rawMatchState === null) return;
      inMatch.value = Number(rawMatchState) > 0;
      if (!inMatch.value) clearNativeSnapshot();
    };

    onMounted(() => {
      window.__fx ||= {};
      window.__fx.gameAttackSelectorHud = {
        receiveLayout,
        receiveState,
        isReady: () => ready.value && inMatch.value,
      };
      syncMatchState();
      receiveLayout(window.__fx.gameAttackSelectorLayout);
      receiveState(window.__fx.gameAttackSelectorState);
      stopDragging = window.setInterval(syncMatchState, 200);
      readPosition();
      window.addEventListener("fx-game-hud-layout-loaded", onLayoutLoaded);
      window.addEventListener("resize", readPosition);
      window.addEventListener("orientationchange", readPosition);
      document.addEventListener("fullscreenchange", readPosition);
    });
    onBeforeUnmount(() => {
      stopDrag();
      window.clearInterval(stopDragging);
      window.removeEventListener("fx-game-hud-layout-loaded", onLayoutLoaded);
      window.removeEventListener("resize", readPosition);
      window.removeEventListener("orientationchange", readPosition);
      document.removeEventListener("fullscreenchange", readPosition);
      if (window.__fx?.gameAttackSelectorHud?.receiveLayout === receiveLayout) delete window.__fx.gameAttackSelectorHud;
    });

    return { style, state, inMatch, startDrag, onSliderPointerDown, onSliderPointerMove, activateAdjust, stopNativeInput };
  },
  template: `
    <div v-if="inMatch && state.unitsLabel !== ''" class="fx-game-attack-selector" :style="style" aria-label="Attack percentage selector" @pointerdown="stopNativeInput" @mousedown="stopNativeInput">
      <button class="fx-game-attack-adjust" type="button" aria-label="Decrease attack percentage" tabindex="-1" @pointerdown="stopNativeInput" @pointerup="activateAdjust($event, 11 / 12)">−</button>
      <div class="fx-game-attack-track" role="slider" aria-label="Attack percentage" :aria-valuenow="Math.round(state.percentage * 100)" aria-valuemin="0" aria-valuemax="100" tabindex="-1" @pointerdown="onSliderPointerDown" @pointermove="onSliderPointerMove">
        <div class="fx-game-attack-track-fill"></div>
        <span class="fx-game-attack-value"><strong>{{ state.unitsLabel }}</strong><span>({{ state.percentageLabel }})</span></span>
      </div>
      <button class="fx-game-attack-adjust" type="button" aria-label="Increase attack percentage" tabindex="-1" @pointerdown="stopNativeInput" @pointerup="activateAdjust($event, 12 / 11)">+</button>
      <button class="fx-game-attack-drag" type="button" aria-label="Move attack selector" tabindex="-1" @pointerdown="startDrag" @click="stopNativeInput"><span></span></button>
    </div>
  `,
});

export function createVueGameAttackSelectorWidget() {
  if (document.getElementById("fx-game-attack-selector-root")) return () => {};
  const styleId = "fx-game-attack-selector-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .fx-game-attack-selector{position:fixed;z-index:62;display:grid;grid-template-columns:minmax(42px,12%) minmax(0,1fr) minmax(42px,12%);box-sizing:border-box;overflow:visible;border:1px solid color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 40%,rgba(150,185,225,.2));border-radius:10px;background:linear-gradient(145deg,rgba(20,30,45,var(--fx-game-hud-panel-alpha,.81)),rgba(9,15,26,var(--fx-game-hud-panel-alpha,.81)));color:#eef4ff;box-shadow:inset 0 1px rgba(255,255,255,.055),0 6px 18px rgba(0,0,0,.24);backdrop-filter:blur(12px);font-family:var(--fx-game-native-font-family,Arial,sans-serif);user-select:none;-webkit-user-select:none;touch-action:none;pointer-events:auto}
      .fx-game-attack-adjust{position:relative;z-index:1;min-width:0;height:100%;padding:0;border:0;border-right:1px solid color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 36%,rgba(150,185,225,.16));background:transparent;color:#f5f8ff;font:700 1.7em/1 var(--fx-game-native-font-family,Arial,sans-serif);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
      .fx-game-attack-adjust:nth-of-type(2){border-right:0;border-left:1px solid color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 36%,rgba(150,185,225,.16))}
      .fx-game-attack-adjust:hover,.fx-game-attack-adjust:active{background:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 14%,transparent)}
      .fx-game-attack-adjust:focus{outline:none}
      .fx-game-attack-track{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;overflow:hidden;background:transparent;touch-action:none;cursor:crosshair}
      .fx-game-attack-track-fill{position:absolute;inset:0 auto 0 0;width:var(--fx-attack-fill);background:linear-gradient(145deg,color-mix(in srgb,var(--fx-attack-fill-color) 86%,var(--fx-game-team-accent,#9bc4ff)),var(--fx-attack-fill-color));opacity:.82;pointer-events:none}
      .fx-game-attack-value{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:.45em;width:100%;padding:0 .3em;font-size:clamp(13px,calc(1.65em * var(--fx-game-hud-font-scale,1)),26px);font-weight:700;line-height:1;text-align:center;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.65);pointer-events:none}
      .fx-game-attack-value strong{overflow:hidden;text-overflow:ellipsis}
      .fx-game-attack-drag{position:absolute;z-index:3;top:2px;left:50%;width:32px;height:5px;transform:translateX(-50%);padding:0;border:0;border-radius:4px;background:color-mix(in srgb,var(--fx-game-team-accent,#9bc4ff) 64%,rgba(245,249,255,.32));cursor:move;touch-action:none;opacity:.48}
      .fx-game-attack-drag:hover{opacity:.95}
      .fx-game-attack-drag:focus{outline:none}
    `;
    document.head.appendChild(style);
  }
  const host = document.createElement("div");
  host.id = "fx-game-attack-selector-root";
  document.body.appendChild(host);
  const app = createApp(GameAttackSelectorWidget);
  app.config.errorHandler = (error, _instance, info) => console.error("[ZFX Client GameAttackSelector] Vue error:", info, error);
  app.mount(host);
  return () => { app.unmount(); host.remove(); };
}
