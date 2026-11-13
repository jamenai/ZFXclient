import { defineComponent, onBeforeUnmount, onMounted } from "vue/dist/vue.esm-bundler.js";

export const GameTeamChartWidget = defineComponent({
  name: "FxGameTeamChartWidget",
  props: {
    visible: { type: Boolean, required: true },
    positionStyle: { type: Object, required: true },
    segments: { type: Object, required: true },
    detailedTeamPercentage: { type: Boolean, required: true },
    collapsed: { type: Boolean, default: false },
  },
  emits: ["start-move", "toggle-collapse"],
  setup(_props, { emit }) {
    let pointerStart = null;
    let dragged = false;
    let ignoreClick = false;
    let clearIgnoreTimer = 0;
    const onPointerDown = event => {
      if (event.button !== 0) return;
      pointerStart = { x: event.clientX, y: event.clientY };
      dragged = false;
      emit("start-move", event);
    };
    const onPointerMove = event => {
      if (!pointerStart || dragged) return;
      dragged = Math.abs(event.clientX - pointerStart.x) + Math.abs(event.clientY - pointerStart.y) > 4;
    };
    const onPointerUp = () => {
      if (!pointerStart) return;
      ignoreClick = dragged;
      pointerStart = null;
      window.clearTimeout(clearIgnoreTimer);
      clearIgnoreTimer = window.setTimeout(() => { ignoreClick = false; }, 0);
    };
    const onHeaderClick = event => {
      if (ignoreClick) {
        event.preventDefault();
        event.stopPropagation();
        ignoreClick = false;
        return;
      }
      emit("toggle-collapse");
    };
    onMounted(() => {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.clearTimeout(clearIgnoreTimer);
    });
    return { onPointerDown, onHeaderClick };
  },
  template: `
    <aside v-if="visible" class="fx-game-team-chart" :class="{ 'is-collapsed': collapsed }" :style="positionStyle" aria-label="Teamanteile">
      <header :aria-expanded="!collapsed" :title="collapsed ? 'Zum Ausklappen klicken oder zum Verschieben ziehen' : 'Zum Einklappen klicken oder zum Verschieben ziehen'" @pointerdown="onPointerDown" @click="onHeaderClick">
        <span class="fx-game-team-chart-icon" aria-hidden="true">◒</span>
        <strong>TEAMANTEILE</strong>
      </header>
      <svg v-if="!collapsed" class="fx-game-team-chart-pie" viewBox="0 0 100 100" role="img" aria-label="Gebietsanteile der Teams">
        <circle v-if="segments.teams.length === 1" cx="50" cy="50" r="45" :fill="segments.teams[0].color" stroke="rgba(255,255,255,.85)" stroke-width="1.2" />
        <template v-else>
          <path v-for="team in segments.segments" :key="team.id" :d="team.path" :fill="team.color" stroke="rgba(255,255,255,.85)" stroke-width="1.2" />
          <template v-for="team in segments.segments" :key="'label-' + team.id">
            <text v-if="team.share >= (detailedTeamPercentage ? .16 : .13)" :x="team.labelX" :y="team.labelY" :style="{ fontSize: team.labelFontSize + 'px' }" text-anchor="middle" dominant-baseline="middle">{{ team.label }}</text>
          </template>
        </template>
        <text v-if="segments.teams.length === 1" x="50" y="51" :style="{ fontSize: detailedTeamPercentage ? '8px' : '9px' }" text-anchor="middle" dominant-baseline="middle">{{ detailedTeamPercentage ? '100.00%' : '100%' }}</text>
      </svg>
    </aside>
  `,
});
