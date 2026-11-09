import { defineComponent } from "vue/dist/vue.esm-bundler.js";

export const LobbyPlayerName = defineComponent({
  props: { name: String, color: String },
  emits: ["activate"],
  template: `<button type="button" class="fx-custom-lobby-chat-player-name" :style="color ? { color } : null" @click.stop="$emit('activate', $event)">{{ name }}</button>`,
});

const GameModeBadge = defineComponent({
  props: { modeKey: String, label: String, standalone: Boolean },
  template: `
    <span class="fx-custom-lobby-mode-emblem" :class="{ 'is-standalone': standalone }" :data-mode="modeKey || 'unknown'" role="img" :aria-label="label || ''" :title="label || ''">
      <svg v-if="modeKey === 'team'" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/></svg>
      <svg v-else-if="modeKey === 'battle-royale'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/></svg>
      <svg v-else-if="modeKey === 'duel'" viewBox="0 0 24 24"><path d="m4 20 10-10m-6 0 6 6m-2-12 8 8m-5-9 6 6m-13 6-4 4m12-12 4-4"/></svg>
      <svg v-else-if="modeKey === 'zombie'" viewBox="0 0 24 24"><path d="M12 3a8 8 0 0 0-5 14.2V21h3v-2h4v2h3v-3.8A8 8 0 0 0 12 3Z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/><path d="M10 15h4"/></svg>
      <svg v-else viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/></svg>
    </span>`,
});

