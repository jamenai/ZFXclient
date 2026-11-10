import { defineComponent } from "vue/dist/vue.esm-bundler.js";

import { LobbyPlayerName } from "./lobbyPlayerName.js";

export const LobbyChat = defineComponent({
  components: { LobbyPlayerName },
  props: {
    labels: { type: Object, default: () => ({}) },
    messages: { type: Array, default: () => [] },
    status: { type: String, default: "" },
  },
  emits: ["send"],
  data() { return { message: "", activationTimer: 0, stickToChatBottom: true, senderMenu: null }; },
  mounted() {
    // The native client needs one initial request to populate its single
    // lobby-wide chat list. Keep it enabled across tab changes; never toggle it
    // off when leaving this Vue tab.
    const activationStartedAt = Date.now();
    const tryActivateLobbyChat = () => {
      const fx = window.__fx;
      if (fx?.lobbyChatChannelRequested) {
        this.activationTimer = 0;
        return;
      }
      const activate = fx?.setNativeLobbyChatMode;
      if (typeof activate === "function") {
        if (activate(0) === true) {
          fx.lobbyChatChannelRequested = true;
          this.activationTimer = 0;
          return;
        }
      }
      if (Date.now() - activationStartedAt >= 60000) {
        this.activationTimer = 0;
        console.warn("[ZFX Client LobbyChat] Native lobby chat subscription is unavailable.");
        return;
      }
      this.activationTimer = window.setTimeout(tryActivateLobbyChat, 250);
    };
    tryActivateLobbyChat();
    this.$nextTick(() => {
      const list = this.$refs.messages;
      if (list) list.scrollTop = list.scrollHeight;
    });
  },
  methods: {
    formatMessageTime(value) {
      const date = new Date(Number(value));
      return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },
    openSenderMenu(event, entry) {
      if (!entry?.senderName) return;
      this.senderMenu = {
        senderId: entry.senderId,
        senderName: entry.senderName,
        senderColor: entry.senderColor || "",
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 176)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 54)),
      };
    },
    openMentionMenu(event, segment) {
      this.openSenderMenu(event, {
        senderId: segment?.mentionId,
        senderName: String(segment?.text ?? "").replace(/^@/, ""),
        senderColor: segment?.color,
      });
    },
    insertMention() {
      if (!this.senderMenu) return;
      let token = "";
      try {
        const accountId = Number(this.senderMenu.senderId);
        if (Number.isInteger(accountId)) token = String(window.__fx?.getLobbyChatMentionToken?.(accountId) ?? "").trim();
      } catch (error) {
        console.warn("[ZFX Client LobbyChat] Could not resolve account mention ID:", error);
      }
      if (!token) {
        console.warn("[ZFX Client LobbyChat] Account mention ID is not available for this sender.", this.senderMenu);
        return;
      }
      const mention = `@${token}`;
      this.message = `${this.message}${this.message && !/\s$/.test(this.message) ? " " : ""}${mention} `;
      this.senderMenu = null;
      this.$nextTick(() => this.$refs.chatInput?.focus());
    },
    insertMentionToken(token) {
      const accountId = String(token ?? "").trim();
      if (!/^[A-Za-z0-9_-]{5}$/.test(accountId)) return false;
      const mention = `@${accountId}`;
      this.message = `${this.message}${this.message && !/\s$/.test(this.message) ? " " : ""}${mention} `;
      this.$nextTick(() => this.$refs.chatInput?.focus());
      return true;
    },
    clearDraft() {
      this.message = "";
      this.$nextTick(() => this.$refs.chatInput?.focus());
    },
    submit() {
      const message = this.message.trim();
      if (message) this.$emit("send", message, sent => { if (sent) this.message = ""; });
    },
  },
  template: `
    <section class="fx-custom-lobby-chat-view" :aria-label="labels.chat">
      <div ref="messages" class="fx-custom-lobby-chat-messages" aria-live="polite">
        <p v-for="entry in messages" :key="entry.id" :style="entry.senderTerritoryColor ? { '--fx-chat-sender-territory-color': entry.senderTerritoryColor } : null"><time v-if="entry.receivedAt" class="fx-custom-lobby-chat-time" :datetime="new Date(entry.receivedAt).toISOString()">{{ formatMessageTime(entry.receivedAt) }}</time><span class="fx-custom-lobby-chat-message-content"><template v-if="entry.senderName"><LobbyPlayerName :name="entry.senderName" :color="entry.senderColor" @activate="openSenderMenu($event, entry)" /><span class="fx-custom-lobby-chat-sender-separator" aria-hidden="true">·</span></template><template v-if="entry.segments && entry.segments.length"><template v-for="(segment, index) in entry.segments" :key="index"><LobbyPlayerName v-if="segment.resolvedPlayer" :name="segment.text" :color="segment.color" @activate="openMentionMenu($event, segment)" /><span v-else :style="segment.color ? { color: segment.color } : null">{{ segment.text }}</span></template></template><template v-else>{{ entry.text }}</template></span></p>
        <span v-if="!messages.length" class="fx-custom-lobby-chat-empty">{{ labels.chatEmpty }}</span>
      </div>
      <Teleport to="body">
        <div v-if="senderMenu" class="fx-custom-lobby-chat-menu-backdrop" @click="senderMenu = null" @keydown.esc="senderMenu = null">
          <div class="fx-custom-lobby-chat-context-menu" role="menu" :style="{ left: senderMenu.x + 'px', top: senderMenu.y + 'px' }" @click.stop>
            <strong :style="senderMenu.senderColor ? { color: senderMenu.senderColor } : null">{{ senderMenu.senderName }}</strong>
            <button type="button" role="menuitem" :disabled="senderMenu.senderId == null" @click="insertMention">@ {{ labels.mention }}</button>
          </div>
        </div>
      </Teleport>
      <span v-if="status" class="fx-custom-lobby-chat-status">{{ status }}</span>
      <form class="fx-custom-lobby-chat-compose" @submit.stop.prevent="submit">
        <input ref="chatInput" v-model="message" type="text" :placeholder="labels.chatPlaceholder" :aria-label="labels.chatPlaceholder" @keydown.stop @keyup.stop @keypress.stop>
        <button type="button" class="fx-custom-lobby-chat-clear" :disabled="!message" :aria-label="labels.clear" :title="labels.clear" @click="clearDraft">×</button>
        <button type="submit">{{ labels.send }}</button>
      </form>
    </section>`,
  beforeUpdate() {
    const list = this.$refs.messages;
    this.stickToChatBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 32;
  },
  beforeUnmount() {
    if (this.activationTimer) window.clearTimeout(this.activationTimer);
  },
  updated() {
    const list = this.$refs.messages;
    if (list && this.stickToChatBottom) list.scrollTop = list.scrollHeight;
  },
});
