/** Normalize native Terri notifications and manage clan-mention confirmations. */
export function createNativeNotificationAdapter({ lobbyChatFeed, pingFilter, settingsApi } = {}) {
  const listeners = new Set();
  const history = [];
  let sequence = 0;
  let receivedCount = 0;
  let clanPingCount = 0;
  let confirmationCount = 0;
  let pendingConfirmation = null;

  function getConfirmationMode() {
    const mode = settingsApi?.getString?.("clanMentionConfirmationMode", "ui");
    return ["ui", "chat", "auto"].includes(mode) ? mode : "ui";
  }

  function emit(item) {
    for (const listener of listeners) {
      try { listener(item); }
      catch (error) { console.error("[ZFX NativeNotifications] Subscriber failed:", error); }
    }
  }

  function respondToConfirmation(accept) {
    if (!pendingConfirmation) return false;
    const pending = pendingConfirmation;
    const sent = window.__fx?.nativeLobbyChatTransport?.respondClanConfirmation?.(accept === true) === true;
    if (!sent) return false;
    lobbyChatFeed?.update?.(pending.chatId, { confirmationState: accept ? "confirmed" : "cancelled" });
    pendingConfirmation = null;
    emit({ kind: "confirmation-resolved", id: pending.id, accepted: accept === true });
    return true;
  }

  function receive(entry, formattedText = "") {
    if (!entry || typeof entry !== "object") return false;
    const type = Number(entry.id);
    const text = String(formattedText || entry.s || "").trim();
    if (!text) return false;

    if (type === 6) {
      const mode = getConfirmationMode();
      const id = `native-confirm:${Date.now()}:${++sequence}`;
      const chatId = `native-confirm-chat:${sequence}`;
      pendingConfirmation = { id, chatId, text, mode };
      lobbyChatFeed?.publish?.({
        id: chatId, text, system: true, nativeType: 6,
        confirmationMode: mode, confirmationState: "pending",
      });
      confirmationCount++;
      receivedCount++;
      if (mode === "ui") emit({ kind: "confirmation", id, text, mode });
      if (mode === "auto") {
        // Defer until the native parser finishes setting its pending state.
        queueMicrotask(() => {
          if (pendingConfirmation?.id === id) respondToConfirmation(true);
        });
      }
      return true;
    }

    const clanPing = type === 0 && /@\[[^\]]{1,16}\]/.test(String(entry.s || ""));
    if (type === 0 && !clanPing) return false;
    if (pingFilter?.isMuted?.(entry, "s")) return false;

    const notification = Object.freeze({
      id: type, index: sequence++, text,
      senderId: entry.pk ?? null, timestamp: Date.now(),
      mention: clanPing, source: "native",
    });
    history.push(notification);
    if (history.length > 100) history.splice(0, history.length - 100);
    receivedCount++;
    if (clanPing) clanPingCount++;
    emit(notification);
    return true;
  }

  function handleManualResponse(text, accepted) {
    if (!pendingConfirmation || pendingConfirmation.mode !== "chat") return false;
    const response = String(text ?? "").trim().toLowerCase();
    if (response !== "yes" && response !== "no") return false;
    if (accepted !== true) return false;
    const pending = pendingConfirmation;
    pendingConfirmation = null;
    lobbyChatFeed?.update?.(pending.chatId, { confirmationState: response === "yes" ? "confirmed" : "cancelled" });
    return true;
  }

  function subscribe(listener, { replay = true } = {}) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    if (replay) {
      for (const notification of history) {
        try { listener(notification); }
        catch (error) { console.error("[ZFX NativeNotifications] Subscriber failed during replay:", error); }
      }
      if (pendingConfirmation?.mode === "ui") listener({ kind: "confirmation", ...pendingConfirmation });
    }
    return () => listeners.delete(listener);
  }

  function acknowledge(index) {
    const previousLength = history.length;
    const next = history.filter(notification => notification.index !== Number(index));
    history.splice(0, history.length, ...next);
    return history.length !== previousLength;
  }

  return Object.freeze({
    receive, subscribe, acknowledge, respondToConfirmation, handleManualResponse,
    canSendChatMessage: text => !(pendingConfirmation?.mode === "ui")
      && !(pendingConfirmation?.mode === "chat" && !/^(yes|no)$/i.test(String(text ?? "").trim())),
    isConfirmationPending: () => Boolean(pendingConfirmation),
    getHistory: () => [...history],
    getDiagnostics: () => ({ receivedCount, clanPingCount, confirmationCount, historyCount: history.length, subscriberCount: listeners.size, confirmationMode: getConfirmationMode(), confirmationPending: Boolean(pendingConfirmation) }),
  });
}
