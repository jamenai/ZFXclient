import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { loadGameHudVisibility } from "../../../modules/gameHudVisibility.js";
import { loadGameActionQueueSettings } from "../../../modules/gameActionQueueSettings.js";

const POSITION_KEY = "zfx.gameActionQueue.position.v1";
const ATTACK_SLOT_COUNT = 6;
const BOAT_SLOT_COUNT = 8;
const SLOT_COUNT = ATTACK_SLOT_COUNT + BOAT_SLOT_COUNT;
const ACTION_MISSING_GRACE_MS = 350;
const diagnosticsHistory = [];
const DIAGNOSTICS_BUILD = "attack-slot-trace-6";
const getGameActionQueueDiagnostics = () => ({ version: DIAGNOSTICS_BUILD, frames: diagnosticsHistory.slice(-20) });
const exposeGameActionQueueDiagnostics = () => {
  // Publish outside Vue setup as well: the HUD can be temporarily unmounted or
  // fail to mount, but diagnostics should still tell us whether this bundle loaded.
  window.__fx = window.__fx || {};
  window.__fx.gameActionQueueHudBuild = DIAGNOSTICS_BUILD;
  window.__fx.getGameActionQueueDiagnostics = getGameActionQueueDiagnostics;
  window.getGameActionQueueDiagnostics = getGameActionQueueDiagnostics;
};
exposeGameActionQueueDiagnostics();
const createEmptySlot = index => ({ slotKey: `slot-${index}`, groupType: index < ATTACK_SLOT_COUNT ? "attack" : "boat", actionKey: null, active: false, type: "empty", target: null, units: 0, name: "", path: [], color: null, missingSince: 0 });
const createEmptySlots = () => Array.from({ length: SLOT_COUNT }, (_, index) => createEmptySlot(index));

