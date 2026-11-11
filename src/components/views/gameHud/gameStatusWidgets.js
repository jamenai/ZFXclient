import { defineComponent } from "vue/dist/vue.esm-bundler.js";

export const GameStatusWidgets = defineComponent({
  name: "FxGameStatusWidgets",
  props: {
    rows: { type: Array, default: () => [] },
    statusCardStyle: { type: Function, required: true },
    formatted: { type: Function, required: true },
  },
  emits: ["start-move"],
  template: `
    <template v-for="row in rows" :key="row.key">
      <aside class="fx-game-status-item fx-game-status-card" :class="'is-' + row.key" :style="[statusCardStyle(row.key), row.densityColor ? { '--fx-game-density-color': row.densityColor } : null]" :aria-label="row.shortLabel || 'Spielstatus'">
        <div v-if="row.key === 'map-control'" class="fx-game-status-map-pair">
          <div class="fx-game-status-map-main" @pointerdown="$emit('start-move',$event,row.key)">
            <header class="fx-game-status-card-head">
              <span class="fx-game-status-icon" aria-hidden="true">{{ row.metrics.find(metric => metric.key === 'percentage')?.icon || '%' }}</span>
              <span class="fx-game-status-label">PERCENTAGE</span>
            </header>
            <strong class="fx-game-status-value">{{ row.metrics.find(metric => metric.key === 'percentage')?.value || '—' }}</strong>
          </div>
          <div class="fx-game-status-map-pixels"><span class="fx-game-status-icon" aria-hidden="true">{{ row.metrics.find(metric => metric.key === 'pixels')?.icon || '▦' }}</span><small>PIXELS</small><strong>{{ row.metrics.find(metric => metric.key === 'pixels')?.value || '—' }}</strong></div>
          <div class="fx-game-status-meter" role="meter" :aria-valuenow="Math.round(row.percentageFill)" aria-valuemin="0" aria-valuemax="100" aria-label="Map share"><span :style="{ width: row.percentageFill + '%' }"></span></div>
        </div>
        <template v-else>
          <header class="fx-game-status-card-head" @pointerdown="$emit('start-move',$event,row.key)">
            <span class="fx-game-status-icon" aria-hidden="true">{{ row.icon }}</span>
            <span v-if="row.key !== 'time'" class="fx-game-status-label">{{ row.shortLabel }}</span>
          </header>
          <strong v-if="row.key !== 'density' || (!row.maxTroops && !row.interest)" class="fx-game-status-value">{{ row.value }}</strong>
          <div v-else class="fx-game-status-density-values">
            <div v-if="row.value && row.value !== '—'" class="fx-game-status-density-main"><strong class="fx-game-status-value">{{ row.value }}</strong><small>troops / pixel</small></div>
            <div v-if="row.maxTroops" class="fx-game-status-max-troops"><span><small>MAX TROOPS</small><strong :title="row.maxTroops">{{ formatted(row.maxTroops) }}</strong></span></div>
            <div v-if="row.interest" class="fx-game-status-max-troops fx-game-status-interest"><span><small>INTEREST</small><strong>{{ row.interest }}</strong></span></div>
            <div v-if="row.value && row.value !== '—'" class="fx-game-status-meter" role="meter" :aria-valuenow="Math.round(row.densityFill)" aria-valuemin="0" aria-valuemax="100" aria-label="Density capacity"><span :style="{ width: row.densityFill + '%' }"></span></div>
          </div>
        </template>
      </aside>
    </template>
  `,
});
