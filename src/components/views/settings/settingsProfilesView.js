import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import settingsManager, { saveSettings, settingsApi } from "../../../modules/settings/settings.js";
import { createDefaultSettings } from "../../../modules/settings/settingsSchema.js";
import { mergeSettings } from "../../../modules/settings/settingsStore.js";

const PROFILE_STORAGE_KEY = "zfx_settings_profiles_v1";
const PROFILE_FORMAT = "zfx-settings-profile";
const PROFILE_SCHEMA_VERSION = 3;
const SYSTEM_DEFAULT_PROFILE_ID = "zfx-system-default";
const ACTIVE_PROFILE_STORAGE_KEY = "zfx_active_settings_profile_v1";
const NATIVE_SETTING_IDS = [1, 2, 5, 7, 8, 9, 11, 12, 13, 14, 15, 16];
const NATIVE_SETTING_KEYS = { 1: "resolution", 2: "largeUi", 5: "font", 7: "placeBalance", 8: "hideZoom", 9: "minimumFont", 11: "textSpeed", 12: "language", 13: "messageKeepClosed", 14: "messageMuted", 15: "highlighting", 16: "highlightIntensity" };
const NATIVE_KEY_SETTING_IDS = Object.fromEntries(Object.entries(NATIVE_SETTING_KEYS).map(([id, key]) => [key, Number(id)]));

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function migrateProfile(candidate) {
  if (!candidate || candidate.format !== PROFILE_FORMAT) throw new TypeError("This is not a supported ZFX settings profile.");
  let profile = candidate;
  let version = Number(profile.schemaVersion) || 1;
  if (version > PROFILE_SCHEMA_VERSION || version < 1) throw new TypeError("This settings profile uses an unsupported schema version.");
  while (version < PROFILE_SCHEMA_VERSION) {
    if (version === 1) profile = { ...profile, schemaVersion: 2, native: { ...profile.native, resetToDefaults: false } };
    if (version === 2) profile = { ...profile, schemaVersion: 3 };
    version++;
  }
  return profile;
}

function normalizeProfile(candidate) {
  if (!candidate || candidate.format !== PROFILE_FORMAT || candidate.schemaVersion !== PROFILE_SCHEMA_VERSION
      || typeof candidate.name !== "string" || !candidate.name.trim()
      || !candidate.native || typeof candidate.native !== "object"
      || !candidate.zfx || typeof candidate.zfx !== "object") throw new TypeError("This is not a supported ZFX settings profile.");
  const values = {};
  for (const id of NATIVE_SETTING_IDS) {
    const value = candidate.native.values?.[id];
    if (value === undefined) continue;
    if (id === 5 || id === 12) {
      if (typeof value !== "string") throw new TypeError(`Invalid native setting ${id}.`);
      values[id] = value;
    } else {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new TypeError(`Invalid native setting ${id}.`);
      values[id] = number;
    }
  }
  const shortcuts = {};
  for (const [index, value] of Object.entries(candidate.native.shortcuts || {})) {
    const numericIndex = Number(index);
    if (Number.isInteger(numericIndex) && numericIndex >= 0 && typeof value === "string") shortcuts[numericIndex] = value;
  }
  return {
    format: PROFILE_FORMAT,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : makeId(),
    name: candidate.name.trim().slice(0, 60),
    updatedAt: Number(candidate.updatedAt) || Date.now(),
    native: {
      resetToDefaults: candidate.native.resetToDefaults === true,
      settings: candidate.native.settings && typeof candidate.native.settings === "object"
        ? { ...candidate.native.settings }
        : Object.fromEntries(Object.entries(NATIVE_SETTING_KEYS).filter(([id]) => values[id] !== undefined).map(([id, key]) => [key, values[id]])),
      // Retain old fields while old profile exports are migrated.
      values,
      connection: Number.isInteger(Number(candidate.native.connection)) ? Number(candidate.native.connection) : null,
      shortcuts,
    },
    zfx: mergeSettings(createDefaultSettings(), candidate.zfx),
  };
}

