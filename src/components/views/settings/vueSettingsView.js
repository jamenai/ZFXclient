import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { GameSettingsPanel } from "./gameSettingsView.js";
import { ActiveSettingsProfileSelector } from "./settingsProfilesView.js";
import { SettingsProfilesToolbar } from "./settingsProfilesToolbar.js";

const VueSettingsView = defineComponent({
  name: "FxSettingsView",
  components: { ActiveSettingsProfileSelector, SettingsProfilesToolbar, GameSettingsPanel },
  props: { settingsManager: { type: Object, required: true } },
  setup(props) {
    const visible = ref(false);
    const profileDirty = ref(false);
    const hasZfxSettings = ref(true);
    const closeConfirmation = ref(false);
    const profilesToolbar = ref(null);
    const settingsContent = ref(null);
    const activeSettingsSection = ref("general");
    const zfxSectionPanels = new Map();
    const isGerman = ref(false);
    const labels = computed(() => isGerman.value ? {
      nativeTitle: "Spieleinstellungen", nativeSubtitle: "Native Optionen des Spiels.", zfxTab: "ZFX", nativeTab: "Native",
      saveProfile: "Änderungen speichern", discardProfile: "Änderungen verwerfen",
      title: "Einstellungen", subtitle: "ZFX-Client-Optionen und Benutzeroberfläche.", close: "Schlie\u00dfen", sections: "Einstellungsbereiche", clientSettings: "ZFX-Einstellungen", gameSettings: "Spieleinstellungen",
      footer: { "Reset Settings": "Einstellungen zur\u00fccksetzen", "Save Settings": "Einstellungen speichern", Import: "Importieren", Export: "Exportieren", Reset: "Zur\u00fccksetzen", Save: "Speichern" },
    } : {
      nativeTitle: "Game Settings", nativeSubtitle: "Native options provided by the game.", zfxTab: "ZFX", nativeTab: "Native",
      saveProfile: "Save changes", discardProfile: "Discard changes",
      title: "Settings", subtitle: "ZFX client options and interface preferences.", close: "Close", sections: "Settings sections", clientSettings: "ZFX Settings", gameSettings: "Game Settings",
      footer: { "Einstellungen zur\u00fccksetzen": "Reset Settings", "Einstellungen speichern": "Save Settings", Importieren: "Import", Exportieren: "Export", Zur\u00fccksetzen: "Reset", Speichern: "Save" },
    });
    const settingsSections = computed(() => isGerman.value ? [
      { id: "general", label: "Allgemein" }, { id: "display", label: "Anzeige" },
      { id: "controls", label: "Steuerung" }, { id: "connection", label: "Verbindung" },
      { id: "interface", label: "Benutzeroberfläche" }, { id: "notifications", label: "Benachrichtigungen" },
      { id: "replays", label: "Wiederholungen" }, { id: "about", label: "Über" },
    ] : [
      { id: "general", label: "General" }, { id: "display", label: "Display" },
      { id: "controls", label: "Controls" }, { id: "connection", label: "Connection" },
      { id: "interface", label: "Interface" }, { id: "notifications", label: "Notifications" },
      { id: "replays", label: "Replays" }, { id: "about", label: "About" },
    ]);
    const sectionTranslations = {
      general: ["General", "Allgemein"], allgemein: ["General", "Allgemein"],
      "in-gamedisplay": ["In-game display", "Spielanzeige"], ingamedisplay: ["In-game display", "Spielanzeige"], spielanzeige: ["In-game display", "Spielanzeige"],
      leaderboard: ["Leaderboard", "Rangliste"], rangliste: ["Leaderboard", "Rangliste"],
      density: ["Density", "Dichte"], dichte: ["Density", "Dichte"],
      attackestimate: ["Attack estimate", "Angriffssch\u00e4tzung"], angriffsschaetzung: ["Attack estimate", "Angriffssch\u00e4tzung"],
      ownterritory: ["Own territory", "Eigenes Gebiet"], eigenesgebiet: ["Own territory", "Eigenes Gebiet"],
      names: ["Names", "Namen"], namen: ["Names", "Namen"], controls: ["Controls", "Steuerung"], steuerung: ["Controls", "Steuerung"],
      home: ["Home", "Startseite"], startseite: ["Home", "Startseite"], lobby: ["Lobby", "Lobby"],
      replays: ["Replays", "Wiederholungen"], wiederholungen: ["Replays", "Wiederholungen"], about: ["About", "\u00dcber"], uber: ["About", "\u00dcber"],
      notifications: ["Notifications", "Benachrichtigungen"], benachrichtigungen: ["Notifications", "Benachrichtigungen"],
      "in-game": ["In-game", "Im Spiel"], ingame: ["In-game", "Im Spiel"], imspiel: ["In-game", "Im Spiel"],
      interface: ["Interface", "Benutzeroberfläche"], benutzeroberfläche: ["Interface", "Benutzeroberfläche"],
      playback: ["Playback", "Wiedergabe"], wiedergabe: ["Playback", "Wiedergabe"],
      reminderrules: ["Reminder rules", "Erinnerungsregeln"], erinnerungsregeln: ["Reminder rules", "Erinnerungsregeln"],
      mutedlobbypings: ["Muted lobby pings", "Stumme Lobby-Erwähnungen"], stummelobbyerwähnungen: ["Muted lobby pings", "Stumme Lobby-Erwähnungen"],
      savedreplays: ["Saved Replays", "Gespeicherte Replays"], gespeichertereplays: ["Saved Replays", "Gespeicherte Replays"],
      popups: ["Popups", "Pop-ups"],
    };
    const updateLanguage = () => {
      isGerman.value = String(window.__fx?.getGameLanguage?.() || "en").toLowerCase().startsWith("de");
    };
    const handleGameLanguageChange = () => {
      updateLanguage();
      if (!visible.value) return;
      props.settingsManager.refreshTranslations?.();
      props.settingsManager.collectFields?.();
      props.settingsManager.syncFields();
    };
    const handleProfileLoaded = () => { props.settingsManager.syncFields(); };
    const markZfxSettingsChanged = () => window.dispatchEvent(new CustomEvent("fx-settings-changed"));
    const translateSection = label => {
      const key = String(label).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const pair = sectionTranslations[key];
      return pair ? pair[isGerman.value ? 1 : 0] : label;
    };
    const selectSettingsSection = sectionId => {
      activeSettingsSection.value = sectionId;
      const panel = zfxSectionPanels.get(sectionId);
      hasZfxSettings.value = Boolean(panel);
      if (settingsContent.value) settingsContent.value.replaceChildren(...(panel ? [panel] : []));
    };
    const normalizeSectionKey = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");

    const close = () => { closeConfirmation.value = false; visible.value = false; };
    const requestClose = () => {
      if (profilesToolbar.value?.isDirty?.()) {
        closeConfirmation.value = true;
        return;
      }
      close();
    };
    const saveAndClose = () => {
      if (profilesToolbar.value?.saveChanges?.()) close();
    };
    const discardAndClose = () => {
      if (profilesToolbar.value?.discardChanges?.()) close();
      else close();
    };
    const saveProfileChanges = () => profilesToolbar.value?.saveChanges?.();
    const discardProfileChanges = () => profilesToolbar.value?.discardChanges?.();
    const open = () => {
      updateLanguage();
      props.settingsManager.refreshTranslations?.();
      props.settingsManager.collectFields?.();
      props.settingsManager.syncFields();
      visible.value = true;
    };
    const openNative = () => {
      open();
    };
    const onKeyDown = event => {
      if (visible.value && event.key === "Escape") requestClose();
    };

    onMounted(() => {
      updateLanguage();
      const nativeSettings = document.querySelector(".window.settings");
      const content = nativeSettings?.querySelector(".scrollable");
      const actions = nativeSettings?.querySelector("footer");
      if (content) {
        const groups = [];
        let currentGroup = null;
        for (const node of Array.from(content.childNodes)) {
          const heading = node.nodeType === Node.ELEMENT_NODE
            ? node.querySelector?.(".settings-category-title")
            : null;
          if (heading) {
            currentGroup = { id: `settings-section-${groups.length}`, label: heading.textContent.trim(), nodes: [] };
            groups.push(currentGroup);
          } else if (currentGroup) currentGroup.nodes.push(node);
        }
        const getSectionPanel = sectionId => {
          if (!zfxSectionPanels.has(sectionId)) {
            const panel = document.createElement("div");
            panel.className = "fx-settings-category-panel fx-settings-merged-zfx-panel";
            zfxSectionPanels.set(sectionId, panel);
          }
          return zfxSectionPanels.get(sectionId);
        };
        for (const group of groups) {
          const groupKey = normalizeSectionKey(group.label);
          const defaultSection = ({
            general: "general", allgemein: "general", ingame: "display", imspiel: "display",
            interface: "interface", benutzeroberflche: "interface", benutzeroberflaeche: "interface",
            notifications: "notifications", benachrichtigungen: "notifications",
            replays: "replays", wiederholungen: "replays", about: "about", uber: "about",
          })[groupKey];
          if (!defaultSection) continue;
          let currentSectionId = defaultSection;
          for (const node of group.nodes) {
            const heading = node.nodeType === Node.ELEMENT_NODE
              ? node.querySelector?.(".settings-subsection-title")
              : null;
            if (groupKey === "ingame" && heading) {
              const subsectionKey = normalizeSectionKey(heading.dataset.settingsSubsectionLabel || heading.textContent);
              currentSectionId = ["controls", "steuerung"].includes(subsectionKey) ? "controls" : "display";
            }
            getSectionPanel(currentSectionId).append(node);
          }
        }
        content.replaceChildren();
        selectSettingsSection(activeSettingsSection.value);
      }
      actions?.remove();
      settingsContent.value?.addEventListener("input", markZfxSettingsChanged, true);
      settingsContent.value?.addEventListener("change", markZfxSettingsChanged, true);
      if (nativeSettings) nativeSettings.style.display = "none";
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("fx-game-language-change", handleGameLanguageChange);
      window.addEventListener("fx-settings-profile-loaded", handleProfileLoaded);
      window.__fx.openVueSettings = open;
      window.__fx.closeVueSettings = requestClose;
      window.__fx.openVueGameSettings = openNative;
      window.__fx.closeVueGameSettings = requestClose;
    });

    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("fx-game-language-change", handleGameLanguageChange);
      window.removeEventListener("fx-settings-profile-loaded", handleProfileLoaded);
      settingsContent.value?.removeEventListener("input", markZfxSettingsChanged, true);
      settingsContent.value?.removeEventListener("change", markZfxSettingsChanged, true);
      if (window.__fx?.openVueSettings === open) delete window.__fx.openVueSettings;
      if (window.__fx?.closeVueSettings === requestClose) delete window.__fx.closeVueSettings;
      if (window.__fx?.openVueGameSettings === openNative) delete window.__fx.openVueGameSettings;
      if (window.__fx?.closeVueGameSettings === requestClose) delete window.__fx.closeVueGameSettings;
    });

    return { visible, profileDirty, hasZfxSettings, activeSettingsSection, settingsSections, isGerman, closeConfirmation, profilesToolbar, settingsContent, translateSection, labels, close, requestClose, saveAndClose, discardAndClose, saveProfileChanges, discardProfileChanges, selectSettingsSection };
  },
  template: `
    <div v-show="visible" class="fx-settings-overlay" @pointerdown.self="requestClose">
      <section class="fx-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="fx-settings-title">
        <header class="fx-settings-header">
          <div class="fx-settings-mark" aria-hidden="true">⚙</div>
          <div class="fx-settings-heading"><small>ZFX CLIENT · SETTINGS</small><h1 id="fx-settings-title">{{ labels.title }}</h1><p>{{ labels.subtitle }}</p></div>
          <ActiveSettingsProfileSelector :has-unsaved="profileDirty" />
          <button type="button" class="fx-settings-close" :aria-label="labels.close" @click="requestClose">×</button>
        </header>
        <SettingsProfilesToolbar ref="profilesToolbar" @dirty-change="profileDirty = $event" />
        <div class="fx-settings-body">
          <nav class="fx-settings-tabs" role="tablist" :aria-label="labels.sections">
            <button v-for="section in settingsSections" :key="section.id" type="button" role="tab" :aria-selected="activeSettingsSection === section.id" :class="{ 'is-active': activeSettingsSection === section.id }" @click="selectSettingsSection(section.id)">{{ section.label }}</button>
          </nav>
          <main class="fx-settings-merged-main">
            <GameSettingsPanel v-if="['general','display','controls','connection'].includes(activeSettingsSection)" :section="activeSettingsSection" />
            <section v-show="hasZfxSettings" class="fx-settings-merged-zfx-source">
              <header><span>{{ labels.clientSettings }}</span><h2>{{ settingsSections.find(section => section.id === activeSettingsSection)?.label }}</h2></header>
              <div ref="settingsContent" class="fx-settings-content"></div>
            </section>
          </main>
        </div>
        <div class="fx-settings-actions">
          <div class="fx-settings-profile-actions fx-settings-global-profile-actions">
            <button type="button" class="fx-profile-reset" :disabled="!profileDirty" @click="discardProfileChanges"><span aria-hidden="true">↺</span> {{ labels.discardProfile }}</button>
            <button type="button" class="fx-profile-save" :disabled="!profileDirty" @click="saveProfileChanges"><span aria-hidden="true">✓</span> {{ labels.saveProfile }}</button>
          </div>
          <button type="button" class="fx-settings-close-bottom" @click="requestClose">{{ labels.close }}</button>
        </div>
        <div v-if="closeConfirmation" class="fx-settings-close-confirm-backdrop" role="presentation">
          <section class="fx-settings-close-confirm" role="alertdialog" aria-modal="true" aria-labelledby="fx-settings-close-confirm-title">
            <span class="fx-settings-close-confirm-icon" aria-hidden="true">⚠</span>
            <div><h2 id="fx-settings-close-confirm-title">{{ isGerman ? 'Ungespeicherte Änderungen' : 'Unsaved changes' }}</h2><p>{{ isGerman ? 'Was möchtest du mit den Änderungen in diesem Profil machen?' : 'What would you like to do with this profile’s changes?' }}</p></div>
            <div class="fx-settings-close-confirm-actions">
              <button type="button" class="is-primary" @click="saveAndClose"><span aria-hidden="true">✓</span> {{ isGerman ? 'Speichern' : 'Save' }}</button>
              <button type="button" class="is-danger" @click="discardAndClose"><span aria-hidden="true">↶</span> {{ isGerman ? 'Änderungen verwerfen' : 'Discard changes' }}</button>
              <button type="button" @click="closeConfirmation = false"><span aria-hidden="true">×</span> {{ isGerman ? 'Weiter bearbeiten' : 'Keep editing' }}</button>
            </div>
          </section>
        </div>
      </section>
    </div>`,
});

export function createVueSettingsView(settingsManager) {
  const host = document.createElement("div");
  host.id = "fx-settings-view-root";
  document.body.appendChild(host);
  const app = createApp(VueSettingsView, { settingsManager });
  app.mount(host);
  return () => {
    app.unmount();
    host.remove();
  };
}
