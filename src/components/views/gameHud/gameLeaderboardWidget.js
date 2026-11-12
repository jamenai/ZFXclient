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
    showEliminated: { type: Boolean, default: true },
    showBots: { type: Boolean, default: true },
    activeTab: { type: String, default: "players" },
    ownClanRank: { type: Number, default: null },
    tabLabels: { type: Object, default: () => ({ players: "Players", rivals: "Rivals", teams: "Teams" }) },
    visibleRows: { type: Array, default: () => [] },
    topSpacerHeight: { type: Number, default: 0 },
    bottomSpacerHeight: { type: Number, default: 0 },
    playerFilter: { type: String, default: "all" },
    canFilterClan: { type: Boolean, default: false },
    canFilterTeam: { type: Boolean, default: false },
  },
  emits: ["start-move", "header-click", "toggle-collapsed", "go-top", "set-active-tab", "toggle-own-player-lock", "toggle-eliminated", "toggle-bots", "set-player-filter", "rows-scroll", "manual-scroll", "focus-player", "toggle-player-lock", "resize", "rows-container", "panel-element"],
  template: `
    <aside :ref="el => $emit('panel-element',el)" class="fx-game-leaderboard-hud" :style="panelStyle" aria-label="Game leaderboard">
      <header class="fx-game-leaderboard-head" role="button" tabindex="0" :aria-expanded="!collapsed" :aria-label="collapsed ? 'Leaderboard öffnen' : 'Leaderboard einklappen'" @pointerdown="$emit('start-move',$event)" @click="$emit('header-click',$event)" @keydown.enter.space.prevent="$emit('toggle-collapsed',$event)">
        <span class="fx-game-leaderboard-icon" aria-hidden="true">♛</span>
        <span v-if="!collapsed" class="fx-game-leaderboard-title"><small>PARTIE</small><strong>Leaderboard</strong></span>
        <span class="fx-game-leaderboard-counts" aria-label="Verbleibende Spieler">
          <span class="fx-game-leaderboard-count" title="Nicht eliminierte menschliche Spieler"><span aria-hidden="true">♟</span> {{ dataReady ? aliveHumanCount : '…' }}</span>
          <span class="fx-game-leaderboard-count" title="Nicht eliminierte Bots"><span aria-hidden="true">🤖</span> {{ dataReady ? aliveBotCount : '…' }}</span>
          <span class="fx-game-leaderboard-count" title="Zuschauer"><span aria-hidden="true">👁</span> {{ dataReady ? snapshot.spectatorCount : '…' }}</span>
          <span v-if="collapsed && dataReady" class="fx-game-placement-badge" :aria-label="'Dein Rang ' + (snapshot.ownRank || 'unbekannt')" title="Dein Rang"><i v-if="snapshot.ownPlayer?.color" class="fx-game-own-color" :style="{ backgroundColor: snapshot.ownPlayer.color }" aria-hidden="true"></i><strong>Du</strong><em>#{{ snapshot.ownRank || '—' }}</em></span>
          <span v-if="collapsed && dataReady && ownClanRank !== null" class="fx-game-placement-badge is-clan-rank" :aria-label="'Clan-Rang ' + ownClanRank" title="Dein Clan: Rivalenrang"><strong>Clan</strong><em>#{{ ownClanRank }}</em></span>
        </span>
      </header>



      <div v-if="!collapsed && dataReady" :ref="el => $emit('rows-container',el)" class="fx-game-leaderboard-rows" @scroll="$emit('rows-scroll',$event)" @wheel="$emit('manual-scroll',$event)" @touchstart="$emit('manual-scroll',$event)" @pointerdown="$emit('manual-scroll',$event)">
        <div class="fx-game-leaderboard-spacer" :style="{ height: topSpacerHeight + 'px' }" aria-hidden="true"></div>
        <div v-if="!rows.length" class="fx-game-leaderboard-empty">{{ activeTab === 'rivals' ? 'Keine Clans gefunden' : activeTab === 'teams' ? 'Keine Teams in dieser Partie' : 'Keine Spieler gefunden' }}</div>
        <div v-for="item in visibleRows" :key="item.id" class="fx-game-leaderboard-row-wrap" :class="{ 'is-own': activeTab === 'players' && item.isOwn, 'is-clanmate': activeTab === 'players' && item.isClanMate, 'is-eliminated': activeTab === 'players' && !item.isAlive, 'is-aggregate': activeTab !== 'players' }" :style="item.color ? { '--fx-game-player-color': item.color } : null">
          <template v-if="activeTab === 'players'">
            <button :data-player-id="item.id" type="button" class="fx-game-leaderboard-row" :title="'Auf Spieler ' + item.name + ' zentrieren'" @pointerdown.prevent @click="$emit('focus-player',item,$event)">
              <span class="fx-game-leaderboard-rank">{{ item.rank }}</span>
              <i class="fx-game-leaderboard-player-color" :style="item.color ? { backgroundColor: item.color } : null"></i>
              <span class="fx-game-leaderboard-name" :title="item.name"><span class="fx-game-leaderboard-type" :class="item.isBot ? 'is-bot' : 'is-human'" :title="item.isBot ? 'Bot' : 'Human'" :aria-label="item.isBot ? 'Bot' : 'Human'" aria-hidden="true"><span v-if="item.isBot">🤖</span><svg v-else viewBox="0 0 16 16"><circle cx="8" cy="5" r="3"></circle><path d="M2 15a6 6 0 0 1 12 0z"></path></svg></span><span v-if="item.isOwn" class="fx-game-leaderboard-player-badge is-you">YOU</span><span v-else-if="item.isClanMate" class="fx-game-leaderboard-player-badge is-clan">CLAN</span>{{ item.name }}</span>
              <span class="fx-game-leaderboard-territory">{{ formatted(item.territories) }}</span>
            </button>
            <button type="button" class="fx-game-leaderboard-lock" :class="{ 'is-locked': lockedPlayerId === item.id }" :aria-pressed="lockedPlayerId === item.id" :aria-label="lockedPlayerId === item.id ? 'Spieler nicht mehr fixieren' : 'Spieler in der Liste fixieren'" :title="lockedPlayerId === item.id ? 'Fixierung lösen' : 'Spielerposition fixieren'" @pointerdown.prevent @click="$emit('toggle-player-lock',item,$event)">{{ lockedPlayerId === item.id ? '🔒' : '⌖' }}</button>
          </template>
          <div v-else class="fx-game-leaderboard-aggregate-row">
            <span class="fx-game-leaderboard-rank">{{ item.rank }}</span>
            <i class="fx-game-leaderboard-player-color" :style="item.color ? { backgroundColor: item.color } : null"></i>
            <span class="fx-game-leaderboard-aggregate-name" :title="item.name">{{ item.name }}<small>{{ item.memberCount }} Spieler</small></span>
            <strong class="fx-game-leaderboard-territory">{{ formatted(item.territories) }}</strong>
          </div>
        </div>
        <div class="fx-game-leaderboard-spacer" :style="{ height: bottomSpacerHeight + 'px' }" aria-hidden="true"></div>
      </div>
      <div v-else-if="!collapsed" class="fx-game-leaderboard-loading" role="status">Spielerdaten werden geladen …</div>
      <footer v-if="!collapsed" class="fx-game-leaderboard-foot">
        <span>{{ activeTab === 'players' ? 'Spieler' : activeTab === 'rivals' ? 'Rivalen' : 'Teams' }}</span>
        <button type="button" class="fx-game-leaderboard-go-top" :disabled="!rows.length" @pointerdown.prevent @click="$emit('go-top',$event)"><span aria-hidden="true">↑</span> Go top</button>
      </footer>
      <nav v-if="!collapsed && activeTab === 'players'" class="fx-game-leaderboard-tools" aria-label="Leaderboard-Navigation">
        <button type="button" class="fx-game-own-rank-lock" :class="{ 'is-active': lockedPlayerId === snapshot?.ownPlayerId }" :aria-pressed="lockedPlayerId === snapshot?.ownPlayerId" :title="(snapshot?.ownPlayer?.color ? 'Deine Farbe: ' + snapshot.ownPlayer.color + '. ' : '') + (lockedPlayerId === snapshot?.ownPlayerId ? 'Eigenen Rang nicht mehr fixieren' : 'Eigenen Rang fixieren')" @pointerdown.prevent @click="$emit('toggle-own-player-lock',$event)"><i v-if="snapshot?.ownPlayer?.color" class="fx-game-own-color" :style="{ backgroundColor: snapshot.ownPlayer.color }" aria-hidden="true"></i><span aria-hidden="true">&#9811;</span><strong>#{{ dataReady ? (snapshot.ownRank || '—') : '—' }}</strong><i aria-hidden="true">{{ lockedPlayerId === snapshot?.ownPlayerId ? '🔒' : '⌖' }}</i></button>
        <button type="button" class="fx-game-eliminated-toggle" :class="{ 'is-active': showEliminated }" :aria-pressed="showEliminated" :aria-label="showEliminated ? 'Eliminierte Spieler ausblenden' : 'Eliminierte Spieler anzeigen'" :title="showEliminated ? 'Eliminierte Spieler werden angezeigt' : 'Eliminierte Spieler sind ausgeblendet'" @pointerdown.prevent @click="$emit('toggle-eliminated',$event)"><span aria-hidden="true">💀</span><i aria-hidden="true">{{ showEliminated ? '✓' : '×' }}</i></button>
        <button type="button" class="fx-game-bots-toggle" :class="{ 'is-active': showBots }" :aria-pressed="showBots" :aria-label="showBots ? 'Bots ausblenden' : 'Bots anzeigen'" :title="showBots ? 'Bots werden angezeigt' : 'Bots sind ausgeblendet'" @pointerdown.prevent @click="$emit('toggle-bots',$event)"><span aria-hidden="true">🤖</span><i aria-hidden="true">{{ showBots ? '✓' : '×' }}</i></button>
      </nav>
      <nav v-if="!collapsed && activeTab === 'players'" class="fx-game-leaderboard-filters" aria-label="Player filters">
        <button type="button" :class="{ 'is-active': playerFilter === 'all' }" :aria-pressed="playerFilter === 'all'" @pointerdown.prevent @click="$emit('set-player-filter','all',$event)">All</button>
        <button type="button" :class="{ 'is-active': playerFilter === 'clan' }" :aria-pressed="playerFilter === 'clan'" :disabled="!canFilterClan" title="Spieler aus deinem Clan anzeigen" @pointerdown.prevent @click="$emit('set-player-filter','clan',$event)">Clan</button>
        <button type="button" :class="{ 'is-active': playerFilter === 'team' }" :aria-pressed="playerFilter === 'team'" :disabled="!canFilterTeam" title="Spieler aus deinem Team anzeigen" @pointerdown.prevent @click="$emit('set-player-filter','team',$event)">Team</button>
      </nav>
      <nav v-if="!collapsed" class="fx-game-leaderboard-tabs" role="tablist" aria-label="Leaderboard-Ansichten">
        <button type="button" role="tab" :class="{ 'is-active': activeTab === 'players' }" :aria-selected="activeTab === 'players'" @pointerdown.prevent @click="$emit('set-active-tab','players',$event)">{{ tabLabels.players }}</button>
        <button type="button" role="tab" :class="{ 'is-active': activeTab === 'rivals' }" :aria-selected="activeTab === 'rivals'" @pointerdown.prevent @click="$emit('set-active-tab','rivals',$event)">{{ tabLabels.rivals }}</button>
        <button type="button" role="tab" :class="{ 'is-active': activeTab === 'teams' }" :aria-selected="activeTab === 'teams'" @pointerdown.prevent @click="$emit('set-active-tab','teams',$event)">{{ tabLabels.teams }}</button>
      </nav>
      <button v-if="!collapsed" type="button" class="fx-game-leaderboard-resize" aria-label="Resize leaderboard" title="Drag to resize" @pointerdown="$emit('resize',$event)" @click.prevent tabindex="-1"></button>
    </aside>
  `,
});