function readProfiles() {
  try {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY) || "[]";
    const value = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    const profiles = [];
    for (const candidate of value) {
      try {
        // This was an automatic migration snapshot, not a profile explicitly
        // saved by the user. Do not present it as an available profile.
        if (String(candidate?.name || "").trim().toLowerCase() === "current settings") continue;
        const profile = normalizeProfile(migrateProfile(candidate));
        if (profile.id !== SYSTEM_DEFAULT_PROFILE_ID) profiles.push(profile);
      } catch (error) { console.warn("[ZFX Client] Skipping an invalid settings profile:", error); }
    }
    const migrated = JSON.stringify(profiles);
    if (migrated !== stored) localStorage.setItem(PROFILE_STORAGE_KEY, migrated);
    return profiles;
  } catch { return []; }
}

function createSystemDefaultProfile() {
  return normalizeProfile({
    format: PROFILE_FORMAT, schemaVersion: PROFILE_SCHEMA_VERSION, id: SYSTEM_DEFAULT_PROFILE_ID,
    name: "Default (System)", updatedAt: 0,
    native: { resetToDefaults: true, values: {}, connection: 0, shortcuts: {} }, zfx: createDefaultSettings(),
  });
}

function profileNativeDraft(profile) {
  const snapshot = window.__fx?.gameSettingsAdapter?.getSnapshot?.();
  const settings = profile.native.resetToDefaults
    ? Object.fromEntries(Object.entries(NATIVE_SETTING_KEYS).filter(([id]) => snapshot?.defaults?.[id] !== undefined).map(([id, key]) => [key, snapshot.defaults[id]]))
    : { ...profile.native.settings };
  return {
    settings,
    values: Object.fromEntries(Object.entries(settings).map(([key, value]) => [NATIVE_KEY_SETTING_IDS[key], value])),
    connection: profile.native.resetToDefaults ? (snapshot?.defaultConnection ?? 0) : (profile.native.connection ?? 0),
    shortcuts: profile.native.resetToDefaults
      ? Object.fromEntries((snapshot?.shortcutDefaults || []).map((value, index) => [index, value]))
      : { ...profile.native.shortcuts },
  };
}

let nativeDraft = null;

export function beginSettingsProfileDraft(profileId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || SYSTEM_DEFAULT_PROFILE_ID) {
  const profiles = readProfiles();
  const profile = profileId === SYSTEM_DEFAULT_PROFILE_ID
    ? createSystemDefaultProfile()
    : profiles.find(item => item.id === profileId) || createSystemDefaultProfile();
  nativeDraft = profileNativeDraft(profile);
  settingsManager.beginDraft(mergeSettings(createDefaultSettings(), profile.zfx));
  return profile;
}

export function getNativeSettingsDraft() { return nativeDraft; }
export function setNativeSettingsDraft(id, value) {
  if (!nativeDraft) beginSettingsProfileDraft();
  nativeDraft.values[id] = value;
  const key = NATIVE_SETTING_KEYS[id];
  if (key) nativeDraft.settings[key] = value;
}
export function setNativeConnectionDraft(value) {
  if (!nativeDraft) beginSettingsProfileDraft();
  nativeDraft.connection = Number(value) || 0;
  nativeDraft.settings.connection = nativeDraft.connection;
}
export function setNativeShortcutDraft(index, value) {
  if (!nativeDraft) beginSettingsProfileDraft();
  nativeDraft.shortcuts[index] = String(value || "");
}

