import { createApp, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { networkDebug } from "../../../modules/networkDebug.js";

const GameDebugHud = defineComponent({
  name: "FxGameDebugHud",
  setup() {
    const visible = ref(false);
    const fps = ref(0);
    const network = ref(networkDebug.getSnapshot());
    let animationFrame = 0;
    let sampleTimer = 0;
    let finishedTimer = 0;
    let frameCount = 0;
    let fpsUpdatedAt = 0;

    const stopSampling = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (sampleTimer) clearInterval(sampleTimer);
      animationFrame = 0;
      sampleTimer = 0;
      networkDebug.setEnabled(false);
    };
    const sampleFrame = timestamp => {
      frameCount += 1;
      if (!fpsUpdatedAt) fpsUpdatedAt = timestamp;
      if (timestamp - fpsUpdatedAt >= 1000) {
        fps.value = Math.round(frameCount * 1000 / (timestamp - fpsUpdatedAt));
        frameCount = 0;
        fpsUpdatedAt = timestamp;
      }
      if (visible.value) animationFrame = requestAnimationFrame(sampleFrame);
    };
    const setVisible = value => {
      visible.value = value;
      stopSampling();
      if (value) {
        frameCount = 0;
        fpsUpdatedAt = 0;
        networkDebug.setEnabled(true);
        sampleTimer = window.setInterval(() => { network.value = networkDebug.getSnapshot(); }, 500);
        animationFrame = requestAnimationFrame(sampleFrame);
      }
    };
    const toggle = () => setVisible(!visible.value);
    const onKeyDown = event => {
      if (event.ctrlKey && event.shiftKey && event.code === "F9") {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }
    };
    const formatRate = value => value >= 1024 ? `${(value / 1024).toFixed(1)} KB/s` : `${value} B/s`;

    onMounted(() => {
      window.__fx ||= {};
      window.__fx.toggleNetworkDebugHud = toggle;
      window.addEventListener("keydown", onKeyDown);
      finishedTimer = window.setInterval(() => {
        if (window.__fx?.nativeGameFinished && visible.value) setVisible(false);
      }, 200);
    });
    onBeforeUnmount(() => {
      stopSampling();
      window.clearInterval(finishedTimer);
      window.removeEventListener("keydown", onKeyDown);
      if (window.__fx?.toggleNetworkDebugHud === toggle) delete window.__fx.toggleNetworkDebugHud;
    });
    return { visible, fps, network, formatRate, toggle };
  },
  template: `
    <aside v-if="visible" class="fx-game-debug-hud" aria-label="Game performance and network diagnostics">
      <header><strong>DEBUG</strong><span>{{ fps }} FPS</span><button type="button" tabindex="-1" @click="toggle">×</button></header>
      <div class="fx-game-debug-hud-line"><span>RX</span><strong>{{ network.packetsIn }} pkt/s</strong><small>{{ formatRate(network.bytesIn) }}</small></div>
      <small class="fx-game-debug-hud-total">{{ network.totalIn }} packets received</small>
      <div class="fx-game-debug-hud-line"><span>TX</span><strong>{{ network.packetsOut }} pkt/s</strong><small>{{ formatRate(network.bytesOut) }}</small></div>
      <small class="fx-game-debug-hud-total">{{ network.totalOut }} sent<span v-if="network.lastOutSeconds !== null"> · last {{ network.lastOutSeconds }}s ago</span></small>
      <footer v-if="network.sockets.length">Sockets <span v-for="socket in network.sockets" :key="socket.id">{{ socket.id }}: {{ socket.packetsIn + socket.packetsOut }}</span></footer>
    </aside>
  `,
});

export function createVueGameDebugHud() {
  if (document.getElementById("fx-game-debug-hud-root")) return () => {};
  const styleId = "fx-game-debug-hud-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .fx-game-debug-hud{position:fixed;z-index:100;top:12px;right:12px;width:190px;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(155,190,225,.3);border-radius:8px;background:rgba(8,14,24,var(--fx-game-hud-panel-alpha,.81));box-shadow:0 6px 22px rgba(0,0,0,.3);backdrop-filter:blur(8px);color:#edf4ff;font:12px/1.35 var(--fx-game-native-font-family,Arial,sans-serif);pointer-events:none;user-select:none}
      .fx-game-debug-hud header{display:flex;align-items:center;gap:8px;margin-bottom:5px;color:#9fc6ff}.fx-game-debug-hud header strong{margin-right:auto;letter-spacing:.09em}.fx-game-debug-hud header button{pointer-events:auto;padding:0 3px;border:0;background:transparent;color:#cbd8e8;font:18px/1 inherit;cursor:pointer}
      .fx-game-debug-hud-line{display:grid;grid-template-columns:28px 1fr auto;gap:5px;align-items:center;padding:2px 0}.fx-game-debug-hud-line>span{color:#8fa6c1}.fx-game-debug-hud-line small,.fx-game-debug-hud-total{color:#b8c5d6}.fx-game-debug-hud-total{display:block;margin:0 0 3px 33px;font-size:10px}.fx-game-debug-hud footer{display:flex;gap:8px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.1);color:#8fa6c1;font-size:10px}
    `.replace(/font-size:\s*([^;}]+)/g, (_match, declaration) => `font-size:${declaration.replace(/(\d+(?:\.\d+)?)px/g, "calc($1px * var(--fx-game-hud-font-scale,1))")}`)
      .replace(/(font:\s*(?:\d+\s+)?)(\d+(?:\.\d+)?)px(?=\/)/g, "$1calc($2px * var(--fx-game-hud-font-scale,1))");
    document.head.appendChild(style);
  }
  const host = document.createElement("div");
  host.id = "fx-game-debug-hud-root";
  document.body.appendChild(host);
  const app = createApp(GameDebugHud);
  app.config.errorHandler = (error, _instance, info) => console.error("[ZFX Client GameDebugHud] Vue error:", info, error);
  app.mount(host);
  return () => { app.unmount(); host.remove(); };
}
