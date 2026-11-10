import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";
import { ZfxLogoMark } from "../../shared/zfxLogoMark.js";

const GoldTransferView = defineComponent({
  name: "FxGoldTransferView",
  components: { ZfxLogoMark },
  setup() {
    const visible = ref(false);
    const accountId = ref("");
    const recipient = ref("");
    const amount = ref("");
    const loggedIn = ref(false);
    const status = ref("");
    const busy = ref(false);
    const gameLanguage = ref("");
    let languageTimer = 0;
    const isGerman = computed(() => gameLanguage.value.startsWith("de"));
    const labels = computed(() => isGerman.value ? {
      eyebrow: "ZFX CLIENT · KONTO", title: "Gold transfer", subtitle: "Sende Gold direkt über den Spielserver an ein anderes Konto.",
      sender: "Dein Account", recipient: "Empfänger-Code", recipientPlaceholder: "Fünfstelligen Code eingeben",
      amount: "Goldbetrag", amountPlaceholder: "Betrag eingeben", send: "Gold senden", close: "Schließen",
      loginRequired: "Melde dich im Spielkonto an, um Gold zu senden.", required: "Bitte gib den fünfstelligen Empfänger-Code und einen positiven Goldbetrag ein.",
      sendFailed: "Der Transfer konnte nicht gestartet werden.", sent: "Transferanfrage an den Spielserver gesendet.",
      reminder: "Der Empfänger-Code ist fünf Zeichen lang. Prüfe ihn sorgfältig; Transfers können möglicherweise nicht rückgängig gemacht werden.",
    } : {
      eyebrow: "ZFX CLIENT · ACCOUNT", title: "Gold transfer", subtitle: "Send gold to another account through the game server.",
      sender: "Your account", recipient: "Recipient account code", recipientPlaceholder: "Enter 5-character code",
      amount: "Gold amount", amountPlaceholder: "Enter amount", send: "Send gold", close: "Close",
      loginRequired: "Log in to your game account before sending gold.", required: "Enter the 5-character recipient code and a positive gold amount.",
      sendFailed: "The transfer could not be started.", sent: "Transfer request sent to the game server.",
      reminder: "The recipient code is five characters. Check it carefully; transfers may not be reversible.",
    });
    function refreshLanguage() {
      const selected = window.__fx?.getGameLanguage?.();
      if (selected !== undefined && selected !== null && String(selected).trim()) gameLanguage.value = String(selected).toLowerCase();
      else if (!gameLanguage.value) gameLanguage.value = (navigator.language || "en").toLowerCase();
    }
    function refresh() {
      const snapshot = window.__fx?.goldTransferAdapter?.getSnapshot?.();
      if (!snapshot) return false;
      accountId.value = String(snapshot.accountId || "");
      recipient.value = String(snapshot.recipient || "");
      amount.value = String(snapshot.amount || "");
      loggedIn.value = Boolean(snapshot.loggedIn);
      return true;
    }
    function open(prefillRecipient = null) {
      refresh();
      if (prefillRecipient !== null && prefillRecipient !== undefined) recipient.value = String(prefillRecipient).trim();
      status.value = "";
      busy.value = false;
      visible.value = true;
      window.requestAnimationFrame(() => document.getElementById("fx-gold-transfer-recipient")?.focus());
    }
    function close() { visible.value = false; }
    function send() {
      status.value = "";
      const cleanRecipient = recipient.value.trim();
      const numericAmount = Number(amount.value);
      if (!loggedIn.value) { status.value = labels.value.loginRequired; return; }
      if (cleanRecipient.length !== 5 || !Number.isInteger(numericAmount) || numericAmount < 1) { status.value = labels.value.required; return; }
      busy.value = true;
      const sent = window.__fx?.goldTransferAdapter?.send?.(cleanRecipient, numericAmount);
      busy.value = false;
      status.value = sent ? labels.value.sent : labels.value.sendFailed;
    }
    function onKeyDown(event) { if (visible.value && event.key === "Escape") close(); }
    onMounted(() => {
      refreshLanguage();
      languageTimer = window.setInterval(refreshLanguage, 500);
      window.addEventListener("keydown", onKeyDown);
      window.__fx.openVueGoldTransfer = open;
      window.__fx.closeVueGoldTransfer = close;
    });
    onBeforeUnmount(() => {
      window.clearInterval(languageTimer);
      window.removeEventListener("keydown", onKeyDown);
      if (window.__fx?.openVueGoldTransfer === open) delete window.__fx.openVueGoldTransfer;
      if (window.__fx?.closeVueGoldTransfer === close) delete window.__fx.closeVueGoldTransfer;
    });
    return { visible, accountId, recipient, amount, loggedIn, status, busy, labels, open, close, send };
  },
  template: `
    <div v-if="visible" class="fx-gold-transfer-overlay" @pointerdown.self="close">
      <main class="fx-gold-transfer-view" role="dialog" aria-modal="true" aria-labelledby="fx-gold-transfer-title">
        <header class="fx-gold-transfer-header">
          <ZfxLogoMark class="fx-gold-transfer-brand-mark" aria-hidden="true" />
          <div><small>{{ labels.eyebrow }}</small><h1 id="fx-gold-transfer-title">{{ labels.title }}</h1><p>{{ labels.subtitle }}</p></div>
          <button type="button" class="fx-gold-transfer-close" :aria-label="labels.close" @click="close">×</button>
        </header>
        <form class="fx-gold-transfer-content" @submit.prevent="send">
          <section class="fx-gold-transfer-card">
            <div class="fx-gold-transfer-card-heading"><span>01</span><h2>{{ labels.sender }}</h2><i :class="loggedIn ? 'is-online' : ''"></i></div>
            <div class="fx-gold-transfer-account"><span>◉</span><div><small>{{ labels.sender }}</small><strong>{{ accountId || '—' }}</strong></div><b v-if="loggedIn">✓</b></div>
            <p v-if="!loggedIn" class="fx-gold-transfer-login-note">{{ labels.loginRequired }}</p>
          </section>
          <section class="fx-gold-transfer-card fx-gold-transfer-form-card">
            <div class="fx-gold-transfer-card-heading"><span>02</span><h2>{{ labels.recipient }}</h2><i></i></div>
            <label class="fx-gold-transfer-field"><span>{{ labels.recipient }}</span><input id="fx-gold-transfer-recipient" v-model="recipient" type="text" maxlength="5" autocomplete="off" autocapitalize="off" spellcheck="false" :placeholder="labels.recipientPlaceholder" /></label>
            <label class="fx-gold-transfer-field"><span>{{ labels.amount }}</span><div class="fx-gold-transfer-amount"><input v-model="amount" type="number" min="1" step="1" inputmode="numeric" :placeholder="labels.amountPlaceholder" /><b>🧈</b></div></label>
            <p class="fx-gold-transfer-reminder">{{ labels.reminder }}</p>
          </section>
          <div class="fx-gold-transfer-actions"><p v-if="status" role="status" :class="{ 'is-success': status === labels.sent }">{{ status }}</p><button class="fx-gold-transfer-submit" type="submit" :disabled="busy || !loggedIn">{{ labels.send }} <span>›</span></button></div>
        </form>
        <footer class="fx-gold-transfer-footer"><span><i></i>ZFX Client · Territorial.io</span><button type="button" @click="close">{{ labels.close }}</button></footer>
      </main>
    </div>`,
});

export function createVueGoldTransferView() {
  if (document.getElementById("fx-gold-transfer-view-root")) return () => {};
  const host = document.createElement("div");
  host.id = "fx-gold-transfer-view-root";
  document.body.appendChild(host);
  const app = createApp(GoldTransferView);
  app.config.errorHandler = (error, _instance, info) => console.error("[ZFX Client GoldTransferView] Vue error:", info, error);
  app.mount(host);
  return () => { app.unmount(); host.remove(); };
}
