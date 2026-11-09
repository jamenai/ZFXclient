import { computed, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from "vue/dist/vue.esm-bundler.js";

const LoginView = defineComponent({
  name: "FxLoginView",
  setup() {
    const visible = ref(false);
    const language = ref("en");
    const accountName = ref("");
    const password = ref("");
    const passwordVisible = ref(false);
    const error = ref("");
    const submitting = ref(false);
    const sidebarWidth = ref(0);
    const isGerman = computed(() => language.value.startsWith("de"));
    const labels = computed(() => isGerman.value ? {
      title: "Anmelden", subtitle: "Melde dich mit deinem bestehenden Territorial.io-Konto an.",
      accountName: "Login-Kontoname (max. 5 Zeichen)", accountNameHint: "Verwende den Login-Namen deines Kontos, nicht deinen Spielernamen.",
      password: "Passwort (max. 15 Zeichen)", passwordHint: "Das native Spiel akzeptiert bis zu 15 Zeichen.", show: "Anzeigen", hide: "Verbergen",
      securityTitle: "Sicherheitshinweis", officialDomain: "Die offizielle Domain ist territorial.io.",
      phishingWarning: "Gib deine Zugangsdaten nur auf der offiziellen Website ein.",
      trustedApps: "Die offiziellen Android- und iOS-Apps sind ebenfalls sicher.",
      back: "Zurück", login: "Anmelden", signingIn: "Anmeldung wird gestartet…",
      required: "Bitte Kontoname und Passwort eingeben.", unavailable: "Der native Login ist noch nicht bereit. Bitte erneut öffnen.",
    } : {
      title: "Login", subtitle: "Sign in with your existing Territorial.io account.",
      accountName: "Login Account Name (max 5 characters)", accountNameHint: "Use the account login name, not your in-game player name.",
      password: "Password (max 15 characters)", passwordHint: "The native game accepts up to 15 characters.", show: "Show", hide: "Hide",
      securityTitle: "Security Tip", officialDomain: "The only official domain is territorial.io.",
      phishingWarning: "Only enter your credentials on the official website.",
      trustedApps: "The official Android and iOS apps are also safe.",
      back: "Back", login: "Login", signingIn: "Starting login…",
      required: "Enter your account name and password.", unavailable: "Native login is not ready yet. Please reopen this view.",
    });

    function refreshLanguage() {
      language.value = String(window.__fx?.getGameLanguage?.() || navigator.language || "en").toLowerCase();
      sidebarWidth.value = Number(window.__fx?.sidebar?.getWidth?.()) || 0;
    }
    function open() {
      refreshLanguage();
      accountName.value = "";
      password.value = "";
      passwordVisible.value = false;
      error.value = "";
      submitting.value = false;
      visible.value = true;
      requestAnimationFrame(() => document.querySelector("#fx-login-view-account-name")?.focus());
    }
    function close() {
      visible.value = false;
      password.value = "";
      submitting.value = false;
    }
    function back() {
      window.__fx?.nativeLoginAdapter?.cancel?.();
      close();
      requestAnimationFrame(() => window.__fx?.openVueMyAccount?.());
    }
    async function submit() {
      error.value = "";
      const name = accountName.value.trim();
      if (!name || !password.value) {
        error.value = labels.value.required;
        return;
      }
      const login = window.__fx?.nativeLoginAdapter?.login;
      if (typeof login !== "function") {
        error.value = labels.value.unavailable;
        return;
      }
      submitting.value = true;
      let started = false;
      try { started = await login(name, password.value); } catch (loginError) {
        console.error("[ZFX Client LoginView] Native login failed to start", loginError);
      }
      if (!started) {
        submitting.value = false;
        error.value = labels.value.unavailable;
        return;
      }
      password.value = "";
      // The game now owns the authentication response and any server error UI.
      close();
    }
    function onKeyDown(event) {
      if (!visible.value) return;
      if (event.key === "Escape") { event.preventDefault(); back(); }
    }

    onMounted(() => {
      refreshLanguage();
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("resize", refreshLanguage);
      window.__fx.openVueLoginView = open;
      window.__fx.closeVueLoginView = close;
    });
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", refreshLanguage);
      if (window.__fx?.openVueLoginView === open) delete window.__fx.openVueLoginView;
      if (window.__fx?.closeVueLoginView === close) delete window.__fx.closeVueLoginView;
    });

    return { visible, labels, isGerman, accountName, password, passwordVisible, error, submitting, sidebarWidth, back, submit };
  },
  template: `
    <div v-if="visible" class="fx-login-view-overlay" :style="{ left: sidebarWidth + 'px' }">
      <main class="fx-login-view" role="dialog" aria-modal="true" aria-labelledby="fx-login-title">
        <header class="fx-login-view-header">
          <small>ZFX CLIENT · ACCOUNT</small>
          <h1 id="fx-login-title">{{ labels.title }}</h1>
          <p>{{ labels.subtitle }}</p>
        </header>
        <div class="fx-login-view-content">
          <form class="fx-login-form" @submit.prevent="submit">
            <label class="fx-login-field" for="fx-login-view-account-name">
              <span>{{ labels.accountName }}</span>
              <input id="fx-login-view-account-name" v-model="accountName" autocomplete="username" maxlength="5" required>
              <small class="fx-login-field-hint">{{ labels.accountNameHint }}</small>
            </label>
            <label class="fx-login-field" for="fx-login-view-password">
              <span>{{ labels.password }}</span>
              <div class="fx-login-password-control">
                <input id="fx-login-view-password" v-model="password" :type="passwordVisible ? 'text' : 'password'" autocomplete="current-password" maxlength="15" required>
                <button type="button" @click="passwordVisible = !passwordVisible">{{ passwordVisible ? labels.hide : labels.show }}</button>
              </div>
              <small class="fx-login-field-hint">{{ labels.passwordHint }}</small>
            </label>
            <p v-if="error" class="fx-login-error" role="alert">{{ error }}</p>
          </form>
          <aside class="fx-login-security-card">
            <span aria-hidden="true">⌑</span>
            <h2>{{ labels.securityTitle }}</h2>
            <p>{{ labels.officialDomain }}</p>
            <p>{{ labels.phishingWarning }}</p>
            <p>{{ labels.trustedApps }}</p>
          </aside>
        </div>
        <footer class="fx-login-view-footer">
          <button type="button" class="fx-login-back" @click="back">‹ <span>{{ labels.back }}</span></button>
          <button type="button" class="fx-login-submit" :disabled="submitting" @click="submit">
            <span v-if="submitting">{{ labels.signingIn }}</span><span v-else>{{ labels.login }}</span><b aria-hidden="true">›</b>
          </button>
        </footer>
      </main>
    </div>`,
});

export function createVueLoginView() {
  if (document.getElementById("fx-login-view-root")) return () => {};
  const host = document.createElement("div");
  host.id = "fx-login-view-root";
  document.body.appendChild(host);
  const app = createApp(LoginView);
  app.config.errorHandler = (error, _instance, info) => console.error("[ZFX Client LoginView] Vue error:", info, error);
  app.mount(host);
  return () => { app.unmount(); host.remove(); };
}
