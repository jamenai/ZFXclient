import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import settingsManager, { settingsApi } from "../../../modules/settings/settings.js";
import { createDefaultSettings } from "../../../modules/settings/settingsSchema.js";
import { mergeSettings } from "../../../modules/settings/settingsStore.js";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  SYSTEM_DEFAULT_PROFILE_ID,
  applyProfileToRuntime,
  beginSettingsProfileDraft,
  createCustomProfileFromDefault,
  getNativeSettingsDraft,
  migrateProfile,
  normalizeProfile,
  readProfiles,
} from "./settingsProfilesView.js";

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const SettingsProfilesToolbar = defineComponent({
  name: "SettingsProfilesToolbar",
  emits: ["dirty-change"],
  setup(_props, { emit, expose }) {
    const profiles = ref([]);
    const activeId = ref(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || SYSTEM_DEFAULT_PROFILE_ID);
    const editingId = ref("");
    const profileName = ref("");
    const status = ref("");
    const dirty = ref(false);
    const addMode = ref(false);
    const isGerman = computed(() => String(window.__fx?.getGameLanguage?.() || "en").toLowerCase().startsWith("de"));
    const text = computed(() => isGerman.value ? {
      profile: "Profil auswählen", add: "Hinzufügen", export: "Exportieren", remove: "Löschen", import: "Profil importieren",
      newName: "Name des neuen Profils", namePlaceholder: "Profilname", create: "Profil erstellen", cancel: "Abbrechen", save: "Speichern", reset: "Änderungen verwerfen",
      unsaved: "UNGESPEICHERTE ÄNDERUNGEN – noch nicht in diesem Profil gespeichert.", saved: "Profil gespeichert.", savedInactive: "Profil gespeichert. Im Spiel bleibt das aktive Profil unverändert.",
      confirmDiscard: "Ungespeicherte Änderungen verwerfen?", confirmDelete: "Dieses Profil löschen?", nameRequired: "Bitte einen Profilnamen eingeben.",
      nameExists: "Dieser Profilname ist bereits vergeben.", imported: "Profil importiert.", invalid: "Profil konnte nicht importiert werden.",
      confirmImport: "Ungespeicherte Änderungen verwerfen und Profil importieren?",
    } : {
      profile: "Select profile", add: "Add", export: "Export", remove: "Delete", import: "Import profile",
      newName: "New profile name", namePlaceholder: "Profile name", create: "Create profile", cancel: "Cancel", save: "Save", reset: "Discard changes",
      unsaved: "UNSAVED CHANGES – not yet stored in this profile.", saved: "Profile saved.", savedInactive: "Profile saved. The active in-game profile is unchanged.",
      confirmDiscard: "Discard unsaved changes?", confirmDelete: "Delete this profile?", nameRequired: "Enter a profile name.",
      nameExists: "That profile name is already in use.", imported: "Profile imported.", invalid: "Could not import this profile.",
      confirmImport: "Discard unsaved changes and import a profile?",
    });
    const editingProfile = computed(() => profiles.value.find(profile => profile.id === editingId.value) || profiles.value[0] || null);

    function emitDirty(value) {
      dirty.value = value;
      emit("dirty-change", value);
    }
    function storeProfiles() {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles.value));
    }
    function loadProfile(id) {
      editingId.value = id;
      beginSettingsProfileDraft(id);
      settingsManager.syncFields();
      emitDirty(false);
      status.value = "";
      window.dispatchEvent(new CustomEvent("fx-settings-profile-loaded"));
    }
    function refreshProfiles() {
      profiles.value = readProfiles();
      const storedActive = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || SYSTEM_DEFAULT_PROFILE_ID;
      activeId.value = storedActive;
      if (!profiles.value.some(profile => profile.id === editingId.value)) {
        editingId.value = profiles.value.find(profile => profile.id === storedActive)?.id || profiles.value[0]?.id || "";
      }
    }
    function changeEditingProfile(event) {
      const id = String(event.target.value || "");
      if (!profiles.value.some(profile => profile.id === id)) return;
      if (dirty.value && !window.confirm(text.value.confirmDiscard)) {
        event.target.value = editingId.value;
        return;
      }
      loadProfile(id);
    }
    function activateProfile(event) {
      const id = String(event.target.value || "");
      if (![SYSTEM_DEFAULT_PROFILE_ID, ...profiles.value.map(profile => profile.id)].includes(id) || id === activeId.value) return;
      if (!window.confirm("Activate this profile and reload the client?")) {
        event.target.value = activeId.value;
        return;
      }
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
      window.location.reload();
    }
    function captureDraft(profile) {
      const native = getNativeSettingsDraft() || {};
      return normalizeProfile({
        format: "zfx-settings-profile", schemaVersion: 3, id: profile.id, name: profile.name, updatedAt: Date.now(),
        native: { values: native.values || {}, settings: native.settings || {}, connection: native.connection ?? 0, shortcuts: native.shortcuts || {} },
        zfx: settingsManager.getDraft?.() || settingsApi.getSnapshot(),
      });
    }
    function saveChanges() {
      const selected = editingProfile.value;
      if (!selected || selected.id === SYSTEM_DEFAULT_PROFILE_ID) return false;
      try {
        const saved = captureDraft(selected);
        const index = profiles.value.findIndex(profile => profile.id === saved.id);
        if (index < 0) return false;
        profiles.value.splice(index, 1, saved);
        storeProfiles();
        emitDirty(false);
        if (saved.id === activeId.value) {
          applyProfileToRuntime(saved);
          loadProfile(saved.id);
          status.value = text.value.saved;
        } else status.value = text.value.savedInactive;
        return true;
      } catch (error) {
        status.value = String(error?.message || error);
        return false;
      }
    }
    function discardChanges() {
      if (!profiles.value.some(profile => profile.id === editingId.value)) return false;
      profiles.value = readProfiles();
      loadProfile(editingId.value);
      return true;
    }
    function startAdd() {
      if (dirty.value && !window.confirm(text.value.confirmDiscard)) return;
      if (dirty.value) discardChanges();
      addMode.value = true;
      profileName.value = "";
      status.value = "";
    }
    function createProfile() {
      const name = profileName.value.trim().slice(0, 60);
      if (!name) { status.value = text.value.nameRequired; return false; }
      if (["default", ...profiles.value.map(profile => profile.name.toLowerCase())].includes(name.toLowerCase())) {
        status.value = text.value.nameExists;
        return false;
      }
      const profile = createCustomProfileFromDefault(name);
      profiles.value.unshift(profile);
      storeProfiles();
      addMode.value = false;
      profileName.value = "";
      loadProfile(profile.id);
      return true;
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
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || (dirty.value && !window.confirm(text.value.confirmImport))) return;
      try {
        const imported = normalizeProfile(migrateProfile(JSON.parse(await file.text())));
        if (imported.id === SYSTEM_DEFAULT_PROFILE_ID) imported.id = makeId();
        if (imported.name.toLowerCase() === "default") imported.name = "Default copy";
        const nameMatch = profiles.value.find(profile => profile.name.toLowerCase() === imported.name.toLowerCase());
        if (nameMatch?.id === activeId.value) {
          imported.id = makeId();
          imported.name = `${imported.name} imported`.slice(0, 60);
        } else if (nameMatch) imported.id = nameMatch.id;
        else if (profiles.value.some(profile => profile.id === imported.id)) imported.id = makeId();
        const index = profiles.value.findIndex(profile => profile.id === imported.id);
        if (index >= 0) profiles.value.splice(index, 1, imported);
        else profiles.value.unshift(imported);
        storeProfiles();
        status.value = text.value.imported;
        loadProfile(imported.id);
      } catch (error) {
        status.value = `${text.value.invalid} ${String(error?.message || error)}`;
      }
    }
    function deleteProfile() {
      const selected = editingProfile.value;
      if (!selected || !window.confirm(text.value.confirmDelete)) return;
      profiles.value = profiles.value.filter(profile => profile.id !== selected.id);
      storeProfiles();
      if (selected.id === activeId.value) {
        const nextActive = profiles.value[0]?.id || SYSTEM_DEFAULT_PROFILE_ID;
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, nextActive);
        window.location.reload();
        return;
      }
      const next = profiles.value.find(profile => profile.id === activeId.value) || profiles.value[0];
      if (next) loadProfile(next.id);
    }
    const markDirty = () => {
      if (addMode.value || !editingProfile.value) return;
      emitDirty(true);
      status.value = text.value.unsaved;
    };
    onMounted(() => {
      refreshProfiles();
      if (editingId.value) loadProfile(editingId.value);
      window.addEventListener("fx-settings-changed", markDirty);
    });
    onBeforeUnmount(() => window.removeEventListener("fx-settings-changed", markDirty));
    expose({ saveChanges, discardChanges, isDirty: () => dirty.value });
    return {
      profiles, activeId, editingId, editingProfile, profileName, status, dirty, addMode, text,
      changeEditingProfile, activateProfile, startAdd, createProfile, saveChanges, discardChanges,
      exportSelectedProfile, importProfile, deleteProfile,
    };
  },
  template: `
    <section class="fx-settings-profile-editor" aria-label="Profile editor actions">
      <label class="fx-settings-profile-edit-selector"><span>{{ text.profile }}</span><select :value="editingId" @change="changeEditingProfile"><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label>
      <button type="button" class="fx-profile-add" title="Add profile" @click="startAdd"><span aria-hidden="true">＋</span> {{ text.add }}</button>
      <button type="button" class="fx-profile-export" title="Export profile" @click="exportSelectedProfile"><span aria-hidden="true">⇩</span> {{ text.export }}</button>
      <button type="button" class="is-danger" title="Delete profile" @click="deleteProfile"><span aria-hidden="true">⌫</span> {{ text.remove }}</button>
      <button type="button" class="fx-profile-import" title="Import profile" @click="$refs.profileFile.click()"><span aria-hidden="true">⇧</span> {{ text.import }}</button>
      <template v-if="addMode">
        <label class="fx-settings-profile-new-name"><span>{{ text.newName }}</span><input v-model="profileName" maxlength="60" :placeholder="text.namePlaceholder" @keydown.enter.prevent="createProfile"></label>
        <button type="button" @click="createProfile"><span aria-hidden="true">✓</span> {{ text.create }}</button>
        <button type="button" @click="addMode = false"><span aria-hidden="true">×</span> {{ text.cancel }}</button>
      </template>
      <input ref="profileFile" class="fx-settings-profile-file" type="file" accept="application/json,.json" @change="importProfile">
      <p v-if="dirty" class="fx-settings-profile-status is-dirty" role="status"><span aria-hidden="true">⚠</span> {{ text.unsaved }}</p>
      <p v-else-if="status" class="fx-settings-profile-status" role="status"><span aria-hidden="true">✓</span> {{ status }}</p>
    </section>`,
});
