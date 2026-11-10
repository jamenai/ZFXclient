import { defineComponent } from "vue/dist/vue.esm-bundler.js";

export const ClanOverview = defineComponent({
  props: { clan: String, readyCount: Number, memberCount: Number, members: Array, labels: Object },
  emits: ["select-player"],
  methods: {
    statusClass(player) {
      return player?.participation === "spectator" ? "is-spectator" : `is-${player?.readiness || "unknown"}`;
    },
  },
  template: `
    <aside class="fx-custom-lobby-side-panel">
      <article class="fx-custom-lobby-card fx-custom-lobby-clan-card">
        <header class="fx-custom-lobby-clan-heading">
          <span class="fx-custom-lobby-card-icon" aria-hidden="true">♜</span>
          <div class="fx-custom-lobby-clan-title"><h2>{{ labels.clanTitle }}</h2><span v-if="clan" class="fx-custom-lobby-clan-tag">{{ clan }}</span></div>
          <div class="fx-custom-lobby-clan-ready" :aria-label="readyCount + ' / ' + memberCount + ' ' + labels.ready.toLowerCase()">
            <span class="fx-custom-lobby-clan-ready-value">{{ readyCount }}<span class="fx-custom-lobby-clan-ready-total"> / {{ memberCount }}</span></span>
            <span class="fx-custom-lobby-clan-ready-label">{{ labels.ready }}</span>
          </div>
        </header>
        <div class="fx-custom-lobby-clan-members"><button v-for="player in members" :key="player.id || player.name" type="button" class="fx-custom-lobby-clan-member" :title="player.participation === 'spectator' || player.readiness === 'other-entry' ? (player.readyEntryLabel || player.title || player.name) : (player.title || player.name)" :style="player.color ? { color: player.color } : null" @click.stop.prevent="$emit('select-player', player, $event)"><i class="fx-custom-lobby-status-dot" :class="statusClass(player)"></i>{{ player.name }}</button><p v-if="!clan" class="fx-custom-lobby-clan-empty">{{ labels.noClan }}</p><p v-else-if="!members.length" class="fx-custom-lobby-clan-empty">{{ labels.noClanMembers }}</p></div>
      </article>
    </aside>`,
});