function registerNativeSettingsNamespace() {
  settingsApi.registerNamespace("native", {
    get(key) {
      if (!nativeDraft) return undefined;
      if (key === "connection") return nativeDraft.connection;
      if (key.startsWith("shortcut.")) return nativeDraft.shortcuts[Number(key.slice(9))];
      const id = NATIVE_KEY_SETTING_IDS[key];
      return id === undefined ? undefined : nativeDraft.settings?.[key] ?? nativeDraft.values[id];
    },
    set(key, value) {
      if (!nativeDraft) beginSettingsProfileDraft();
      if (key === "connection") { setNativeConnectionDraft(value); return true; }
      if (key.startsWith("shortcut.")) { const index = Number(key.slice(9)); if (!Number.isInteger(index) || index < 0) return false; setNativeShortcutDraft(index, value); return true; }
      const id = NATIVE_KEY_SETTING_IDS[key];
      if (id === undefined) return false;
      setNativeSettingsDraft(id, value);
      return true;
    },
  });
}
export function resetNativeSettingsDraft() {
  const snapshot = window.__fx?.gameSettingsAdapter?.getSnapshot?.();
  if (!snapshot) return;
  nativeDraft = {
    values: { ...(snapshot.defaults || {}) },
    settings: { ...Object.fromEntries(Object.entries(NATIVE_SETTING_KEYS).filter(([id]) => snapshot.defaults?.[id] !== undefined).map(([id, key]) => [key, snapshot.defaults[id]])), connection: snapshot.defaultConnection ?? 0 },
    connection: snapshot.defaultConnection ?? 0,
    shortcuts: Object.fromEntries((snapshot.shortcutDefaults || []).map((value, index) => [index, value])),
  };
}

function applyZfxProfile(profile, { persist = true } = {}) {
  const next = mergeSettings(createDefaultSettings(), profile.zfx);
  settingsApi.replaceProfileValues(next);
  settingsManager.discardDraft();
  settingsManager.applySettings();
  settingsManager.syncFields();
  if (persist) saveSettings();
  // A few game patches (including leaderboard tabs) calculate canvas/layout
  // geometry during resize. Native game handlers may not exist yet during
  // profile initialization, so refresh after the game has mounted as well.
  const refreshGameLayout = () => window.dispatchEvent(new Event("resize"));
  refreshGameLayout();
  [500, 1500, 4000].forEach(delay => window.setTimeout(refreshGameLayout, delay));
}

function applyProfileToRuntime(profile, { persist = true } = {}) {
  applyZfxProfile(profile, { persist });
  const adapter = window.__fx?.gameSettingsAdapter;
  if (!adapter?.setField) throw new Error("Native game settings are not available yet.");
  const defaults = profile.native.resetToDefaults ? adapter.getSnapshot?.() : null;
  if (profile.native.resetToDefaults) {
    // The native reset handler also navigates to the game's Settings screen.
    // Apply default values through the adapter instead of invoking that UI action.
    for (const id of NATIVE_SETTING_IDS) {
      const value = defaults?.defaults?.[id];
      if (value !== undefined && adapter.setField(id, value) === false) throw new Error(`Could not reset native setting ${id}.`);
    }
    adapter.setConnection?.(defaults?.defaultConnection ?? 0);
    for (const [index, shortcut] of (defaults?.shortcutDefaults || []).entries()) adapter.setShortcut?.(index, shortcut);
  }
  const nativeValues = { ...profile.native.values };
  for (const [key, id] of Object.entries(NATIVE_KEY_SETTING_IDS)) {
    if (profile.native.settings?.[key] !== undefined) nativeValues[id] = profile.native.settings[key];
  }
  for (const id of NATIVE_SETTING_IDS.filter(id => id !== 12)) {
    if (nativeValues[id] !== undefined && adapter.setField(id, nativeValues[id]) === false) throw new Error(`Could not apply native setting ${id}.`);
  }
  if (profile.native.values[12] !== undefined && adapter.setField(12, profile.native.values[12]) === false) throw new Error("Could not apply the native language setting.");
  if (profile.native.connection !== null) adapter.setConnection?.(profile.native.connection);
  for (const [index, shortcut] of Object.entries(profile.native.shortcuts)) adapter.setShortcut?.(Number(index), shortcut);
}

