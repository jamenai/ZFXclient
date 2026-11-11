import { defineComponent } from "vue/dist/vue.esm-bundler.js";

export const GameTeamChartWidget = defineComponent({
  name: "FxGameTeamChartWidget",
  props: {
    visible: { type: Boolean, required: true },
    positionStyle: { type: Object, required: true },
    segments: { type: Object, required: true },
    detailedTeamPercentage: { type: Boolean, required: true },
  },
  emits: ["start-move"],
  template: `
    <aside v-if="visible" class="fx-game-team-chart" :style="positionStyle" aria-label="Teamanteile">
      <header @pointerdown="$emit('start-move',$event)"><span aria-hidden="true">◒</span><strong>TEAMANTEILE</strong></header>
      <svg class="fx-game-team-chart-pie" viewBox="0 0 100 100" role="img" aria-label="Gebietsanteile der Teams">
        <circle v-if="segments.teams.length === 1" cx="50" cy="50" r="45" :fill="segments.teams[0].color" stroke="rgba(255,255,255,.85)" stroke-width="1.2" />
        <template v-else>
          <path v-for="team in segments.segments" :key="team.id" :d="team.path" :fill="team.color" stroke="rgba(255,255,255,.85)" stroke-width="1.2" />
          <template v-for="team in segments.segments" :key="'label-' + team.id">
            <text v-if="team.share >= (detailedTeamPercentage ? .16 : .13)" :x="team.labelX" :y="team.labelY" text-anchor="middle" dominant-baseline="middle">{{ team.label }}</text>
          </template>
        </template>
        <text v-if="segments.teams.length === 1" x="50" y="51" text-anchor="middle" dominant-baseline="middle">100%</text>
      </svg>
    </aside>
  `,
});