export const MapHeader = defineComponent({
  components: { GameModeBadge },
  props: { map: String, mapImage: String, nextMap: String, nextMapImage: String, nextTeamCountLabel: String, nextGameModeLabel: String, gameModeKey: String, nextGameModeKey: String, nextGameMeta: String, isContest: Boolean, nextIsContest: null, noFullsend: Boolean, nextNoFullsend: Boolean, labels: Object, entries: Array, currentMapEntryId: Number, selectedGameJoined: Boolean, selectionDisabled: Boolean, entryTitle: Function, readyCount: Number, readyClans: Array, readyClanTotal: Number, teamCount: String, gameModeLabel: String, lobbyRating: Object },
  emits: ["select-entry", "join-selected"],
  template: `
    <header class="fx-custom-lobby-top">
      <nav class="fx-custom-lobby-modes fx-custom-lobby-entries" :aria-label="labels.upcomingGames">
        <button v-for="entry in visibleEntries" :key="entry.id ?? entry.index" type="button"
          class="fx-custom-lobby-mode fx-custom-lobby-entry" :class="{ 'is-active': entry.active, 'is-next': entry.selected, 'is-contest': entry.isContest }" :data-mode="entry.modeKey" :data-next-game="entry.selected ? 'true' : 'false'"
          :aria-pressed="entry.active" @click="$emit('select-entry', entry)">
          <img v-if="entry.mapImage" class="fx-custom-lobby-entry-map-image" :src="entry.mapImage" alt="" aria-hidden="true">
          <span class="fx-custom-lobby-mode-meta">
            <span v-if="entry.countdownSeconds != null" class="fx-custom-lobby-mode-clock">{{ formatCountdown(entry.countdownSeconds) }}</span>
            <span class="fx-custom-lobby-mode-count-group"><span v-if="entry.playerCount != null || entry.maxPlayers != null" class="fx-custom-lobby-mode-count">{{ entry.playerCount ?? '—' }}<template v-if="entry.maxPlayers != null">/{{ entry.maxPlayers }}</template> {{ labels.players.toLowerCase() }}</span><span v-if="entry.rating" class="fx-custom-lobby-entry-rating" :title="entry.rating.title"><img :src="entry.rating.image" alt="" aria-hidden="true"><b>{{ entry.rating.value }}</b></span></span>
          </span>
          <GameModeBadge :mode-key="entry.modeKey" :label="entry.modeLabel" />
          <strong class="fx-custom-lobby-mode-title">{{ entryTitle(entry) }}<span v-if="entry.isContest" class="fx-custom-lobby-contest-badge">CONTEST</span><span v-if="entry.selected" class="fx-custom-lobby-entry-selected">✓ {{ labels.selected }}</span></strong>
          <span class="fx-custom-lobby-entry-mode-label">{{ entry.modeLabel }}<span v-if="entry.teamCountLabel"> · {{ entry.teamCountLabel }}</span></span>
        </button>
        <div v-if="!visibleEntries.length" class="fx-custom-lobby-entry-empty">{{ entries.length ? labels.noOtherUpcomingGames : labels.waitingForGames }}</div>
      </nav>
      <div class="fx-custom-lobby-map-cards">
      <section class="fx-custom-lobby-map-hero" :class="{ 'is-contest': isContest }">
        <img v-if="mapImage" class="fx-custom-lobby-map-image" :src="mapImage" alt="" aria-hidden="true">
        <div class="fx-custom-lobby-map-heading">
          <span>{{ labels.currentMap }}<b v-if="isContest" class="fx-custom-lobby-contest-badge">🏆 CONTEST</b></span>
          <div class="fx-custom-lobby-map-title-row">
            <GameModeBadge v-if="gameModeKey" :mode-key="gameModeKey" :label="gameModeLabel" standalone />
            <h1>{{ map || labels.map }}</h1>
          </div>
          <strong v-if="gameModeLabel" class="fx-custom-lobby-map-mode-label">{{ gameModeLabel }}<span v-if="teamCount"> · {{ teamCount }}</span></strong>
          <section class="fx-custom-lobby-rating-card" :title="lobbyRating?.title || labels.lobbyRatingUnavailable">
            <img v-if="lobbyRating" :src="lobbyRating.image" alt="" aria-hidden="true">
            <div><span>{{ labels.lobbyRating }}</span><strong>{{ lobbyRating?.value || '—' }}<small v-if="lobbyRating"> / 10</small></strong><small>{{ lobbyRating?.meta || labels.lobbyRatingUnavailable }}</small></div>
          </section>
        </div>
        <section class="fx-custom-lobby-clan-chart-card" :aria-label="labels.readyClansByClan">
          <svg class="fx-custom-lobby-clan-chart-pie" viewBox="0 0 42 42" role="img" :aria-label="labels.readyClansByClan">
            <circle class="fx-custom-lobby-clan-chart-track" cx="21" cy="21" r="16" />
            <circle v-for="clan in readyClans" :key="clan.tag" class="fx-custom-lobby-clan-chart-slice" cx="21" cy="21" r="16" :stroke="clan.color" :stroke-dasharray="clan.dashArray" :stroke-dashoffset="clan.dashOffset" />
            <text x="21" y="22" text-anchor="middle">{{ readyClanTotal }}</text>
          </svg>
          <div class="fx-custom-lobby-clan-chart-legend">
            <strong>{{ labels.readyClansByClan }}</strong>
            <span v-if="!readyClans.length" class="fx-custom-lobby-clan-chart-empty">{{ labels.noReadyClanPlayers }}</span>
            <span v-for="clan in readyClans" :key="clan.tag" class="fx-custom-lobby-clan-chart-item" :title="clan.count + ' ' + labels.ready.toLowerCase()">
              <i :style="{ backgroundColor: clan.color }"></i><b v-if="!clan.isOthers">{{ clan.tag }}</b><b v-else>({{ labels.others }})</b><span>{{ clan.count }}</span>
            </span>
          </div>
        </section>
        <div class="fx-custom-lobby-map-details">
          <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/></svg><span>{{ labels.currentMap }}</span><strong>{{ map || '—' }}</strong></div>
          <div><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0m2-9a3 3 0 1 0 0-6m1 9a5 5 0 0 1 3 4"/></svg><span>{{ labels.readyPlayers }}</span><strong>{{ readyCount }}</strong></div>
          <div v-if="teamCount"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0m1-4a4.5 4.5 0 0 1 5 4"/></svg><span>{{ labels.teams }}</span><strong>{{ teamCount }}</strong></div>
          <strong v-if="noFullsend" class="fx-custom-lobby-rules-badge">NO FULLSEND</strong>
        </div>
      </section>
      <article class="fx-custom-lobby-card fx-custom-lobby-next-card" :class="{ 'is-contest': Boolean(nextMap) && nextIsContest === true, 'is-standard': Boolean(nextMap) && nextIsContest === false, 'is-empty': !nextMap }">
        <img v-if="nextMapImage" class="fx-custom-lobby-next-image" :src="nextMapImage" alt="" aria-hidden="true">
        <div class="fx-custom-lobby-next-heading"><span class="fx-custom-lobby-next-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></span><span class="fx-custom-lobby-next-label">{{ nextMap ? (selectedGameJoined ? labels.joinedGame : labels.selectedGame) : labels.selectGame }}</span><b v-if="nextMap && nextIsContest === true" class="fx-custom-lobby-contest-badge">CONTEST</b><b v-else-if="nextMap && nextIsContest === false" class="fx-custom-lobby-next-standard">{{ labels.nextStandardGame }}</b><b v-else-if="nextMap" class="fx-custom-lobby-next-unknown">{{ labels.nextContestUnknown }}</b></div>
        <div class="fx-custom-lobby-next-title-row">
          <GameModeBadge v-if="nextGameModeKey" :mode-key="nextGameModeKey" :label="nextGameModeLabel" standalone />
          <strong class="fx-custom-lobby-next-title">{{ nextMap || labels.noGameSelected }}</strong>
        </div>
        <small v-if="nextGameMeta" class="fx-custom-lobby-next-teams">{{ nextGameMeta }}</small>
        <small v-if="nextGameModeLabel" class="fx-custom-lobby-next-mode-label">{{ nextGameModeLabel }}<span v-if="nextTeamCountLabel"> · {{ nextTeamCountLabel }}</span></small>
        <small v-if="!nextMap" class="fx-custom-lobby-next-teams">{{ labels.chooseGameHint }}</small>
        <strong v-if="nextNoFullsend" class="fx-custom-lobby-rules-badge">NO FULLSEND</strong>
        <button type="button" class="fx-custom-lobby-entry-selection" :class="selectedGameJoined ? 'is-selected' : 'is-not-selected'" :aria-pressed="selectedGameJoined" :disabled="selectionDisabled" @click="$emit('join-selected')">{{ selectedGameJoined ? labels.leaveGame : labels.joinGame }}</button>
      </article>
      </div>
    </header>`,
  methods: {
    formatCountdown(value) {
      const seconds = Math.max(0, Math.floor(Number(value) || 0));
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    },
  },
  computed: {
    visibleEntries() {
      return this.entries || [];
    },
  },
});

