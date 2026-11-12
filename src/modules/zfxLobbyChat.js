import { io } from "socket.io-client";

const SERVER_URL = "https://nexus.mapella.org/empIC";
const ROOM_NAME = "zfx-lobby";
const IDENTITY_STORAGE_KEY = "zfx.lobbyChat.identity.v1";
const listeners = new Set();
const state = { status: "offline", messages: [] };
let socket = null;
let identity = null;
let messageSequence = 0;
let joinedRoom = false;

function makeId() {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function getTerriAccountCode() {
  const fx = window.__fx;
  const directCode = fx?.getNativeOwnLobbyPlayerAccountCode?.();
  const ownPlayerId = fx?.getGameVar?.("playerId");
  const ownPlayer = fx?.gameSdk?.lobby?.getSnapshot?.()?.players?.find(player => player.self
    || (ownPlayerId != null && String(player.id) === String(ownPlayerId)));
  const candidate = String(directCode || ownPlayer?.accountCode || "").trim();
  if (/^@?[A-Za-z0-9_-]{5}$/.test(candidate)) return candidate.startsWith("@") ? candidate : `@${candidate}`;
  return "";
}

function resolveTerriName(accountCode) {
  const token = String(accountCode || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_-]{5}$/.test(token)) return "";
  try { return String(window.__fx?.resolveLobbyChatMention?.(token) || "").trim(); } catch { return ""; }
}

function getIdentity() {
  if (identity) {
    identity.userName = getTerriAccountCode() || identity.playerName;
    return identity;
  }
  let assetID = "";
  try {
    const stored = JSON.parse(localStorage.getItem(IDENTITY_STORAGE_KEY) || "null");
    if (typeof stored?.assetID === "string" && stored.assetID.length >= 12) assetID = stored.assetID;
  } catch { /* Create a local guest identity if storage is unavailable or invalid. */ }
  if (!assetID) {
    assetID = `zfx-${makeId()}`;
    try { localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify({ assetID })); } catch { /* Session identity still works without storage. */ }
  }

  const fx = window.__fx;
  const nativeIdentity = fx?.getNativeOwnPlayerIdentity?.();
  const ownPlayerId = fx?.getGameVar?.("playerId");
  const nativeName = fx?.getGameVar?.("rawPlayerNames")?.[ownPlayerId];
  const playerName = String(nativeIdentity?.name || nativeIdentity?.username || nativeName || "ZFX Guest").trim().slice(0, 40) || "ZFX Guest";
  identity = { assetID, playerName, userName: getTerriAccountCode() || playerName };
  return identity;
}

function publish() {
  const snapshot = { status: state.status, messages: [...state.messages] };
  for (const listener of listeners) listener(snapshot);
}

function addMessage(message) {
  state.messages.push({
    id: message.id || `zfx:${Date.now()}:${++messageSequence}`,
    senderId: message.senderId == null ? null : String(message.senderId),
    senderName: String(message.senderName || "ZFX Guest"),
    text: String(message.text || ""),
    system: message.system === true,
    receivedAt: message.receivedAt || Date.now(),
  });
  if (state.messages.length > 150) state.messages.splice(0, state.messages.length - 150);
  publish();
}

function handleMessage(data) {
  if (!data || (data.toRoomId && data.toRoomId !== ROOM_NAME)) return;
  const text = String(data.text ?? data.message ?? "").trim();
  if (!text) return;
  const sender = data.user || data.sender || {};
  const parsedTime = new Date(data.time).getTime();
  const rawSenderName = sender.name || sender.userName || data.userName || data.senderName || "ZFX Guest";
  addMessage({
    id: data.id,
    senderId: sender.id ?? sender.assetID ?? data.senderId,
    senderName: resolveTerriName(rawSenderName) || rawSenderName,
    text,
    receivedAt: Number.isFinite(parsedTime) ? parsedTime : Date.now(),
  });
}

function handleNotification(notification) {
  if (!notification || notification.room !== ROOM_NAME) return;
  const action = notification.type === "user_joined_room" ? "joined" : notification.type === "user_leaved_room" ? "left" : "";
  if (!action || !notification.name) return;
  addMessage({
    system: true,
    senderName: "",
    text: `${notification.name} ${action} the ZFX lobby chat`,
    receivedAt: notification.date || Date.now(),
  });
}

function connect() {
  if (socket) return;
  state.status = "connecting";
  joinedRoom = false;
  publish();

  socket = io(SERVER_URL, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  socket.on("connect", () => {
    const currentIdentity = getIdentity();
    joinedRoom = false;
    socket.emit("auth", currentIdentity);
    socket.emit("subscribe", { room: ROOM_NAME }, () => {
      if (!socket?.connected) return;
      joinedRoom = true;
      state.status = "connected";
      publish();
    });
  });
  socket.on("message", handleMessage);
  socket.on("notification", handleNotification);
  socket.on("disconnect", () => {
    joinedRoom = false;
    state.status = "disconnected";
    publish();
  });
  socket.on("connect_error", error => {
    joinedRoom = false;
    state.status = "error";
    console.warn("[ZFX Lobby Chat] Socket connection failed:", error?.message || error);
    publish();
  });
  socket.connect();
}

function disconnect() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  joinedRoom = false;
  state.status = "offline";
  publish();
}

export const zfxLobbyChat = Object.freeze({
  connect,
  disconnect,
  send(text) {
    const message = String(text ?? "").trim().slice(0, 500);
    if (!message || !socket?.connected || !joinedRoom) return false;
    const currentIdentity = getIdentity();
    socket.emit("message", {
      toRoomId: ROOM_NAME,
      time: new Date().toISOString(),
      user: { id: currentIdentity.assetID, name: currentIdentity.userName },
      text: message,
    });
    return true;
  },
  subscribe(listener) {
    listeners.add(listener);
    listener({ status: state.status, messages: [...state.messages] });
    return () => listeners.delete(listener);
  },
});
