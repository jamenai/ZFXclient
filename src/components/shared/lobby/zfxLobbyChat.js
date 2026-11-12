import { defineComponent } from "vue/dist/vue.esm-bundler.js";
import { zfxLobbyChat } from "../../../modules/zfxLobbyChat.js";
import { LobbyPlayerName } from "./lobbyPlayerName.js";

export const ZfxLobbyChat = defineComponent({
  name: "ZfxLobbyChat",
  components: { LobbyPlayerName },
  props: { labels: { type: Object, default: () => ({}) } },
  data() {
    return { messages: [], status: "offline", message: "", unsubscribe: null };
  },
  mounted() {
    this.unsubscribe = zfxLobbyChat.subscribe(snapshot => {
      this.messages = snapshot.messages;
      this.status = snapshot.status;
      this.$nextTick(() => {
        const list = this.$refs.messages;
        if (list) list.scrollTop = list.scrollHeight;
      });
    });
  },
  beforeUnmount() {
    this.unsubscribe?.();
  },
  methods: {
    formatTime(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },
    resolveSegments(value) {
      const source = String(value ?? "");
      const segments = [];
      const pattern = /https:\/\/[^\s<>"']+|@([a-zA-Z0-9_-]{5})(?=$|[\s:!.?,)])/g;
      let previousEnd = 0;
      let match;
      while ((match = pattern.exec(source))) {
        if (match.index > previousEnd) segments.push({ text: source.slice(previousEnd, match.index) });
        if (match[0].startsWith("https://")) {
          let url = match[0];
          while (/[.,!?;:]$/.test(url)) url = url.slice(0, -1);
          try {
            if (new URL(url).protocol === "https:") segments.push({ text: url, href: url });
            else segments.push({ text: url });
          } catch { segments.push({ text: url }); }
          if (url.length < match[0].length) segments.push({ text: match[0].slice(url.length) });
        } else {
          let name = "";
          try { name = String(window.__fx?.resolveLobbyChatMention?.(match[1]) || "").trim(); } catch { /* Keep an unresolved account code visible. */ }
          segments.push(name
            ? { text: name, resolvedPlayer: true, color: window.__fx?.resolveLobbyChatMentionColor?.(match[1]) || "" }
            : { text: match[0] });
        }
        previousEnd = match.index + match[0].length;
      }
      if (previousEnd < source.length || !segments.length) segments.push({ text: source.slice(previousEnd) });
      return segments;
    },
    statusLabel() {
      const copy = this.labels;
      if (this.status === "connected") return copy.zfxChatConnected;
      if (this.status === "connecting") return copy.zfxChatConnecting;
      if (this.status === "error") return copy.zfxChatUnavailable;
      if (this.status === "disconnected") return copy.zfxChatDisconnected;
      return copy.zfxChatOffline;
    },
    submit() {
      const value = this.message.trim();
      if (!value || !zfxLobbyChat.send(value)) return;
      this.message = "";
    },
    clearDraft() { this.message = ""; },
  },
  template: `
    <section class="fx-custom-lobby-chat-view fx-custom-lobby-zfx-chat" :aria-label="labels.zfxChat">
      <div ref="messages" class="fx-custom-lobby-chat-messages" aria-live="polite">
        <p v-for="entry in messages" :key="entry.id" :class="{ 'is-system': entry.system }">
          <time v-if="entry.receivedAt" class="fx-custom-lobby-chat-time" :datetime="new Date(entry.receivedAt).toISOString()">{{ formatTime(entry.receivedAt) }}</time>
          <span class="fx-custom-lobby-chat-message-content"><template v-if="entry.senderName"><strong>{{ entry.senderName }}</strong><span class="fx-custom-lobby-chat-sender-separator" aria-hidden="true">·</span></template><template v-for="(segment, index) in resolveSegments(entry.text)" :key="index"><LobbyPlayerName v-if="segment.resolvedPlayer" :name="segment.text" :color="segment.color" /><a v-else-if="segment.href" :href="segment.href" target="_blank" rel="noopener noreferrer">{{ segment.text }}</a><span v-else>{{ segment.text }}</span></template></span>
        </p>
        <span v-if="!messages.length" class="fx-custom-lobby-chat-empty">{{ labels.chatEmpty }}</span>
      </div>
      <span class="fx-custom-lobby-chat-status" :class="'is-' + status">{{ statusLabel() }}</span>
      <form class="fx-custom-lobby-chat-compose" @submit.stop.prevent="submit">
        <input ref="chatInput" v-model="message" type="text" maxlength="500" :placeholder="labels.zfxChatPlaceholder" :aria-label="labels.zfxChatPlaceholder" @keydown.stop @keyup.stop @keypress.stop>
        <button type="button" class="fx-custom-lobby-chat-clear" :disabled="!message" :aria-label="labels.clear" :title="labels.clear" @click="clearDraft">×</button>
        <button type="submit" :disabled="status !== 'connected' || !message.trim()">{{ labels.send }}</button>
      </form>
    </section>`,
});