export const LobbyProgress = defineComponent({
  props: { snapshot: Object, labels: Object },
  template: `
    <section class="fx-custom-lobby-summary">
      <article class="fx-custom-lobby-progress-card">
        <div class="fx-custom-lobby-progress-track"><div class="fx-custom-lobby-progress-fill" :style="{ width: progressPercent + '%' }"></div></div>
        <strong class="fx-custom-lobby-progress-percent">{{ percentLabel }}</strong>
        <span class="fx-custom-lobby-progress-eta">{{ etaLabel }}</span>
      </article>
    </section>`,
  data() { return {
    countdownTimer: 0, currentTime: Date.now(), countdownEntryId: null,
    countdownBaseline: null, countdownServerValue: null, countdownReceivedAt: 0,
    countdownSequence: null, audioContext: null, audioUnlockHandler: null,
  }; },
  mounted() {
    this.syncStartCountdown(true);
    this.audioUnlockHandler = () => this.unlockProgressAudio();
    document.addEventListener("pointerdown", this.audioUnlockHandler, { capture: true, passive: true });
    document.addEventListener("keydown", this.audioUnlockHandler, { capture: true });
    this.progressTimer = window.setInterval(() => {
      this.currentTime = Date.now();
      this.tickProgressCountdown();
    }, 250);
  },
  beforeUnmount() {
    if (this.progressTimer) window.clearInterval(this.progressTimer);
    if (this.audioUnlockHandler) {
      document.removeEventListener("pointerdown", this.audioUnlockHandler, true);
      document.removeEventListener("keydown", this.audioUnlockHandler, true);
    }
    this.audioContext?.close().catch(() => {});
  },
  watch: {
    "snapshot.nextGameEntryId"() { this.syncStartCountdown(true); },
    "snapshot.nextGameCountdownSeconds"() {
      this.syncStartCountdown(false);
      this.tickProgressCountdown();
    },
  },
  computed: {
    percentLabel() {
      const value = this.progressPercent;
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    },
    remainingSeconds() {
      if (!Number.isFinite(this.countdownServerValue)) return null;
      return Math.max(0, this.countdownServerValue - Math.floor((this.currentTime - this.countdownReceivedAt) / 1000));
    },
    progressPercent() {
      if (!Number.isFinite(this.countdownBaseline) || this.countdownBaseline <= 0 || this.remainingSeconds == null) return 0;
      return Math.min(100, Math.max(0, (this.countdownBaseline - this.remainingSeconds) / this.countdownBaseline * 100));
    },
    etaLabel() {
      if (this.remainingSeconds == null) return this.labels.etaUnavailable;
      if (this.remainingSeconds === 0) return this.labels.startingNow;
      const seconds = this.remainingSeconds;
      const time = seconds >= 3600
        ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
        : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      return `${this.labels.startsIn} ${time}`;
    },
  },
  methods: {
    unlockProgressAudio() {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        this.audioContext ||= new AudioContextClass();
        if (this.audioContext.state === "suspended") this.audioContext.resume().catch(() => {});
      } catch { /* Audio is optional. */ }
    },
    playProgressBeep(second) {
      try {
        this.unlockProgressAudio();
        const context = this.audioContext;
        if (!context || context.state !== "running") return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const startAt = context.currentTime;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(second === 1 ? 980 : 760, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.13);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.14);
      } catch { /* Audio is optional. */ }
    },
    tickProgressCountdown() {
      const eta = this.remainingSeconds;
      if (!Number.isFinite(eta) || eta > 5) {
        this.countdownSequence = null;
        return;
      }
      if (!this.countdownSequence) {
        if (eta < 1) return;
        this.countdownSequence = { nextSecond: Math.min(5, eta), nextAt: Date.now() };
      }
      if (this.countdownSequence.nextSecond < 1 || Date.now() < this.countdownSequence.nextAt) return;
      const second = this.countdownSequence.nextSecond;
      this.playProgressBeep(second);
      this.countdownSequence.nextSecond--;
      this.countdownSequence.nextAt = Date.now() + 1000;
    },
    syncStartCountdown(forceReset) {
      const entryId = this.snapshot.nextGameEntryId ?? null;
      const value = Number(this.snapshot.nextGameCountdownSeconds);
      if (entryId !== this.countdownEntryId || forceReset) {
        this.countdownEntryId = entryId;
        this.countdownBaseline = Number.isFinite(value) ? value : null;
        this.countdownServerValue = Number.isFinite(value) ? value : null;
        this.countdownReceivedAt = Date.now();
        this.countdownSequence = null;
        return;
      }
      if (!Number.isFinite(value)) return;
      if (Number.isFinite(this.countdownServerValue) && value > this.countdownServerValue + 3) {
        this.countdownBaseline = value;
        this.countdownSequence = null;
      }
      if (value !== this.countdownServerValue) {
        this.countdownServerValue = value;
        this.countdownReceivedAt = Date.now();
      }
    },
  },
});

