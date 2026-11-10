import { defineComponent } from "vue/dist/vue.esm-bundler.js";

import { GameModeBadge } from "./gameModeBadge.js";

export const MapHeader = defineComponent({
  components: { GameModeBadge },
  props: { map: String, mapImage: String, nextMap: String, nextMapImage: String, nextTeamCountLabel: String, nextGameModeLabel: String, gameModeKey: String, nextGameModeKey: String, nextGameMeta: String, isContest: Boolean, nextIsContest: null, noFullsend: Boolean, nextNoFullsend: Boolean, labels: Object, entries: Array, currentMapEntryId: Number, selectedGameParticipation: String, selectionDisabled: Boolean, entryTitle: Function, readyCount: Number, readyClans: Array, readyClanTotal: Number, teamCount: String, gameModeLabel: String, lobbyRating: Object },
  emits: ["select-entry", "join-selected", "restore-selection"],
  template: `
    <header class="fx-custom-lobby-top">
      <nav class="fx-custom-lobby-modes fx-custom-lobby-entries" :aria-label="labels.upcomingGames">
        <button v-for="entry in visibleEntries" :key="entry.id ?? entry.index" type="button"
          class="fx-custom-lobby-mode fx-custom-lobby-entry" :class="{ 'is-active': entry.active, 'is-next': entry.selected, 'is-contest': entry.isContest }" :data-mode="entry.modeKey" :data-next-game="entry.selected ? 'true' : 'false'"
          :aria-pressed="entry.active" @click="$emit('select-entry', entry)">
          <img v-if="entry.mapImage" class="fx-custom-lobby-entry-map-image" :src="entry.mapImage" alt="" aria-hidden="true">
          <span class="fx-custom-lobby-mode-meta">
            <span v-if="entry.countdownSeconds != null" class="fx-custom-lobby-mode-clock">{{ formatCountdown(entry.countdownSeconds) }}</span>
            <span class="fx-custom-lobby-mode-count-group"><span v-if="entry.playerCount != null || entry.maxPlayers != null" class="fx-custom-lobby-mode-count" :title="labels.players"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M15 15.5a5 5 0 0 1 6.5 4.5"/></svg><span>{{ entry.playerCount ?? '—' }}<template v-if="entry.maxPlayers != null">/{{ entry.maxPlayers }}</template></span></span><span class="fx-custom-lobby-mode-watchers" :title="labels.watchers"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/></svg><span>{{ entry.watcherCount ?? 0 }}</span></span></span>
          </span>
          <GameModeBadge :mode-key="entry.modeKey" :label="entry.modeLabel" />
          <strong class="fx-custom-lobby-mode-title">{{ entryTitle(entry) }}<span v-if="entry.isContest" class="fx-custom-lobby-contest-badge">CONTEST</span><span v-if="entry.selected" class="fx-custom-lobby-entry-selected">✓ {{ labels.selected }}</span></strong>
          <span class="fx-custom-lobby-entry-mode-label">{{ entry.modeLabel }}<span v-if="entry.teamCountLabel"> · {{ entry.teamCountLabel }}</span></span>
          <span v-if="entry.rating" class="fx-custom-lobby-entry-rating" :title="entry.rating.title"><img :src="entry.rating.image" alt="" aria-hidden="true"><b>{{ entry.rating.value }}</b></span>
        </button>
        <div v-if="!visibleEntries.length" class="fx-custom-lobby-entry-empty">{{ entries.length ? labels.noOtherUpcomingGames : labels.waitingForGames }}</div>
      </nav>
      <div class="fx-custom-lobby-map-cards">
      <section class="fx-custom-lobby-map-hero" :class="{ 'is-contest': isContest }" :data-mode="gameModeKey || 'unknown'">
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
      <article class="fx-custom-lobby-card fx-custom-lobby-next-card" :class="{ 'is-contest': Boolean(nextMap) && nextIsContest === true, 'is-standard': Boolean(nextMap) && nextIsContest === false, 'is-empty': !nextMap, 'is-clickable': Boolean(nextMap) }" :data-mode="nextGameModeKey || 'unknown'" :tabindex="nextMap ? 0 : null" :aria-label="nextMap ? labels.selectedGame + ': ' + nextMap : null" @click="nextMap && $emit('restore-selection')" @keydown.enter.self="nextMap && $emit('restore-selection')" @keydown.space.self.prevent="nextMap && $emit('restore-selection')">
        <img v-if="nextMapImage" class="fx-custom-lobby-next-image" :src="nextMapImage" alt="" aria-hidden="true">
        <div class="fx-custom-lobby-next-heading"><span class="fx-custom-lobby-next-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></span><span class="fx-custom-lobby-next-label">{{ nextMap ? (selectedGameParticipation === 'joined' ? labels.joinedGame : selectedGameParticipation === 'spectator' ? labels.spectatingGame : labels.selectedGame) : labels.selectGame }}</span><b v-if="nextMap && nextIsContest === true" class="fx-custom-lobby-contest-badge">CONTEST</b><b v-else-if="nextMap && nextIsContest === false" class="fx-custom-lobby-next-standard">{{ labels.nextStandardGame }}</b><b v-else-if="nextMap" class="fx-custom-lobby-next-unknown">{{ labels.nextContestUnknown }}</b></div>
        <div class="fx-custom-lobby-next-title-row">
          <GameModeBadge v-if="nextGameModeKey" :mode-key="nextGameModeKey" :label="nextGameModeLabel" standalone />
          <strong class="fx-custom-lobby-next-title">{{ nextMap || labels.noGameSelected }}</strong>
        </div>
        <small v-if="nextGameMeta" class="fx-custom-lobby-next-teams">{{ nextGameMeta }}</small>
        <small v-if="nextGameModeLabel || nextNoFullsend" class="fx-custom-lobby-next-mode-label"><span v-if="nextGameModeLabel">{{ nextGameModeLabel }}<span v-if="nextTeamCountLabel"> · {{ nextTeamCountLabel }}</span></span><b v-if="nextNoFullsend" class="fx-custom-lobby-next-rules">NO FULLSEND</b></small>
        <small v-if="!nextMap" class="fx-custom-lobby-next-teams">{{ labels.chooseGameHint }}</small>
        <div class="fx-custom-lobby-participation-status" :class="selectedGameParticipation === 'joined' ? 'is-joined' : selectedGameParticipation === 'spectator' ? 'is-spectating' : 'is-empty'" role="status" aria-live="polite"><svg v-if="selectedGameParticipation === 'joined'" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><svg v-else-if="selectedGameParticipation === 'spectator'" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/></svg><span v-if="selectedGameParticipation === 'joined'">{{ labels.joinedStatus }}</span><span v-else-if="selectedGameParticipation === 'spectator'">{{ labels.spectatingStatus }}</span></div>
        <div class="fx-custom-lobby-entry-actions"><button type="button" class="fx-custom-lobby-entry-selection" :class="selectedGameParticipation === 'joined' ? 'is-selected' : 'is-not-selected'" :aria-pressed="selectedGameParticipation === 'joined'" :disabled="selectionDisabled" @click.stop="$emit('join-selected', selectedGameParticipation === 'joined' ? 'none' : 'joined')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5M10 17l5-5-5-5m5 5H3"/></svg><span>{{ selectedGameParticipation === 'joined' ? labels.leaveGame : labels.joinGame }}</span></button><button type="button" class="fx-custom-lobby-entry-spectate" :class="selectedGameParticipation === 'spectator' ? 'is-selected' : 'is-not-selected'" :aria-pressed="selectedGameParticipation === 'spectator'" :title="selectedGameParticipation === 'spectator' ? labels.stopSpectating : labels.spectateGame" :disabled="selectionDisabled" @click.stop="$emit('join-selected', selectedGameParticipation === 'spectator' ? 'none' : 'spectator')"><svg v-if="selectedGameParticipation === 'spectator'" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/></svg><span>{{ selectedGameParticipation === 'spectator' ? labels.spectatingActive : labels.spectateGame }}</span><b v-if="selectedGameParticipation === 'spectator'" class="fx-custom-lobby-action-active">{{ labels.active }}</b></button></div>
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