const GameActionQueueWidget = defineComponent({
  name: "FxGameActionQueueWidget",
  setup() {
    const actions = ref(createEmptySlots());
    const boatRoutes = ref([]);
    const nativeLayout = ref(null);
    const savedPosition = ref(null);
    const frameSize = ref({ width: 310, height: 460 });
    const viewportSize = ref({ width: window.innerWidth, height: window.innerHeight });
    const inMatch = ref(false);
    const finished = ref(false);
    const hudVisibility = ref(loadGameHudVisibility());
    const queueSettings = ref(loadGameActionQueueSettings());
    const pending = ref(new Set());
    let pollTimer;
    let pendingTimer;
    let emptySnapshotSince = 0;
    let drag = null;
    const position = computed(() => {
      const layout = nativeLayout.value;
      const width = frameSize.value.width;
      const height = frameSize.value.height;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      if (savedPosition.value) return {
        left: Math.max(8, Math.min(maxX, savedPosition.value.xRatio * maxX + 8)),
        top: Math.max(8, Math.min(maxY, savedPosition.value.yRatio * maxY + 8)),
      };
      if (layout && Date.now() - layout.updatedAt < 1800) return {
        left: Math.max(8, Math.min(maxX, layout.left)),
        top: Math.max(8, Math.min(maxY, layout.top)),
      };
      return { left: Math.max(8, window.innerWidth - width - 16), top: 164 };
    });
    const panelStyle = computed(() => {
      return {
        left: `${Math.round(position.value.left)}px`,
        top: `${Math.round(position.value.top)}px`,
        width: `${frameSize.value.width}px`,
        height: `${frameSize.value.height}px`,
      };
    });
    const queueVisible = computed(() => inMatch.value && !finished.value && hudVisibility.value.actionQueue && (queueSettings.value.showWhenEmpty || actions.value.some(action => action.active)));
    const routesVisible = computed(() => hudVisibility.value.boatRoutes !== false);
    const visible = computed(() => queueVisible.value || (inMatch.value && !finished.value && routesVisible.value && boatRoutes.value.length > 0));

    const sync = () => {
      exposeGameActionQueueDiagnostics();
      viewportSize.value = { width: window.innerWidth, height: window.innerHeight };
      const fx = window.__fx;
      const matchState = Number(fx?.getGameVar?.("gMatchState"));
      inMatch.value = Number.isFinite(matchState) && matchState > 0;
      finished.value = fx?.nativeGameFinished === true;
      const saved = fx?.gameActionQueueAdapter?.layout;
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) nativeLayout.value = { ...saved };
      if (!inMatch.value || finished.value || (!fx?.gameActionQueueAdapter?.getSnapshot && !fx?.gameBoatRoutesAdapter?.getSnapshot)) {
        actions.value = createEmptySlots();
        boatRoutes.value = [];
        emptySnapshotSince = 0;
        return;
      }
      const next = fx.gameActionQueueAdapter?.getSnapshot?.();
      const candidates = Array.isArray(next) ? next
        .map((action, sourceIndex) => action && Number.isFinite(Number(action.target)) && Number.isFinite(Number(action.units)) && Number(action.units) > 0
          ? { ...action, sourceIndex: Number.isFinite(action.sourceIndex) ? action.sourceIndex : sourceIndex, key: action.key || `${action.type || "action"}:${action.target}` }
          : null)
        .filter(Boolean) : [];
      const observedActions = [
        // Keep an attack attached to its target identity, not its current native
        // row index: removing an earlier order compacts the native array and must
        // not move the remaining attacks into earlier HUD slots.
        ...candidates.filter(action => action.type === "attack")
          .map(action => ({ ...action, key: `attack:target:${action.target}` }))
          .slice(0, ATTACK_SLOT_COUNT),
        ...candidates.filter(action => action.type === "boat").slice(0, BOAT_SLOT_COUNT),
      ];
      const observedKeys = new Set(observedActions.map(action => action.key));
      pending.value = new Set([...pending.value].filter(key => observedKeys.has(key)));
      const incoming = observedActions.filter(action => !pending.value.has(action.key));
      let pinnedSingleAttack = false;
      if (incoming.length === 0) {
        if (!actions.value.some(action => action.active)) {
          actions.value = createEmptySlots();
          emptySnapshotSince = 0;
        } else {
          if (!emptySnapshotSince) emptySnapshotSince = Date.now();
          // The native list can be empty briefly while it rebuilds; retain rows and hit targets.
          if (Date.now() - emptySnapshotSince >= ACTION_MISSING_GRACE_MS) {
            actions.value = createEmptySlots();
            emptySnapshotSince = 0;
          }
        }
      } else {
        emptySnapshotSince = 0;
        const unmatched = [...incoming];
        const now = Date.now();
        const slots = actions.value.length === SLOT_COUNT ? actions.value : createEmptySlots();
        const assigned = new Map();
        // While a lone attack advances, both its target and its native row index
        // may change. Pin its next snapshot to the sole active attack slot before
        // considering row keys, otherwise it can be mistaken for a new order.
        const incomingAttackIndices = unmatched.map((action, index) => action.type === "attack" ? index : -1).filter(index => index >= 0);
        const activeAttackSlots = slots.map((slot, index) => ({ slot, index }))
          .filter(({ slot }) => slot.groupType === "attack" && slot.actionKey && slot.active);
        if (incomingAttackIndices.length === 1 && activeAttackSlots.length === 1) {
          assigned.set(activeAttackSlots[0].index, unmatched.splice(incomingAttackIndices[0], 1)[0]);
          pinnedSingleAttack = true;
        }
        // Claim every exact identity before attempting continuity matches.
        slots.forEach((slot, index) => {
          if (!slot.actionKey || assigned.has(index)) return;
          const matchIndex = unmatched.findIndex(action => action.key === slot.actionKey && action.type === slot.groupType);
          if (matchIndex >= 0) assigned.set(index, unmatched.splice(matchIndex, 1)[0]);
        });
        for (const type of ["attack", "boat"]) {
          const priorSlots = slots.map((slot, index) => ({ slot, index }))
            .filter(({ slot, index }) => slot.groupType === type && slot.actionKey && !assigned.has(index)
              && (slot.active || now - (slot.missingSince || now) < ACTION_MISSING_GRACE_MS));
          const incomingIndices = unmatched.map((action, index) => action.type === type ? index : -1).filter(index => index >= 0);
          if (priorSlots.length === 1 && incomingIndices.length === 1) {
            assigned.set(priorSlots[0].index, unmatched.splice(incomingIndices[0], 1)[0]);
          }
        }
        // Native target IDs can change between steps. Keep an update in its prior row
        // by matching native source position first, then same-owner troop continuity.
        const fallbackSlots = slots.map((slot, index) => ({ slot, index }))
          .filter(({ slot, index }) => slot.actionKey && !assigned.has(index))
          .sort((left, right) => Number(right.slot.active) - Number(left.slot.active));
        for (const { slot, index } of fallbackSlots) {
          let matchIndex = -1;
          if (slot.groupType === "boat") {
            matchIndex = unmatched.findIndex(action => action.type === slot.groupType && action.sourceIndex === slot.sourceIndex);
          }
          if (matchIndex < 0) {
            let bestDistance = Infinity;
            unmatched.forEach((action, candidateIndex) => {
              if (action.type !== slot.groupType) return;
              const samePlayer = action.playerId != null && slot.playerId != null && Number(action.playerId) === Number(slot.playerId);
              const sameName = action.name && slot.name && action.name === slot.name;
              if (slot.groupType === "boat" && !samePlayer && !sameName) return;
              const previousUnits = Math.max(1, Number(slot.units) || 0);
              const currentUnits = Math.max(1, Number(action.units) || 0);
              const distance = Math.abs(Math.log(currentUnits / previousUnits));
              if (distance < bestDistance) { bestDistance = distance; matchIndex = candidateIndex; }
            });
          }
          if (matchIndex < 0 && slot.groupType === "boat") {
            matchIndex = unmatched.findIndex(action => action.type === slot.groupType && action.sourceIndex === slot.sourceIndex);
          }
          if (matchIndex >= 0) assigned.set(index, unmatched.splice(matchIndex, 1)[0]);
        }
        actions.value = slots.map((slot, index) => {
          const updated = assigned.get(index);
          if (updated) {
            return { ...updated, slotKey: `slot-${index}`, groupType: slot.groupType, actionKey: updated.key, active: true, missingSince: 0 };
          }
          if (!slot.actionKey) return createEmptySlot(index);
          const missingSince = slot.missingSince || now;
          if (now - missingSince >= ACTION_MISSING_GRACE_MS) return createEmptySlot(index);
          return { ...slot, active: false, missingSince };
        });
        for (const action of unmatched) {
          const emptyIndex = actions.value.findIndex(slot => !slot.actionKey && slot.groupType === action.type);
          if (emptyIndex < 0) break;
          actions.value[emptyIndex] = { ...action, slotKey: `slot-${emptyIndex}`, groupType: action.type, actionKey: action.key, active: true, missingSince: 0 };
        }
      }
      const ownBoatRoutes = actions.value.filter(action => action.active && action.type === "boat" && Array.isArray(action.path) && action.path.length > 1);
      let nativeBoatRoutes = [];
      try {
        nativeBoatRoutes = fx.gameBoatRoutesAdapter?.getSnapshot?.() ?? fx.gameActionQueueAdapter?.getBoatRoutes?.() ?? [];
      } catch { /* Keep routes from the active action rows if the native feed is temporarily unavailable. */ }
      const routesByKey = new Map();
      for (const route of [...ownBoatRoutes, ...(Array.isArray(nativeBoatRoutes) ? nativeBoatRoutes : [])]) {
        if (route?.key) routesByKey.set(route.key, route);
      }
      boatRoutes.value = [...routesByKey.values()];
      diagnosticsHistory.push({
        at: Date.now(),
        pinnedSingleAttack,
        native: candidates.map(({ key, type, target, playerId, name, units, sourceIndex }) => ({ key, type, target, playerId, name, units, sourceIndex })),
        grouped: incoming.map(({ key, type, target, playerId, name, units, sourceIndex }) => ({ key, type, target, playerId, name, units, sourceIndex })),
        slots: actions.value.map(({ slotKey, groupType, actionKey, sourceIndex, type, target, playerId, name, units, active }) => ({ slotKey, groupType, actionKey, sourceIndex, type, target, playerId, name, units, active })),
      });
      if (diagnosticsHistory.length > 30) diagnosticsHistory.shift();
    };
    const savePosition = (left, top) => {
      const width = frameSize.value.width;
      const height = frameSize.value.height;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      savedPosition.value = {
        xRatio: Math.max(0, Math.min(1, (left - 8) / maxX)),
        yRatio: Math.max(0, Math.min(1, (top - 8) / maxY)),
        width,
        height,
      };
      try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(savedPosition.value)); } catch { /* Storage may be unavailable. */ }
    };
    const stopDrag = event => {
      if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
      savePosition(position.value.left, position.value.top);
      window.removeEventListener("pointermove", moveDrag, true);
      window.removeEventListener("pointerup", stopDrag, true);
      window.removeEventListener("pointercancel", stopDrag, true);
      drag = null;
    };
    const moveDrag = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const width = frameSize.value.width;
      const height = frameSize.value.height;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, drag.left + event.clientX - drag.x));
      const top = Math.max(8, Math.min(window.innerHeight - height - 8, drag.top + event.clientY - drag.y));
      savedPosition.value = {
        xRatio: Math.max(0, Math.min(1, (left - 8) / Math.max(1, window.innerWidth - width - 16))),
        yRatio: Math.max(0, Math.min(1, (top - 8) / Math.max(1, window.innerHeight - height - 16))),
      };
    };
    const startDrag = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: position.value.left, top: position.value.top };
      window.addEventListener("pointermove", moveDrag, true);
      window.addEventListener("pointerup", stopDrag, true);
      window.addEventListener("pointercancel", stopDrag, true);
    };
    const moveResize = event => {
      if (!resizeDrag || event.pointerId !== resizeDrag.pointerId) return;
      event.preventDefault();
      const maxWidth = Math.max(220, window.innerWidth - resizeDrag.left - 8);
      const maxHeight = Math.max(260, window.innerHeight - resizeDrag.top - 8);
      const width = Math.max(220, Math.min(maxWidth, resizeDrag.width + event.clientX - resizeDrag.x));
      const height = Math.max(260, Math.min(maxHeight, resizeDrag.height + event.clientY - resizeDrag.y));
      frameSize.value = { width, height };
      savedPosition.value = {
        xRatio: Math.max(0, Math.min(1, (resizeDrag.left - 8) / Math.max(1, window.innerWidth - width - 16))),
        yRatio: Math.max(0, Math.min(1, (resizeDrag.top - 8) / Math.max(1, window.innerHeight - height - 16))),
        width,
        height,
      };
    };
    const stopResize = event => {
      if (!resizeDrag || (event?.pointerId != null && event.pointerId !== resizeDrag.pointerId)) return;
      savePosition(position.value.left, position.value.top);
      window.removeEventListener("pointermove", moveResize, true);
      window.removeEventListener("pointerup", stopResize, true);
      window.removeEventListener("pointercancel", stopResize, true);
      resizeDrag = null;
    };
    const startResize = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      resizeDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: position.value.left, top: position.value.top, width: frameSize.value.width, height: frameSize.value.height };
      window.addEventListener("pointermove", moveResize, true);
      window.addEventListener("pointerup", stopResize, true);
      window.addEventListener("pointercancel", stopResize, true);
    };
    const stopAction = (event, action) => {
      event.preventDefault();
      event.stopPropagation();
      const adapter = window.__fx?.gameActionQueueAdapter;
      const succeeded = action.type === "boat"
        ? adapter?.stopBoat?.(action.target)
        : adapter?.stopAttack?.(action.target);
      if (!succeeded) return;
      pending.value = new Set([...pending.value, action.key]);
      const slotIndex = actions.value.findIndex(slot => slot.slotKey === action.slotKey);
      if (slotIndex >= 0) actions.value[slotIndex] = createEmptySlot(slotIndex);
      window.clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(() => { pending.value = new Set(); sync(); }, 1400);
      event.currentTarget.blur();
      sync();
    };
    const reinforceAction = (event, action) => {
      event.preventDefault();
      event.stopPropagation();
      if (action.type !== "attack") return;
      window.__fx?.gameActionQueueAdapter?.reinforceAttack?.(action.target);
      event.currentTarget.blur();
    };
    const routePoints = action => Array.isArray(action?.path)
      ? action.path.map(point => `${Number(point.x).toFixed(1)},${Number(point.y).toFixed(1)}`).join(" ")
      : "";
    const onVisibilityChanged = event => { hudVisibility.value = { ...hudVisibility.value, ...event.detail }; };
    const onQueueSettingsChanged = event => { queueSettings.value = { ...queueSettings.value, ...event.detail }; };

    onMounted(() => {
      exposeGameActionQueueDiagnostics();
      try {
        const saved = JSON.parse(window.localStorage.getItem(POSITION_KEY) || "null");
        if (Number.isFinite(saved?.xRatio) && Number.isFinite(saved?.yRatio)) savedPosition.value = saved;
        if (Number.isFinite(saved?.width) && Number.isFinite(saved?.height)) {
          const wasDefaultSize = saved.width === 286 && saved.height === 374;
          frameSize.value = {
            width: Math.max(220, wasDefaultSize ? 310 : saved.width),
            height: Math.max(260, wasDefaultSize ? 460 : saved.height),
          };
        }
      } catch { /* Ignore invalid stored positions. */ }
      sync();
      pollTimer = window.setInterval(sync, 200);
      window.addEventListener("resize", sync);
      document.addEventListener("fullscreenchange", sync);
      window.addEventListener("fx-game-hud-visibility-changed", onVisibilityChanged);
      window.addEventListener("fx-game-action-queue-settings-changed", onQueueSettingsChanged);
    });
    onBeforeUnmount(() => {
      window.clearInterval(pollTimer);
      window.clearTimeout(pendingTimer);
      window.removeEventListener("resize", sync);
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("fx-game-hud-visibility-changed", onVisibilityChanged);
      window.removeEventListener("fx-game-action-queue-settings-changed", onQueueSettingsChanged);
      stopDrag();
      stopResize();
    });

    return { actions, boatRoutes, visible, queueVisible, routesVisible, frameVisible: computed(() => hudVisibility.value.actionQueueFrame !== false), queueSettings, panelStyle, pending, viewportSize, routePoints, startDrag, startResize, stopAction, reinforceAction };
  },
  template: `
    <div v-if="visible" class="fx-game-action-layer" aria-label="Running attacks and boats">
      <svg class="fx-game-action-routes" :viewBox="'0 0 ' + viewportSize.width + ' ' + viewportSize.height" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <g v-for="route in boatRoutes" :key="'route-' + route.key" :style="{ '--fx-action-color': route.color || '#9db0c8' }">
          <template v-if="routesVisible && route.path && route.path.length > 1">
            <polyline class="fx-game-action-route-glow" :points="routePoints(route)" />
            <polyline class="fx-game-action-route" :points="routePoints(route)" />
            <circle class="fx-game-action-route-destination" :cx="route.path[route.path.length - 1].x" :cy="route.path[route.path.length - 1].y" r="4" />
          </template>
        </g>
      </svg>
      <div v-if="queueVisible" class="fx-game-action-queue" :class="{ 'is-frame-hidden': !frameVisible }" :style="panelStyle">
        <button class="fx-game-action-frame-grip" type="button" tabindex="-1" aria-label="Move attack and boat list" title="Drag list" @pointerdown="startDrag" @click.stop><span aria-hidden="true">⠿</span><span>ORDERS</span></button>
        <div class="fx-game-action-slots">
        <template v-for="(action,index) in actions" :key="action.slotKey">
        <div v-if="index === 0" class="fx-game-action-section-label">ATTACKS</div>
        <div v-if="index === 6" class="fx-game-action-section-label is-boats">BOATS</div>
        <article class="fx-game-action-row" :class="['is-' + action.type, 'stop-' + queueSettings.stopButtonPosition, { 'is-inactive': !action.active, 'is-empty': !action.active }]" :style="action.color ? { '--fx-action-color': action.color } : null">
        <button v-if="action.active" class="fx-game-action-grip" type="button" tabindex="-1" aria-label="Action type" @click.stop>
          <span class="fx-game-action-type" aria-hidden="true">{{ action.type === 'boat' ? '⛵' : '⚔' }}</span>
        </button>
        <span class="fx-game-action-name" :title="action.active ? action.name : ''">{{ action.active ? action.name : '' }}</span>
        <strong class="fx-game-action-units">{{ action.active ? Number(action.units).toLocaleString() : '' }}</strong>
        <button v-if="action.active && action.type === 'attack'" class="fx-game-action-reinforce" type="button" tabindex="-1" :aria-label="'Reinforce attack on ' + action.name" title="Reinforce attack" @pointerdown.prevent.stop @click="reinforceAction($event,action)">+</button>
        <button v-if="action.active" class="fx-game-action-stop" type="button" tabindex="-1" :disabled="pending.has(action.key)" :aria-label="action.type === 'boat' ? 'Stop boat to ' + action.name : 'Stop attack on ' + action.name" :title="action.type === 'boat' ? 'Stop boat' : 'Stop attack'" @pointerdown.prevent.stop @click="stopAction($event,action)">×</button>
      </article>
        </template>
        </div>
        <button class="fx-game-action-resize" type="button" tabindex="-1" aria-label="Resize action list" title="Resize" @pointerdown="startResize" @click.stop></button>
      </div>
    </div>
  `,
});

