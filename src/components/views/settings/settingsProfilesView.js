import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import settingsManager, { saveSettings, settingsApi } from "../../../modules/settings/settings.js";
import { createDefaultSettings } from "../../../modules/settings/settingsSchema.js";
import { mergeSettings } from "../../../modules/settings/settingsStore.js";

export const PROFILE_STORAGE_KEY = "zfx_settings_profiles_v1";
const PROFILE_FORMAT = "zfx-settings-profile";
const PROFILE_SCHEMA_VERSION = 3;
export const SYSTEM_DEFAULT_PROFILE_ID = "zfx-system-default";
export const ACTIVE_PROFILE_STORAGE_KEY = "zfx_active_settings_profile_v1";
const PROFILE_SEED_KEY = "zfx_settings_profiles_seeded_v2";
const NATIVE_SETTING_IDS = [1, 2, 5, 7, 8, 9, 11, 12, 13, 14, 15, 16];
const NATIVE_SETTING_KEYS = { 1: "resolution", 2: "largeUi", 5: "font", 7: "placeBalance", 8: "hideZoom", 9: "minimumFont", 11: "textSpeed", 12: "language", 13: "messageKeepClosed", 14: "messageMuted", 15: "highlighting", 16: "highlightIntensity" };
const NATIVE_KEY_SETTING_IDS = Object.fromEntries(Object.entries(NATIVE_SETTING_KEYS).map(([id, key]) => [key, Number(id)]));

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function migrateProfile(candidate) {
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

export function normalizeProfile(candidate) {
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

export function readProfiles() {
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

export function createSystemDefaultProfile() {
  return normalizeProfile({
    format: PROFILE_FORMAT, schemaVersion: PROFILE_SCHEMA_VERSION, id: SYSTEM_DEFAULT_PROFILE_ID,
    name: "Default", updatedAt: 0,
    native: { resetToDefaults: true, values: {}, connection: 0, shortcuts: {} }, zfx: createDefaultSettings(),
  });
}

export function createCustomProfileFromDefault(name = "Custom", id = makeId()) {
  const defaults = createSystemDefaultProfile();
  return normalizeProfile({ ...defaults, id, name, updatedAt: Date.now() });
}

function ensureInitialCustomProfile() {
  const profiles = readProfiles();
  let custom = profiles.find(profile => profile.name.toLowerCase() === "custom");
  if (!custom) {
    custom = createCustomProfileFromDefault();
    profiles.unshift(custom);
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  }
  const previouslySeeded = localStorage.getItem(PROFILE_SEED_KEY) === "true";
  const activeId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
  if (!activeId || (!previouslySeeded && activeId === SYSTEM_DEFAULT_PROFILE_ID)) {
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, custom.id);
  }
  localStorage.setItem(PROFILE_SEED_KEY, "true");
  return profiles;
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

export function applyProfileToRuntime(profile, { persist = true } = {}) {
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
  const profiles = ensureInitialCustomProfile();
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
    let retryTimer;
    const applyWhenNativeSettingsReady = () => {
      window.clearTimeout(retryTimer);
      if (window.__fx?.gameSettingsAdapter?.setField) {
        window.removeEventListener("fx-native-settings-adapter-ready", applyWhenNativeSettingsReady);
        const current = activeId === SYSTEM_DEFAULT_PROFILE_ID ? createSystemDefaultProfile() : readProfiles().find(profile => profile.id === activeId);
        if (current) {
          try { applyProfileToRuntime(current, { persist: false }); }
          catch (error) { console.error("[ZFX Client] Could not activate the saved settings profile:", error); }
        }
      } else retryTimer = window.setTimeout(applyWhenNativeSettingsReady, 1000);
    };
    window.addEventListener("fx-native-settings-adapter-ready", applyWhenNativeSettingsReady);
    applyWhenNativeSettingsReady();
  } else applyProfileToRuntime(active);
  beginSettingsProfileDraft(activeId);
  registerNativeSettingsNamespace();
}

export const ActiveSettingsProfileSelector = defineComponent({
  name: "ActiveSettingsProfileSelector",
  props: { hasUnsaved: { type: Boolean, default: false } },
  setup(props) {
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
      if (props.hasUnsaved && !window.confirm(isGerman.value
        ? "Profil aktivieren und Client neu laden? Ungespeicherte Änderungen werden verworfen?"
        : "Activate this profile and reload the client? Unsaved changes will be discarded?")) {
        event.target.value = activeId.value;
        return;
      }
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
      window.location.reload();
    }
    onMounted(refresh);
    return { profiles, activeId, allProfiles, label, activate };
  },
  template: `<label class="fx-settings-active-profile-selector"><span>{{ label }}</span><select :value="activeId" @change="activate"><option v-for="profile in allProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label>`,
});
