import { defineComponent } from "vue/dist/vue.esm-bundler.js";

export const LobbyPlayerName = defineComponent({
  props: { name: String, color: String },
  emits: ["activate"],
  template: `<button type="button" class="fx-custom-lobby-chat-player-name" :style="color ? { color } : null" @click.stop="$emit('activate', $event)">{{ name }}</button>`,
});
