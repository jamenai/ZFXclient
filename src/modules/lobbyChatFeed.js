const listeners = new Set();
const history = [];
let decodedEntryCount = 0;
let publishedMessageCount = 0;
let duplicateMessageCount = 0;
let chatModeCommandCount = 0;
let lastChatModeCommand = null;
const packetCounts = Object.create(null);
const recentSocketEntries = new Map();

function observeSocketPacket(packetType) {
  packetCounts[packetType] = (packetCounts[packetType] ?? 0) + 1;
  if (packetCounts[packetType] === 1) {
    console.info("[ZFX Client LobbyChat] incoming socket packet type", packetType);
  }
}

function observeSocketEntry(entry, queueIndex = null, nativeText = null) {
  decodedEntryCount++;
  if (decodedEntryCount === 1 || decodedEntryCount % 25 === 0) {
    console.info("[ZFX Client LobbyChat] decoded room-chat socket entries", {
      decodedEntryCount,
      entryType: entry?.id ?? null,
      textEntry: typeof entry?.s === "string" || typeof nativeText === "string",
    });
  }
  // Native formatting covers text, gold transfers, moderation notices, and
  // confirmation prompts (including the follow-up "yes" flow).
  const nativeType = Number(entry?.id);
  const text = String(nativeType === 0 ? entry?.s ?? "" : nativeText ?? entry?.s ?? "").trim();
  if (!text) return;
  const senderId = nativeType === 0 ? entry?.ue : null;
  // A room message may be observed once as a live packet and again when the
  // native client appends/replays its history queue. Those observations have
  // different queue IDs, so correlate identical entries briefly by payload.
  publish({
    id: `native:${queueIndex}:${nativeType}:${senderId ?? ""}:${text}`,
    senderId,
    text,
    system: nativeType !== 0,
    nativeType,
  });
}

function observeChatModeCommand(mode) {
  chatModeCommandCount++;
  lastChatModeCommand = mode;
  console.info("[ZFX Client LobbyChat] native chat mode command", { mode, chatModeCommandCount });
}

function publish(message) {
  const text = String(message?.text ?? "").trim();
  if (!text) return;
  const entry = {
    id: String(message?.id ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`),
    text,
    senderId: message?.senderId != null && Number.isInteger(Number(message.senderId)) ? Number(message.senderId) : null,
    receivedAt: Number.isFinite(Number(message?.receivedAt)) ? Number(message.receivedAt) : Date.now(),
    system: message?.system === true,
    nativeType: Number.isInteger(Number(message?.nativeType)) ? Number(message.nativeType) : null,
  };
  if (entry.nativeType != null) {
    const fingerprint = `${entry.nativeType}:${entry.senderId ?? ""}:${entry.text}`;
    const now = Date.now();
    const sourceIsLive = entry.id.includes(":live:");
    const previous = recentSocketEntries.get(fingerprint);
    if (previous && previous.sourceIsLive !== sourceIsLive && now - previous.timestamp < 5000) {
      duplicateMessageCount++;
      return;
    }
    recentSocketEntries.set(fingerprint, { timestamp: now, sourceIsLive });
    if (recentSocketEntries.size > 200) {
      for (const [key, record] of recentSocketEntries) {
        if (now - record.timestamp >= 5000 || recentSocketEntries.size > 200) recentSocketEntries.delete(key);
      }
    }
  }
  // Room chat entries can be replayed by the socket parser after a reconnect.
  // Their room/index ID is stable, so ignore only an identical entry with the
  // same ID; two intentionally repeated messages have different IDs.
  const duplicate = history.some(existing => existing.id === entry.id
    && existing.senderId === entry.senderId
    && existing.text === entry.text);
  if (duplicate) {
    duplicateMessageCount++;
    return;
  }
  history.push(entry);
  if (history.length > 60) history.splice(0, history.length - 60);
  publishedMessageCount++;
  console.info("[ZFX Client LobbyChat] received room message", {
    publishedMessageCount,
    senderId: entry.senderId,
    text: entry.text,
    subscriberCount: listeners.size,
  });
  for (const listener of listeners) listener(entry);
}

function subscribe(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  for (const entry of history) listener(entry);
  return () => listeners.delete(listener);
}

function getDiagnostics() {
  return {
    packetCounts: { ...packetCounts }, decodedEntryCount, publishedMessageCount,
    duplicateMessageCount,
    bufferedMessageCount: history.length, subscriberCount: listeners.size,
    chatModeCommandCount, lastChatModeCommand,
  };
}

export default { observeSocketPacket, observeSocketEntry, observeChatModeCommand, publish, subscribe, getDiagnostics };
