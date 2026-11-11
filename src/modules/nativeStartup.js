const COMPATIBILITY_SERVICE_URL = "https://nexus.mapella.org/api/native-game-compatibility";
const VERSION_OVERRIDE_STORAGE_KEY = "fx_native_game_version_override";

function readVersionOverride() {
  try {
    const value = window.localStorage.getItem(VERSION_OVERRIDE_STORAGE_KEY)?.trim();
    if (!value) return null;
    if (/^\d+\.\d+\.\d+$/.test(value)) return value;
    console.warn("[ZFX Client] Ignoring invalid native game version test override.");
  } catch (error) {
    console.warn("[ZFX Client] Could not read native game version test override:", error);
  }
  return null;
}

export function createNativeStartup() {
  const bundledVersion = String(window.__fxBuildInfo?.nativeGameVersion || "");
  const versionOverride = readVersionOverride();
  const expectedVersion = versionOverride || bundledVersion;
  const buildTimestamp = String(window.__fxBuildInfo?.buildTimestamp || "");
  const state = { status: "idle", expectedVersion, latestVersion: null, checkedAt: null, error: "" };
  let checkPromise = null;
  let startPromise = null;
  let banner = null;

  if (versionOverride) {
    console.warn(`[ZFX Client] Native game version test override is active (${versionOverride}); bundled version is ${bundledVersion}.`);
  }

  function setVersionOverride(version) {
    const value = version == null ? "" : String(version).trim();
    if (value && !/^\d+\.\d+\.\d+$/.test(value)) {
      throw new Error("The native game version override must use x.y.z format, or null to disable it.");
    }
    if (value) window.localStorage.setItem(VERSION_OVERRIDE_STORAGE_KEY, value);
    else window.localStorage.removeItem(VERSION_OVERRIDE_STORAGE_KEY);
    window.location.reload();
  }

  function labels() {
    const german = String(navigator.language || "en").toLowerCase().startsWith("de");
    return german ? {
      checking: "Territorial.io-Version wird geprüft …",
      current: `Territorial.io ${expectedVersion} ist kompatibel.`,
      outdated: `Territorial.io wurde auf ${state.latestVersion} aktualisiert. ZFX unterstützt derzeit ${expectedVersion}. Lobby und Spiel sind vorübergehend deaktiviert; unabhängige ZFX-Funktionen bleiben verfügbar.`,
      unknown: "Die Territorial.io-Version konnte nicht sicher geprüft werden. Lobby und Spiel bleiben deaktiviert; unabhängige ZFX-Funktionen sind verfügbar.",
      retry: "Erneut prüfen",
      override: `Test-Override aktiv: Geprüft wird ${versionOverride} statt Build-Version ${bundledVersion}.`,
      resetOverride: "Override zurücksetzen",
    } : {
      checking: "Checking the Territorial.io version …",
      current: `Territorial.io ${expectedVersion} is compatible.`,
      outdated: `Territorial.io has been updated to ${state.latestVersion}. ZFX currently supports ${expectedVersion}. Lobby and game actions are paused; independent ZFX features remain available.`,
      unknown: "The Territorial.io version could not be verified safely. Lobby and game actions are paused; independent ZFX features remain available.",
      retry: "Check again",
      override: `Test override active: checking ${versionOverride} instead of bundled version ${bundledVersion}.`,
      resetOverride: "Reset override",
    };
  }

  function renderBanner() {
    if (!document.body) return;
    if (!banner) {
      banner = document.createElement("aside");
      banner.id = "fx-native-version-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      document.body.appendChild(banner);
    }
    const text = labels();
    if ((state.status === "current" || state.status === "idle") && !versionOverride) {
      banner.hidden = true;
      banner.replaceChildren();
      return;
    }
    banner.hidden = false;
    const message = document.createElement("span");
    message.textContent = state.status === "checking"
      ? text.checking
      : state.status === "current" ? text.current
        : state.status === "update-required" ? text.outdated : text.unknown;
    if (versionOverride) message.textContent += ` ${text.override}`;
    const actions = document.createElement("div");
    actions.className = "fx-native-version-actions";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = text.retry;
    retry.addEventListener("click", () => { void checkCompatibility(); });
    actions.appendChild(retry);
    if (versionOverride) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = text.resetOverride;
      reset.addEventListener("click", () => setVersionOverride(null));
      actions.appendChild(reset);
    }
    banner.replaceChildren(message, actions);
  }

  function setStatus(status, details = {}) {
    Object.assign(state, details, { status });
    renderBanner();
    window.dispatchEvent(new CustomEvent("fx-native-compatibility-change", { detail: { ...state } }));
  }

  async function checkCompatibility(force = false) {
    if (checkPromise && !force) return checkPromise;
    if (!expectedVersion) {
      setStatus("unknown", { error: "The built client has no native game version metadata." });
      return { ...state };
    }
    setStatus("checking", { error: "" });
    checkPromise = (async () => {
      try {
        const url = new URL(COMPATIBILITY_SERVICE_URL);
        url.searchParams.set("supportedVersion", expectedVersion);
        const response = await fetch(url, {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          signal: AbortSignal.timeout(12000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`Compatibility service returned HTTP ${response.status}.`);
        if (result?.supportedVersion !== expectedVersion
          || !["compatible", "update-required"].includes(result?.status)
          || typeof result?.currentVersion !== "string") {
          throw new Error("The compatibility service returned an invalid response.");
        }
        const status = result.status === "compatible" ? "current" : "update-required";
        setStatus(status, {
          latestVersion: result.currentVersion,
          checkedAt: Number(result.checkedAt) || Date.now(),
          error: "",
        });
        if (status === "current") await loadAndStartNativeGame();
      } catch (error) {
        console.warn("[ZFX Client] Territorial.io compatibility check failed:", error);
        setStatus("unknown", { checkedAt: Date.now(), error: String(error?.message || error) });
      } finally {
        checkPromise = null;
      }
      return { ...state };
    })();
    return checkPromise;
  }

  function loadAndStartNativeGame() {
    if (state.status !== "current") return Promise.resolve(false);
    if (window.__fx?.nativeGameStarted) return Promise.resolve(true);
    if (startPromise) return startPromise;
    startPromise = new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-fx-native-game="true"]');
      let shouldAppend = false;
      if (!script) {
        script = document.createElement("script");
        script.dataset.fxNativeGame = "true";
        script.src = `game.js?${encodeURIComponent(buildTimestamp || "current")}`;
        shouldAppend = true;
      }
      script.addEventListener("load", () => {
        if (typeof window.__fxStartNativeGame !== "function") {
          script.remove();
          startPromise = null;
          reject(new Error("The native game startup hook is unavailable."));
          return;
        }
        try {
          window.__fxStartNativeGame();
          resolve(true);
        } catch (error) {
          startPromise = null;
          reject(error);
        }
      }, { once: true });
      script.addEventListener("error", () => {
        script.remove();
        startPromise = null;
        reject(new Error("The native game script could not be loaded."));
      }, { once: true });
      if (shouldAppend) document.body.appendChild(script);
      if (script.dataset.fxLoaded === "true" && typeof window.__fxStartNativeGame === "function") {
        window.__fxStartNativeGame();
        resolve(true);
      } else {
        script.addEventListener("load", () => { script.dataset.fxLoaded = "true"; }, { once: true });
      }
    }).catch(error => {
      console.error("[ZFX Client] Native game startup failed:", error);
      setStatus("unknown", { error: String(error?.message || error) });
      return false;
    });
    return startPromise;
  }

  function notifyBlocked() {
    renderBanner();
    banner?.scrollIntoView?.({ block: "nearest" });
  }

  async function requestMultiplayer(...args) {
    if (state.status !== "current") {
      if (state.status === "idle" || state.status === "checking") await checkCompatibility();
      if (state.status !== "current") {
        notifyBlocked();
        return false;
      }
    }
    if (!await loadAndStartNativeGame()) return false;
    const deadline = Date.now() + 12000;
    while (typeof window.__fx?.nativeStartMultiplayer !== "function" && Date.now() < deadline) {
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    if (typeof window.__fx?.nativeStartMultiplayer !== "function") return false;
    return window.__fx.nativeStartMultiplayer(...args);
  }

  return {
    checkCompatibility,
    initialize: () => checkCompatibility(),
    isCompatible: () => state.status === "current",
    getSnapshot: () => ({ ...state }),
    notifyBlocked,
    requestMultiplayer,
    setVersionOverride,
  };
}
