import { defineComponent } from "vue/dist/vue.esm-bundler.js";

import { GameModeBadge } from "./gameModeBadge.js";

export const LobbyProgress = defineComponent({
  components: { GameModeBadge },
  props: { snapshot: Object, labels: Object },
  template: `
    <section class="fx-custom-lobby-summary">
      <article class="fx-custom-lobby-progress-card">
        <div class="fx-custom-lobby-progress-track"><div class="fx-custom-lobby-progress-fill" :style="{ width: progressPercent + '%' }"></div></div>
        <strong class="fx-custom-lobby-progress-percent">{{ percentLabel }}</strong>
        <span class="fx-custom-lobby-progress-eta" :class="{ 'is-counting': remainingSeconds > 0, 'is-starting': remainingSeconds === 0, 'is-unavailable': remainingSeconds == null }"><template v-if="remainingSeconds > 0"><small>{{ labels.startsIn }}</small><strong>{{ countdownTime }}</strong></template><strong v-else>{{ etaLabel }}</strong></span>
      </article>
      <aside v-if="contestTimers.length" class="fx-custom-lobby-contest-timers" :aria-label="labels.upcomingContests">
        <strong>{{ labels.upcomingContests }}</strong>
        <div><span v-for="timer in contestTimers" :key="timer.mode" class="fx-custom-lobby-contest-timer" :aria-label="timer.label + ': ' + timer.time" :title="timer.label">
          <GameModeBadge :mode-key="timer.modeKey" :label="timer.label" /><time>{{ timer.time }}</time>
        </span></div>
      </aside>
    </section>`,
  data() { return {
    countdownTimer: 0, currentTime: Date.now(), countdownEntryId: null,
    countdownBaseline: null, countdownServerValue: null, countdownReceivedAt: 0,
    countdownSequence: null, audioContext: null, audioUnlockHandler: null,
    contestRefreshTimer: 0, contestTimers: [],
  }; },
  mounted() {
    this.syncStartCountdown(true);
    this.refreshContestTimers();
    this.contestRefreshTimer = window.setInterval(this.refreshContestTimers, 1000);
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
    if (this.contestRefreshTimer) window.clearInterval(this.contestRefreshTimer);
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
    countdownTime() {
      if (this.remainingSeconds == null) return "";
      const seconds = this.remainingSeconds;
      return seconds >= 3600
        ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
        : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    },
    progressPercent() {
      if (!Number.isFinite(this.countdownBaseline) || this.countdownBaseline <= 0 || this.remainingSeconds == null) return 0;
      return Math.min(100, Math.max(0, (this.countdownBaseline - this.remainingSeconds) / this.countdownBaseline * 100));
    },
    etaLabel() {
      if (this.remainingSeconds == null) return this.labels.etaUnavailable;
      if (this.remainingSeconds === 0) return this.labels.startingNow;
      return `${this.labels.startsIn} ${this.countdownTime}`;
    },
  },
  methods: {
    refreshContestTimers() {
      let nativeText = "";
      try { nativeText = String(window.__fx?.getNativeContestTimers?.() ?? ""); }
      catch (error) { console.warn("[ZFX Client LobbyView] Could not read native contest timers:", error); }
      const labelsByMode = {
        team: this.labels.modeTeamGame,
        br: this.labels.modeBattleRoyale,
        "1v1": this.labels.modeDuel,
        zombie: this.labels.modeZombie,
      };
      this.contestTimers = [...nativeText.matchAll(/([^:|]+):\s*(\d{1,2}:\d{2})/g)]
        .map(([, sourceMode, time]) => {
          const mode = sourceMode.trim().toLowerCase();
          const key = mode === "team" ? "team"
            : mode === "br" || mode.includes("battle") ? "br"
              : mode === "1v1" ? "1v1" : mode.includes("zombie") ? "zombie" : "";
          const modeKey = key === "br" ? "battle-royale" : key === "1v1" ? "duel" : key;
          return key ? { mode: key, modeKey, label: labelsByMode[key], time } : null;
        })
        .filter(Boolean);
    },
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