export function createVueGameActionQueueWidget() {
  if (document.getElementById("fx-game-action-queue-root")) return () => {};
  const styleId = "fx-game-action-queue-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .fx-game-action-layer{position:fixed;inset:0;z-index:67;pointer-events:none}.fx-game-action-routes{position:absolute;inset:0;width:100vw;height:100vh;overflow:visible;pointer-events:none}.fx-game-action-route-glow,.fx-game-action-route{fill:none;stroke:var(--fx-action-color,#9db0c8);stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.fx-game-action-route-glow{stroke-width:7px;opacity:.19;filter:blur(2px)}.fx-game-action-route{stroke-width:2.4px;stroke-dasharray:8 6;opacity:.88}.fx-game-action-route-destination{fill:var(--fx-action-color,#9db0c8);stroke:#101923;stroke-width:1.5px;vector-effect:non-scaling-stroke}
      .fx-game-action-queue{position:fixed;z-index:68;display:grid;grid-template-rows:22px minmax(0,1fr);gap:3px;box-sizing:border-box;min-width:220px;min-height:260px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:hidden;padding:4px;border:1px solid rgba(176,198,224,.28);border-radius:7px;background:rgba(8,15,24,var(--fx-game-hud-panel-alpha,.81));box-shadow:0 6px 18px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.04);pointer-events:none;font-family:var(--fx-game-native-font-family,Arial,sans-serif);font-size:calc(12.5px * var(--fx-game-hud-font-scale,1));user-select:none;-webkit-user-select:none}.fx-game-action-queue.is-frame-hidden{border-color:transparent;background:transparent;box-shadow:none;padding:0}
      .fx-game-action-frame-grip{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;padding:0 5px;border:0;border-radius:4px;background:rgba(160,185,214,.07);color:rgba(210,222,238,.65);font:600 9px/1 var(--fx-game-native-font-family,Arial,sans-serif);letter-spacing:.12em;cursor:move;touch-action:none;pointer-events:auto}.fx-game-action-frame-grip span:first-child{font-size:13px;line-height:1}.fx-game-action-queue.is-frame-hidden .fx-game-action-frame-grip{background:transparent;color:rgba(210,222,238,.2)}.fx-game-action-frame-grip:active{background:rgba(190,210,238,.15)}
      .fx-game-action-resize{position:absolute;right:1px;bottom:1px;z-index:2;width:14px;height:14px;padding:0;border:0;border-right:2px solid rgba(190,210,238,.38);border-bottom:2px solid rgba(190,210,238,.38);border-radius:0 0 4px 0;background:transparent;cursor:nwse-resize;touch-action:none;pointer-events:auto}.fx-game-action-queue.is-frame-hidden .fx-game-action-resize{border-color:rgba(190,210,238,.16)}
      .fx-game-action-slots{display:grid;grid-template-rows:12px repeat(6,minmax(0,1fr)) 15px repeat(8,minmax(0,1fr));gap:2px;min-width:0;min-height:0;pointer-events:none}.fx-game-action-section-label{display:flex;align-items:center;padding:0 4px;border-bottom:1px solid rgba(170,195,225,.11);color:rgba(205,220,240,.48);font:600 9px/1 var(--fx-game-native-font-family,Arial,sans-serif);letter-spacing:.13em}.fx-game-action-section-label.is-boats{border-top:1px solid rgba(170,195,225,.2);border-bottom:1px solid rgba(170,195,225,.11);padding-top:2px}
      .fx-game-action-row{display:flex;align-items:center;gap:8px;box-sizing:border-box;min-width:0;min-height:0;padding:0 6px;border:1px solid color-mix(in srgb,var(--fx-action-color,#8ba2bd) 46%,rgba(160,190,225,.2));border-radius:4px;background:linear-gradient(110deg,color-mix(in srgb,var(--fx-action-color,#8ba2bd) 20%,rgba(10,17,27,var(--fx-game-hud-panel-alpha,.81))),rgba(10,17,27,var(--fx-game-hud-panel-alpha,.81)) 44%);box-shadow:0 3px 8px rgba(0,0,0,.22),inset 0 1px rgba(255,255,255,.04);color:#eef4ff;pointer-events:auto}.fx-game-action-row.stop-left .fx-game-action-stop{order:-1}.fx-game-action-row.is-inactive{visibility:hidden;pointer-events:none}.fx-game-action-row.is-empty{visibility:visible;border-color:transparent;background:transparent;box-shadow:none;pointer-events:none}.fx-game-action-queue.is-frame-hidden .fx-game-action-row.is-empty{border-color:rgba(190,210,238,.13)}.fx-game-action-row.is-empty .fx-game-action-grip{visibility:hidden}.fx-game-action-row.is-attack .fx-game-action-grip{display:none}.fx-game-action-row.is-inactive .fx-game-action-stop,.fx-game-action-row.is-inactive .fx-game-action-reinforce{display:none}
      .fx-game-action-type{display:grid;place-items:center;flex:0 0 22px;width:22px;height:22px;border-radius:4px;background:color-mix(in srgb,var(--fx-action-color,#8ba2bd) 22%,rgba(130,180,240,.12));color:var(--fx-action-color,#b6c7da);font-size:14px;line-height:1}
      .fx-game-action-name{flex:1;min-width:0;overflow:hidden;color:#f3f6fb;font-weight:650;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.7)}
      .fx-game-action-units{flex:0 0 auto;color:#dbe8f8;font-size:.92em;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.65)}
      .fx-game-action-grip,.fx-game-action-reinforce,.fx-game-action-stop{display:grid;place-items:center;flex:0 0 26px;width:26px;height:26px;padding:0;border:0;border-radius:4px;background:transparent;color:#dce6f2;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
      .fx-game-action-grip{cursor:default}
      .fx-game-action-reinforce{border:1px solid rgba(108,210,145,.36);background:rgba(38,145,82,.2);color:#a9efc0;font-size:17px;line-height:1}.fx-game-action-reinforce:hover{border-color:rgba(128,235,166,.82);background:rgba(43,174,93,.48);color:#fff}
      .fx-game-action-stop{border:1px solid rgba(255,112,112,.34);background:rgba(174,38,48,.22);color:#ffbcbc;font-size:18px;line-height:1}.fx-game-action-stop:hover:not(:disabled){border-color:rgba(255,133,133,.8);background:rgba(211,42,52,.55);color:#fff}.fx-game-action-stop:disabled{opacity:.42;cursor:default}
      .fx-game-action-reinforce:focus,.fx-game-action-stop:focus,.fx-game-action-grip:focus{outline:none}
    `;
    document.head.appendChild(style);
  }
  const host = document.createElement("div");
  host.id = "fx-game-action-queue-root";
  document.body.appendChild(host);
  const app = createApp(GameActionQueueWidget);
  app.config.errorHandler = (error, _instance, info) => console.error("[ZFX Client GameActionQueue] Vue error:", info, error);
  app.mount(host);
  return () => { app.unmount(); host.remove(); };
}