export const PlayerList = defineComponent({
  props: { players: Array, allPlayers: Array, clans: Array, labels: Object, count: Number, playerCountLabel: String, query: String, sortBy: String, readyFilter: String, affiliationFilter: String, activeTab: String, chatMessages: Array, chatStatus: String, teamMode: Boolean, teamPlayers: Array, teamClan: String, teamCount: String, clanCount: String, topReadyClan: Object, onlyReadyClans: Boolean, currentMap: String, nextMap: String, nextTeamCount: String },
  emits: ["update:query", "update:sort", "update:ready-filter", "update:affiliation-filter", "reset-filter-groups", "reset-filters", "filter-ready-clans", "select-player", "select-tab", "send-chat", "send-call", "send-join", "send-team-message"],
  data() { return { teamMessage: "", teamMessageStatus: "" }; },
  template: `
    <section class="fx-custom-lobby-player-panel fx-custom-lobby-workspace">
      <nav class="fx-custom-lobby-workspace-tabs" :aria-label="labels.lobbyViews">
        <button type="button" data-tab="overview" :class="{ 'is-active': activeTab === 'overview' }" :aria-selected="activeTab === 'overview'" @click="$emit('select-tab', 'overview')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>{{ labels.overview }}</button>
        <button type="button" data-tab="chat" :class="{ 'is-active': activeTab === 'chat' }" :aria-selected="activeTab === 'chat'" @click="$emit('select-tab', 'chat')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 10h8M8 14h5"/></svg>{{ labels.chat }}</button>
        <button type="button" data-tab="players" :class="{ 'is-active': activeTab === 'players' }" :aria-selected="activeTab === 'players'" @click="$emit('select-tab', 'players')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2Z"/></svg>{{ labels.players }} <span class="fx-custom-lobby-tab-count">{{ playerCountLabel }}</span></button>
        <button type="button" data-tab="clans" :class="{ 'is-active': activeTab === 'clans' }" :aria-selected="activeTab === 'clans'" @click="$emit('select-tab', 'clans')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 6v5.2c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6Z"/><path d="M8 12h8M12 8v8"/></svg>{{ labels.clans }} <span class="fx-custom-lobby-tab-count">{{ clanCount }}</span></button>
        <button type="button" data-tab="team" :class="{ 'is-active': activeTab === 'team' }" :aria-selected="activeTab === 'team'" @click="$emit('select-tab', 'team')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M15 15.5a5 5 0 0 1 6.5 4.5"/></svg>{{ labels.team }} <span class="fx-custom-lobby-tab-count">{{ teamCount }}</span></button>
        <button type="button" data-tab="calls" :class="{ 'is-active': activeTab === 'calls' }" :aria-selected="activeTab === 'calls'" @click="$emit('select-tab', 'calls')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5m0 8v5M3 12h5m8 0h5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>{{ labels.calls }}</button>
      </nav>
      <div v-if="activeTab === 'players' || activeTab === 'team'" class="fx-custom-lobby-roster-view">
        <div class="fx-custom-lobby-player-header">
          <input type="search" :value="query" :placeholder="labels.search" :aria-label="labels.search" @input="$emit('update:query', $event.target.value)">
          <label class="fx-custom-lobby-sort"><span>{{ labels.sort }}</span><select :value="sortBy" :aria-label="labels.sort" @change="$emit('update:sort', $event.target.value)"><option value="rank-desc">{{ labels.sortRankDesc }}</option><option value="rank-asc">{{ labels.sortRankAsc }}</option><option value="name">{{ labels.sortName }}</option></select></label>
          <div class="fx-custom-lobby-filter-toolbar">
            <button type="button" :class="{ 'is-active': readyFilter === 'all' && (activeTab === 'team' || affiliationFilter === 'all') }" @click="$emit('reset-filter-groups')">{{ labels.all }}</button>
            <div class="fx-custom-lobby-filters" role="group" :aria-label="labels.readinessFilters">
              <button type="button" :class="{ 'is-active': readyFilter === 'ready' }" @click="$emit('update:ready-filter', 'ready')">{{ labels.ready }}</button>
              <button type="button" :class="{ 'is-active': readyFilter === 'not-ready' }" @click="$emit('update:ready-filter', 'not-ready')">{{ labels.notReady }}</button>
            </div>
            <div v-if="activeTab !== 'team'" class="fx-custom-lobby-filters" role="group" :aria-label="labels.affiliationFilters">
              <button type="button" :class="{ 'is-active': affiliationFilter === 'clan' }" @click="$emit('update:affiliation-filter', 'clan')">{{ labels.clan }}</button>
              <button type="button" :class="{ 'is-active': affiliationFilter === 'followed' }" @click="$emit('update:affiliation-filter', 'followed')">{{ labels.followed }}</button>
            </div>
            <button type="button" class="fx-custom-lobby-filter-reset" @click="$emit('reset-filters')">{{ labels.resetFilters }}</button>
          </div>
        </div>
        <div class="fx-custom-lobby-table-wrap">
          <table class="fx-custom-lobby-table">
            <thead><tr><th>#</th><th>{{ labels.players }}</th><th>{{ labels.clan }}</th><th>{{ labels.rank }}</th><th>{{ labels.status }}</th></tr></thead>
            <tbody>
              <tr v-for="(player, index) in visiblePlayers" :key="player.id || player.name + ':' + index" :class="{ 'is-self': player.self }" :title="player.title || player.name" :style="player.color ? { '--fx-custom-player-color': player.color } : null" @click.stop.prevent="$emit('select-player', player, $event)">
                <td>{{ index + 1 }}</td>
                <td class="fx-custom-lobby-player-name"><i class="fx-custom-lobby-status-dot" :class="'is-' + player.readiness"></i>{{ player.name }}</td>
                <td class="fx-custom-lobby-player-clan">{{ player.clan ? '[' + player.clan + ']' : '—' }}</td>
                <td>{{ player.rankText || (player.rank ? '#' + player.rank.toLocaleString() : '-') }}</td>
                <td class="fx-custom-lobby-player-status" :class="'is-' + player.readiness"><span>{{ player.readiness === 'ready' ? labels.ready : player.readiness === 'not-ready' ? labels.notReady : labels.online }}</span><small v-if="player.readiness === 'ready' && player.readyEntryLabel"> · {{ player.readyEntryLabel }}</small></td>
              </tr>
              <tr v-if="!visiblePlayers.length"><td colspan="5" class="fx-custom-lobby-empty">{{ activeTab === 'team' && !teamClan ? labels.noClan : labels.noPlayers }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <section v-else-if="activeTab === 'overview'" class="fx-custom-lobby-overview">
        <div class="fx-custom-lobby-overview-stats">
          <article class="is-players"><span>{{ labels.players }}</span><strong>{{ playerCountLabel }}</strong></article>
          <article class="is-clans"><span>{{ labels.clans }}</span><strong>{{ clanCount }}</strong></article>
          <article v-if="teamMode" class="is-team"><span>{{ labels.team }}</span><strong>{{ teamCount }}</strong></article>
          <article v-if="topReadyClan" class="is-top-clan"><span>{{ labels.topReadyClan }}</span><strong>[{{ topReadyClan.tag }}]</strong><small>{{ topReadyClan.readyCount }} / {{ topReadyClan.players.length }} {{ labels.ready.toLowerCase() }}</small></article>
        </div>
        <section class="fx-custom-lobby-overview-top-ready">
          <header><div><h2>{{ labels.topReadyPlayers }}</h2><p>{{ labels.overviewLeadersNote }}</p></div><span class="fx-custom-lobby-overview-count">{{ topReadyPlayers.length }} / 3</span></header>
          <ol v-if="topReadyPlayers.length">
            <li v-for="(player, index) in topReadyPlayers" :key="player.id || player.name" :class="{ 'is-self': player.self }">
              <span class="fx-custom-lobby-overview-place" :class="'is-place-' + (index + 1)">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="fx-custom-lobby-overview-name"><i class="fx-custom-lobby-status-dot is-ready"></i><strong>{{ player.name }}</strong><small>{{ player.rankText || (player.rank ? '#' + player.rank.toLocaleString() : '-') }}</small></span>
              <span v-if="player.clan" class="fx-custom-lobby-overview-clan">[{{ player.clan }}]</span>
            </li>
          </ol>
          <p v-else class="fx-custom-lobby-empty">{{ labels.noReadyPlayers }}</p>
        </section>
      </section>
      <section v-else-if="activeTab === 'clans'" class="fx-custom-lobby-clans-view">
        <div class="fx-custom-lobby-filters fx-custom-lobby-clan-filters" role="group" :aria-label="labels.clans">
          <button type="button" :class="{ 'is-active': !onlyReadyClans }" @click="$emit('filter-ready-clans', false)">{{ labels.all }}</button>
          <button type="button" :class="{ 'is-active': onlyReadyClans }" @click="$emit('filter-ready-clans', true)">{{ labels.onlyReadyClans }}</button>
        </div>
        <div class="fx-custom-lobby-table-wrap">
          <table class="fx-custom-lobby-table">
            <thead><tr><th>#</th><th>{{ labels.clan }}</th><th>{{ labels.players }}</th><th>{{ labels.ready }}</th></tr></thead>
            <tbody>
              <tr v-for="(clan, index) in clans" :key="clan.tag" :class="{ 'is-self': teamClan && clan.tag === teamClan }">
                <td>{{ index + 1 }}</td><td class="fx-custom-lobby-player-clan">[{{ clan.tag }}]</td>
                <td>{{ clan.players.length }}</td><td>{{ clan.readyCount }} / {{ clan.players.length }}</td>
              </tr>
              <tr v-if="!clans.length"><td colspan="4" class="fx-custom-lobby-empty">{{ onlyReadyClans ? labels.noReadyClans : labels.noClans }}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section v-else-if="activeTab === 'calls'" class="fx-custom-lobby-calls-view">
        <section class="fx-custom-lobby-call-section fx-custom-lobby-call-spawn-section">
          <header class="fx-custom-lobby-call-heading"><h3>{{ labels.spawnDirections }}</h3><p>{{ labels.spawnCallHint }}</p></header>
          <div class="fx-custom-lobby-call-compass" role="group" :aria-label="labels.spawnDirections">
            <button v-for="direction in spawnDirections" :key="direction.key" type="button" :class="{ 'is-center': direction.key === 'center' }" :style="{ gridColumn: direction.column, gridRow: direction.row }" :disabled="!teamClan || !currentMap" :aria-label="labels[direction.labelKey]" :title="labels[direction.labelKey]" @click="$emit('send-call', direction.key)"><span>{{ direction.icon }}</span></button>
          </div>
        </section>
        <section class="fx-custom-lobby-call-section fx-custom-lobby-call-message-section">
          <header class="fx-custom-lobby-call-heading"><h3>{{ labels.team }}</h3><p>{{ labels.teamMessagePlaceholder }}</p></header>
          <form class="fx-custom-lobby-call-message" @submit.stop.prevent="sendTeamMessage">
            <input v-model="teamMessage" type="text" :maxlength="110" :placeholder="labels.teamMessagePlaceholder" :aria-label="labels.teamMessagePlaceholder" :disabled="!teamClan" @keydown.stop @keyup.stop @keypress.stop>
            <button type="submit" :disabled="!teamClan || !teamMessage.trim()">{{ labels.send }}</button>
            <span v-if="teamMessageStatus" role="status">{{ teamMessageStatus }}</span>
          </form>
          <div class="fx-custom-lobby-call-join-group">
            <header class="fx-custom-lobby-call-join-heading"><h3>{{ labels.join }}</h3></header>
            <div class="fx-custom-lobby-call-actions">
              <button type="button" :disabled="!teamClan" @click="$emit('send-join', 'cont')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11v2h4l12 5V6l-12 5H3Z"/><path d="m7 13 2 7h3l-2-6M21 9l-2 1m2 5-2-1"/></svg><span>{{ labels.joinCont }}</span></button>
              <button type="button" :disabled="!teamClan" @click="$emit('send-join', 'current')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11v2h4l12 5V6l-12 5H3Z"/><path d="m7 13 2 7h3l-2-6M21 9l-2 1m2 5-2-1"/></svg><span>{{ labels.join }}</span></button>
              <button type="button" :disabled="!teamClan || !nextMap || !nextTeamCount" @click="$emit('send-join', 'next')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11v2h4l12 5V6l-12 5H3Z"/><path d="m7 13 2 7h3l-2-6M21 9l-2 1m2 5-2-1"/></svg><span>{{ labels.joinNext.replace('{map}', nextMap || labels.nextGame).replace('{count}', (nextTeamCount || '').replace(/\s*teams?$/i, '') || '?') }}</span></button>
            </div>
          </div>
        </section>
      </section>
      <LobbyChat v-else ref="lobbyChat" :labels="labels" :messages="chatMessages" :status="chatStatus" @send="sendChat" />
    </section>`,
  computed: {
    spawnDirections() { return [
      { key: "top left", icon: "↖", labelKey: "topLeft", column: 1, row: 1 },
      { key: "top", icon: "↑", labelKey: "top", column: 2, row: 1 },
      { key: "top right", icon: "↗", labelKey: "topRight", column: 3, row: 1 },
      { key: "left", icon: "←", labelKey: "left", column: 1, row: 2 },
      { key: "center", icon: "◎", labelKey: "center", column: 2, row: 2 },
      { key: "right", icon: "→", labelKey: "right", column: 3, row: 2 },
      { key: "bottom left", icon: "↙", labelKey: "bottomLeft", column: 1, row: 3 },
      { key: "bottom", icon: "↓", labelKey: "bottom", column: 2, row: 3 },
      { key: "bottom right", icon: "↘", labelKey: "bottomRight", column: 3, row: 3 },
    ]; },
    visiblePlayers() { return this.activeTab === "team" ? this.teamPlayers : this.players; },
    topReadyPlayers() {
      return [...(this.allPlayers || [])]
        .filter(player => player.readiness === "ready")
        .sort((left, right) => (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY)
          || left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
        .slice(0, 3);
    },
  },
  methods: {
    sendChat(message, callback) { this.$emit("send-chat", message, callback); },
    insertMentionToken(token) { return this.$refs.lobbyChat?.insertMentionToken(token) ?? false; },
    sendTeamMessage() {
      const message = this.teamMessage.trim();
      if (!message || !this.teamClan) return;
      this.teamMessageStatus = "";
      this.$emit("send-team-message", message, sent => {
        this.teamMessageStatus = sent ? this.labels.messageSent : this.labels.messageSendFailed;
        if (sent) this.teamMessage = "";
      });
    },
  },
});

export const LobbyChat = defineComponent({
  components: { LobbyPlayerName },
  props: { labels: Object, messages: Array, status: String },
  emits: ["send"],
  data() { return { message: "", activationTimer: 0, stickToChatBottom: true, senderMenu: null }; },
  mounted() {
    // The native client needs one initial request to populate its single
    // lobby-wide chat list. Keep it enabled across tab changes; never toggle it
    // off when leaving this Vue tab.
    const activationStartedAt = Date.now();
    const tryActivateLobbyChat = () => {
      const fx = window.__fx;
      if (fx?.lobbyChatChannelRequested) {
        this.activationTimer = 0;
        return;
      }
      const activate = fx?.setNativeLobbyChatMode;
      if (typeof activate === "function") {
        fx.lobbyChatChannelRequested = true;
        this.activationTimer = 0;
        activate(0);
        return;
      }
      if (Date.now() - activationStartedAt >= 60000) {
        this.activationTimer = 0;
        console.warn("[ZFX Client LobbyChat] Native lobby chat subscription is unavailable.");
        return;
      }
      this.activationTimer = window.setTimeout(tryActivateLobbyChat, 250);
    };
    tryActivateLobbyChat();
    this.$nextTick(() => {
      const list = this.$refs.messages;
      if (list) list.scrollTop = list.scrollHeight;
    });
  },
  beforeUnmount() {
    if (this.activationTimer) window.clearTimeout(this.activationTimer);
  },
  methods: {
    openSenderMenu(event, entry) {
      if (!entry?.senderName) return;
      this.senderMenu = {
        senderId: entry.senderId,
        senderName: entry.senderName,
        senderColor: entry.senderColor || "",
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 176)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 54)),
      };
    },
    openMentionMenu(event, segment) {
      this.openSenderMenu(event, {
        senderId: segment?.mentionId,
        senderName: String(segment?.text ?? "").replace(/^@/, ""),
        senderColor: segment?.color,
      });
    },
    insertMention() {
      if (!this.senderMenu) return;
      let token = "";
      try {
        const accountId = Number(this.senderMenu.senderId);
        if (Number.isInteger(accountId)) token = String(window.__fx?.getLobbyChatMentionToken?.(accountId) ?? "").trim();
      } catch (error) {
        console.warn("[ZFX Client LobbyChat] Could not resolve account mention ID:", error);
      }
      if (!token) {
        console.warn("[ZFX Client LobbyChat] Account mention ID is not available for this sender.", this.senderMenu);
        return;
      }
      const mention = `@${token}`;
      this.message = `${this.message}${this.message && !/\s$/.test(this.message) ? " " : ""}${mention} `;
      this.senderMenu = null;
      this.$nextTick(() => this.$refs.chatInput?.focus());
    },
    insertMentionToken(token) {
      const accountId = String(token ?? "").trim();
      if (!/^[A-Za-z0-9_-]{5}$/.test(accountId)) return false;
      const mention = `@${accountId}`;
      this.message = `${this.message}${this.message && !/\s$/.test(this.message) ? " " : ""}${mention} `;
      this.$nextTick(() => this.$refs.chatInput?.focus());
      return true;
    },
    clearDraft() {
      this.message = "";
      this.$nextTick(() => this.$refs.chatInput?.focus());
    },
    submit() {
      const message = this.message.trim();
      if (message) this.$emit("send", message, sent => { if (sent) this.message = ""; });
    },
  },
  template: `
    <section class="fx-custom-lobby-chat-view" :aria-label="labels.chat">
      <div ref="messages" class="fx-custom-lobby-chat-messages" aria-live="polite">
        <p v-for="entry in messages" :key="entry.id"><template v-if="entry.senderName"><LobbyPlayerName :name="entry.senderName" :color="entry.senderColor" @activate="openSenderMenu($event, entry)" />:</template><template v-if="entry.segments && entry.segments.length"><template v-for="(segment, index) in entry.segments" :key="index"><LobbyPlayerName v-if="segment.resolvedPlayer" :name="segment.text" :color="segment.color" @activate="openMentionMenu($event, segment)" /><span v-else :style="segment.color ? { color: segment.color } : null">{{ segment.text }}</span></template></template><template v-else>{{ entry.text }}</template></p>
        <span v-if="!messages.length" class="fx-custom-lobby-chat-empty">{{ labels.chatEmpty }}</span>
      </div>
      <Teleport to="body">
        <div v-if="senderMenu" class="fx-custom-lobby-chat-menu-backdrop" @click="senderMenu = null" @keydown.esc="senderMenu = null">
          <div class="fx-custom-lobby-chat-context-menu" role="menu" :style="{ left: senderMenu.x + 'px', top: senderMenu.y + 'px' }" @click.stop>
            <strong :style="senderMenu.senderColor ? { color: senderMenu.senderColor } : null">{{ senderMenu.senderName }}</strong>
            <button type="button" role="menuitem" :disabled="senderMenu.senderId == null" @click="insertMention">@ {{ labels.mention }}</button>
          </div>
        </div>
      </Teleport>
      <span v-if="status" class="fx-custom-lobby-chat-status">{{ status }}</span>
      <form class="fx-custom-lobby-chat-compose" @submit.stop.prevent="submit">
        <input ref="chatInput" v-model="message" type="text" :placeholder="labels.chatPlaceholder" :aria-label="labels.chatPlaceholder" @keydown.stop @keyup.stop @keypress.stop>
        <button type="button" class="fx-custom-lobby-chat-clear" :disabled="!message" :aria-label="labels.clear" :title="labels.clear" @click="clearDraft">×</button>
        <button type="submit">{{ labels.send }}</button>
      </form>
    </section>`,
  beforeUpdate() {
    const list = this.$refs.messages;
    this.stickToChatBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 32;
  },
  beforeUnmount() {
    if (this.activationTimer) window.clearTimeout(this.activationTimer);
  },
  updated() {
    const list = this.$refs.messages;
    if (list && this.stickToChatBottom) list.scrollTop = list.scrollHeight;
  },
});

PlayerList.components = { LobbyChat };

export const ClanOverview = defineComponent({
  props: { clan: String, readyCount: Number, memberCount: Number, members: Array, labels: Object },
  emits: ["select-player"],
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
        <div class="fx-custom-lobby-clan-members"><button v-for="player in members" :key="player.id || player.name" type="button" class="fx-custom-lobby-clan-member" :title="player.readiness === 'other-entry' ? (player.readyEntryLabel || player.name) : (player.title || player.name)" :style="player.color ? { color: player.color } : null" @click.stop.prevent="$emit('select-player', player, $event)"><i class="fx-custom-lobby-status-dot" :class="'is-' + player.readiness"></i>{{ player.name }}</button><p v-if="!clan" class="fx-custom-lobby-clan-empty">{{ labels.noClan }}</p><p v-else-if="!members.length" class="fx-custom-lobby-clan-empty">{{ labels.noClanMembers }}</p></div>
      </article>
    </aside>`,
});

