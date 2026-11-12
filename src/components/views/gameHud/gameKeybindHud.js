import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { mobileKeybinds } from "../../../modules/keybinds.js";
import { settingsApi } from "../../../modules/settings/settings.js";

const GameKeybindHud = defineComponent({
  name: "FxGameKeybindHud",
  setup() {
    const layout = ref(null);
    const enabled = ref(settingsApi.getBoolean("keybindButtons"));
    const fresh = ref(false);
    let lastLayoutAt = 0;
    let settingsTimer;
    const visible = computed(() => enabled.value && fresh.value && layout.value?.buttons?.length > 0);
    const style = computed(() => {
      const current = layout.value;
      if (!current) return {};
      return {
        left: `${current.left}px`,
        top: `${current.top}px`,
        width: `${current.width}px`,
        height: `${current.height}px`,
        gap: `${current.gap}px`,
        "--fx-keybind-base-font-size": `${current.fontSize}px`,
      };
    });
    const receiveLayout = next => {
      lastLayoutAt = Date.now();
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
    onMounted(() => {
      window.__fx ||= {};
      window.__fx.gameKeybindHudAdapter ||= {};
      window.__fx.gameKeybindHudAdapter.receiveLayout = receiveLayout;
      settingsTimer = window.setInterval(() => {
        enabled.value = settingsApi.getBoolean("keybindButtons");
        fresh.value = Date.now() - lastLayoutAt < 700;
      }, 200);
    });
    onBeforeUnmount(() => {
      window.clearInterval(settingsTimer);
      if (window.__fx?.gameKeybindHudAdapter?.receiveLayout === receiveLayout) {
        delete window.__fx.gameKeybindHudAdapter.receiveLayout;
      }
    });
    return { layout, visible, style, activate, stopGameInput };
  },
  template: `
    <div v-if="visible" class="fx-game-keybind-hud" :style="style" aria-label="Attack percentage shortcuts">
      <button v-for="button in layout.buttons" :key="button.index" type="button" tabindex="-1" @pointerdown="stopGameInput" @pointerup="activate($event, button.index)" @pointercancel.stop @mousedown="stopGameInput" @click="stopGameInput">{{ button.label }}</button>
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
      .fx-game-keybind-hud{position:fixed;z-index:61;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));box-sizing:border-box;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;font-family:var(--fx-game-native-font-family,Arial,sans-serif);font-size:calc(var(--fx-keybind-base-font-size,12px) * var(--fx-game-hud-font-scale,1))}
      .fx-game-keybind-hud button{min-width:0;height:100%;padding:0 3px;border:0;border-right:1px solid rgba(110,180,220,.45);background:rgba(0,0,0,var(--fx-game-hud-panel-alpha,.81));color:#f5f8ff;font:700 1em/1 var(--fx-game-native-font-family,Arial,sans-serif);text-align:center;white-space:nowrap;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
      .fx-game-keybind-hud button:first-child{border-radius:3px 0 0 3px}
      .fx-game-keybind-hud button:last-child{border-right:0;border-radius:0 3px 3px 0}
      .fx-game-keybind-hud button:focus{outline:none}
      .fx-game-keybind-hud button:active{background:rgba(28,76,102,.9)}
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
