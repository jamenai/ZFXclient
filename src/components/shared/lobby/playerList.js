import { defineComponent } from "vue/dist/vue.esm-bundler.js";
import { GameModeBadge } from "./gameModeBadge.js";
import { LobbyChat } from "./lobbyChat.js";

function readStoredFilterState(key) {
  try { return localStorage.getItem(key) === "true"; } catch { return false; }
}

export const PlayerList = defineComponent({
  name: "LobbyWorkspace",
  components: { GameModeBadge, LobbyChat },
  props: {
    players: Array, lobbyPlayers: Array, clanLobbyPlayers: Array, allPlayers: Array, clans: Array, labels: Object,
    playerCountLabel: String, watcherCount: Number, lobbyCount: Number, gameClanCount: Number,
    clanGamePlayers: Array,
    gameQuery: String, lobbyQuery: String, sortBy: String,
    lobbyReadyFilter: String, affiliationFilter: String, entryFilter: String,
    currentEntryAvailable: Boolean, gameTab: String, lobbyTab: String,
    chatMessages: Array, chatStatus: String, teamClan: String,
    clanCount: String, topReadyClan: Object, onlyReadyClans: Boolean,
    currentMap: String, nextMap: String, nextTeamCount: String,
  },
  emits: [
    "update:game-query", "update:lobby-query", "update:sort", "update:lobby-ready-filter", "update:affiliation-filter", "update:entry-filter",
    "reset-filter-groups", "reset-filters", "filter-ready-clans", "select-player",
    "follow-join", "select-game-tab", "select-lobby-tab", "send-chat", "send-call",
    "send-join", "send-team-message",
  ],
  data() { return {
    gameFiltersCollapsed: readStoredFilterState("fx_lobby_game_filters_collapsed"),
    lobbyFiltersCollapsed: readStoredFilterState("fx_lobby_people_filters_collapsed"),
    teamMessage: "",
    teamMessageStatus: "",
    spawnDirections: [
      { key: "topLeft", labelKey: "topLeft", icon: "↖", column: 1, row: 1 },
      { key: "top", labelKey: "top", icon: "↑", column: 2, row: 1 },
      { key: "topRight", labelKey: "topRight", icon: "↗", column: 3, row: 1 },
      { key: "left", labelKey: "left", icon: "←", column: 1, row: 2 },
      { key: "center", labelKey: "center", icon: "•", column: 2, row: 2 },
      { key: "right", labelKey: "right", icon: "→", column: 3, row: 2 },
      { key: "bottomLeft", labelKey: "bottomLeft", icon: "↙", column: 1, row: 3 },
      { key: "bottom", labelKey: "bottom", icon: "↓", column: 2, row: 3 },
      { key: "bottomRight", labelKey: "bottomRight", icon: "↘", column: 3, row: 3 },
    ],
  }; },
  computed: {
    visiblePlayers() {
      return this.gameTab === "clan" ? (this.clanGamePlayers || []) : (this.players || []);
    },
    topReadyPlayers() {
      return [...(this.players || [])]
        .filter(player => player.readiness === "ready" && player.participation !== "spectator")
        .sort((left, right) => (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY)
          || left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
        .slice(0, 3);
    },
  },
  methods: {
    statusClass(player) {
      return player?.participation === "spectator" ? "is-spectator" : `is-${player?.readiness || "unknown"}`;
    },
    readyEntrySummary(player) {
      const parts = [];
      if (player?.readyEntryModeLabel) parts.push(player.readyEntryModeLabel);
      if (player?.readyEntryMapName) parts.push(player.readyEntryMapName);
      else if (!player?.readyEntryModeLabel && player?.readyEntryLabel) parts.push(player.readyEntryLabel);
      if (player?.readyEntryTeamCountLabel) parts.push(player.readyEntryTeamCountLabel);
      return parts.join(" - ");
    },
    toggleFilterBar(scope) {
      const stateKey = scope === "game" ? "gameFiltersCollapsed" : "lobbyFiltersCollapsed";
      const storageKey = scope === "game" ? "fx_lobby_game_filters_collapsed" : "fx_lobby_people_filters_collapsed";
      this[stateKey] = !this[stateKey];
      try { localStorage.setItem(storageKey, String(this[stateKey])); } catch { /* Keep filter controls usable if storage is unavailable. */ }
    },
    openPlayer(player, event) { this.$emit("select-player", player, event); },
    sendTeamMessage() {
      const message = this.teamMessage.trim();
      if (!message || !this.teamClan) return;
      this.teamMessageStatus = "";
      this.$emit("send-team-message", message, sent => {
        this.teamMessageStatus = sent ? this.labels.messageSent : this.labels.messageSendFailed;
        if (sent) this.teamMessage = "";
      });
    },
    insertMentionToken(token) { return this.$refs.lobbyChat?.insertMentionToken(token) ?? false; },
  },
  template: `
    <div class="fx-custom-lobby-split-workspace">
      <section class="fx-custom-lobby-player-panel fx-custom-lobby-workspace fx-custom-lobby-game-panel">
        <header class="fx-custom-lobby-panel-scope is-game"><span class="fx-custom-lobby-panel-scope-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 8h10a4 4 0 0 1 3.8 5.3l-1 3a2 2 0 0 1-3.4.7l-1.5-1.5h-3.8l-1.5 1.5a2 2 0 0 1-3.4-.7l-1-3A4 4 0 0 1 7 8Z"/><path d="M8 11v4m-2-2h4m7-1h.01M18 14h.01"/></svg></span><span class="fx-custom-lobby-panel-scope-copy"><strong>{{ labels.gamePanel }}</strong><small>{{ labels.gamePanelHint }}</small></span><nav class="fx-custom-lobby-workspace-tabs" :aria-label="labels.gameMode">
          <button type="button" data-tab="overview" :class="{ 'is-active': gameTab === 'overview' }" :aria-selected="gameTab === 'overview'" @click="$emit('select-game-tab', 'overview')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg><span class="fx-custom-lobby-tab-label">{{ labels.overview }}</span></button>
          <button type="button" data-tab="players" :class="{ 'is-active': gameTab === 'players' }" :aria-selected="gameTab === 'players'" @click="$emit('select-game-tab', 'players')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2Z"/></svg><span class="fx-custom-lobby-tab-label">{{ labels.players }}</span> <span class="fx-custom-lobby-tab-count">{{ playerCountLabel }}</span></button>
          <button type="button" data-tab="watchers" :class="{ 'is-active': gameTab === 'watchers' }" :aria-selected="gameTab === 'watchers'" @click="$emit('select-game-tab', 'watchers')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg><span class="fx-custom-lobby-tab-label">{{ labels.watchers }}</span> <span class="fx-custom-lobby-tab-count">{{ watcherCount }}</span></button>
          <button type="button" data-tab="clan" :class="{ 'is-active': gameTab === 'clan' }" :aria-selected="gameTab === 'clan'" @click="$emit('select-game-tab', 'clan')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 6v5.2c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6Z"/><path d="M8 12h8M12 8v8"/></svg><span class="fx-custom-lobby-tab-label">{{ labels.team }}</span> <span class="fx-custom-lobby-tab-count">{{ gameClanCount }}</span></button>
          <button type="button" data-tab="calls" :class="{ 'is-active': gameTab === 'calls' }" :aria-selected="gameTab === 'calls'" @click="$emit('select-game-tab', 'calls')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l10 5V5L7 10H3Z"/><path d="M7 14l1.5 6h3L10 14m7-4a4 4 0 0 1 0 4"/></svg><span class="fx-custom-lobby-tab-label">{{ labels.calls }}</span></button><button v-if="gameTab === 'players' || gameTab === 'watchers'" type="button" class="fx-custom-lobby-filter-tab-toggle" :aria-expanded="!gameFiltersCollapsed" :aria-label="gameFiltersCollapsed ? labels.showFilters : labels.hideFilters" :title="gameFiltersCollapsed ? labels.showFilters : labels.hideFilters" @click="toggleFilterBar('game')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z"/></svg></button></nav></header>
        <section v-if="gameTab === 'overview'" class="fx-custom-lobby-overview fx-custom-lobby-panel-content">
          <div class="fx-custom-lobby-overview-stats"><article class="is-players"><span>{{ labels.players }}</span><strong>{{ playerCountLabel }}</strong></article><article class="is-clans"><span>{{ labels.clan }}</span><strong>{{ gameClanCount }}</strong></article></div>
          <section class="fx-custom-lobby-overview-top-ready"><header><div><h2>{{ labels.topReadyPlayers }}</h2><p>{{ labels.overviewLeadersNote }}</p></div><span class="fx-custom-lobby-overview-count">{{ topReadyPlayers.length }} / 3</span></header><ol v-if="topReadyPlayers.length"><li v-for="(player, index) in topReadyPlayers" :key="player.id || player.name" :class="{ 'is-self': player.self }"><span class="fx-custom-lobby-overview-place" :class="'is-place-' + (index + 1)">{{ String(index + 1).padStart(2, '0') }}</span><span class="fx-custom-lobby-overview-name"><i class="fx-custom-lobby-status-dot is-ready"></i><strong>{{ player.name }}</strong><small>{{ player.rankText || (player.rank ? '#' + player.rank.toLocaleString() : '-') }}</small></span><span v-if="player.clan" class="fx-custom-lobby-overview-clan">[{{ player.clan }}]</span></li></ol><p v-else class="fx-custom-lobby-empty">{{ labels.noReadyPlayers }}</p></section>
        </section>
        <section v-else-if="gameTab === 'players' || gameTab === 'watchers' || gameTab === 'clan'" class="fx-custom-lobby-roster-view fx-custom-lobby-panel-content" :class="{ 'is-single-game-roster': gameTab === 'players' || gameTab === 'watchers' }">
          <div v-if="gameTab !== 'clan'" v-show="!gameFiltersCollapsed" class="fx-custom-lobby-player-header"><input type="search" :value="gameQuery" :placeholder="labels.search" :aria-label="labels.search" @input="$emit('update:game-query', $event.target.value)"><span class="fx-custom-lobby-player-count">{{ visiblePlayers.length }}</span></div>
          <div class="fx-custom-lobby-player-grid">
            <article v-for="(player, index) in visiblePlayers" :key="player.id || player.name + ':' + index" class="fx-custom-lobby-player-grid-card" :class="{ 'is-self': player.self }" :style="{ '--fx-custom-player-color': player.color || null, '--fx-custom-player-territory-border': player.territoryBorderColor || null }" :title="player.title || player.name" @click.stop.prevent="openPlayer(player, $event)"><header><i class="fx-custom-lobby-status-dot" :class="statusClass(player)"></i><strong>{{ player.name }}</strong><small v-if="player.rankText || player.rank" class="fx-custom-lobby-player-rank">{{ player.rankText || '#' + player.rank.toLocaleString() }}</small></header><div class="fx-custom-lobby-player-grid-meta"><span class="fx-custom-lobby-player-status" :class="statusClass(player)">{{ player.participation === 'spectator' ? labels.spectator : player.readiness === 'ready' ? labels.ready : player.readiness === 'not-ready' ? labels.waiting : labels.online }}</span><small v-if="player.readyEntryLabel" class="fx-custom-lobby-player-entry-meta"><GameModeBadge v-if="player.readyEntryModeKey" :mode-key="player.readyEntryModeKey" :label="player.readyEntryModeLabel" compact /><span>{{ readyEntrySummary(player) }}</span></small></div></article>
            <p v-if="!visiblePlayers.length" class="fx-custom-lobby-empty">{{ gameTab === 'clan' ? (teamClan ? labels.noGameClanMembers : labels.noClan) : labels.noPlayers }}</p>
          </div>
        </section>
        <section v-else class="fx-custom-lobby-calls-view fx-custom-lobby-panel-content">
          <section class="fx-custom-lobby-call-section fx-custom-lobby-call-spawn-section"><header class="fx-custom-lobby-call-heading"><h3>{{ labels.spawnDirections }}</h3><p>{{ labels.spawnCallHint }}</p></header><div class="fx-custom-lobby-call-compass" role="group" :aria-label="labels.spawnDirections"><button v-for="direction in spawnDirections" :key="direction.key" type="button" :class="{ 'is-center': direction.key === 'center' }" :style="{ gridColumn: direction.column, gridRow: direction.row }" :disabled="!teamClan || !currentMap" :aria-label="labels[direction.labelKey]" :title="labels[direction.labelKey]" @click="$emit('send-call', direction.key)"><span>{{ direction.icon }}</span></button></div></section>
          <section class="fx-custom-lobby-call-section fx-custom-lobby-call-message-section"><header class="fx-custom-lobby-call-heading"><h3>{{ labels.team }}</h3><p>{{ labels.teamMessagePlaceholder }}</p></header><form class="fx-custom-lobby-call-message" @submit.stop.prevent="sendTeamMessage"><input v-model="teamMessage" type="text" :maxlength="110" :placeholder="labels.teamMessagePlaceholder" :aria-label="labels.teamMessagePlaceholder" :disabled="!teamClan" @keydown.stop @keyup.stop @keypress.stop><button type="submit" :disabled="!teamClan || !teamMessage.trim()">{{ labels.send }}</button><span v-if="teamMessageStatus" role="status">{{ teamMessageStatus }}</span></form><div class="fx-custom-lobby-call-join-group"><header class="fx-custom-lobby-call-join-heading"><h3>{{ labels.join }}</h3></header><div class="fx-custom-lobby-call-actions"><button type="button" :disabled="!teamClan" @click="$emit('send-join', 'cont')">{{ labels.joinCont }}</button><button type="button" :disabled="!teamClan" @click="$emit('send-join', 'current')">{{ labels.join }}</button><button type="button" :disabled="!teamClan || !nextMap || !nextTeamCount" @click="$emit('send-join', 'next')">{{ labels.joinNext.replace('{map}', nextMap || labels.nextGame).replace('{count}', (nextTeamCount || '').replace(/\s*teams?$/i, '') || '?') }}</button></div></div></section>
        </section>
      </section>

      <section class="fx-custom-lobby-player-panel fx-custom-lobby-workspace fx-custom-lobby-lobby-panel">
        <header class="fx-custom-lobby-panel-scope is-lobby"><span class="fx-custom-lobby-panel-scope-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M15 15.5a5 5 0 0 1 6.5 4.5"/></svg></span><span class="fx-custom-lobby-panel-scope-copy"><strong>{{ labels.lobbyPanel }}</strong><small>{{ labels.lobbyPanelHint }}</small></span><nav class="fx-custom-lobby-workspace-tabs" :aria-label="labels.lobbyViews">
          <button type="button" data-tab="chat" :class="{ 'is-active': lobbyTab === 'chat' }" :aria-selected="lobbyTab === 'chat'" @click="$emit('select-lobby-tab', 'chat')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 10h8M8 14h5"/></svg><span class="fx-custom-lobby-tab-label">{{ labels.chat }}</span></button>
          <button type="button" data-tab="lobby" :class="{ 'is-active': lobbyTab === 'lobby' }" :aria-selected="lobbyTab === 'lobby'" @click="$emit('select-lobby-tab', 'lobby')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M15 15.5a5 5 0 0 1 6.5 4.5"/></svg><span class="fx-custom-lobby-tab-label">{{ labels.people }}</span> <span class="fx-custom-lobby-tab-count">{{ lobbyCount }}</span></button>
          <button type="button" data-tab="clan" :class="{ 'is-active': lobbyTab === 'clan' }" :aria-selected="lobbyTab === 'clan'" @click="$emit('select-lobby-tab', 'clan')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 6v5.2c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6Z"/><path d="M8 12h8M12 8v8"/></svg><span class="fx-custom-lobby-tab-label">{{ labels.clan }}</span> <span class="fx-custom-lobby-tab-count">{{ clanLobbyPlayers?.length || 0 }}</span></button>
          <button type="button" data-tab="clans" :class="{ 'is-active': lobbyTab === 'clans' }" :aria-selected="lobbyTab === 'clans'" @click="$emit('select-lobby-tab', 'clans')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 6v5.2c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6Z"/><path d="M8 12h8M12 8v8"/></svg><span class="fx-custom-lobby-tab-label">{{ labels.clans }}</span> <span class="fx-custom-lobby-tab-count">{{ clanCount }}</span></button><button v-if="lobbyTab === 'lobby'" type="button" class="fx-custom-lobby-filter-tab-toggle" :aria-expanded="!lobbyFiltersCollapsed" :aria-label="lobbyFiltersCollapsed ? labels.showFilters : labels.hideFilters" :title="lobbyFiltersCollapsed ? labels.showFilters : labels.hideFilters" @click="toggleFilterBar('lobby')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z"/></svg></button></nav></header>
        <LobbyChat v-if="lobbyTab === 'chat'" ref="lobbyChat" :labels="labels" :messages="chatMessages || []" :status="chatStatus" @send="(message, callback) => $emit('send-chat', message, callback)" />
        <section v-else-if="lobbyTab === 'lobby'" class="fx-custom-lobby-roster-view fx-custom-lobby-panel-content">
          <div v-show="!lobbyFiltersCollapsed" class="fx-custom-lobby-player-header"><input type="search" :value="lobbyQuery" :placeholder="labels.search" :aria-label="labels.search" @input="$emit('update:lobby-query', $event.target.value)"><select :value="sortBy" :aria-label="labels.sort" @change="$emit('update:sort', $event.target.value)"><option value="rank-desc">{{ labels.sortRankDesc }}</option><option value="rank-asc">{{ labels.sortRankAsc }}</option><option value="name">{{ labels.sortName }}</option></select><div class="fx-custom-lobby-filter-toolbar fx-custom-lobby-ready-filter" role="group" :aria-label="labels.readinessFilters" :data-filter-label="labels.readinessFilters"><button type="button" :class="{ 'is-active': lobbyReadyFilter === 'all' }" @click="$emit('update:lobby-ready-filter', 'all')">{{ labels.all }}</button><button type="button" :class="{ 'is-active': lobbyReadyFilter === 'waiting' }" @click="$emit('update:lobby-ready-filter', 'waiting')">{{ labels.waiting }}</button><button type="button" :class="{ 'is-active': lobbyReadyFilter === 'joined' }" @click="$emit('update:lobby-ready-filter', 'joined')">{{ labels.players }}</button><button type="button" :class="{ 'is-active': lobbyReadyFilter === 'spectator' }" @click="$emit('update:lobby-ready-filter', 'spectator')">{{ labels.spectator }}</button></div><div class="fx-custom-lobby-filter-toolbar fx-custom-lobby-affiliation-filter" role="group" :aria-label="labels.affiliationFilters" :data-filter-label="labels.affiliationFilters"><button type="button" :class="{ 'is-active': affiliationFilter === 'all' }" @click="$emit('update:affiliation-filter', 'all')">{{ labels.all }}</button><button type="button" :class="{ 'is-active': affiliationFilter === 'clan' }" @click="$emit('update:affiliation-filter', 'clan')">{{ labels.clan }}</button><button type="button" :class="{ 'is-active': affiliationFilter === 'followed' }" @click="$emit('update:affiliation-filter', 'followed')">{{ labels.followed }}</button></div><div class="fx-custom-lobby-filter-toolbar fx-custom-lobby-entry-filter" role="group" :aria-label="labels.gameFilters" :data-filter-label="labels.gameFilters"><button type="button" :class="{ 'is-active': entryFilter === 'all' }" @click="$emit('update:entry-filter', 'all')">{{ labels.allGames }}</button><button type="button" :class="{ 'is-active': entryFilter === 'current' }" :disabled="!currentEntryAvailable" @click="$emit('update:entry-filter', 'current')">{{ labels.currentMapSelection }}</button></div><button type="button" class="fx-custom-lobby-filter-reset" @click="$emit('reset-filters')">{{ labels.resetFilters }}</button></div>
          <div class="fx-custom-lobby-player-grid"><article v-for="(player, index) in lobbyPlayers" :key="player.id || player.name + ':' + index" class="fx-custom-lobby-player-grid-card" :class="{ 'is-self': player.self }" :style="{ '--fx-custom-player-color': player.color || null, '--fx-custom-player-territory-border': player.territoryBorderColor || null }" :title="player.title || player.name" @click.stop.prevent="openPlayer(player, $event)"><header><i class="fx-custom-lobby-status-dot" :class="statusClass(player)"></i><strong>{{ player.name }}</strong><small v-if="player.rankText || player.rank" class="fx-custom-lobby-player-rank">{{ player.rankText || '#' + player.rank.toLocaleString() }}</small></header><div class="fx-custom-lobby-player-grid-meta"><span class="fx-custom-lobby-player-status" :class="statusClass(player)">{{ player.participation === 'spectator' ? labels.spectator : player.readiness === 'ready' ? labels.ready : player.readiness === 'not-ready' ? labels.waiting : labels.online }}</span><small v-if="player.readyEntryLabel" class="fx-custom-lobby-player-entry-meta"><GameModeBadge v-if="player.readyEntryModeKey" :mode-key="player.readyEntryModeKey" :label="player.readyEntryModeLabel" compact /><span>{{ readyEntrySummary(player) }}</span></small><small v-if="player.clan">[{{ player.clan }}]</small></div></article><p v-if="!lobbyPlayers?.length" class="fx-custom-lobby-empty">{{ labels.noPlayers }}</p></div>
        </section>
        <section v-else-if="lobbyTab === 'clan'" class="fx-custom-lobby-roster-view fx-custom-lobby-panel-content"><div class="fx-custom-lobby-player-grid"><article v-for="(player, index) in clanLobbyPlayers" :key="player.id || player.name + ':' + index" class="fx-custom-lobby-player-grid-card" :class="{ 'is-self': player.self }" :style="{ '--fx-custom-player-color': player.color || null, '--fx-custom-player-territory-border': player.territoryBorderColor || null }" :title="player.title || player.name" @click.stop.prevent="openPlayer(player, $event)"><header><i class="fx-custom-lobby-status-dot" :class="statusClass(player)"></i><strong>{{ player.name }}</strong><small v-if="player.rankText || player.rank" class="fx-custom-lobby-player-rank">{{ player.rankText || '#' + player.rank.toLocaleString() }}</small></header><div class="fx-custom-lobby-player-grid-meta"><span class="fx-custom-lobby-player-status" :class="statusClass(player)">{{ player.participation === 'spectator' ? labels.spectator : player.participation === 'joined' ? labels.players : player.readiness === 'ready' ? labels.ready : player.readiness === 'not-ready' ? labels.waiting : labels.online }}</span><small v-if="player.readyEntryLabel" class="fx-custom-lobby-player-entry-meta"><GameModeBadge v-if="player.readyEntryModeKey" :mode-key="player.readyEntryModeKey" :label="player.readyEntryModeLabel" compact /><span>{{ readyEntrySummary(player) }}</span></small></div></article><p v-if="!clanLobbyPlayers?.length" class="fx-custom-lobby-empty">{{ teamClan ? labels.noClanMembers : labels.noClan }}</p></div></section>
        <section v-else class="fx-custom-lobby-clans-view fx-custom-lobby-panel-content"><div class="fx-custom-lobby-filters fx-custom-lobby-clan-filters" role="group" :aria-label="labels.clans"><button type="button" :class="{ 'is-active': !onlyReadyClans }" @click="$emit('filter-ready-clans', false)">{{ labels.all }}</button><button type="button" :class="{ 'is-active': onlyReadyClans }" @click="$emit('filter-ready-clans', true)">{{ labels.onlyReadyClans }}</button></div><div class="fx-custom-lobby-player-grid"><article v-for="clan in clans" :key="clan.tag" class="fx-custom-lobby-player-grid-card"><header><strong>[{{ clan.tag }}]</strong><small>{{ clan.readyCount }} / {{ clan.players.length }} {{ labels.ready.toLowerCase() }}</small></header><div class="fx-custom-lobby-player-grid-meta"><span>{{ clan.players.length }} {{ labels.players.toLowerCase() }}</span></div></article><p v-if="!clans?.length" class="fx-custom-lobby-empty">{{ onlyReadyClans ? labels.noReadyClans : labels.noClans }}</p></div></section>
      </section>
    </div>`,
});
