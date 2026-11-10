import { defineComponent } from "vue/dist/vue.esm-bundler.js";

export const GameModeBadge = defineComponent({
  props: { modeKey: String, label: String, standalone: Boolean, compact: Boolean },
  template: `
    <span class="fx-custom-lobby-mode-emblem" :class="{ 'is-standalone': standalone, 'is-compact': compact }" :data-mode="modeKey || 'unknown'" role="img" :aria-label="label || ''" :title="label || ''">
      <svg v-if="modeKey === 'team'" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/></svg>
      <svg v-else-if="modeKey === 'battle-royale'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/></svg>
      <svg v-else-if="modeKey === 'duel'" viewBox="0 0 24 24"><circle cx="6.5" cy="7" r="2.7"/><path d="M2 19v-2a4.5 4.5 0 0 1 9 0v2z"/><circle cx="17.5" cy="7" r="2.7"/><path d="M13 19v-2a4.5 4.5 0 0 1 9 0v2z"/><path d="M10 11.5h4"/></svg>
      <svg v-else-if="modeKey === 'zombie'" viewBox="0 0 24 24"><path d="M12 3a8 8 0 0 0-5 14.2V21h3v-2h4v2h3v-3.8A8 8 0 0 0 12 3Z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/><path d="M10 15h4"/></svg>
      <svg v-else viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/></svg>
    </span>`,
});
