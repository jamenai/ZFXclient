/** Owns the lobby-chat stream subscription independently of lobby UI tabs. */
export function createLobbyChatSocketAdapter(gameSdk) {
  let started = false;
  let requested = false;
  let requestedAt = 0;
  let matchActive = false;
  let timer = 0;
  let unsubscribeMatchStarted = () => {};

  function requestLobbyStream() {
    const fx = window.__fx;
    if (!fx || matchActive) return false;
    // Socket slot 0 can exist before the WebSocket is fully connected. Sending
    // the stream activation during that window is silently lost by the native
    // transport, so keep retrying until its connected predicate succeeds.
    if (fx.isMultiplayerConnected?.() !== true) {
      requested = false;
      requestedAt = 0;
      fx.lobbyChatChannelRequested = false;
      return false;
    }
    if (requested || fx.lobbyChatChannelRequested) {
      requested = true;
      return true;
    }
    if (fx.nativeLobbyChatTransport?.subscribeLobby?.() !== true) return false;
    requested = true;
    requestedAt = Date.now();
    fx.lobbyChatChannelRequested = true;
    console.info("[ZFX Client LobbyChat] Subscribed to the lobby chat socket stream.");
    return true;
  }

  function sendMessage(message) {
    const fx = window.__fx;
    const text = String(message ?? "").trim();
    if (!text || fx?.isMultiplayerConnected?.() !== true) return false;
    return fx.nativeLobbyChatTransport?.sendMessage?.(text) === true;
  }

  function sendClanMessage(clan, message) {
    const fx = window.__fx;
    const tag = String(clan ?? "").trim().replace(/^\[|\]$/g, "").toUpperCase();
    const text = String(message ?? "").trim();
    if (!tag || !text || fx?.isMultiplayerConnected?.() !== true) return false;
    return fx.nativeLobbyChatTransport?.sendClanMessage?.(tag, text) === true;
  }

  function handleLobbyReturn() {
    matchActive = false;
    requested = false;
    requestedAt = 0;
    if (window.__fx) window.__fx.lobbyChatChannelRequested = false;
    requestLobbyStream();
  }

  function retryLobbyStream() {
    if (matchActive) return false;
    requested = false;
    requestedAt = 0;
    if (window.__fx) window.__fx.lobbyChatChannelRequested = false;
    return requestLobbyStream();
  }

  function start() {
    if (started) return;
    started = true;
    unsubscribeMatchStarted = gameSdk?.on?.("match.started", () => {
      matchActive = true;
      requested = false;
      requestedAt = 0;
      if (window.__fx) window.__fx.lobbyChatChannelRequested = false;
    }) ?? (() => {});
    window.addEventListener("fx-native-lobby-return-chat", handleLobbyReturn);
    timer = window.setInterval(requestLobbyStream, 500);
    requestLobbyStream();
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = 0;
    unsubscribeMatchStarted();
    unsubscribeMatchStarted = () => {};
    window.removeEventListener("fx-native-lobby-return-chat", handleLobbyReturn);
    started = false;
  }

  return Object.freeze({
    start,
    stop,
    subscribeLobby: requestLobbyStream,
    retryLobbyStream,
    sendMessage,
    sendClanMessage,
    getDiagnostics: () => ({ started, requested, requestedAt, matchActive, canSend: Boolean(window.__fx?.nativeLobbyChatTransport?.sendMessage) }),
  });
}