export function initializeSettingsProfiles() {
  const profiles = readProfiles();
  let activeId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
  if (!activeId) {
    activeId = SYSTEM_DEFAULT_PROFILE_ID;
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeId);
  }
  let active = activeId === SYSTEM_DEFAULT_PROFILE_ID ? createSystemDefaultProfile() : profiles.find(profile => profile.id === activeId);
  if (!active) {
    activeId = SYSTEM_DEFAULT_PROFILE_ID;
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeId);
    active = createSystemDefaultProfile();
  }
  // ZFX settings are independent of the native game adapter, so apply them
  // immediately instead of waiting for that adapter to initialize.
  applyZfxProfile(active);
  registerNativeSettingsNamespace();
  if (!window.__fx?.gameSettingsAdapter?.setField) {
    let attempts = 0;
    const retry = () => {
      if (window.__fx?.gameSettingsAdapter?.setField) {
        const current = activeId === SYSTEM_DEFAULT_PROFILE_ID ? createSystemDefaultProfile() : readProfiles().find(profile => profile.id === activeId);
        if (current) {
          try { applyProfileToRuntime(current, { persist: false }); }
          catch (error) { console.error("[ZFX Client] Could not activate the saved settings profile:", error); }
        }
      } else if (++attempts < 80) window.setTimeout(retry, 250);
      else console.error("[ZFX Client] Native settings adapter did not become available; the active profile was not applied.");
    };
    window.setTimeout(retry, 0);
  } else applyProfileToRuntime(active);
  beginSettingsProfileDraft(activeId);
  registerNativeSettingsNamespace();
}

export const ActiveSettingsProfileSelector = defineComponent({
  name: "ActiveSettingsProfileSelector",
  setup() {
    const profiles = ref([]);
    const activeId = ref(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || SYSTEM_DEFAULT_PROFILE_ID);
    const isGerman = computed(() => String(window.__fx?.getGameLanguage?.() || "en").toLowerCase().startsWith("de"));
    const label = computed(() => isGerman.value ? "Aktiv im Spiel" : "Active in game");
    const allProfiles = computed(() => [createSystemDefaultProfile(), ...profiles.value]);
    function refresh() {
      profiles.value = readProfiles();
      const stored = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || SYSTEM_DEFAULT_PROFILE_ID;
      activeId.value = allProfiles.value.some(profile => profile.id === stored) ? stored : SYSTEM_DEFAULT_PROFILE_ID;
    }
    function activate(event) {
      const id = String(event.target.value || "");
      if (!allProfiles.value.some(profile => profile.id === id) || id === activeId.value) return;
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
      window.location.reload();
    }
    onMounted(refresh);
    return { profiles, activeId, allProfiles, label, activate };
  },
  template: `<label class="fx-settings-active-profile-selector"><span>{{ label }}</span><select :value="activeId" @change="activate"><option v-for="profile in allProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label>`,
});

