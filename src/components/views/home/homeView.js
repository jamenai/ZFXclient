import { createApp, computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { ZfxLogoMark } from "../../shared/zfxLogoMark.js";

const FxHomeView = defineComponent({
  name: "FxHomeView",
  components: { ZfxLogoMark },
  setup() {
    const visible = ref(false);
    const leaving = ref(false);
    const nameEditorOpen = ref(false);
    const nameDraft = ref("");
    const nameStatus = ref("");
    const nameHistory = ref([]);
    const accountId = ref("");
    const playerColor = ref("#3f96ff");
    const initialPlayerColor = ref("#3f96ff");
    const recentColors = ref([]);
    const fullPlayerName = ref("");
    const profileName = ref("");
    const clan = ref("");
    const isGerman = computed(() => (window.__fx?.getGameLanguage?.() || navigator.language || "en").toLowerCase().startsWith("de"));
    const labels = computed(() => isGerman.value ? {
      accountId: "Account-ID",
      eyebrow: "DEIN SPIEL. DEIN CLIENT.", subtitle: "Dein Territorial.io-Spielbereich",
      multiplayer: "Mehrspieler", scenario: "Szenario", scenarioNote: "(nativ)", menuNote: "(nativ)", accountNote: "(WIP)", account: "Konto", menu: "Spielmenü",
      settings: "Einstellungen", discord: "Discord", customLobby: "Custom-Lobby beitreten oder erstellen", customLobbyNote: "Noch nicht vollständig implementiert",
      online: "Startklar", player: "Spielerprofil", changeName: "Namen ändern", nameTitle: "Spielername ändern",
      nameNote: "Bis zu 20 Zeichen. Clan-Tags wie [TAG] kannst du im Namen mit angeben.", save: "Änderungen speichern", cancel: "Zurück",
      nameReconnect: "Änderungen gespeichert. Lobby wird neu verbunden …",
      nameHistory: "Zuletzt verwendete Namen", nameHistoryHint: "Ein Name in der Liste genügt zum direkten Wechsel.",
      colorTitle: "Spielerfarbe", chooseColor: "Farbe auswählen", colorHint: "Wähle eine Farbe für deinen Spielernamen.",
      recentColors: "Zuletzt verwendete Farben", colorMissing: "Die Spielerfarbe kann gerade nicht gespeichert werden.",
      nameMissing: "Das Namensfeld des Spiels ist gerade nicht verfügbar.", nameEmpty: "Bitte gib einen Namen ein.",
    } : {
      accountId: "Account ID",
      eyebrow: "YOUR GAME. YOUR CLIENT.", subtitle: "Your Territorial.io home",
      multiplayer: "Multiplayer", scenario: "Custom scenario", scenarioNote: "(native)", menuNote: "(native)", accountNote: "(WIP)", account: "My account", menu: "Game menu",
      settings: "Settings", discord: "Discord", customLobby: "Join or create a custom lobby", customLobbyNote: "Not fully implemented",
      online: "Ready to play", player: "Player profile", changeName: "Change name", nameTitle: "Change player name",
      nameNote: "Up to 20 characters. You can include clan tags like [TAG] in your name.", save: "Save changes", cancel: "Back",
      nameReconnect: "Changes saved. Reconnecting to the lobby …",
      nameHistory: "Recently used names", nameHistoryHint: "Select a name to switch back to it instantly.",
      colorTitle: "Player color", chooseColor: "Choose color", colorHint: "Pick a color for your player name.",
      recentColors: "Recently used colors", colorMissing: "The player color cannot be saved right now.",
      nameMissing: "The game's name field is not available right now.", nameEmpty: "Enter a name first.",
    });
    let timer = 0;
    let navigationPending = false;
    let navigationTimeout = 0;
    const nativeHomeButtonVisibility = new WeakMap();
    const nativeNameInputVisibility = new WeakMap();
    const hiddenNativeHomeExtras = new Map();
    let nativeHomeExtrasObserver = null;

    function hasVisibleNativeHomeControls() {
      const buttons = Array.isArray(window.__fx?.nativeHomeMenuButtons) ? window.__fx.nativeHomeMenuButtons : [];
      const controls = [...buttons, window.__fx?.getNativeHomeNameInput?.()].filter(Boolean);
      return controls.some(element => {
        if (!element.isConnected || !element.getClientRects().length) return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || Number(style.opacity) <= 0) return false;
        const visibilityMap = buttons.includes(element) ? nativeHomeButtonVisibility : nativeNameInputVisibility;
        const sharedVisibilityMap = window.__fx?.nativeHomeControlVisibility;
        const originalVisibility = visibilityMap.has(element)
          ? visibilityMap.get(element)
          : sharedVisibilityMap?.has(element)
            ? sharedVisibilityMap.get(element)?.[0]
            : element.style.visibility;
        return originalVisibility !== "hidden";
      });
    }

    function setNativeHomeButtonsHidden(hidden) {
      const bridgeSetter = window.__fx?.setNativeHomeControlsHidden;
      if (typeof bridgeSetter === "function") {
        bridgeSetter(hidden);
        return;
      }
      for (const button of window.__fx?.nativeHomeMenuButtons || []) {
        if (!button) continue;
        if (!nativeHomeButtonVisibility.has(button)) nativeHomeButtonVisibility.set(button, button.style.visibility);
        button.style.visibility = hidden ? "hidden" : nativeHomeButtonVisibility.get(button);
      }
      const nameInput = window.__fx?.getNativeHomeNameInput?.();
      if (nameInput) {
        if (!nativeNameInputVisibility.has(nameInput)) nativeNameInputVisibility.set(nameInput, nameInput.style.visibility);
        nameInput.style.visibility = hidden ? "hidden" : nativeNameInputVisibility.get(nameInput);
      }
    }

    function setNativeHomeExtrasHidden(hidden) {
      const scope = document.body;
      if (!scope) return;
      const targets = new Set();
      const candidates = Array.from(scope.querySelectorAll("a, img, [role='link'], div, section, article"))
        .filter(element => !element.closest("#fx-app-mount, #fx-sidebar, #fx-home-view-root"));
      let clanWidget = null;
      let clanWidgetTextLength = Infinity;
      for (const element of candidates) {
        const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        if (text.length > 500 || !/top\s+clan/i.test(text) || !/best\s+clan/i.test(text)) continue;
        if (text.length < clanWidgetTextLength) {
          clanWidget = element;
          clanWidgetTextLength = text.length;
        }
      }
      if (clanWidget) targets.add(clanWidget);

      for (const element of candidates) {
        if (!element.matches("a, img, [role='link']")) continue;
        const identifyingText = [element.textContent, element.getAttribute("href"), element.getAttribute("src"),
          element.getAttribute("alt"), element.getAttribute("title")].filter(Boolean).join(" ");
        if (!/(google\s*play|play\.google|app\s*store|apps\.apple|discord)/i.test(identifyingText)) continue;
        targets.add(element);
      }

      if (hidden) {
        for (const element of targets) {
          if (hiddenNativeHomeExtras.has(element)) continue;
          hiddenNativeHomeExtras.set(element, {
            display: element.style.getPropertyValue("display"),
            displayPriority: element.style.getPropertyPriority("display"),
            visibility: element.style.getPropertyValue("visibility"),
            visibilityPriority: element.style.getPropertyPriority("visibility"),
            pointerEvents: element.style.getPropertyValue("pointer-events"),
            pointerEventsPriority: element.style.getPropertyPriority("pointer-events"),
          });
          element.style.setProperty("display", "none", "important");
          element.style.setProperty("visibility", "hidden", "important");
          element.style.setProperty("pointer-events", "none", "important");
        }
      } else {
        for (const [element, style] of hiddenNativeHomeExtras) {
          if (!element.isConnected) continue;
          for (const [property, value, priority] of [
            ["display", style.display, style.displayPriority],
            ["visibility", style.visibility, style.visibilityPriority],
            ["pointer-events", style.pointerEvents, style.pointerEventsPriority],
          ]) {
            if (value) element.style.setProperty(property, value, priority);
            else element.style.removeProperty(property);
          }
        }
        hiddenNativeHomeExtras.clear();
      }
    }

    setNativeHomeButtonsHidden(true);
    setNativeHomeExtrasHidden(true);

    function refresh() {
      const game = window.__fx;
      const rawNames = game?.getGameVar?.("rawPlayerNames");
      const playerId = game?.getGameVar?.("playerId");
      const gameName = game?.getNativeHomeNameInput?.()?.value;
      const name = typeof gameName === "string" && gameName.trim()
        ? gameName
        : Array.isArray(rawNames) ? rawNames[playerId] : "";
      fullPlayerName.value = typeof name === "string" ? name : "";
      const tag = typeof name === "string" ? name.match(/^\s*\[([^\]]{1,8})\]\s*/) : null;
      profileName.value = typeof name === "string" ? name.replace(/^\s*\[[^\]]+\]\s*/, "").trim() : "";
      accountId.value = String(game?.getNativeAccountId?.() || "").trim();
      try { clan.value = game?.leaderboardFilter?.parseClanFromPlayerName?.(name) || tag?.[1]?.toUpperCase() || ""; }
      catch { clan.value = tag?.[1]?.toUpperCase() || ""; }
      const hasNativeMenuState = game?.nativeMenuState != null && Number.isFinite(Number(game.nativeMenuState));
      const onHomeScreen = (hasNativeMenuState
        ? Number(game.nativeMenuState) === 5
        : hasVisibleNativeHomeControls()) && Number(game?.getGameVar?.("gameState")) !== 1;
      const nativeColor = game?.getNativePlayerColor?.();
      if (!nameEditorOpen.value && typeof nativeColor === "string" && nativeColor) playerColor.value = nativeColor;
      if (!onHomeScreen) {
        navigationPending = false;
        leaving.value = false;
        if (navigationTimeout) window.clearTimeout(navigationTimeout);
        navigationTimeout = 0;
      }
      if (!navigationPending) visible.value = onHomeScreen;
      const customLobbyVisible = game?.isCustomLobbyViewVisible?.() === true;
      setNativeHomeButtonsHidden(visible.value || customLobbyVisible);
      setNativeHomeExtrasHidden(true);
    }

    function openNameEditor() {
      nameDraft.value = window.__fx?.getNativeHomeNameInput?.()?.value || fullPlayerName.value || profileName.value;
      nameStatus.value = "";
      loadNameHistory();
      loadColorHistory();
      playerColor.value = window.__fx?.getNativePlayerColor?.() || "#3f96ff";
      initialPlayerColor.value = playerColor.value;
      rememberName(nameDraft.value);
      nameEditorOpen.value = true;
    }

    const NAME_HISTORY_KEY = "fx_player_name_history_v1";
    function loadNameHistory() {
      try {
        const saved = JSON.parse(localStorage.getItem(NAME_HISTORY_KEY) || "[]");
        nameHistory.value = Array.isArray(saved)
          ? [...new Set(saved.filter(name => typeof name === "string").map(name => name.trim().slice(0, 20)).filter(Boolean))].slice(0, 8)
          : [];
      } catch { nameHistory.value = []; }
    }

    function rememberName(name) {
      const normalized = String(name ?? "").trim().slice(0, 20);
      if (!normalized) return;
      nameHistory.value = [normalized, ...nameHistory.value.filter(entry => entry.toLowerCase() !== normalized.toLowerCase())].slice(0, 8);
      try { localStorage.setItem(NAME_HISTORY_KEY, JSON.stringify(nameHistory.value)); }
      catch { /* Keep the current session usable if local storage is unavailable. */ }
    }

    const COLOR_HISTORY_KEY = "fx_player_color_history_v1";
    function loadColorHistory() {
      try {
        const saved = JSON.parse(localStorage.getItem(COLOR_HISTORY_KEY) || "[]");
        recentColors.value = Array.isArray(saved)
          ? [...new Set(saved.filter(color => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)).map(color => color.toLowerCase()))].slice(0, 8)
          : [];
      } catch { recentColors.value = []; }
    }

    function rememberColor(color) {
      const normalized = String(color || "").toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(normalized)) return;
      recentColors.value = [normalized, ...recentColors.value.filter(entry => entry !== normalized)].slice(0, 8);
      try { localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify(recentColors.value)); }
      catch { /* Keep the current session usable if local storage is unavailable. */ }
    }

    function saveName() {
      const value = nameDraft.value.trim().slice(0, 20);
      if (!value) { nameStatus.value = labels.value.nameEmpty; return; }
      const currentName = window.__fx?.getNativeHomeNameInput?.()?.value || fullPlayerName.value;
      const nameChanged = value !== currentName;
      const colorChanged = playerColor.value !== initialPlayerColor.value;
      if (!nameChanged && !colorChanged) { nameEditorOpen.value = false; return; }
      if (nameChanged && !window.__fx?.setNativeHomeName?.(value)) { nameStatus.value = labels.value.nameMissing; return; }
      if (colorChanged && !window.__fx?.setNativePlayerColor?.(playerColor.value)) { nameStatus.value = labels.value.colorMissing; return; }
      if (nameChanged) rememberName(value);
      if (colorChanged) rememberColor(playerColor.value);
      initialPlayerColor.value = playerColor.value;
      const reconnectNeeded = (nameChanged || colorChanged)
        && Number(window.__fx?.getGameVar?.("gameState")) !== 1
        && window.__fx?.isMultiplayerConnected?.() === true;
      if (reconnectNeeded && window.__fx?.reconnectMultiplayer?.()) {
        nameStatus.value = labels.value.nameReconnect;
        window.setTimeout(() => { nameEditorOpen.value = false; nameStatus.value = ""; }, 900);
      } else {
        nameEditorOpen.value = false;
        nameStatus.value = "";
      }
      window.setTimeout(refresh, 80);
    }

    function setPlayerColor(event) {
      const color = String(event?.target?.value || "").toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(color)) return;
      playerColor.value = color;
    }

    function selectRecentColor(color) { playerColor.value = color; }

    function navigateFromHome(action) {
      if (navigationPending) return;
      navigationPending = true;
      leaving.value = true;
      visible.value = false;
      // Let Vue paint the leaving state before the native screen starts changing.
      window.requestAnimationFrame(() => {
        try { action?.(); }
        finally {
          navigationTimeout = window.setTimeout(() => {
            navigationPending = false;
            leaving.value = false;
            navigationTimeout = 0;
            refresh();
          }, 4000);
        }
      });
    }

    const startMultiplayer = () => navigateFromHome(() => window.__fx?.startMultiplayer?.());
    const openScenario = () => navigateFromHome(() => window.__fx?.openCustomScenario?.());
    const openAccount = () => navigateFromHome(() => window.__fx?.openVueMyAccount?.());
    const openGameMenu = () => navigateFromHome(() => window.__fx?.openGameMenu?.());
    const openSettings = () => navigateFromHome(() => typeof window.__fx?.openVueGameSettings === "function"
      ? window.__fx.openVueGameSettings() : window.__fx?.openVueSettings?.());
    const openCustomLobby = () => navigateFromHome(() => window.__fx?.customLobby?.showJoinPrompt?.());

    onMounted(() => {
      refresh();
      timer = window.setInterval(refresh, 300);
      window.addEventListener("fx-native-menu-state-change", refresh);
      nativeHomeExtrasObserver = new MutationObserver(() => {
        if (visible.value) setNativeHomeExtrasHidden(true);
      });
      nativeHomeExtrasObserver.observe(document.body, { childList: true, subtree: true });
      window.__fx.openPlayerNameView = openNameEditor;
      window.__fx.startMultiplayerFromHome = startMultiplayer;
    });
    onBeforeUnmount(() => {
      if (timer) window.clearInterval(timer);
      if (navigationTimeout) window.clearTimeout(navigationTimeout);
      nativeHomeExtrasObserver?.disconnect();
      setNativeHomeButtonsHidden(false);
      setNativeHomeExtrasHidden(false);
      window.removeEventListener("fx-native-menu-state-change", refresh);
      if (window.__fx?.openPlayerNameView === openNameEditor) delete window.__fx.openPlayerNameView;
      if (window.__fx?.startMultiplayerFromHome === startMultiplayer) delete window.__fx.startMultiplayerFromHome;
    });

    return {
      visible, leaving, nameEditorOpen, nameDraft, nameStatus, nameHistory, accountId, fullPlayerName, profileName, clan, labels,
      startMultiplayer, openScenario, openAccount, openGameMenu, openSettings, openCustomLobby,
      openNameEditor, saveName, playerColor, recentColors, setPlayerColor, selectRecentColor, selectHistoryName: name => { nameDraft.value = name; saveName(); },
      closeNameEditor: () => { nameEditorOpen.value = false; },
    };
  },
  template: `
    <Transition name="fx-home-transition">
    <main v-if="visible && !nameEditorOpen" id="fx-home-view" :class="{'is-leaving': leaving}" aria-label="ZFX Client home">
      <div class="fx-home-orb fx-home-orb-one"></div><div class="fx-home-orb fx-home-orb-two"></div>
      <section class="fx-home-shell">
        <header class="fx-home-header">
          <ZfxLogoMark class="fx-home-brand-mark" aria-hidden="true" />
          <div class="fx-home-brand-copy"><small>ZFX CLIENT</small><h1>ZFX Client</h1><p>{{ labels.subtitle }}</p></div>
          <button type="button" class="fx-home-profile" :aria-label="labels.changeName" @click="openNameEditor">
            <span class="fx-home-profile-avatar">{{ (profileName || 'Z').slice(0, 1).toUpperCase() }}</span>
            <div><small>{{ labels.player }}</small><strong>{{ fullPlayerName || profileName || 'ZULUS' }}</strong><small v-if="accountId" class="fx-home-account-id">{{ labels.accountId }}: {{ accountId }}</small></div>
            <span class="fx-home-profile-edit" aria-hidden="true">✎</span>
          </button>
        </header>
        <section class="fx-home-welcome">
          <div><span class="fx-home-eyebrow">{{ labels.eyebrow }}</span><h2>{{ isGerman ? 'Willkommen zurück' : 'Welcome back' }}</h2></div>
          <span class="fx-home-ready"><i></i>{{ labels.online }}</span>
        </section>
        <nav class="fx-home-actions" :aria-label="isGerman ? 'Hauptmenü' : 'Main menu'">
          <button type="button" class="fx-home-action is-primary" @click="startMultiplayer"><span class="fx-home-action-icon">⚔</span><span>{{ labels.multiplayer }}</span><b>›</b></button>
          <button type="button" class="fx-home-action is-scenario" @click="openScenario"><span class="fx-home-action-icon">✦</span><span class="fx-home-scenario-copy"><strong>{{ labels.scenario }}</strong><small>{{ labels.scenarioNote }}</small></span><b>›</b></button>
          <button type="button" class="fx-home-action is-account" @click="openAccount"><span class="fx-home-action-icon">◉</span><span class="fx-home-scenario-copy"><strong>{{ labels.account }}</strong><small>{{ labels.accountNote }}</small></span><b>›</b></button>
          <button type="button" class="fx-home-action is-menu" @click="openGameMenu"><span class="fx-home-action-icon">☰</span><span class="fx-home-scenario-copy"><strong>{{ labels.menu }}</strong><small>{{ labels.menuNote }}</small></span><b>›</b></button>
        </nav>
        <footer class="fx-home-footer">
          <button type="button" class="fx-home-secondary" @click="openSettings"><span>⚙</span>{{ labels.settings }}</button>
          <a class="fx-home-secondary fx-home-discord" href="https://discord.gg/9Dr2GMUNhc" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">◉</span>{{ labels.discord }}</a>
          <button type="button" class="fx-home-secondary is-lobby" @click="openCustomLobby"><span>⌘</span><span class="fx-home-lobby-copy"><strong>{{ labels.customLobby }}</strong><small>{{ labels.customLobbyNote }}</small></span><b>›</b></button>
        </footer>
      </section>
    </main>
    </Transition>
    <main v-if="nameEditorOpen" id="fx-home-view" class="is-name-view" aria-label="Change player name">
      <section class="fx-home-name-card">
        <button type="button" class="fx-home-name-close" :aria-label="labels.cancel" :title="labels.cancel" @click="closeNameEditor">&times;</button>
        <span class="fx-home-eyebrow">ZFX CLIENT · {{ labels.player.toUpperCase() }}</span>
        <h1>{{ labels.nameTitle }}</h1>
        <p>{{ labels.nameNote }}</p>
        <small v-if="accountId" class="fx-home-account-id">{{ labels.accountId }}: {{ accountId }}</small>
        <form class="fx-home-name-form" @submit.prevent="saveName">
          <label for="fx-home-name-input">{{ labels.player }}</label>
          <input id="fx-home-name-input" v-model="nameDraft" type="text" maxlength="20" autocomplete="off" spellcheck="false" autofocus>
          <small class="fx-home-name-length">{{ nameDraft.length }} / 20</small>
          <p v-if="nameStatus" class="fx-home-name-status" role="status">{{ nameStatus }}</p>
        </form>
        <section class="fx-home-player-color"><div><h2>{{ labels.colorTitle }}</h2><p>{{ labels.colorHint }}</p></div><label class="fx-home-player-color-control"><span class="fx-home-player-color-swatch" :style="{ backgroundColor: playerColor }"></span><span>{{ labels.chooseColor }}</span><input type="color" :value="playerColor" :aria-label="labels.chooseColor" @input="setPlayerColor"></label></section>
        <section v-if="recentColors.length" class="fx-home-recent-colors"><h2>{{ labels.recentColors }}</h2><div><button v-for="color in recentColors" :key="color" type="button" :class="{ 'is-selected': playerColor === color }" :aria-label="color" :title="color" @click="selectRecentColor(color)"><span :style="{ backgroundColor: color }"></span></button></div></section>
        <button type="button" class="fx-home-name-save" @click="saveName">{{ labels.save }}</button>
        <section v-if="nameHistory.length" class="fx-home-name-history">
          <h2>{{ labels.nameHistory }}</h2>
          <p>{{ labels.nameHistoryHint }}</p>
          <div class="fx-home-name-history-list">
            <button v-for="name in nameHistory" :key="name" type="button" :disabled="name === (fullPlayerName || nameDraft)" @click="selectHistoryName(name)">{{ name }}</button>
          </div>
        </section>
      </section>
    </main>`,
});

export function createVueHomeView() {
  if (document.getElementById("fx-home-view-root")) return () => {};
  const host = document.createElement("div");
  host.id = "fx-home-view-root";
  document.body.appendChild(host);
  const app = createApp(FxHomeView);
  app.config.errorHandler = (error, _instance, info) => console.error("[ZFX Client HomeView] Vue error:", info, error);
  app.mount(host);
  return () => { app.unmount(); host.remove(); };
}
