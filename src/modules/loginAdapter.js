const nextFrame = () => new Promise(resolve => window.requestAnimationFrame(resolve));

/**
 * UI-facing login contract. All native menu state changes and native adapter
 * retries live here so login views do not need to know how the game routes.
 */
export const loginAdapter = {
  async prepare() {
    const fx = window.__fx;
    if (typeof fx?.setNativeMenuState === "function") fx.setNativeMenuState(6);
    await nextFrame();
    return typeof window.__fx?.nativeLoginAdapter?.login === "function";
  },

  async login(accountName, password) {
    await this.prepare();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) await this.prepare();
      const nativeAdapter = window.__fx?.nativeLoginAdapter;
      if (typeof nativeAdapter?.login !== "function") continue;
      try {
        if (await nativeAdapter.login(accountName, password)) return { ok: true };
      } catch (error) {
        if (attempt === 1) return { ok: false, reason: "error", error };
      }
    }
    return { ok: false, reason: "unavailable" };
  },

  async cancel() {
    const cancel = window.__fx?.nativeLoginAdapter?.cancel;
    if (typeof cancel !== "function") return false;
    try { return Boolean(await cancel()); } catch (error) {
      console.warn("[ZFX Client LoginAdapter] Native login cancel failed", error);
      return false;
    }
  },
};