export const SettingsProfilesToolbar = defineComponent({
  name: "SettingsProfilesEditor",
  emits: ["edit-state-change"],
  setup(_props, { emit }) {
    const profiles = ref([]);
    const activeId = ref(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || SYSTEM_DEFAULT_PROFILE_ID);
    const editingId = ref(activeId.value);
    const profileName = ref("");
    const status = ref("");
    const dirty = ref(false);
    const isEditing = ref(false);
    const duplicateMode = ref(false);
    const isGerman = computed(() => String(window.__fx?.getGameLanguage?.() || "en").toLowerCase().startsWith("de"));
    const text = computed(() => isGerman.value ? {
      profile: "Profil auswÃ¤hlen", editing: "Profil wird bearbeitet", edit: "Bearbeiten", export: "Exportieren", duplicate: "Duplizieren", remove: "LÃ¶schen", import: "Profil importieren",
      newName: "Name des Duplikats", namePlaceholder: "Profilname", createDuplicate: "Duplikat erstellen", cancel: "Abbrechen", save: "Ã„nderungen speichern", cancelEdit: "Bearbeitung abbrechen",
      unsaved: "Ungespeicherte Ã„nderungen im Profilentwurf.", saved: "Profil gespeichert.", savedInactive: "Profil gespeichert. Das aktive Spielprofil blieb unverÃ¤ndert.",
      confirmDiscard: "Ungespeicherte Ã„nderungen am Entwurf verwerfen?", confirmActivate: "Profil aktivieren und Client neu laden? Nicht gespeicherte Ã„nderungen am Entwurf verwerfen?",
      confirmOverwrite: "Ã„nderungen in dieses Profil speichern? Wenn es aktiv ist, werden sie im Spiel Ã¼bernommen.", confirmDelete: "Dieses Profil lÃ¶schen?",
      nameRequired: "Bitte einen Namen fÃ¼r das Duplikat eingeben.", nameExists: "Dieser Profilname ist bereits vergeben.", systemLocked: "Das System-Standardprofil kann nicht bearbeitet oder gelÃ¶scht werden.",
      imported: "Profil importiert und zur Bearbeitung ausgewÃ¤hlt.", invalid: "Profil konnte nicht importiert werden.", confirmImport: "Ungespeicherte Ã„nderungen verwerfen und Profil importieren?",
    } : {
      profile: "Select profile", editing: "Editing profile", edit: "Edit", export: "Export", duplicate: "Duplicate", remove: "Delete", import: "Import profile",
      newName: "Duplicate name", namePlaceholder: "Profile name", createDuplicate: "Create duplicate", cancel: "Cancel", save: "Save changes", cancelEdit: "Cancel editing",
      unsaved: "Unsaved changes in this profile draft.", saved: "Profile saved.", savedInactive: "Profile saved. The active game profile was not changed.",
      confirmDiscard: "Discard unsaved changes to this draft?", confirmActivate: "Activate this profile and reload the client? Unsaved draft changes will be discarded?",
      confirmDelete: "Delete this profile?",
      nameRequired: "Enter a name for the duplicate.", nameExists: "That profile name is already in use.", systemLocked: "The system default profile cannot be edited or deleted.",
      imported: "Profile imported and selected for editing.", invalid: "Could not import this profile.", confirmImport: "Discard unsaved changes and import a profile?",
    });
    const allProfiles = computed(() => [createSystemDefaultProfile(), ...profiles.value]);
    const editingProfile = computed(() => allProfiles.value.find(profile => profile.id === editingId.value) || createSystemDefaultProfile());
    const canEdit = computed(() => editingProfile.value.id !== SYSTEM_DEFAULT_PROFILE_ID);
    const canOverwrite = computed(() => isEditing.value && dirty.value && editingProfile.value.id !== SYSTEM_DEFAULT_PROFILE_ID);

    function refreshProfiles() {
      profiles.value = readProfiles();
      const storedActive = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || SYSTEM_DEFAULT_PROFILE_ID;
      activeId.value = allProfiles.value.some(profile => profile.id === storedActive) ? storedActive : SYSTEM_DEFAULT_PROFILE_ID;
      if (!allProfiles.value.some(profile => profile.id === editingId.value)) editingId.value = activeId.value;
      profileName.value = "";
    }
    function changeEditingProfile(event) {
      const id = String(event.target.value || "");
      if (!allProfiles.value.some(profile => profile.id === id)) return;
      if (isEditing.value && !endEditing(false)) { event.target.value = editingId.value; return; }
      editingId.value = id;
      duplicateMode.value = false;
      profileName.value = "";
      dirty.value = false;
      status.value = "";
      beginSettingsProfileDraft(id);
      settingsManager.syncFields();
      window.dispatchEvent(new CustomEvent("fx-settings-profile-loaded"));
    }
    function activateProfile(event) {
      const id = String(event.target.value || "");
      if (!allProfiles.value.some(profile => profile.id === id) || id === activeId.value) return;
      if (!window.confirm(text.value.confirmActivate)) { event.target.value = activeId.value; return; }
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
      window.location.reload();
    }
    function captureDraft(name, id) {
      const native = getNativeSettingsDraft() || profileNativeDraft(editingProfile.value);
      return normalizeProfile({
        format: PROFILE_FORMAT, schemaVersion: PROFILE_SCHEMA_VERSION, id: id || makeId(), name, updatedAt: Date.now(),
        native: { values: native.values, settings: native.settings, connection: native.connection, shortcuts: native.shortcuts },
        zfx: settingsManager.getDraft?.() || settingsApi.getSnapshot(),
      });
    }
    function saveStored() { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles.value)); }
    function startEditing() {
      if (!canEdit.value) return;
      beginSettingsProfileDraft(editingId.value);
      settingsManager.syncFields();
      isEditing.value = true;
      dirty.value = false;
      status.value = "";
      emit("edit-state-change", true);
      window.dispatchEvent(new CustomEvent("fx-settings-profile-loaded"));
    }
    function endEditing(restore = true) {
      if (dirty.value && !window.confirm(text.value.confirmDiscard)) return false;
      isEditing.value = false;
      duplicateMode.value = false;
      profileName.value = "";
      dirty.value = false;
      status.value = "";
      if (restore) {
        beginSettingsProfileDraft(activeId.value);
        settingsManager.syncFields();
        window.dispatchEvent(new CustomEvent("fx-settings-profile-loaded"));
      }
      emit("edit-state-change", false);
      return true;
    }
    function startDuplicate() {
      if (isEditing.value) return;
      duplicateMode.value = true;
      profileName.value = `${editingProfile.value.name} copy`.slice(0, 60);
      status.value = "";
    }
    function createDuplicate() {
      const name = profileName.value.trim().slice(0, 60);
      if (!name) { status.value = text.value.nameRequired; return; }
      if (allProfiles.value.some(profile => profile.name.toLowerCase() === name.toLowerCase())) { status.value = text.value.nameExists; return; }
      try {
        const source = editingProfile.value;
        const profile = normalizeProfile({ ...source, id: makeId(), name, updatedAt: Date.now() });
        profiles.value.unshift(profile);
        saveStored();
        editingId.value = profile.id;
        profileName.value = "";
        duplicateMode.value = false;
        dirty.value = false;
        beginSettingsProfileDraft(profile.id);
        settingsManager.syncFields();
        isEditing.value = true;
        emit("edit-state-change", true);
        window.dispatchEvent(new CustomEvent("fx-settings-profile-loaded"));
      } catch (error) { status.value = String(error?.message || error); }
    }
    function saveChanges() {
      const selected = editingProfile.value;
      if (!selected || selected.id === SYSTEM_DEFAULT_PROFILE_ID) { status.value = text.value.systemLocked; return; }
      try {
        const profile = captureDraft(selected.name, selected.id);
        const index = profiles.value.findIndex(item => item.id === selected.id);
        if (index < 0) throw new Error("The profile no longer exists.");
        profiles.value.splice(index, 1, profile);
        saveStored();
        dirty.value = false;
        if (profile.id === activeId.value) {
          applyProfileToRuntime(profile);
          beginSettingsProfileDraft(profile.id);
          settingsManager.syncFields();
          window.dispatchEvent(new CustomEvent("fx-settings-profile-loaded"));
          status.value = text.value.saved;
        }
        else {
          status.value = text.value.savedInactive;
          isEditing.value = false;
          emit("edit-state-change", false);
        }
      } catch (error) { status.value = String(error?.message || error); }
    }
    function exportSelectedProfile() {
      const profile = editingProfile.value;
      if (!profile) return;
      const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ZFX-profile-${profile.name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "settings"}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    async function importProfile(event) {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      if (isEditing.value && dirty.value && !window.confirm(text.value.confirmImport)) return;
      if (isEditing.value) { isEditing.value = false; dirty.value = false; emit("edit-state-change", false); }
      try {
        const imported = normalizeProfile(migrateProfile(JSON.parse(await file.text())));
        if (imported.id === SYSTEM_DEFAULT_PROFILE_ID) imported.id = makeId();
        const nameMatch = profiles.value.find(item => item.name.toLowerCase() === imported.name.toLowerCase());
        if (nameMatch && nameMatch.id === activeId.value) {
          imported.id = makeId(); imported.name = `${imported.name} (imported)`.slice(0, 60);
        } else if (nameMatch) imported.id = nameMatch.id;
        else if (profiles.value.some(item => item.id === imported.id)) imported.id = makeId();
        const index = profiles.value.findIndex(item => item.id === imported.id);
        if (index >= 0) profiles.value.splice(index, 1, imported); else profiles.value.unshift(imported);
        saveStored(); editingId.value = imported.id; profileName.value = ""; dirty.value = false; status.value = text.value.imported;
        beginSettingsProfileDraft(imported.id); settingsManager.syncFields();
        isEditing.value = true;
        emit("edit-state-change", true);
        window.dispatchEvent(new CustomEvent("fx-settings-profile-loaded"));
      } catch (error) { status.value = `${text.value.invalid} ${String(error?.message || error)}`; }
    }
    function deleteProfile() {
      const profile = editingProfile.value;
      if (!profile || profile.id === SYSTEM_DEFAULT_PROFILE_ID || isEditing.value || !window.confirm(text.value.confirmDelete)) return;
      profiles.value = profiles.value.filter(item => item.id !== profile.id);
      saveStored();
      if (profile.id === activeId.value) {
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, SYSTEM_DEFAULT_PROFILE_ID);
        window.location.reload();
        return;
      }
      editingId.value = activeId.value;
      beginSettingsProfileDraft(editingId.value); settingsManager.syncFields();
      dirty.value = false; status.value = "";
      window.dispatchEvent(new CustomEvent("fx-settings-profile-loaded"));
    }
    function exportDraft() {
      const profile = editingProfile.value;
      if (!profile || profile.id === SYSTEM_DEFAULT_PROFILE_ID) return;
      const current = captureDraft(profile.name, profile.id);
      const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `ZFX-profile-${profile.name.replace(/[^a-z0-9_-]+/gi, "-") || "settings"}.json`; anchor.click(); URL.revokeObjectURL(url);
    }
    const markDirty = () => { if (isEditing.value) { dirty.value = true; status.value = text.value.unsaved; } };
    onMounted(() => {
      refreshProfiles();
      window.addEventListener("fx-settings-changed", markDirty);
    });
    onBeforeUnmount(() => window.removeEventListener("fx-settings-changed", markDirty));
    return { allProfiles, editingId, editingProfile, profileName, status, dirty, isEditing, duplicateMode, canEdit, canOverwrite, text,
      changeEditingProfile, startEditing, endEditing, startDuplicate, createDuplicate, saveChanges, exportSelectedProfile, exportDraft, importProfile, deleteProfile };
  },
  template: `
    <section class="fx-settings-profile-editor" aria-label="Profile editor actions">
      <label class="fx-settings-profile-edit-selector"><span>{{ isEditing ? text.editing : text.profile }}</span><select :value="editingId" :disabled="isEditing" @change="changeEditingProfile"><option v-for="profile in allProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label>
      <template v-if="!isEditing && !duplicateMode">
        <button type="button" :disabled="!canEdit" @click="startEditing">{{ text.edit }}</button>
        <button type="button" @click="exportSelectedProfile">{{ text.export }}</button>
        <button type="button" @click="startDuplicate">{{ text.duplicate }}</button>
        <button type="button" class="is-danger" :disabled="editingProfile.id === 'zfx-system-default'" @click="deleteProfile">{{ text.remove }}</button>
        <button type="button" @click="$refs.profileFile.click()">{{ text.import }}</button>
      </template>
      <template v-if="duplicateMode">
        <label class="fx-settings-profile-new-name"><span>{{ text.newName }}</span><input v-model="profileName" maxlength="60" :placeholder="text.namePlaceholder"></label>
        <button type="button" @click="createDuplicate">{{ text.createDuplicate }}</button>
        <button type="button" @click="duplicateMode = false">{{ text.cancel }}</button>
      </template>
      <div class="fx-settings-profile-actions">
        <template v-if="isEditing">
          <button type="button" :disabled="!canOverwrite" @click="saveChanges">{{ text.save }}</button>
          <button type="button" @click="endEditing()">{{ text.cancelEdit }}</button>
        </template>
      </div>
      <input ref="profileFile" class="fx-settings-profile-file" type="file" accept="application/json,.json" @change="importProfile">
      <p v-if="status" class="fx-settings-profile-status" :class="{ 'is-dirty': dirty }" role="status">{{ status }}</p>
    </section>`,
});
