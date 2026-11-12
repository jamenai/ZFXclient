let enabled = false;
let packetsIn = 0;
let packetsOut = 0;
let bytesIn = 0;
let bytesOut = 0;
let lastInAt = null;
let lastOutAt = null;
let sessionStart = performance.now();
let sessionBase = { packetsIn: 0, packetsOut: 0 };
const sockets = new Map();
let previous = { at: performance.now(), packetsIn: 0, packetsOut: 0, bytesIn: 0, bytesOut: 0 };

function byteLength(data) {
  if (typeof data === "string") return new TextEncoder().encode(data).byteLength;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
  return 0;
}

function record(socketId, direction, data) {
  if (!enabled || (direction !== "in" && direction !== "out")) return;
  const size = byteLength(data);
  const id = Number.isInteger(Number(socketId)) ? Number(socketId) : -1;
  const entry = sockets.get(id) ?? { packetsIn: 0, packetsOut: 0, bytesIn: 0, bytesOut: 0 };
  const suffix = direction === "in" ? "In" : "Out";
  entry[`packets${suffix}`] += 1;
  entry[`bytes${suffix}`] += size;
  sockets.set(id, entry);
  if (direction === "in") { packetsIn += 1; bytesIn += size; }
  else { packetsOut += 1; bytesOut += size; }
  if (direction === "in") lastInAt = performance.now();
  else lastOutAt = performance.now();
}

function setEnabled(value) {
  enabled = value === true;
  previous = { at: performance.now(), packetsIn, packetsOut, bytesIn, bytesOut };
  if (enabled) {
    sessionStart = previous.at;
    sessionBase = { packetsIn, packetsOut };
    lastInAt = null;
    lastOutAt = null;
    sockets.clear();
  }
}

function getSnapshot() {
  const now = performance.now();
  const elapsed = Math.max(1, now - previous.at);
  const delta = {
    packetsIn: packetsIn - previous.packetsIn,
    packetsOut: packetsOut - previous.packetsOut,
    bytesIn: bytesIn - previous.bytesIn,
    bytesOut: bytesOut - previous.bytesOut,
  };
  previous = { at: now, packetsIn, packetsOut, bytesIn, bytesOut };
  const rate = value => Math.round(value * 1000 / elapsed);
  return {
    enabled,
    packetsIn: rate(delta.packetsIn),
    packetsOut: rate(delta.packetsOut),
    bytesIn: rate(delta.bytesIn),
    bytesOut: rate(delta.bytesOut),
    totalIn: packetsIn - sessionBase.packetsIn,
    totalOut: packetsOut - sessionBase.packetsOut,
    lastOutSeconds: lastOutAt == null ? null : Math.floor((now - lastOutAt) / 1000),
    sessionSeconds: Math.max(1, Math.floor((now - sessionStart) / 1000)),
    sockets: Array.from(sockets, ([id, value]) => ({ id, ...value })),
  };
}

export const networkDebug = Object.freeze({ setEnabled, record, getSnapshot });
