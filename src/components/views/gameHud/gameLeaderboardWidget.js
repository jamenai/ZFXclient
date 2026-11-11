import { defineComponent } from "vue/dist/vue.esm-bundler.js";

export const GameLeaderboardWidget = defineComponent({
  name: "FxGameLeaderboardWidget",
  props: {
    panelStyle: { type: Object, required: true },
    collapsed: { type: Boolean, required: true },
    dataReady: { type: Boolean, required: true },
    snapshot: { type: Object, default: null },
    rows: { type: Array, default: () => [] },
    formatted: { type: Function, required: true },
    aliveHumanCount: { type: [Number, String], default: null },
    aliveBotCount: { type: [Number, String], default: null },
    lockedPlayerId: { type: [Number, String], default: null },
  },
  emits: ["start-move", "header-click", "toggle-collapsed", "find-me", "go-top", "manual-scroll", "focus-player", "toggle-player-lock", "resize", "rows-container", "panel-element"],
  template: `
    <aside :ref="el => $emit('panel-element',el)" class="fx-game-leaderboard-hud" :style="panelStyle" aria-label="Game leaderboard">
      <header class="fx-game-leaderboard-head" role="button" tabindex="0" :aria-expanded="!collapsed" :aria-label="collapsed ? 'Leaderboard öffnen' : 'Leaderboard einklappen'" @pointerdown="$emit('start-move',$event)" @click="$emit('header-click',$event)" @keydown.enter.space.prevent="$emit('toggle-collapsed',$event)">
        <span class="fx-game-leaderboard-icon" aria-hidden="true">♛</span>
        <span v-if="!collapsed" class="fx-game-leaderboard-title"><small>PARTIE</small><strong>Leaderboard</strong></span>
        <span class="fx-game-leaderboard-counts" aria-label="Verbleibende Spieler">
          <span class="fx-game-leaderboard-count" title="Nicht eliminierte menschliche Spieler"><span aria-hidden="true">♟</span> {{ dataReady ? aliveHumanCount : '…' }}</span>
          <span class="fx-game-leaderboard-count" title="Nicht eliminierte Bots"><span aria-hidden="true">🤖</span> {{ dataReady ? aliveBotCount : '…' }}</span>
          <span class="fx-game-leaderboard-count" title="Zuschauer"><span aria-hidden="true">👁</span> {{ dataReady ? snapshot.spectatorCount : '…' }}</span>
        </span>
      </header>
      <nav v-if="!collapsed" class="fx-game-leaderboard-tools" aria-label="Leaderboard-Navigation">
        <button type="button" @pointerdown.prevent @click="$emit('find-me',$event)"><span aria-hidden="true">⌖</span> Find me</button>
        <button type="button" @pointerdown.prevent @click="$emit('go-top',$event)"><span aria-hidden="true">↑</span> Go top</button>
      </nav>
      <div v-if="!collapsed && dataReady" :ref="el => $emit('rows-container',el)" class="fx-game-leaderboard-rows" @wheel="$emit('manual-scroll',$event)" @touchstart="$emit('manual-scroll',$event)" @pointerdown="$emit('manual-scroll',$event)">
        <div v-for="player in rows" :key="player.id" class="fx-game-leaderboard-row-wrap" :class="{ 'is-own': player.isOwn, 'is-eliminated': !player.isAlive }" :style="player.color ? { '--fx-game-player-color': player.color } : null">
          <button :data-player-id="player.id" type="button" class="fx-game-leaderboard-row" :title="'Auf Spieler ' + player.name + ' zentrieren'" @pointerdown.prevent @click="$emit('focus-player',player,$event)">
            <span class="fx-game-leaderboard-rank">{{ player.rank }}</span>
            <i class="fx-game-leaderboard-player-color" :style="player.color ? { backgroundColor: player.color } : null"></i>
            <span class="fx-game-leaderboard-name" :title="player.name"><span class="fx-game-leaderboard-type" :class="player.isBot ? 'is-bot' : 'is-human'" :title="player.isBot ? 'Bot' : 'Human'" :aria-label="player.isBot ? 'Bot' : 'Human'" aria-hidden="true"><span v-if="player.isBot">🤖</span><svg v-else viewBox="0 0 16 16"><circle cx="8" cy="5" r="3"></circle><path d="M2 15a6 6 0 0 1 12 0z"></path></svg></span>{{ player.name }}</span>
            <span class="fx-game-leaderboard-territory">{{ formatted(player.territories) }}</span>
          </button>
          <button type="button" class="fx-game-leaderboard-lock" :class="{ 'is-locked': lockedPlayerId === player.id }" :aria-pressed="lockedPlayerId === player.id" :aria-label="lockedPlayerId === player.id ? 'Spieler nicht mehr fixieren' : 'Spieler in der Liste fixieren'" :title="lockedPlayerId === player.id ? 'Fixierung lösen' : 'Spielerposition fixieren'" @pointerdown.prevent @click="$emit('toggle-player-lock',player,$event)">{{ lockedPlayerId === player.id ? '🔒' : '⌖' }}</button>
        </div>
      </div>
      <div v-else-if="!collapsed" class="fx-game-leaderboard-loading" role="status">Spielerdaten werden geladen …</div>
      <footer v-if="!collapsed" class="fx-game-leaderboard-foot">
        <span>Dein Rang</span><strong>#{{ dataReady ? (snapshot.ownRank || '—') : '—' }}</strong>
      </footer>
      <button v-if="!collapsed" type="button" class="fx-game-leaderboard-resize" aria-label="Resize leaderboard" title="Drag to resize" @pointerdown="$emit('resize',$event)" @click.prevent tabindex="-1"></button>
    </aside>
  `,
});
