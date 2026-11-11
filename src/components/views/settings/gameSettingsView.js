import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { getNativeSettingsDraft, resetNativeSettingsDraft, setNativeConnectionDraft, setNativeSettingsDraft, setNativeShortcutDraft } from "./settingsProfilesView.js";

export const GameSettingsPanel = defineComponent({
  name: "FxGameSettingsPanel",
  props: { section: { type: String, default: "general" } },
  setup(props) {
    const language = ref("en");
    const snapshot = ref(null);
    const selectedSection = computed(() => props.section);
    const keyCaptureIndex = ref(-1);
    let refreshTimer = 0;
    const isGerman = computed(() => language.value.startsWith("de"));
    const sections = computed(() => isGerman.value ? [
      { id: "general", label: "Allgemein", icon: "◉" },
      { id: "display", label: "Anzeige", icon: "▣" },
      { id: "controls", label: "Steuerung", icon: "⌨" },
      { id: "connection", label: "Verbindung", icon: "⌁" },
    ] : [
      { id: "general", label: "General", icon: "◉" },
      { id: "display", label: "Display", icon: "▣" },
      { id: "controls", label: "Controls", icon: "⌨" },
      { id: "connection", label: "Connection", icon: "⌁" },
    ]);
    const labels = computed(() => isGerman.value ? {
      title: "Spieleinstellungen", subtitle: "Spieloptionen in der ZFX-Ansicht.", close: "Schließen",
      clientSettings: "ZFX-Einstellungen", gameSettings: "Spieleinstellungen", language: "Sprache", display: "Anzeige", select: "Auswählen", fontPlaceholder: "Schriftart eingeben",
      generalEyebrow: "ALLGEMEINE OPTIONEN", generalDescription: "Sprache und Verhalten des Nachrichtenfensters festlegen.",
      displayEyebrow: "ANZEIGEOPTIONEN", displayDescription: "Auflösung, Textdarstellung und visuelle Effekte anpassen.",
      connectionEyebrow: "NETZWERKOPTIONEN", connectionDescription: "Festlegen, wie die Verbindung zum Spielserver hergestellt wird.",
      messageKeepClosed: "Nachrichtenfenster geschlossen halten", messageMuted: "Nachrichtenfenster stummschalten",
      keyHint: "Taste anklicken und neue Tastenkombination drücken", resetKeys: "Tastenkürzel zurücksetzen",
      resetAll: "Einstellungen zurücksetzen", confirmReset: "Alle Spieleinstellungen auf Standard zurücksetzen?",
      intensity: "Intensität", live: "Änderungen werden direkt im Spiel übernommen.",
    } : {
      title: "Game Settings", subtitle: "Game options in the ZFX interface.", close: "Close",
      clientSettings: "ZFX Settings", gameSettings: "Game Settings", language: "Language", display: "Display", select: "Select", fontPlaceholder: "Enter font name",
      generalEyebrow: "GENERAL OPTIONS", generalDescription: "Configure the language and in-game message behavior.",
      displayEyebrow: "DISPLAY OPTIONS", displayDescription: "Adjust resolution, text rendering, and visual effects.",
      connectionEyebrow: "NETWORK OPTIONS", connectionDescription: "Choose how the game connects to the server.",
      messageKeepClosed: "Keep message window closed", messageMuted: "Mute message window",
      keyHint: "Click a key field and press a new key", resetKeys: "Reset shortcuts",
      resetAll: "Reset settings", confirmReset: "Reset all game settings to their defaults?",
      intensity: "Intensity", live: "Changes are applied to the game immediately.",
    });
    const nativeLabels = computed(() => isGerman.value ? {
      resolution: "Auflösung", minimumFont: "Minimale Schriftgröße", textSpeed: "Textdarstellungsgeschwindigkeit",
      largeUi: "Große Benutzeroberfläche", placeBalance: "Kontostand oberhalb platzieren", hideZoom: "Zoomtasten ausblenden",
      font: "Schriftart", messageBox: "Nachrichtenfenster", connection: "Mehrspieler-Verbindung", highlighting: "Hervorhebung", shortcuts: "Tastenkürzel",
    } : {
      resolution: "Resolution", minimumFont: "Minimum font size", textSpeed: "Text rendering speed",
      largeUi: "Large UI", placeBalance: "Place balance above", hideZoom: "Hide zoom buttons",
      font: "Font", messageBox: "Message window", connection: "Multiplayer connection", highlighting: "Highlighting", shortcuts: "Shortcut keys",
    });
    const gameOptions = computed(() => isGerman.value ? {
      language: [{ value: "en", label: "Englisch" }, { value: "de", label: "Deutsch" }],
      resolution: ["Niedrig", "Mittel", "Hoch", "Sehr hoch"], minimumFont: ["Mittel", "Klein", "Sehr klein"],
      textSpeed: ["Langsam", "Normal", "Schnell"], connection: ["Automatisch (empfohlen)", "Direkt", "Über Proxy"],
    } : {
      language: [{ value: "en", label: "English" }, { value: "de", label: "German" }],
      resolution: ["Low", "Medium", "High", "Very high"], minimumFont: ["Medium", "Small", "Very small"],
      textSpeed: ["Slow", "Normal", "Fast"], connection: ["Automatic (recommended)", "Direct", "Via proxy"],
    });
    const keyGroups = computed(() => {
      const actions = isGerman.value
        ? ["Angriff an Mausposition", "Schiff zur Mausposition senden", "Angriffsanteil erhöhen", "Angriffsanteil verringern", "Angriffsanteil leicht erhöhen", "Angriffsanteil leicht verringern", "Oberfläche ein-/ausblenden", "Hineinzoomen", "Herauszoomen", "Kamera nach links", "Kamera nach rechts", "Kamera nach oben", "Kamera nach unten", "Schwächsten Angriff ergänzen", "Friedensabstimmung starten", "Schiff an Mausposition abfangen"]
        : ["Initiate land attack at pointer", "Launch ship towards pointer", "Increase attack percentage", "Decrease attack percentage", "Slightly increase percentage", "Slightly decrease percentage", "Toggle UI visibility", "Zoom in", "Zoom out", "Camera left", "Camera right", "Camera up", "Camera down", "Add to weakest attack", "Call peace vote", "Intercept ship at pointer"];
      const shortcuts = snapshot.value?.shortcuts || [];
      const keys = shortcuts.map((value, index) => ({ index, value: value || "" }));
      return actions.map((label, index) => ({ label, keys: keys.slice(index * 2, index * 2 + 2) }));
    });    const defaultLabels = computed(() => isGerman.value
      ? { default: "Standard", enabled: "Aktiviert", disabled: "Deaktiviert", empty: "Leer", none: "Keine Taste", game: "Spielstandard" }
      : { default: "Default", enabled: "Enabled", disabled: "Disabled", empty: "Empty", none: "No key", game: "Game default" });
    const notifySettingsChanged = () => window.dispatchEvent(new CustomEvent("fx-settings-changed"));

    function nativeDefault(id, options) {
      let value = id === 100 ? snapshot.value?.defaultConnection : snapshot.value?.defaults?.[id];
      if (id === 12 && Array.isArray(options)) value = options.find(option => option.value === value)?.label ?? value;
      else if (options?.length && Number.isInteger(Number(value))) value = options[Number(value)] ?? value;
      if (value === undefined || value === null) value = defaultLabels.value.game;
      else if ([2, 7, 8, 13, 14, 15].includes(id)) value = Number(value) ? defaultLabels.value.enabled : defaultLabels.value.disabled;
      else if (id === 5 && value === "") value = defaultLabels.value.empty;
      return `${defaultLabels.value.default}: ${value}`;
    }
    function nativeShortcutDefault(index) {
      return snapshot.value?.shortcutDefaults?.[index] || defaultLabels.value.none;
    }

    function refresh() {
      const selectedLanguage = window.__fx?.getGameLanguage?.();
      if (selectedLanguage) language.value = String(selectedLanguage).toLowerCase();
      const adapter = window.__fx?.gameSettingsAdapter;
      if (typeof adapter?.getSnapshot === "function") {
        const current = adapter.getSnapshot();
        const draft = getNativeSettingsDraft();
        snapshot.value = draft ? {
          ...current,
          values: { ...current.values, ...draft.values },
          connection: draft.connection,
          shortcuts: (current.shortcuts || []).map((value, index) => draft.shortcuts[index] ?? value),
        } : current;
      }
    }
    function setField(id, value) {
      if ([2, 7, 8, 13, 14, 15].includes(id)) value = value ? 1 : 0;
      setNativeSettingsDraft(id, value);
      notifySettingsChanged();
      refresh();
    }
    function setConnection(event) {
      setNativeConnectionDraft(event.target.value);
      notifySettingsChanged();
      refresh();
    }
    function captureKey(event, index) {
      event.preventDefault();
      event.stopPropagation();
      const code = event.code || event.key;
      if (!code || code === "Escape") { keyCaptureIndex.value = -1; return; }
      setNativeShortcutDraft(index, code);
      notifySettingsChanged();
      keyCaptureIndex.value = -1;
      refresh();
    }
    function resetShortcuts() {
      const adapterSnapshot = window.__fx?.gameSettingsAdapter?.getSnapshot?.();
      for (const [index, value] of (adapterSnapshot?.shortcutDefaults || []).entries()) setNativeShortcutDraft(index, value);
      notifySettingsChanged();
      refresh();
    }
    function resetAll() {
      if (!window.confirm(labels.value.confirmReset)) return;
      resetNativeSettingsDraft();
      notifySettingsChanged();
      refresh();
    }
    onMounted(() => {
      refresh();
      refreshTimer = window.setInterval(refresh, 700);
    });
    onBeforeUnmount(() => {
      window.clearInterval(refreshTimer);
    });
    const sectionLabel = computed(() => ({
      general: sections.value[0].label,
      display: sections.value[1].label,
      controls: sections.value[2].label,
      connection: sections.value[3].label,
    }[selectedSection.value] || sections.value[0].label));
    return { sections, selectedSection, sectionLabel, snapshot, labels, nativeLabels, gameOptions, keyGroups, keyCaptureIndex,
      isGerman, defaultLabels, setField, setConnection, captureKey, resetShortcuts, resetAll, nativeDefault, nativeShortcutDefault };
  },
  template: `
    <div class="fx-game-settings-panel">
        <div v-if="snapshot" class="fx-game-settings-layout">
          <section class="fx-game-settings-content">
            <div v-if="selectedSection === 'general'" class="fx-game-settings-section">
              <div class="fx-game-settings-section-heading"><span>{{ labels.generalEyebrow }}</span><h2>{{ sectionLabel }}</h2><p>{{ labels.generalDescription }}</p></div>
              <article class="fx-game-setting-card">
                <div class="fx-game-setting-copy"><strong>{{ labels.language }}</strong><small>{{ nativeDefault(12, gameOptions.language) }}</small><small>{{ isGerman ? 'Verwendet die im Spiel gewählte Sprache.' : 'Uses the language selected in the game.' }}</small></div>
                <select :value="snapshot.values[12]" @change="setField(12, $event.target.value)"><option v-for="option in gameOptions.language" :key="option.value" :value="option.value">{{ option.label }}</option></select>
              </article>
              <article class="fx-game-setting-card">
                <div class="fx-game-setting-copy"><strong>{{ nativeLabels.messageBox }}</strong><small>{{ isGerman ? 'Legt das Verhalten des Nachrichtenfensters fest.' : 'Configure the in-game message box.' }}</small></div>
                <div class="fx-game-setting-toggles"><label><input type="checkbox" :checked="snapshot.values[13]" @change="setField(13, $event.target.checked)"><span>{{ labels.messageKeepClosed }}</span><small>{{ nativeDefault(13) }}</small></label><label><input type="checkbox" :checked="snapshot.values[14]" @change="setField(14, $event.target.checked)"><span>{{ labels.messageMuted }}</span><small>{{ nativeDefault(14) }}</small></label></div>
              </article>
            </div>
            <div v-else-if="selectedSection === 'display'" class="fx-game-settings-section">
              <div class="fx-game-settings-section-heading"><span>{{ labels.displayEyebrow }}</span><h2>{{ sectionLabel }}</h2><p>{{ labels.displayDescription }}</p></div>
              <article class="fx-game-setting-card"><div class="fx-game-setting-copy"><strong>{{ nativeLabels.resolution }}</strong><small>{{ nativeDefault(1, gameOptions.resolution) }}</small></div><select :value="snapshot.values[1]" @change="setField(1, Number($event.target.value))"><option v-for="(option, index) in gameOptions.resolution" :key="index" :value="index">{{ option }}</option></select></article>
              <article class="fx-game-setting-card"><div class="fx-game-setting-copy"><strong>{{ nativeLabels.minimumFont }}</strong><small>{{ nativeDefault(9, gameOptions.minimumFont) }}</small></div><select :value="snapshot.values[9]" @change="setField(9, Number($event.target.value))"><option v-for="(option, index) in gameOptions.minimumFont" :key="index" :value="index">{{ option }}</option></select></article>
              <article class="fx-game-setting-card"><div class="fx-game-setting-copy"><strong>{{ nativeLabels.textSpeed }}</strong><small>{{ nativeDefault(11, gameOptions.textSpeed) }}</small></div><select :value="snapshot.values[11]" @change="setField(11, Number($event.target.value))"><option v-for="(option, index) in gameOptions.textSpeed" :key="index" :value="index">{{ option }}</option></select></article>
              <article class="fx-game-setting-card"><div class="fx-game-setting-copy"><strong>{{ nativeLabels.font }}</strong><small>{{ nativeDefault(5) }}</small><small>{{ isGerman ? 'Schriftart für die Spieloberfläche.' : 'Font used by the game interface.' }}</small></div><input class="fx-game-setting-text" type="text" maxlength="80" :value="snapshot.values[5]" :placeholder="labels.fontPlaceholder" @input="setField(5, $event.target.value)"></article>
              <article class="fx-game-setting-card"><div class="fx-game-setting-copy"><strong>{{ nativeLabels.highlighting }}</strong><small>{{ nativeDefault(15) }} · {{ nativeDefault(16) }}</small><small>{{ labels.intensity }}: {{ snapshot.values[16] }}</small></div><label class="fx-game-setting-toggle"><input type="checkbox" :checked="snapshot.values[15]" @change="setField(15, $event.target.checked)"><span></span></label><input class="fx-game-setting-range" type="range" min="0" max="16" :value="snapshot.values[16]" @input="setField(16, Number($event.target.value))"></article>
              <article class="fx-game-setting-card"><div class="fx-game-setting-copy"><strong>{{ nativeLabels.largeUi }}</strong><small>{{ nativeDefault(2) }}</small></div><label class="fx-game-setting-toggle"><input type="checkbox" :checked="snapshot.values[2]" @change="setField(2, $event.target.checked)"><span></span></label></article>
              <article class="fx-game-setting-card"><div class="fx-game-setting-copy"><strong>{{ nativeLabels.placeBalance }}</strong><small>{{ nativeDefault(7) }}</small></div><label class="fx-game-setting-toggle"><input type="checkbox" :checked="snapshot.values[7]" @change="setField(7, $event.target.checked)"><span></span></label></article>
              <article class="fx-game-setting-card"><div class="fx-game-setting-copy"><strong>{{ nativeLabels.hideZoom }}</strong><small>{{ nativeDefault(8) }}</small></div><label class="fx-game-setting-toggle"><input type="checkbox" :checked="snapshot.values[8]" @change="setField(8, $event.target.checked)"><span></span></label></article>
            </div>
            <div v-else-if="selectedSection === 'controls'" class="fx-game-settings-section">
              <div class="fx-game-settings-section-heading"><span>{{ nativeLabels.shortcuts }}</span><h2>{{ sectionLabel }}</h2><p>{{ labels.keyHint }}</p></div>
              <article v-for="group in keyGroups" :key="group.label" class="fx-game-key-card"><strong>{{ group.label }}</strong><div><div v-for="key in group.keys" :key="key.index" class="fx-game-key-cell"><button type="button" :class="{ 'is-capturing': keyCaptureIndex === key.index }" @focus="keyCaptureIndex = key.index" @blur="keyCaptureIndex === key.index && (keyCaptureIndex = -1)" @keydown="captureKey($event, key.index)">{{ keyCaptureIndex === key.index ? (isGerman ? 'Taste drücken…' : 'Press a key…') : key.value }}</button><small>{{ defaultLabels.default }}: {{ nativeShortcutDefault(key.index) }}</small></div></div></article>
              <button type="button" class="fx-game-settings-reset-keys" @click="resetShortcuts">{{ labels.resetKeys }}</button>
            </div>
            <div v-else class="fx-game-settings-section">
              <div class="fx-game-settings-section-heading"><span>{{ labels.connectionEyebrow }}</span><h2>{{ sectionLabel }}</h2><p>{{ labels.connectionDescription }}</p></div>
              <article class="fx-game-setting-card"><div class="fx-game-setting-copy"><strong>{{ nativeLabels.connection }}</strong><small>{{ nativeDefault(100, gameOptions.connection) }}</small><small>{{ isGerman ? 'Wähle, wie die Verbindung zum Spielserver hergestellt wird.' : 'Choose how the game connects to its server.' }}</small></div><select :value="snapshot.connection" @change="setConnection"><option v-for="(option, index) in gameOptions.connection" :key="index" :value="index">{{ option }}</option></select></article>
            </div>
          </section>
        </div>
    </div>`,
});
