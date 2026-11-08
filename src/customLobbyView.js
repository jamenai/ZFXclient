import {
  computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch,
} from "vue/dist/vue.esm-bundler.js";
import { createApp, h } from "vue/dist/vue.esm-bundler.js";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { createLobbyDataAdapter } from "./lobbyDataAdapter.js";
import { calculateLobbyRating } from "./lobbyRating.js";
import { getMapName } from "./lobbyFilters.js";
import { ClanOverview, LobbyPlayerName, LobbyProgress, MapHeader, PlayerList } from "./lobbyComponents.js";

const APP_ID = "fx-app-mount";
const LOBBY_VIEW_MIGRATION_KEY = "fx_custom_lobby_view_enabled_v1";
const lastDiagnostic = new Map();
const mapImageCache = new Map();
const MAP_IMAGE_CACHE_LIMIT = 20;
const MAP_IMAGE_DB_NAME = "zfx-client-cache";
const MAP_IMAGE_DB_STORE = "map-images";
let mapImageCacheReady = false;
let mapImageDbPromise;

function mapImageCacheKey(mapName) {
  return String(mapName ?? "").trim().normalize("NFKC").toLocaleLowerCase();
}

function rememberMapImage(mapName, image) {
  const key = mapImageCacheKey(mapName);
  if (!key || !image || !isSafeMapImageUrl(image)) return;
  if (mapImageCache.has(key)) return;
  mapImageCache.delete(key);
  mapImageCache.set(key, image);
  while (mapImageCache.size > MAP_IMAGE_CACHE_LIMIT) {
    mapImageCache.delete(mapImageCache.keys().next().value);
  }
  void persistMapImage(key, image);
}

function openMapImageDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (!mapImageDbPromise) {
    mapImageDbPromise = new Promise(resolve => {
      const request = indexedDB.open(MAP_IMAGE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MAP_IMAGE_DB_STORE)) {
          database.createObjectStore(MAP_IMAGE_DB_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return mapImageDbPromise;
}

async function persistMapImage(key, image) {
  try {
    const database = await openMapImageDb();
    if (!database) return;
    const transaction = database.transaction(MAP_IMAGE_DB_STORE, "readwrite");
    const store = transaction.objectStore(MAP_IMAGE_DB_STORE);
    store.put({ key, image, savedAt: Date.now() });
    const records = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    records.sort((left, right) => left.savedAt - right.savedAt);
    for (const record of records.slice(0, Math.max(0, records.length - MAP_IMAGE_CACHE_LIMIT))) {
      store.delete(record.key);
    }
  } catch {
    // Keep the in-memory cache available if browser storage is unavailable.
  }
}

async function loadPersistentMapImages() {
  if (mapImageCacheReady) return;
  mapImageCacheReady = true;
  try {
    const database = await openMapImageDb();
    if (!database) return;
    const records = await new Promise((resolve, reject) => {
      const request = database.transaction(MAP_IMAGE_DB_STORE, "readonly")
        .objectStore(MAP_IMAGE_DB_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    records.sort((left, right) => left.savedAt - right.savedAt);
    for (const record of records.slice(-MAP_IMAGE_CACHE_LIMIT)) {
      if (record?.key && record?.image && isSafeMapImageUrl(record.image) && !mapImageCache.has(record.key)) {
        mapImageCache.set(record.key, record.image);
      }
    }
  } catch {
    // The lobby can still use images captured during this page session.
  }
}

function logLobbyDiagnostic(stage, signature, details) {
  if (lastDiagnostic.get(stage) === signature) return;
  lastDiagnostic.set(stage, signature);
  console.log(`[ZFX Client LobbyView] ${stage}`, details);
}

function migrateLobbyViewPreference() {
  try {
    if (localStorage.getItem(LOBBY_VIEW_MIGRATION_KEY) === "done") return;
    const settings = window.__fx?.settings;
    if (!settings) return;
    // The Vue lobby view replaces the former preview. Enable it once for existing
    // installs that persisted the old default-off value; users can still turn it off.
    settings.customLobbyView = true;
    localStorage.setItem("fx_settings", JSON.stringify(settings));
    localStorage.setItem(LOBBY_VIEW_MIGRATION_KEY, "done");
    console.log("[ZFX Client LobbyView] Migrated saved preference to enabled.");
  } catch { /* Keep startup resilient when storage is unavailable. */ }
}

function cleanText(element) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function resolveLobbyChatMentionAccountId(shortId, playerName) {
  const nativeId = window.__fx?.resolveLobbyChatMentionId?.(shortId);
  if (nativeId != null && Number.isInteger(Number(nativeId))) return Number(nativeId);

  const players = window.__fx?.gameSdk?.lobby?.getSnapshot?.()?.players;
  if (!Array.isArray(players)) return null;
  const normalizedName = String(playerName ?? "").trim().toLocaleLowerCase();
  const player = players.find(candidate =>
    String(candidate?.name ?? candidate?.username ?? "").trim().toLocaleLowerCase() === normalizedName
  );
  const playerId = Number(player?.id ?? player?.accountId);
  return Number.isInteger(playerId) ? playerId : null;
}

function resolveLobbyChatSegments(text) {
  const source = String(text ?? "");
  const segments = [];
  const mentionPattern = /@([a-zA-Z0-9_-]{5})(?=$|[\s:!.?,)])/g;
  let previousEnd = 0;
  let match;
  while ((match = mentionPattern.exec(source))) {
    if (match.index > previousEnd) segments.push({ text: source.slice(previousEnd, match.index) });
    const playerName = window.__fx?.resolveLobbyChatMention?.(match[1]);
    if (playerName) {
      segments.push({
        text: playerName,
        resolvedPlayer: true,
        color: window.__fx?.resolveLobbyChatMentionColor?.(match[1]) || "",
        mentionId: resolveLobbyChatMentionAccountId(match[1], playerName),
      });
    } else segments.push({ text: match[0] });
    previousEnd = match.index + match[0].length;
  }
  if (previousEnd < source.length || segments.length === 0) segments.push({ text: source.slice(previousEnd) });
  return segments;
}

function formatLobbyNotification(text) {
  const source = String(text ?? "").trim();
  const isFollowerNotice = /\b(?:are|is)\s+in\s+the\s+lobby\b|\bjoined\s+the\s+lobby\b|\b(?:sind|ist)\s+in\s+der\s+lobby\b/i.test(source);
  const makeBody = body => {
    const bodySegments = resolveLobbyChatSegments(body);
    return { body: bodySegments.map(segment => segment.text).join(""), bodySegments };
  };
  const senderMatch = source.match(/^@([a-zA-Z0-9_-]{5})(?::\s*|\s+|$)([\s\S]*)$/);
  if (senderMatch) {
    const senderName = window.__fx?.resolveLobbyChatMention?.(senderMatch[1]);
    if (senderName) {
      return {
        senderName,
        senderId: resolveLobbyChatMentionAccountId(senderMatch[1], senderName),
        senderColor: window.__fx?.resolveLobbyChatMentionColor?.(senderMatch[1]) || "",
        ...makeBody(senderMatch[2].trim()),
        kind: isFollowerNotice ? "followers" : "default",
      };
    }
  }
  return { senderName: "", senderId: null, senderColor: "", ...makeBody(source), kind: isFollowerNotice ? "followers" : "default" };
}

function getLobbyList(scope) {
  return Array.from(scope.querySelectorAll("div"))
    .map(element => ({
      element,
      rows: Array.from(element.children).filter(child => child instanceof HTMLSpanElement
        && (child.dataset.fxLobbyPlayer === "true"
          || Boolean(child.dataset.fxAccountName)
          || /^[🟢⚪]\s*/u.test(cleanText(child)))),
    }))
    .filter(candidate => candidate.rows.length > 0)
    .sort((a, b) => b.rows.length - a.rows.length)[0] ?? null;
}

function getLobbyRoot(list) {
  let root = list.parentElement;
  for (let depth = 0; root?.parentElement && depth < 2; depth++) root = root.parentElement;
  return root && root.contains(list) ? root : null;
}

function findLobbyRoot(scope) {
  const modeTab = scope.querySelector(".fx-lobby-mode-tab");
  for (let candidate = modeTab; candidate && candidate !== scope; candidate = candidate.parentElement) {
    const modeTabCount = candidate.querySelectorAll(".fx-lobby-mode-tab").length;
    if (candidate.children.length >= 4 && modeTabCount >= 2) return candidate;
  }
  return null;
}

function findBotProtectionPrompt() {
  const promptPattern = /bot\s*protection|captcha|verif(?:y|ication)|human\s+check|security\s+check|are\s+you\s+(?:a\s+)?human|prove\s+you(?:'re|\s+are)\s+human|confirm\s+you(?:'re|\s+are)\s+human|robot\s+check|unusual\s+activity/i;
  const candidates = document.querySelectorAll(
    'iframe, [role="dialog"], dialog, [class*="captcha" i], [id*="captcha" i], '
    + '[class*="challenge" i], [id*="challenge" i], [class*="verify" i], [id*="verify" i], div, section, p, span',
  );
  for (const element of candidates) {
    if (element.closest(`#${APP_ID}, #fx-sidebar`)) continue;
    const explicitPromptElement = element.matches(
      'iframe, [role="dialog"], dialog, [class*="captcha" i], [id*="captcha" i], '
      + '[class*="challenge" i], [id*="challenge" i], [class*="verify" i], [id*="verify" i]',
    );
    if (element.tagName === "IFRAME") {
      const frameText = `${element.title} ${element.src}`;
      if (!promptPattern.test(frameText)) continue;
    } else {
      const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 1000 || !promptPattern.test(text)
        || (element.children.length > 8 && !explicitPromptElement)) continue;
    }

    const hiddenByLobby = element.closest("[data-fx-custom-lobby-hidden]");
    const ownStyle = getComputedStyle(element);
    if (ownStyle.display === "none" || (!hiddenByLobby && ownStyle.visibility === "hidden")
      || Number(ownStyle.opacity) === 0) continue;
    const rect = element.getBoundingClientRect();
    if (!hiddenByLobby && (rect.width < 80 || rect.height < 30)) continue;
    return element;
  }
  return null;
}

function observeBotProtection(mount) {
  let timer = 0;
  let active = false;
  const update = () => {
    timer = 0;
    const prompt = findBotProtectionPrompt();
    if (Boolean(prompt) === active) return;
    active = Boolean(prompt);
    if (active) document.body.dataset.fxBotProtection = "active";
    else delete document.body.dataset.fxBotProtection;
    window.dispatchEvent(new CustomEvent("fx-bot-protection-state", {
      detail: { active, prompt: prompt?.tagName ?? null },
    }));
    if (active) {
      console.info("[ZFX Client LobbyView] Bot-protection check detected; revealing native game UI.");
    } else {
      console.info("[ZFX Client LobbyView] Bot-protection check cleared; restoring custom lobby view.");
    }
  };
  const schedule = records => {
    if (records.every(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target?.closest(`#${APP_ID}, #fx-sidebar`);
    })) return;
    if (!timer) timer = window.setTimeout(update, 120);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "title", "src"],
  });
  update();
  return () => {
    observer.disconnect();
    if (timer) window.clearTimeout(timer);
    delete document.body.dataset.fxBotProtection;
    mount.style.removeProperty("display");
  };
}

function getPlayerClan(name) {
  return typeof name === "string"
    ? name.match(/\[([^\]]{1,16})\]/)?.[1]?.trim().toLocaleUpperCase() ?? null
    : null;
}

function normalizeLobbyPlayerName(name) {
  return String(name ?? "").replace(/^\s*\[[^\]]{1,16}\]\s*/, "").trim().toLocaleLowerCase();
}

function getSelfLobbyPlayer(players) {
  if (!Array.isArray(players)) return null;
  const playerId = window.__fx?.getGameVar?.("playerId");
  const rawName = window.__fx?.getGameVar?.("rawPlayerNames")?.[playerId] ?? "";
  const ownName = normalizeLobbyPlayerName(rawName);
  return players.find(player => player.self)
    ?? players.find(player => playerId != null && String(player.id) === String(playerId))
    ?? players.find(player => ownName && normalizeLobbyPlayerName(player.name) === ownName)
    ?? null;
}

function getClanChartColor(tag) {
  let hash = 0x811c9dc5;
  const normalizedTag = String(tag ?? "").trim().normalize("NFKC").toLocaleUpperCase();
  for (const character of normalizedTag) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  const hue = hash % 360;
  const saturation = 68 + ((hash >>> 9) % 18);
  const lightness = 54 + ((hash >>> 17) % 10);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function getModeLabel(button) {
  const title = button.querySelector(":scope > .fx-lobby-mode-tab-title");
  if (title) return cleanText(title);
  return Array.from(button.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
    .map(node => node.textContent.trim()).join(" ");
}

function findMapNames(root) {
  const gameNames = window.__fx?.getGameMapNames?.();
  if (!Array.isArray(gameNames)) return [];
  const names = gameNames.filter(name => typeof name === "string" && name.trim()).map(name => name.trim());
  const found = [];
  for (const button of root.querySelectorAll("button")) {
    if (button.classList.contains("fx-lobby-mode-tab")
      || button.matches(".fx-lobby-chat-player-tab, .fx-lobby-filter-action")) continue;
    const text = cleanText(button).toLocaleLowerCase();
    const match = names.find(name => text.includes(name.toLocaleLowerCase()));
    if (match && !found.includes(match)) found.push(match);
  }
  return found;
}

function findMapImage(root) {
  // The native lobby paints its map artwork on the current-map row (child 2).
  const mapRow = root.children[2];
  const rowNodes = mapRow ? [mapRow, ...mapRow.querySelectorAll("*")] : [];
  const previewNodes = [...new Set([...rowNodes, root, ...root.querySelectorAll("*")])];
  const image = Array.from(previewNodes).find(node => node instanceof HTMLImageElement);
  const candidate = image?.currentSrc || image?.src;
  if (candidate && isSafeMapImageUrl(candidate)) return candidate;

  for (const node of previewNodes) {
    const backgroundImage = getComputedStyle(node).backgroundImage;
    const backgroundUrl = backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (backgroundUrl && isSafeMapImageUrl(backgroundUrl)) return backgroundUrl;
  }

  for (const node of previewNodes) {
    for (const pseudo of ["::before", "::after"]) {
      const backgroundImage = getComputedStyle(node, pseudo).backgroundImage;
      const backgroundUrl = backgroundImage.match(/url\(["']?(.*?)\)["']?\)/)?.[1];
      if (backgroundUrl && isSafeMapImageUrl(backgroundUrl)) return backgroundUrl;
    }
  }

  const canvas = rowNodes.find(node => node instanceof HTMLCanvasElement);
  if (canvas) {
    try {
      const dataUrl = canvas.toDataURL("image/png");
      if (isSafeMapImageUrl(dataUrl)) return dataUrl;
    } catch {
      // Cross-origin canvases cannot be exported; use the CSS fallback.
    }
  }

  // Map previews are rendered by the game's viewport canvas, which lives
  // outside the lobby DOM subtree. Crop the pixels underneath the native map row.
  const rowRect = mapRow?.getBoundingClientRect();
  if (rowRect?.width > 0 && rowRect?.height > 0) {
    const centerX = rowRect.left + rowRect.width / 2;
    const centerY = rowRect.top + rowRect.height / 2;
    const viewportCanvases = Array.from(document.querySelectorAll("canvas"))
      .map(source => ({ source, rect: source.getBoundingClientRect() }))
      .filter(({ source, rect }) => source.width > 0 && source.height > 0
        && rect.width > 0 && rect.height > 0
        && centerX >= rect.left && centerX <= rect.right
        && centerY >= rect.top && centerY <= rect.bottom)
      .sort((left, right) => right.source.width * right.source.height - left.source.width * left.source.height);

    for (const { source, rect } of viewportCanvases) {
      // Use the complete game-canvas scene as the map artwork. The lobby's map
      // is painted into this canvas, not represented by a DOM background.
      try {
        const fullCanvasImage = source.toDataURL("image/png");
        if (isSafeMapImageUrl(fullCanvasImage)) return fullCanvasImage;
      } catch {
        // A tainted source may still allow a region copy for the preview.
      }

      const scaleX = source.width / rect.width;
      const scaleY = source.height / rect.height;
      const sx = Math.max(0, Math.floor((rowRect.left - rect.left) * scaleX));
      const sy = Math.max(0, Math.floor((rowRect.top - rect.top) * scaleY));
      const sw = Math.min(source.width - sx, Math.ceil(rowRect.width * scaleX));
      const sh = Math.min(source.height - sy, Math.ceil(rowRect.height * scaleY));
      if (sw <= 0 || sh <= 0) continue;

      const preview = document.createElement("canvas");
      const outputScale = Math.min(1, 1200 / sw);
      preview.width = Math.max(1, Math.round(sw * outputScale));
      preview.height = Math.max(1, Math.round(sh * outputScale));
      try {
        preview.getContext("2d")?.drawImage(source, sx, sy, sw, sh, 0, 0, preview.width, preview.height);
        const dataUrl = preview.toDataURL("image/png");
        if (isSafeMapImageUrl(dataUrl)) return dataUrl;
      } catch {
        // Try another overlapping game canvas if this one is tainted.
      }
    }
  }
  return "";
}

function isSafeMapImageUrl(value) {
  return /^(https?:|blob:|data:image\/)/i.test(value);
}

const getLobbyLabels = (language = window.__fx?.getGameLanguage?.() || "en") => {
  const selectedLanguage = String(language || "en");
  const german = selectedLanguage.toLowerCase().startsWith("de");
  return german ? {
    title: "Lobby-Übersicht", currentMap: "Aktuelle Karte", nextMap: "Ausgewähltes Spiel", selectedGame: "Ausgewähltes Spiel", selectGame: "Spiel auswählen", noGameSelected: "Kein Spiel ausgewählt", chooseGameHint: "Wähle oben ein anstehendes Spiel aus.", modes: "Spielmodi", upcomingGames: "Anstehende Spiele", noOtherUpcomingGames: "Keine weiteren anstehenden Spiele", gameEntry: "Spiel", map: "Karte", modeTeamGame: "Team", modeTeams: "Teams", modeBattleRoyale: "Battle Royale", modeDuel: "1v1", modeZombie: "Zombie", modeUnknown: "Spielmodus", selected: "Ausgewählt", joinGame: "Beitreten", leaveGame: "Verlassen", joinSelected: "Ausgewählt · beitreten", waitingForGames: "Warte auf anstehende Spiele …", unknownPlayer: "Unbekannter Spieler", clans: "Clans",
    lobbyRating: "Lobby-Rating", lobbyRatingUnavailable: "Warte auf bereite Spieler mit Rang",
    teams: "Teams", currentPlayer: "Du spielst als", gameMode: "Spielmodus", readyPlayers: "Bereite Spieler", quickFilters: "Schnellfilter", lobbyInfo: "Lobby-Info", lobbyViews: "Lobby-Bereiche",
    overview: "Übersicht", topReadyPlayers: "Top 3 bereite Spieler", noReadyPlayers: "Keine bereiten Spieler",
    topReadyClan: "Top-Clan (bereit)",
    overviewLeadersNote: "Beste Weltränge unter den bereiten Spielern",
    progress: "Spielstart", players: "Spieler", team: "Team", search: "Spieler suchen …",
    etaUnavailable: "Warte auf Startzeit …", startsIn: "Start in", startingNow: "Spiel startet jetzt",
    readyClansByClan: "Bereite Spieler nach Clan", noReadyClanPlayers: "Keine bereiten Clan-Spieler", others: "Andere",
    all: "Alle", ready: "Bereit", notReady: "Nicht bereit", clan: "Clan", followed: "Following", noClans: "Keine Clans in der Lobby", noClanMembers: "Keine Mitglieder des eigenen Clans in der Lobby",
    onlyReadyClans: "Nur Clans mit Bereiten", noReadyClans: "Keine Clans mit bereiten Spielern",
    readinessFilters: "Bereitschaftsfilter", affiliationFilters: "Zugehörigkeitsfilter", resetFilters: "Filter zurücksetzen",
    rank: "Rang", status: "Status", online: "Online", noPlayers: "Keine Spieler gefunden",
    sort: "Sortierung", sortRankDesc: "Rang absteigend", sortRankAsc: "Rang aufsteigend", sortName: "Name (A–Z)",
    clanTitle: "Clan-Übersicht", chat: "Chat", calls: "Calls", joinCont: "Join Cont", join: "Join", joinNext: "Join {map} {count} teams", nextGame: "nächstes Spiel", chatPlaceholder: "Nachricht an die Lobby …", clear: "Leeren",
    teamMessagePlaceholder: "Nachricht ans Team schreiben …", send: "Senden", messageSent: "Clan-Nachricht gesendet", messageSendFailed: "Clan-Nachricht konnte nicht gesendet werden",
    spawnCallHint: "Wähle einen Kartenbereich. Dein Clan erhält den Call im Lobby-Chat.", spawnDirections: "Spawn-Bereich auswählen",
    topLeft: "Oben links", top: "Oben", topRight: "Oben rechts", left: "Links", center: "Mitte", right: "Rechts", bottomLeft: "Unten links", bottom: "Unten", bottomRight: "Unten rechts",
    send: "Senden", readyAction: "Bereit",
    chatEmpty: "Noch keine Nachrichten", mention: "Erwähnen", dismiss: "Schließen",
    playersCount: "Spieler", noClan: "Kein eigener Clan erkannt", lobbyUnavailable: "Lobby wird geladen …",
    chatUnavailable: "Lobby-Chat konnte nicht geöffnet werden",
  } : {
    title: "Lobby overview", currentMap: "Current map", nextMap: "Your selection", selectedGame: "Your selection", selectGame: "Select game", noGameSelected: "No game selected", chooseGameHint: "Choose an upcoming game above.", modes: "Game modes", upcomingGames: "Upcoming games", noOtherUpcomingGames: "No other upcoming games", gameEntry: "Game", map: "Map", modeTeamGame: "Team", modeTeams: "Teams", modeBattleRoyale: "Battle Royale", modeDuel: "1v1", modeZombie: "Zombie", modeUnknown: "Game mode", selected: "Selected", joinGame: "Join", leaveGame: "Leave", joinSelected: "Selected · join", waitingForGames: "Waiting for upcoming games …", unknownPlayer: "Unknown player", clans: "Clans",
    lobbyRating: "Lobby rating", lobbyRatingUnavailable: "Waiting for ready players with rank data",
    teams: "Teams", currentPlayer: "Playing as", gameMode: "Game mode", readyPlayers: "Ready players", quickFilters: "Quick filters", lobbyInfo: "Lobby info", lobbyViews: "Lobby views",
    overview: "Overview", topReadyPlayers: "Top 3 ready players", noReadyPlayers: "No ready players",
    topReadyClan: "Top ready clan",
    overviewLeadersNote: "Highest global ranks among ready players",
    progress: "Game start", players: "Players", team: "Team", search: "Search players …",
    etaUnavailable: "Waiting for start time …", startsIn: "Starts in", startingNow: "Starting now",
    readyClansByClan: "Ready players by clan", noReadyClanPlayers: "No ready clan players", others: "Others",
    all: "All", ready: "Ready", notReady: "Not ready", clan: "Clan", followed: "Following", noClans: "No clans in this lobby", noClanMembers: "No members of your clan are in this lobby",
    onlyReadyClans: "Only clans with ready players", noReadyClans: "No clans with ready players",
    readinessFilters: "Readiness filters", affiliationFilters: "Affiliation filters", resetFilters: "Reset filters",
    rank: "Rank", status: "Status", online: "Online", noPlayers: "No players found",
    sort: "Sort", sortRankDesc: "Rank descending", sortRankAsc: "Rank ascending", sortName: "Name (A–Z)",
    clanTitle: "Clan overview", chat: "Chat", calls: "Calls", joinCont: "Join Cont", join: "Join", joinNext: "Join {map} {count} teams", nextGame: "next game", chatPlaceholder: "Message the lobby …", clear: "Clear",
    teamMessagePlaceholder: "Write a message to your team …", send: "Send", messageSent: "Clan message sent", messageSendFailed: "Could not send clan message",
    spawnCallHint: "Choose an area of the map. Your clan will receive the call in lobby chat.", spawnDirections: "Choose spawn area",
    topLeft: "Top left", top: "Top", topRight: "Top right", left: "Left", center: "Center", right: "Right", bottomLeft: "Bottom left", bottom: "Bottom", bottomRight: "Bottom right",
    send: "Send", readyAction: "Ready",
    chatEmpty: "No messages yet", mention: "Mention", dismiss: "Close",
    playersCount: "Players", noClan: "No own clan detected", lobbyUnavailable: "Loading lobby …",
    chatUnavailable: "Could not open lobby chat",
  };
};

const LobbyView = defineComponent({
  name: "LobbyView",
  components: { MapHeader, LobbyProgress, PlayerList, ClanOverview, LobbyPlayerName },
  setup() {
    const shell = document.getElementById("fx-game-shell");
    const labels = getLobbyLabels();
    const adapter = createLobbyDataAdapter();
    const snapshot = shallowRef(adapter.getSnapshot());
    const lobbyRating = shallowRef(null);
    const query = ref("");
    const sortBy = ref("rank-asc");
    const readyFilter = ref("all");
    const affiliationFilter = ref("all");
    const chatStatus = ref("");
    const lobbyNotifications = ref([]);
    const notificationIndex = ref(-1);
    const notificationPanelOpen = ref(false);
    const currentLobbyNotification = computed(() => lobbyNotifications.value[notificationIndex.value] ?? null);
    const propagandaDialog = ref(null);
    const propagandaMessage = shallowRef(null);
    let nativePropagandaObserver = null;

    function propagandaRgb(colors, index, fallback) {
      const color = Array.isArray(colors) ? colors[index] : null;
      if (!Array.isArray(color) || color.length < 3) return fallback;
      const channels = color.slice(0, 3).map(channel => {
        const value = Number(channel);
        return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 255) : null;
      });
      return channels.every(channel => channel !== null) ? `rgb(${channels.join(", ")})` : fallback;
    }

    function propagandaTheme(colors) {
      const backdrop = propagandaRgb(colors, 0, "rgb(1, 5, 12)").replace(/^rgb\((.*)\)$/, "rgba($1, .78)");
      return {
        "--fx-propaganda-backdrop": backdrop,
        "--fx-propaganda-card": propagandaRgb(colors, 2, "#081723"),
        "--fx-propaganda-header": propagandaRgb(colors, 1, "#102b3b"),
        "--fx-propaganda-title": propagandaRgb(colors, 7, "#7de4b6"),
        "--fx-propaganda-text": propagandaRgb(colors, 8, "#f0f7fb"),
        "--fx-propaganda-footer": propagandaRgb(colors, 3, "#102b3b"),
        "--fx-propaganda-button": propagandaRgb(colors, 4, "#177a58"),
        "--fx-propaganda-button-text": propagandaRgb(colors, 9, "#f0fff7"),
      };
    }

    function closePropagandaMessage() {
      propagandaMessage.value = null;
      if (propagandaDialog.value?.open) propagandaDialog.value.close();
    }

    function showPropagandaInVue(message, colors, id, suppliedTheme = null) {
      if (window.__fx?.settings?.customLobbyView !== true) return false;
      propagandaMessage.value = {
        text: String(message ?? "").trim(),
        id: Number(id),
        style: suppliedTheme || propagandaTheme(colors),
      };
      nextTick(() => {
        if (propagandaMessage.value && propagandaDialog.value && !propagandaDialog.value.open) {
          propagandaDialog.value.showModal();
        }
      });
      return true;
    }

    function migrateNativePropaganda() {
      for (const overlay of document.querySelectorAll("#fx-propaganda-overlay")) {
        if (overlay.dataset.fxVueHandoff === "true") continue;
        const panel = overlay.firstElementChild;
        const header = panel?.children?.[0];
        const messageBody = panel?.children?.[1];
        const footer = panel?.children?.[2];
        if (!messageBody) continue;
        const messageClone = messageBody.cloneNode(true);
        messageClone.querySelectorAll("style").forEach(style => style.remove());
        const messageText = String(messageClone.innerText || messageClone.textContent || "").trim();
        if (!messageText) continue;
        const closeButton = footer?.querySelector("button");
        const cssValue = (element, property, fallback) => element
          ? getComputedStyle(element).getPropertyValue(property).trim() || fallback
          : fallback;
        const suppliedTheme = {
          "--fx-propaganda-backdrop": cssValue(overlay, "background-color", "rgba(1, 5, 12, .78)"),
          "--fx-propaganda-card": cssValue(messageBody, "background-color", "#081723"),
          "--fx-propaganda-header": cssValue(header, "background-color", "#102b3b"),
          "--fx-propaganda-title": cssValue(header, "color", "#7de4b6"),
          "--fx-propaganda-text": cssValue(messageBody, "color", "#f0f7fb"),
          "--fx-propaganda-footer": cssValue(footer, "background-color", "#102b3b"),
          "--fx-propaganda-button": cssValue(closeButton, "background-color", "#177a58"),
          "--fx-propaganda-button-text": cssValue(closeButton, "color", "#f0fff7"),
        };
        if (showPropagandaInVue(messageText, null, -1, suppliedTheme)) {
          overlay.dataset.fxVueHandoff = "true";
          overlay.remove();
        }
      }
    }

    window.__fx.showPropagandaInVue = showPropagandaInVue;
    function refreshLobbyLanguage(language = window.__fx?.getGameLanguage?.() || "en") {
      const german = String(language || "en").toLowerCase().startsWith("de");
      Object.assign(labels, getLobbyLabels(language));
      labels.followers = german ? "GEFOLGTE SPIELER" : "FOLLOWED PLAYERS";
      labels.nextContestUnknown = german ? "CONTEST-STATUS UNBEKANNT" : "CONTEST STATUS UNKNOWN";
      labels.nextStandardGame = german ? "NORMALES SPIEL" : "STANDARD GAME";
      labels.lobbyCategory = "LOBBY";
      labels.noticeCategory = german ? "HINWEIS" : "NOTICE";
      lobbyNotifications.value = lobbyNotifications.value.map(notification => ({
        ...notification,
        category: labels[notification.categoryKey] || notification.category,
      }));
    }
    refreshLobbyLanguage();
    const activeTab = ref("overview");
    let hasOpenedPlayersTab = false;
    const currentSelectionOverride = ref(undefined);
    let currentSelectionOverrideTimer = 0;
    const playerContextMenu = ref(null);
    const playerListComponent = ref(null);
    const active = ref(false);
    let nativeNotificationObserver = null;
    const hiddenNativeNotifications = new Map();
    const hideNativeNotificationOverlays = () => {
      for (const element of document.body.querySelectorAll("div")) {
        if (element.closest(`#${APP_ID}, #fx-sidebar, #fx-propaganda-overlay`)) continue;
        const inlineStyle = element.style;
        const computedStyle = getComputedStyle(element);
        const position = inlineStyle.position || computedStyle.position;
        const right = inlineStyle.right || computedStyle.right;
        const top = inlineStyle.top || computedStyle.top;
        const zIndex = Number(inlineStyle.zIndex || computedStyle.zIndex);
        const looksLikeNotification = element.children.length >= 3
          || (element.children.length === 0 && /^\\d+$/.test(element.textContent.trim()));
        const isNativeOverlay = (position === "absolute" || position === "fixed")
          && right === "0px"
          && top === "0px"
          && Number.isFinite(zIndex) && zIndex >= 0 && zIndex <= 10
          && looksLikeNotification;
        if (isNativeOverlay && !hiddenNativeNotifications.has(element)) {
          hiddenNativeNotifications.set(element, element.style.display);
          element.style.display = "none";
        }
      }
    };
    const scale = computed(() => Math.max(.75, Math.min(3,
      Number(window.__fx?.settings?.lobbyFontScale ?? 100) / 100)));
    watch(active, isActive => {
      if (isActive) {
        refreshLobbyLanguage();
        requestAnimationFrame(() => {
          hideNativeNotificationOverlays();
          nativeNotificationObserver = new MutationObserver(hideNativeNotificationOverlays);
          nativeNotificationObserver.observe(document.body, { childList: true, subtree: true });
        });
      } else {
        nativeNotificationObserver?.disconnect();
        nativeNotificationObserver = null;
        for (const [element, display] of hiddenNativeNotifications) element.style.display = display;
        hiddenNativeNotifications.clear();
      }
    });
    const filteredPlayers = computed(() => {
      const needle = query.value.trim().toLocaleLowerCase();
      const players = snapshot.value.players.filter(player => {
        if (needle && !player.name.toLocaleLowerCase().includes(needle)) return false;
        if (readyFilter.value === "ready" && player.readiness !== "ready") return false;
        if (readyFilter.value === "not-ready" && player.readiness !== "not-ready") return false;
        if (activeTab.value !== "team" && affiliationFilter.value === "clan" && !player.clan) return false;
        if (activeTab.value !== "team" && affiliationFilter.value === "followed" && !player.followed) return false;
        return true;
      });
      if (sortBy.value === "name") {
        players.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
      } else if (sortBy.value === "rank-asc") {
        players.sort((left, right) => (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY)
          || left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
      } else if (sortBy.value === "rank-desc") {
        players.sort((left, right) => (right.rank ?? Number.NEGATIVE_INFINITY) - (left.rank ?? Number.NEGATIVE_INFINITY)
          || left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
      }
      return players;
    });
    const clanGroups = computed(() => {
      const groups = new Map();
      for (const player of snapshot.value.players) {
        if (!player.clan) continue;
        const group = groups.get(player.clan) ?? { tag: player.clan, players: [], readyCount: 0 };
        group.players.push(player);
        if (player.readiness === "ready") group.readyCount++;
        groups.set(player.clan, group);
      }
      return [...groups.values()].sort((a, b) => b.readyCount - a.readyCount
        || b.players.length - a.players.length
        || a.tag.localeCompare(b.tag));
    });
    const topReadyClan = computed(() => clanGroups.value.find(clan => clan.readyCount > 0) ?? null);
    const readyClanTotal = computed(() => snapshot.value.players
      .filter(player => player.readiness === "ready").length);
    const readyClanSlices = computed(() => {
      const counts = new Map();
      const othersSliceId = "__fx_others__";
      let untaggedCount = 0;
      for (const player of snapshot.value.players) {
        if (player.readiness !== "ready") continue;
        if (!player.clan) {
          untaggedCount++;
          continue;
        }
        counts.set(player.clan, (counts.get(player.clan) ?? 0) + 1);
      }
      const sortedClanCounts = [...counts.entries()].sort(([tagA, countA], [tagB, countB]) =>
        countB - countA || tagA.localeCompare(tagB));
      const otherCount = untaggedCount;
      const chartCounts = otherCount > 0
        ? [...sortedClanCounts, [othersSliceId, otherCount]]
        : sortedClanCounts;
      const total = chartCounts.reduce((sum, [, count]) => sum + count, 0);
      const circumference = 2 * Math.PI * 16;
      let offset = 0;
      return chartCounts.map(([tag, count]) => {
        const isOthers = tag === othersSliceId;
        const segmentLength = circumference * count / total;
        const slice = {
          tag,
          isOthers,
          count,
          color: isOthers ? "#91a0b2" : getClanChartColor(tag),
          dashArray: `${segmentLength} ${circumference - segmentLength}`,
          dashOffset: String(-offset),
        };
        offset += segmentLength;
        return slice;
      });
    });
    const clanCount = computed(() => `${clanGroups.value.filter(clan => clan.readyCount > 0).length}/${clanGroups.value.length}`);
    const onlyReadyClans = ref(false);
    const visibleClanGroups = computed(() => onlyReadyClans.value
      ? clanGroups.value.filter(clan => clan.readyCount > 0)
      : clanGroups.value);
    const playerCountLabel = computed(() => `${snapshot.value.readyCount}/${snapshot.value.playerCount}`);
    const currentPlayerName = computed(() => {
      const self = getSelfLobbyPlayer(snapshot.value.players);
      const nativeIdentity = window.__fx?.getNativeOwnPlayerIdentity?.();
      const playerId = window.__fx?.getGameVar?.("playerId");
      const rawPlayerName = window.__fx?.getGameVar?.("rawPlayerNames")?.[playerId];
      const homeName = window.__fx?.getNativeHomeNameInput?.()?.value;
      const accountName = window.__fx?.myAccountAdapter?.getSnapshot?.()?.accountName;
      return self?.name || rawPlayerName || nativeIdentity?.username || homeName || accountName || labels.unknownPlayer;
    });
    const ownClan = computed(() => {
      const ownName = window.__fx?.getGameVar?.("rawPlayerNames")?.[window.__fx?.getGameVar?.("playerId")] ?? "";
      const ownIdentity = window.__fx?.getNativeOwnPlayerIdentity?.();
      const nativeHomeName = window.__fx?.getNativeHomeNameInput?.()?.value ?? "";
      const ownAccountId = window.__fx?.getNativeAccountId?.();
      const accountProfile = window.__fx?.myAccountAdapter?.getSnapshot?.();
      const accountClan = accountProfile?.primaryClan?.tag || accountProfile?.clanLeadership?.clan
        || accountProfile?.secondaryClan?.tag || "";
      const self = getSelfLobbyPlayer(snapshot.value.players);
      return self?.clan || getPlayerClan(self?.name) || ownIdentity?.clan
        || getPlayerClan(ownIdentity?.username) || getPlayerClan(accountProfile?.accountName)
        || String(accountClan).replace(/^\[|\]$/g, "").trim().toLocaleUpperCase()
        || getPlayerClan(nativeHomeName)
        || snapshot.value.players.find(player => ownAccountId != null && String(player.id) === String(ownAccountId))?.clan
        || getPlayerClan(ownName) || null;
    });
    const getClanDiagnostics = () => {
      const playerId = window.__fx?.getGameVar?.("playerId");
      const rawPlayerName = window.__fx?.getGameVar?.("rawPlayerNames")?.[playerId] ?? null;
      const nativeHomeName = window.__fx?.getNativeHomeNameInput?.()?.value ?? null;
      const nativeAccountId = window.__fx?.getNativeAccountId?.() ?? null;
      const nativeIdentity = window.__fx?.getNativeOwnPlayerIdentity?.() ?? null;
      const accountProfile = window.__fx?.myAccountAdapter?.getSnapshot?.() ?? null;
      const self = getSelfLobbyPlayer(snapshot.value.players);
      return {
        playerId,
        rawPlayerName,
        nativeHomeName,
        nativeAccountId,
        nativeIdentity,
        accountProfile: accountProfile ? {
          accountName: accountProfile.accountName,
          primaryClan: accountProfile.primaryClan?.tag,
          secondaryClan: accountProfile.secondaryClan?.tag,
          leadershipClan: accountProfile.clanLeadership?.clan,
        } : null,
        detectedSelf: self ? { id: self.id, name: self.name, clan: self.clan } : null,
        ownClan: ownClan.value,
        clans: clanGroups.value.map(group => ({ tag: group.tag, count: group.players.length })),
        lobbyPlayers: snapshot.value.players.map(player => ({ id: player.id, name: player.name, clan: player.clan, self: player.self })),
      };
    };
    const nextGameMeta = computed(() => {
      const entries = snapshot.value.upcomingGames ?? [];
      const selectedEntry = entries.find(entry => entry.selected);
      const values = [];
      if (selectedEntry?.playerCount != null) values.push(`${selectedEntry.playerCount} ${labels.players.toLowerCase()}`);
      if (selectedEntry?.countdownSeconds != null) {
        const seconds = Math.max(0, Math.floor(selectedEntry.countdownSeconds));
        values.push(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
      }
      return values.join(" · ");
    });
    const isTeamMode = computed(() => /team/i.test(String(snapshot.value.currentTeamCountLabel ?? "")));
    const ownClanPlayers = computed(() => ownClan.value
      ? snapshot.value.players.filter(player => player.clan === ownClan.value)
      : []);
    const clanOverviewGroup = computed(() => ownClan.value
      ? clanGroups.value.find(group => group.tag === ownClan.value) ?? null
      : null);
    const clanPlayers = computed(() => clanOverviewGroup.value?.players ?? []);
    const teamCount = computed(() => `${ownClanPlayers.value.filter(player => player.readiness === "ready").length}/${ownClanPlayers.value.length}`);
    const filteredTeamPlayers = computed(() => filteredPlayers.value
      .filter(player => ownClan.value && player.clan === ownClan.value));
    const clanReadyCount = computed(() => clanPlayers.value.filter(player => player.readiness === "ready").length);
    const currentMapEntry = computed(() => {
      const entries = snapshot.value.upcomingGames ?? [];
      return entries.find(entry => entry.id === snapshot.value.currentMapEntryId) ?? entries[0] ?? null;
    });
    const currentMapEntrySelected = computed(() => currentMapEntry.value
      ? currentSelectionOverride.value !== undefined
        ? currentSelectionOverride.value === currentMapEntry.value.id
        : currentMapEntry.value.selected === true
      : false);

    let nativeRoot = null;
    let savedStyles = null;
    let observer = null;
    let frame = 0;
    let unsubscribe = () => {};
    let unsubscribeGameSdk = () => {};
    let unsubscribeLobbyChat = () => {};
    let missingLobbyTimer = 0;
    let readinessRefreshTimer = 0;
    let ratingRefreshTimer = 0;

    function refreshLobbyRating(players = snapshot.value.players) {
      const sidebarRating = window.__fx?.vueSidebarApi?.getLobbyRating?.();
      const visibleRatingCard = document.querySelector("#fx-sidebar .fx-vue-sidebar-rating");
      const visibleValue = visibleRatingCard?.querySelector("strong")?.textContent?.match(/[0-9]+(?:[.,][0-9]+)?/)?.[0];
      const visibleMeta = visibleRatingCard?.querySelector("span")?.textContent?.trim();
      const visibleSidebarRating = visibleValue ? {
        value: visibleValue,
        image: visibleRatingCard.querySelector("img")?.src ?? "",
        meta: visibleMeta ?? "",
        title: visibleRatingCard.title ?? "",
      } : null;
      lobbyRating.value = sidebarRating ?? visibleSidebarRating ?? calculateLobbyRating(
        players.filter(player => player.readiness === "ready").map(player => player.rank),
        key => labels[key] ?? key,
      );
    }

    function restoreNativeRoot() {
      if (!nativeRoot || !savedStyles) return;
      for (const [property, value, priority] of savedStyles) {
        if (value) nativeRoot.style.setProperty(property, value, priority);
        else nativeRoot.style.removeProperty(property);
      }
      delete nativeRoot.dataset.fxCustomLobbyHidden;
      nativeRoot = null;
      savedStyles = null;
    }

    function readLobby() {
      if (!shell) return;
      const found = getLobbyList(shell);
      if (!found) {
        const spans = Array.from(shell.querySelectorAll("span"));
        const markedRows = spans.filter(row => row.dataset.fxLobbyPlayer === "true").length;
        const statusRows = spans.filter(row => /^[🟢⚪]\s*/u.test(cleanText(row))).length;
        logLobbyDiagnostic("lobby-list-missing", `${markedRows}:${statusRows}:${spans.length}`, {
          markedPlayerSpans: markedRows,
          statusLikeSpans: statusRows,
          totalSpans: spans.length,
          settingsEnabled: window.__fx?.settings?.customLobbyView,
          gameState: window.__fx?.getGameVar?.("gameState"),
        });
        // Some native builds only render the selected Chat or roster panel.
        if (!nativeRoot?.isConnected) {
          const root = findLobbyRoot(shell);
          if (root) {
            nativeRoot = root;
            savedStyles = ["visibility", "pointer-events"].map(property => [
              property, root.style.getPropertyValue(property), root.style.getPropertyPriority(property),
            ]);
            root.style.setProperty("visibility", "hidden", "important");
            root.style.setProperty("pointer-events", "none", "important");
            root.dataset.fxCustomLobbyHidden = "true";
            active.value = true;
            activeTab.value = "chat";
            const current = adapter.getSnapshot();
            adapter.publish(readNativeSummary(root, {
              ...current,
              chatMessages: current.chatMessages,
            }), "native-lobby-bridge");
            return;
          }
        }
        // Keep the native panel selected by the user; do not simulate tab cycles.
        // Keep the custom view and last roster snapshot alive across that tab change.
        if (nativeRoot?.isConnected) {
          const current = adapter.getSnapshot();
          adapter.publish(readNativeSummary(nativeRoot, {
            ...current,
            chatMessages: current.chatMessages,
          }), current.source);
          active.value = true;
          return;
        }
        if (!missingLobbyTimer) {
          missingLobbyTimer = window.setTimeout(() => {
            missingLobbyTimer = 0;
            if (nativeRoot && !nativeRoot.isConnected) {
              restoreNativeRoot();
              active.value = false;
              adapter.clear();
            }
          }, 1400);
        }
        return;
      }
      if (missingLobbyTimer) {
        window.clearTimeout(missingLobbyTimer);
        missingLobbyTimer = 0;
      }
      const root = getLobbyRoot(found.element);
      if (!root || root === shell || !root.contains(found.element)) {
        logLobbyDiagnostic("lobby-root-invalid", `${Boolean(root)}:${root?.children?.length ?? 0}`, {
          rootFound: Boolean(root),
          rootChildren: root?.children?.length ?? 0,
          playerRows: found.rows.length,
        });
        return;
      }
      if (nativeRoot !== root) {
        restoreNativeRoot();
        nativeRoot = root;
        savedStyles = ["visibility", "pointer-events"].map(property => [
          property, root.style.getPropertyValue(property), root.style.getPropertyPriority(property),
        ]);
        root.style.setProperty("visibility", "hidden", "important");
        root.style.setProperty("pointer-events", "none", "important");
        root.dataset.fxCustomLobbyHidden = "true";
      }

      const ownPlayerId = window.__fx?.getGameVar?.("playerId");
      const ownPlayerName = window.__fx?.getGameVar?.("rawPlayerNames")?.[ownPlayerId];
      const ownIdentity = window.__fx?.getNativeOwnPlayerIdentity?.();
      const sdkLobbySnapshot = window.__fx?.gameSdk?.lobby?.getSnapshot?.();
      const hasDecodedRoster = sdkLobbySnapshot?.rosterEntryId != null
        && sdkLobbySnapshot.entries?.some(entry => entry.id === sdkLobbySnapshot.rosterEntryId)
        && Array.isArray(sdkLobbySnapshot.players);
      const readinessByName = hasDecodedRoster
        ? new Map(sdkLobbySnapshot.players.map(player => [normalizeLobbyPlayerName(player.name), player.ready ? "ready" : "not-ready"]))
        : null;
      const nativePlayers = found.rows.map((row, index) => {
        const rawText = cleanText(row);
        // The native rank/follow patch decorates the inner name span, while
        // getLobbyList returns its outer row. Read metadata from either node.
        const metadata = row.dataset.fxAccountName || row.dataset.fxRank || row.dataset.fxRankText
          ? row : row.querySelector("[data-fx-account-name], [data-fx-rank], [data-fx-rank-text]") ?? row;
        const name = metadata.dataset.fxAccountName || row.dataset.fxAccountName
          || rawText.replace(/^[🟢⚪]\s*/u, "");
        if (!row.dataset.fxLobbyPlayer) row.dataset.fxLobbyPlayer = "true";
        if (!metadata.dataset.fxAccountName) metadata.dataset.fxAccountName = name;
        const senderId = window.__fx?.getLobbyChatSenderIdByName?.(name) ?? null;
        const readinessMark = rawText.codePointAt(0);
        if (readinessMark === 0x1F7E2) row.dataset.fxLobbyReady = "ready";
        else if (readinessMark === 0x26AA) row.dataset.fxLobbyReady = "not-ready";
        else if (!row.dataset.fxLobbyReady) row.dataset.fxLobbyReady = "unknown";
        return {
          id: metadata.dataset.fxPlayerId || row.dataset.fxPlayerId || `${name}-${index}`,
          senderId,
          name,
          clan: metadata.dataset.fxClan || row.dataset.fxClan
            || getPlayerClan(name) || getPlayerClan(rawText),
          readiness: row.dataset.fxLobbyReady || "unknown",
          nativeReadiness: readinessMark === 0x1F7E2 || readinessMark === 0x26AA,
          rank: Number(metadata.dataset.fxRank) || null,
          rankText: metadata.dataset.fxRankText || "",
          followed: metadata.dataset.fxFollowed === "true" || metadata.classList.contains("fx-followed-player"),
          self: metadata.dataset.fxSelf === "true" || row.dataset.fxSelf === "true"
            || String(metadata.dataset.fxPlayerId || row.dataset.fxPlayerId || "") === String(ownPlayerId ?? "")
            || (ownIdentity?.id != null
              && String(metadata.dataset.fxPlayerId || row.dataset.fxPlayerId || "") === String(ownIdentity.id))
            || (typeof ownIdentity?.username === "string"
              && normalizeLobbyPlayerName(ownIdentity.username) === normalizeLobbyPlayerName(name))
            || (typeof ownPlayerName === "string"
              && normalizeLobbyPlayerName(ownPlayerName) === normalizeLobbyPlayerName(name)),
          color: window.__fx?.getLobbyChatSenderColor?.(senderId) || metadata.style.color || row.style.color,
          title: metadata.title || row.title,
          nativeElement: metadata,
        };
      });
      const players = readinessByName
        ? nativePlayers.map(player => ({
          ...player,
          readiness: player.nativeReadiness ? player.readiness
            : readinessByName.get(normalizeLobbyPlayerName(player.name)) ?? player.readiness,
        }))
        : nativePlayers;
      active.value = true;
      const nextSnapshot = adapter.publish(readNativeSummary(root, {
        players,
        chatMessages: adapter.getSnapshot().chatMessages,
      }), "native-lobby-bridge");
      const readinessSignature = nextSnapshot.players.map(player => `${player.id}:${player.readiness}`).join("|");
      logLobbyDiagnostic("lobby-data-found", `${nextSnapshot.playerCount}:${readinessSignature}:${nextSnapshot.modes.length}:${nextSnapshot.currentMap}:${nextSnapshot.nextMap}:${nextSnapshot.chatMessages.length}`, {
        playerCount: nextSnapshot.playerCount,
        modeCount: nextSnapshot.modes.length,
        currentMap: nextSnapshot.currentMap || "unresolved",
        nextMap: nextSnapshot.nextMap || "unresolved",
        readyCount: nextSnapshot.readyCount,
        chatMessageCount: nextSnapshot.chatMessages.length,
      });
    }

    function readNativeSummary(root, snapshot) {
      void loadPersistentMapImages();
      const sdkLobby = window.__fx?.gameSdk?.lobby?.getSnapshot?.();
      const upcomingGames = Array.isArray(sdkLobby?.entries) ? sdkLobby.entries : [];
      const rosterEntry = upcomingGames.find(game => game.id === sdkLobby?.rosterEntryId)
        ?? upcomingGames[0]
        ?? null;
      const selectedNextEntry = upcomingGames.find(game => game.selected) ?? null;
      const currentMapEntry = rosterEntry ?? upcomingGames[0] ?? null;
      const enhancedModes = Array.from(root.querySelectorAll(".fx-lobby-mode-tab"));
      const modeButtons = enhancedModes.length ? enhancedModes
        : Array.from(root.children[1]?.querySelectorAll("button") ?? []);
      const modes = modeButtons.map((button, index) => {
        const clock = cleanText(button.querySelector('[data-fx-tab-meta="clock"]'));
        const count = cleanText(button.querySelector('[data-fx-tab-meta="count"]'));
        const map = cleanText(button.querySelector('[data-fx-tab-meta="map"]'));
        const label = getModeLabel(button);
        const contestText = [label, cleanText(button), button.title, button.getAttribute("aria-label")].filter(Boolean).join(" ");
        // Read current mode metadata from its own tab, never from map rows.
        const teamCountLabel = /^team$/i.test(label.trim())
          ? getTeamCountLabel([cleanText(button), count, map].filter(Boolean)) : "";
        return {
        id: String(index), label,
        clock,
        count,
        map,
        teamCountLabel,
        isContest: button.textContent.includes("🏆")
          || button.querySelector('[aria-label*="contest" i], [title*="contest" i]') !== null
          || /🏆|contest/i.test(contestText),
          active: button.dataset.fxLobbyModeActive === "true"
          || button.getAttribute("aria-pressed") === "true"
          || button.classList.contains("active") || button.classList.contains("selected"),
        nativeElement: button,
      }; });
      const selectedMode = modes.find(mode => mode.active);
      const mapNames = findMapNames(root);
      const room = window.__fx?.lobbyReminders?.getSelectedGame?.();
      const rawNames = window.__fx?.getGameVar?.("rawPlayerNames");
      const roomMap = room?.map == null ? NaN : Number(room.map);
      const roomMode = room?.mode == null ? NaN : Number(room.mode);
      const selectedMapIndex = currentMapEntry?.mapIndex != null ? Number(currentMapEntry.mapIndex)
        : currentMapEntry ? NaN : roomMap;
      const selectedModeCode = currentMapEntry?.modeCode != null ? Number(currentMapEntry.modeCode)
        : currentMapEntry ? NaN : roomMode;
      const currentMap = Number.isInteger(selectedMapIndex)
        ? window.__fx?.getGameMapNames?.()?.[selectedMapIndex] || getMapName(selectedMapIndex)
        : snapshot?.currentMap || mapNames[0] || "";
      const currentTeamCountLabel = Number.isInteger(selectedModeCode) && selectedModeCode >= 0 && selectedModeCode <= 6 ? `${selectedModeCode + 2} Teams` : "";
      const currentModeKey = selectedModeCode >= 0 && selectedModeCode <= 6 ? "team"
        : selectedModeCode === 7 || selectedModeCode === 10 ? "battle-royale"
          : selectedModeCode === 8 ? "duel" : selectedModeCode === 9 ? "zombie" : "unknown";
      const currentGameModeLabel = currentModeKey === "team" ? labels.modeTeamGame
        : currentModeKey === "battle-royale" ? labels.modeBattleRoyale
          : currentModeKey === "duel" ? labels.modeDuel : currentModeKey === "zombie" ? labels.modeZombie
            : currentMapEntry ? "" : selectedMode?.label || "";
      const nextMapIndex = selectedNextEntry?.mapIndex == null ? NaN : Number(selectedNextEntry.mapIndex);
      const nextMap = selectedNextEntry
        ? selectedNextEntry.mapName || (Number.isInteger(nextMapIndex)
          ? window.__fx?.getGameMapNames?.()?.[nextMapIndex] || getMapName(nextMapIndex) : `${labels.gameEntry} #${selectedNextEntry.id}`)
        : "";
      const nextModeCode = selectedNextEntry?.modeCode == null ? NaN : Number(selectedNextEntry.modeCode);
      const nextTeamCountLabel = Number.isInteger(nextModeCode) && nextModeCode >= 0 && nextModeCode <= 6 ? `${nextModeCode + 2} Teams` : "";
      const nextModeKey = nextModeCode >= 0 && nextModeCode <= 6 ? "team"
        : nextModeCode === 7 || nextModeCode === 10 ? "battle-royale"
          : nextModeCode === 8 ? "duel" : nextModeCode === 9 ? "zombie" : "unknown";
      const nextGameModeLabel = nextModeKey === "team" ? labels.modeTeamGame
        : nextModeKey === "battle-royale" ? labels.modeBattleRoyale
          : nextModeKey === "duel" ? labels.modeDuel : nextModeKey === "zombie" ? labels.modeZombie : "";
      const isContest = currentMapEntry ? currentMapEntry.isContest === true
        : selectedMode?.isContest === true || room?.isContest === true;
      const nextIsContest = selectedNextEntry ? selectedNextEntry.isContest === true : null;
      const noFullsend = selectedModeCode === 10;
      const nextNoFullsend = nextModeCode === 10;
      const capturedMapImage = findMapImage(root);
      const currentMapImage = capturedMapImage
        || (snapshot?.currentMap === currentMap ? snapshot?.currentMapImage : "")
        || mapImageCache.get(mapImageCacheKey(currentMap)) || "";
      if (currentMapImage) rememberMapImage(currentMap, currentMapImage);
      const nextMapImage = mapImageCache.get(mapImageCacheKey(nextMap))
        || (mapImageCacheKey(nextMap) === mapImageCacheKey(currentMap) ? currentMapImage : "");
      const gameMapNames = window.__fx?.getGameMapNames?.();
      const entryCards = upcomingGames.map(entry => {
        const mapName = entry.mapName || (entry.mapIndex != null && Number.isInteger(Number(entry.mapIndex))
          ? String(gameMapNames?.[Number(entry.mapIndex)] || getMapName(Number(entry.mapIndex))) : "");
        const modeCode = entry.modeCode == null ? NaN : Number(entry.modeCode);
        const modeKey = modeCode >= 0 && modeCode <= 6 ? "team"
          : modeCode === 7 || modeCode === 10 ? "battle-royale"
            : modeCode === 8 ? "duel" : modeCode === 9 ? "zombie" : "unknown";
        const teamCountLabel = modeKey === "team" ? `${modeCode + 2} ${labels.modeTeams}` : "";
        const modeLabel = modeKey === "team" ? labels.modeTeamGame
          : modeKey === "battle-royale" ? labels.modeBattleRoyale
            : modeKey === "duel" ? labels.modeDuel : modeKey === "zombie" ? labels.modeZombie : labels.modeUnknown;
        const isDisplayedEntry = entry.id === selectedNextEntry?.id;
        return {
          ...entry,
          mapName,
          mapImage: mapImageCache.get(mapImageCacheKey(mapName))
            || (entry.id === currentMapEntry?.id ? currentMapImage : isDisplayedEntry ? nextMapImage : ""),
          modeKey,
          modeLabel,
          teamCountLabel,
        };
      });
      const progressText = cleanText(root.children[5]);
      const readinessTexts = [progressText,
        ...Array.from(root.children[6]?.querySelectorAll("button, [role='button']") ?? [])
          .flatMap(button => [cleanText(button), button.getAttribute("aria-label"), button.title])
          .filter(Boolean),
      ];
      const readinessMatch = readinessTexts.map(text => text.match(/(\d+)\s*\/\s*(\d+)/)).find(Boolean);
      const rosterMatchesEntry = rosterEntry && sdkLobby?.rosterEntryId === rosterEntry.id
        && Array.isArray(sdkLobby.players);
      const readyCount = rosterMatchesEntry ? sdkLobby.readyCount
        : readinessMatch ? Number(readinessMatch[1]) : snapshot?.readyCount;
      const playerCount = rosterMatchesEntry ? sdkLobby.playerCount
        : readinessMatch ? Number(readinessMatch[2]) : snapshot?.playerCount;
      return {
        ...snapshot,
        upcomingGames: entryCards,
        currentMapEntryId: currentMapEntry?.id ?? null,
        rosterEntryId: sdkLobby?.rosterEntryId ?? null,
        nextGameEntryId: rosterEntry?.id ?? null,
        nextGameCountdownSeconds: rosterEntry?.countdownSeconds ?? null,
        nextGamePlayerCount: rosterEntry?.playerCount ?? null,
        modes: modes.length ? modes : snapshot?.modes ?? [],
        // The game now has one lobby-wide chat shared by all game modes.
        chatChannel: "lobby",
        currentMap,
        currentMapImage,
        currentTeamCountLabel,
        currentGameModeLabel,
        currentGameModeKey: currentModeKey,
        nextMap,
        nextMapImage,
        // Chat is lobby-wide; never replace its feed with the selected game's
        // room-local chat log.
        chatMessages: snapshot?.chatMessages ?? [],
        isContest,
        nextIsContest,
        noFullsend,
        nextNoFullsend,
        modes: modes.map(mode => ({ ...mode, teamCountLabel: /team/i.test(mode.label) ? currentTeamCountLabel : "" })),
        nextTeamCountLabel,
        nextGameModeLabel,
        nextGameModeKey: selectedNextEntry ? nextModeKey : "",
        readyCount,
        playerCount,
        progressPercent: null,
      };
    }

    function getTeamCountLabel(texts) {
      for (const text of texts) {
        const match = text.match(/\b(\d+)\s*teams?\b|\bteams?\s*[:x-]?\s*(\d+)\b/i);
        if (!match) continue;
        const count = Number(match[1] ?? match[2]);
        if (!Number.isInteger(count) || count < 2 || count > 8) continue;
        return `${count} Teams`;
      }
      return "";
    }

    function getTeamCountForMap(mapName, mapElement) {
      const mapInfo = window.__fx?.getGameMapInfo?.();
      const metadataCount = mapInfo?.find(info => info.name === mapName)?.teamCount;
      if (Number.isInteger(metadataCount) && metadataCount >= 2 && metadataCount <= 8) {
        return `${metadataCount} Teams`;
      }
      // Fallback for game builds that do not expose team metadata.
      const texts = [cleanText(mapElement), ...Array.from(mapElement?.querySelectorAll("button") ?? []).map(cleanText)].filter(Boolean);
      return getTeamCountLabel(texts);
    }

    function scheduleRead() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        readLobby();
      });
    }

    function findNativeChatTab(root) {
      return Array.from(root?.querySelectorAll("button, [role='button'], [role='tab']") ?? [])
        .find(button => [cleanText(button), button.getAttribute("aria-label"), button.title]
          .some(value => /^chat\b/i.test(value ?? "")));
    }

    function findNativePlayerTab(root) {
      return Array.from(root?.querySelectorAll(".fx-lobby-chat-player-tab, button, [role='button'], [role='tab']") ?? [])
        .find(button => {
          const iconLabel = cleanText(button.querySelector("[data-fx-lobby-tab-icon='true']"));
          return [iconLabel, cleanText(button), button.getAttribute("aria-label"), button.title]
            .some(value => /^(spieler|players)\b/i.test(value ?? ""));
        });
    }

    function selectLobbyTab(tab) {
      if (tab === "players" && !hasOpenedPlayersTab) {
        readyFilter.value = "ready";
        hasOpenedPlayersTab = true;
      }
      activeTab.value = tab;
      // Keep the native roster mounted for live player/readiness data. FX chat
      // receives messages from the socket feed and does not switch native tabs.
      if (tab !== "chat") findNativePlayerTab(nativeRoot)?.click();
      [80, 220].forEach(delay => window.setTimeout(scheduleRead, delay));
    }

    function openPlayerContextMenu(player, event) {
      event?.preventDefault();
      event?.stopPropagation();
      if (!player?.name) return;
      playerContextMenu.value = {
        senderId: player.senderId,
        senderName: player.name,
        senderColor: player.color || "",
        x: Math.max(8, Math.min(event?.clientX ?? 8, window.innerWidth - 176)),
        y: Math.max(8, Math.min(event?.clientY ?? 8, window.innerHeight - 54)),
      };
    }

    async function mentionPlayerFromContextMenu() {
      const player = playerContextMenu.value;
      if (!player) return;
      playerContextMenu.value = null;
      selectLobbyTab("chat");
      await nextTick();
      await nextTick();

      let token = "";
      try {
        const accountId = Number(player.senderId
          ?? window.__fx?.getLobbyChatSenderIdByName?.(player.senderName));
        if (Number.isInteger(accountId)) token = String(window.__fx?.getLobbyChatMentionToken?.(accountId) ?? "").trim();
      } catch (error) {
        console.warn("[ZFX Client LobbyView] Could not resolve account mention ID:", error);
      }
      if (!token) {
        console.warn("[ZFX Client LobbyView] Account mention ID is not available for this player.", player);
        return;
      }
      playerListComponent.value?.insertMentionToken?.(token);
    }

    function handleBotProtectionState(event) {
      if (event.detail?.active) restoreNativeRoot();
      else scheduleRead();
    }

    function handleNativeLobbyReturn() {
      active.value = true;
      scheduleRead();
    }

    function handleLobbyNotification(event) {
      const text = String(event.detail?.text ?? "").trim();
      if (!text) return;
      const presentation = formatLobbyNotification(text);
      const sourceIndex = Number.isInteger(event.detail?.index) ? event.detail.index : null;
      const id = sourceIndex !== null && sourceIndex >= 0
        ? `native:${sourceIndex}` : `${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const existingIndex = lobbyNotifications.value.findIndex(item => item.id === id);
      if (existingIndex >= 0) {
        const categoryKey = presentation.kind === "followers" ? "followers"
          : Number(event.detail?.id) === 7 ? "lobbyCategory" : "noticeCategory";
        lobbyNotifications.value[existingIndex] = {
          ...lobbyNotifications.value[existingIndex], text, ...presentation,
          categoryKey, category: labels[categoryKey],
        };
        notificationIndex.value = existingIndex;
        notificationPanelOpen.value = true;
        return;
      }
      const categoryKey = presentation.kind === "followers" ? "followers"
        : Number(event.detail?.id) === 7 ? "lobbyCategory" : "noticeCategory";
      const nextNotifications = [...lobbyNotifications.value, {
        id,
        text,
        ...presentation,
        categoryKey,
        category: labels[categoryKey],
      }];
      while (nextNotifications.length > 100) nextNotifications.shift();
      lobbyNotifications.value = nextNotifications;
      notificationIndex.value = nextNotifications.length - 1;
      notificationPanelOpen.value = true;
    }

    function previousLobbyNotification() {
      notificationIndex.value = Math.max(0, notificationIndex.value - 1);
    }

    function nextLobbyNotification() {
      notificationIndex.value = Math.min(lobbyNotifications.value.length - 1, notificationIndex.value + 1);
    }

    function selectUpcomingGame(entry) {
      const selected = window.__fx?.gameSdk?.lobby?.selectEntry?.(entry?.id);
      if (!selected) console.warn("[ZFX Client LobbyView] Could not select upcoming game entry:", entry?.id);
      return Boolean(selected);
    }

    function toggleCurrentMapEntry() {
      const entry = currentMapEntry.value;
      const lobby = window.__fx?.gameSdk?.lobby;
      if (!entry || typeof lobby?.selectEntry !== "function") {
        console.warn("[ZFX Client LobbyView] Current-map selection is unavailable:", {
          entryId: entry?.id ?? null,
          currentMapEntryId: snapshot.value.currentMapEntryId,
          lobbySdkAvailable: Boolean(lobby),
        });
        return false;
      }
      const wasSelected = currentMapEntrySelected.value;
      const changed = wasSelected ? lobby.deselectEntry?.() : lobby.selectEntry(entry.id);
      if (!changed) {
        console.warn("[ZFX Client LobbyView] Could not toggle current-map selection:", {
          entryId: entry.id,
          selected: wasSelected,
          selectedEntryId: lobby.getSnapshot?.()?.selectedEntryId ?? null,
        });
        return false;
      }
      currentSelectionOverride.value = wasSelected ? null : entry.id;
      if (currentSelectionOverrideTimer) window.clearTimeout(currentSelectionOverrideTimer);
      currentSelectionOverrideTimer = window.setTimeout(() => {
        currentSelectionOverride.value = undefined;
        currentSelectionOverrideTimer = 0;
      }, 2500);
      return true;
    }

    function getEntryTitle(entry) {
      if (entry.mapName) return entry.mapName;
      if (entry.mapIndex != null) return `${labels.map} ${entry.mapIndex}`;
      return `${labels.gameEntry} #${entry.id}`;
    }

    function readNativeChatMessages(root) {
      const candidates = Array.from(root.querySelectorAll("div, ul, ol"))
        .filter(element => !element.querySelector("[data-fx-lobby-player='true']")
          && !element.querySelector("textarea, input, button"));
      const scored = candidates.map(element => {
        const entries = Array.from(element.children)
          .map(child => cleanText(child))
          .filter(text => text.length > 1 && text.length < 1200);
        if (entries.length < 2) return null;
        const className = typeof element.className === "string" ? element.className.toLowerCase() : "";
        const chatHint = /chat|message|message-list|conversation/.test(className) ? 20 : 0;
        const scrollHint = element.scrollHeight > element.clientHeight + 8 ? 3 : 0;
        return { entries, score: entries.length + chatHint + scrollHint };
      }).filter(Boolean).sort((a, b) => b.score - a.score);
      const entries = scored[0]?.entries ?? [];
      return entries.slice(-60).map((text, index) => ({ id: `${index}:${text}`, text }));
    }

    function sendMessage(message, callback) {
      const sendLobbyMessage = window.__fx?.sendLobbyMessage;
      if (typeof sendLobbyMessage !== "function") {
        chatStatus.value = labels.chatUnavailable;
        callback(false);
        return;
      }
      try {
        const sent = sendLobbyMessage(message);
        chatStatus.value = sent ? "" : labels.chatUnavailable;
        callback(sent);
      } catch (error) {
        console.warn("[ZFX Client LobbyView] Native chat send failed:", error);
        chatStatus.value = labels.chatUnavailable;
        callback(false);
      }
    }

    function sendClanLobbyMessage(clanTag, message) {
      const clan = String(clanTag ?? "").trim();
      const text = String(message ?? "").trim();
      if (!clan || !text) return false;
      const sendClanMessage = window.__fx?.sendClanMessage;
      if (typeof sendClanMessage === "function") return sendClanMessage(clan, text) === true;
      const sendLobbyMessage = window.__fx?.sendLobbyMessage;
      return typeof sendLobbyMessage === "function" && sendLobbyMessage(`@[${clan}] ${text}`) === true;
    }

    function sendSpawnCall(direction) {
      if (!ownClan.value || !snapshot.value.currentMap) return;
      if (!sendClanLobbyMessage(ownClan.value, `spawn call: ${direction}`)) {
        console.warn("[ZFX Client LobbyView] Could not send spawn call through lobby chat.");
      }
    }

    function sendJoinCall(kind) {
      if (!ownClan.value) return;
      if (kind === "current") return sendClanLobbyMessage(ownClan.value, "join");
      if (kind === "cont") return sendClanLobbyMessage(ownClan.value, "join cont");
      const nextMap = String(snapshot.value.nextMap || "").trim();
      const teamCount = String(snapshot.value.nextTeamCountLabel || "").match(/\d+/)?.[0] || "";
      if (kind === "next" && nextMap && teamCount) {
        return sendClanLobbyMessage(ownClan.value, `join ${nextMap} ${teamCount} teams`);
      }
      return false;
    }

    function sendTeamMessage(message, callback) {
      if (!ownClan.value) {
        callback(false);
        return;
      }
      try { callback(sendClanLobbyMessage(ownClan.value, message)); }
      catch (error) {
        console.warn("[ZFX Client LobbyView] Clan message send failed:", error);
        callback(false);
      }
    }

    function handleGameLanguageChange(event) {
      refreshLobbyLanguage(event.detail?.language);
    }

    function getLobbyChatDebugSnapshot() {
      const current = adapter.getSnapshot();
      return {
        active: active.value,
        tab: activeTab.value,
        channel: current.chatChannel,
        adapterMessages: current.chatMessages.length,
        adapterTail: current.chatMessages.slice(-8).map(message => ({
          id: message.id, senderId: message.senderId, senderName: message.senderName, text: message.text,
        })),
        feed: window.__fx?.lobbyChatFeed?.getDiagnostics?.() ?? null,
        native: window.__fx?.getNativeLobbyChatState?.() ?? null,
        subscriptionRequested: window.__fx?.lobbyChatChannelRequested === true,
        subscriptionStatus: window.__fx?.lobbyChatActivationStatus ?? null,
      };
    }

    function debugLobbyChat() {
      const state = getLobbyChatDebugSnapshot();
      console.groupCollapsed("[ZFX Client LobbyChat] debug snapshot");
      console.log("Native queue:", state.native);
      console.log("Socket feed:", state.feed);
      console.log("Vue adapter:", {
        active: state.active,
        tab: state.tab,
        channel: state.channel,
        messageCount: state.adapterMessages,
        tail: state.adapterTail,
      });
      console.log("Feed subscription:", {
        requested: state.subscriptionRequested,
        status: state.subscriptionStatus,
      });
      console.groupEnd();
      return state;
    }

    function replayNativeLobbyChat() {
      const native = window.__fx?.getNativeLobbyChatState?.();
      if (!native?.available) {
        console.warn("[ZFX Client LobbyChat] Native chat queue is not available yet.");
        return debugLobbyChat();
      }
      let replayed = 0;
      for (const message of native.messages ?? []) {
        const text = String(message?.text ?? "").trim();
        if (message?.id !== 0 || !text) continue;
        const exists = adapter.getSnapshot().chatMessages.some(entry =>
          entry.senderId === message.senderId && entry.text === text);
        if (exists) continue;
        window.__fx?.lobbyChatFeed?.publish?.({
          id: `native-replay:${native.sequence}:${message.index}:${message.senderId}`,
          senderId: message.senderId,
          text,
        });
        replayed++;
      }
      console.info(`[ZFX Client LobbyChat] replayed ${replayed} native messages into the Vue feed.`);
      return debugLobbyChat();
    }

    onMounted(() => {
      console.log("[ZFX Client LobbyView] Vue route mounted; waiting for native lobby data.");
      window.__fx.debugLobbyChat = debugLobbyChat;
      window.__fx.replayNativeLobbyChat = replayNativeLobbyChat;
      nativePropagandaObserver = new MutationObserver(migrateNativePropaganda);
      nativePropagandaObserver.observe(document.body, { childList: true, subtree: true });
      migrateNativePropaganda();
      window.addEventListener("fx-lobby-notification", handleLobbyNotification);
      window.addEventListener("fx-game-language-change", handleGameLanguageChange);
      let nativeHistory = [];
      try {
        const history = window.__fx?.getLobbyNotificationHistory?.();
        nativeHistory = Array.isArray(history) ? history : [];
      } catch (error) {
        console.warn("[ZFX Client LobbyView] Native notification history is not ready yet:", error);
      }
      lobbyNotifications.value = nativeHistory.filter(item => item && item.id !== 6 && item.text)
        .slice(-100)
        .map(item => {
          const presentation = formatLobbyNotification(item.text);
          const categoryKey = presentation.kind === "followers" ? "followers"
            : Number(item.id) === 7 ? "lobbyCategory" : "noticeCategory";
          return {
            id: `native:${item.index}`,
            text: String(item.text ?? "").trim(),
            ...presentation,
            categoryKey,
            category: labels[categoryKey],
          };
        });
      refreshLobbyLanguage();
      notificationIndex.value = lobbyNotifications.value.length - 1;
      notificationPanelOpen.value = lobbyNotifications.value.length > 0;
      unsubscribe = adapter.subscribe(value => {
        snapshot.value = value;
        refreshLobbyRating(value.players);
        if (currentSelectionOverride.value !== undefined) {
          const selectedId = value.upcomingGames.find(entry => entry.selected)?.id ?? null;
          if (selectedId === currentSelectionOverride.value) {
            currentSelectionOverride.value = undefined;
            if (currentSelectionOverrideTimer) window.clearTimeout(currentSelectionOverrideTimer);
            currentSelectionOverrideTimer = 0;
          }
        }
      });
      window.__fx.getCustomLobbyClanDiagnostics = getClanDiagnostics;
      unsubscribeGameSdk = window.__fx?.gameSdk?.lobby?.subscribe?.(() => {
        if (nativeRoot?.isConnected) readLobby();
      }) ?? (() => {});
      unsubscribeLobbyChat = window.__fx?.lobbyChatFeed?.subscribe?.(message => {
        const current = adapter.getSnapshot();
        const socketPlayerName = window.__fx?.getLobbyChatSenderName?.(message.senderId);
        const sdkPlayer = window.__fx?.gameSdk?.lobby?.getSnapshot?.()?.players
          ?.find(player => Number(player.id) === Number(message.senderId));
        const playerName = socketPlayerName || sdkPlayer?.name
          || (message.senderId != null ? `Player ${message.senderId}` : labels.unknownPlayer);
        const segments = resolveLobbyChatSegments(message.text);
        adapter.publish({
          ...current,
          chatChannel: "lobby",
          chatMessages: [...current.chatMessages, {
            ...message,
            senderName: playerName,
            senderColor: window.__fx?.getLobbyChatSenderColor?.(message.senderId) || "",
            text: segments.map(segment => segment.text).join(""),
            segments,
          }].slice(-60),
        }, current.source === "none" ? "lobby-socket" : current.source);
      }) ?? (() => {});
      console.info("[ZFX Client LobbyChat] view subscribed", window.__fx?.lobbyChatFeed?.getDiagnostics?.());
      if (!shell) return;
      window.addEventListener("fx-bot-protection-state", handleBotProtectionState);
      window.addEventListener("fx-native-lobby-return", handleNativeLobbyReturn);
      observer = new MutationObserver(records => {
        if (records.some(record => {
          const target = record.target instanceof Element ? record.target : record.target.parentElement;
          return !target?.closest(`#${APP_ID}`);
        })) scheduleRead();
      });
      observer.observe(shell, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ["data-fx-account-name", "data-fx-lobby-ready", "data-fx-rank", "data-fx-rank-text", "data-fx-followed", "data-fx-lobby-mode-active"],
      });
      readinessRefreshTimer = window.setInterval(() => {
        // Native own-account identity may arrive after the initial roster render.
        // Re-read the existing rows so the own-clan overview can resolve then.
        if (active.value && nativeRoot?.isConnected) scheduleRead();
      }, 1000);
      ratingRefreshTimer = window.setInterval(() => refreshLobbyRating(), 1000);
      refreshLobbyRating();
      readLobby();
    });

    onBeforeUnmount(() => {
      observer?.disconnect();
      if (readinessRefreshTimer) window.clearInterval(readinessRefreshTimer);
      if (ratingRefreshTimer) window.clearInterval(ratingRefreshTimer);
      if (currentSelectionOverrideTimer) window.clearTimeout(currentSelectionOverrideTimer);
      if (frame) cancelAnimationFrame(frame);
      if (missingLobbyTimer) window.clearTimeout(missingLobbyTimer);
      window.removeEventListener("fx-bot-protection-state", handleBotProtectionState);
      window.removeEventListener("fx-native-lobby-return", handleNativeLobbyReturn);
      window.removeEventListener("fx-lobby-notification", handleLobbyNotification);
      window.removeEventListener("fx-game-language-change", handleGameLanguageChange);
      if (window.__fx?.showPropagandaInVue === showPropagandaInVue) delete window.__fx.showPropagandaInVue;
      if (window.__fx?.debugLobbyChat === debugLobbyChat) delete window.__fx.debugLobbyChat;
      if (window.__fx?.replayNativeLobbyChat === replayNativeLobbyChat) delete window.__fx.replayNativeLobbyChat;
      nativePropagandaObserver?.disconnect();
      nativePropagandaObserver = null;
      closePropagandaMessage();
      unsubscribe();
      if (window.__fx?.getCustomLobbyClanDiagnostics === getClanDiagnostics) delete window.__fx.getCustomLobbyClanDiagnostics;
      unsubscribeGameSdk();
      unsubscribeLobbyChat();
      restoreNativeRoot();
      adapter.clear();
    });

    return {
      active, labels, snapshot, lobbyRating, scale, query, sortBy, readyFilter, affiliationFilter, filteredPlayers, filteredTeamPlayers, clanGroups, topReadyClan, readyClanSlices, readyClanTotal, activeTab,
      lobbyNotifications, notificationIndex, notificationPanelOpen, currentLobbyNotification,
      propagandaDialog, propagandaMessage, closePropagandaMessage,
      previousLobbyNotification, nextLobbyNotification,
      ownClan, currentPlayerName, clanOverviewGroup, clanPlayers, clanReadyCount, teamCount, clanCount, playerCountLabel, onlyReadyClans, visibleClanGroups, chatStatus, nextGameMeta, isTeamMode,
      currentMapEntry,
      currentMapSelected: currentMapEntrySelected,
      playerContextMenu, playerListComponent, mentionPlayerFromContextMenu,
      selectUpcomingGame,
      getEntryTitle,
      selectPlayer: openPlayerContextMenu,
      setSort: value => { sortBy.value = ["rank-desc", "rank-asc", "name"].includes(value) ? value : "rank-asc"; },
      setReadyFilter: value => { readyFilter.value = readyFilter.value === value ? "all" : value; },
      setAffiliationFilter: value => { affiliationFilter.value = affiliationFilter.value === value ? "all" : value; },
      resetFilterGroups: () => { readyFilter.value = "all"; affiliationFilter.value = "all"; },
      resetFilters: () => { query.value = ""; readyFilter.value = "all"; affiliationFilter.value = "all"; },
      sendChat: (message, callback) => sendMessage(message, callback),
      sendCall: sendSpawnCall,
      sendJoin: sendJoinCall,
      sendTeamMessage,
      selectLobbyTab,
      toggleCurrentMapEntry,
    };
  },
  template: `
    <section v-if="active" id="fx-custom-lobby-view" class="fx-custom-lobby" :style="{ '--fx-custom-lobby-scale': scale }" :aria-label="labels.title">
      <Teleport to="body">
      <dialog ref="propagandaDialog" class="fx-lobby-propaganda-dialog" :style="propagandaMessage?.style" aria-label="Propaganda message" @cancel.prevent="closePropagandaMessage" @click.self="closePropagandaMessage">
        <header><span>PROPAGANDA</span><button type="button" :aria-label="labels.dismiss" @click="closePropagandaMessage">×</button></header>
        <p>{{ propagandaMessage?.text }}</p>
        <footer><button type="button" @click="closePropagandaMessage">{{ labels.dismiss }}</button></footer>
      </dialog>
      <aside v-if="notificationPanelOpen && currentLobbyNotification" class="fx-lobby-notifications" aria-live="polite" aria-label="Lobby-Benachrichtigungen" @pointerdown.stop @mousedown.stop @click.stop>
        <div class="fx-lobby-notification-controls">
          <button type="button" :disabled="notificationIndex <= 0" aria-label="Vorherige Meldung" @click="previousLobbyNotification">◀</button>
          <strong>{{ notificationIndex + 1 }} / {{ lobbyNotifications.length }}</strong>
          <button type="button" :disabled="notificationIndex >= lobbyNotifications.length - 1" aria-label="Nächste Meldung" @click="nextLobbyNotification">▶</button>
          <button type="button" aria-label="Meldung schließen" @click="notificationPanelOpen = false">×</button>
        </div>
        <article class="fx-lobby-notification" :class="{ 'is-followers': currentLobbyNotification.kind === 'followers' }">
          <span class="fx-lobby-notification-category">{{ currentLobbyNotification.category }}</span>
          <LobbyPlayerName v-if="currentLobbyNotification.senderName" class="fx-lobby-notification-sender" :name="currentLobbyNotification.senderName" :color="currentLobbyNotification.senderColor" @activate="openPlayerContextMenu({ name: currentLobbyNotification.senderName, senderId: currentLobbyNotification.senderId, color: currentLobbyNotification.senderColor }, $event)" />
          <p><template v-if="currentLobbyNotification.bodySegments?.length"><template v-for="(segment, index) in currentLobbyNotification.bodySegments" :key="index"><LobbyPlayerName v-if="segment.resolvedPlayer" :name="segment.text" :color="segment.color" @activate="openPlayerContextMenu({ name: segment.text, senderId: segment.mentionId, color: segment.color }, $event)" /><span v-else :style="segment.color ? { color: segment.color } : null">{{ segment.text }}</span></template></template><template v-else>{{ currentLobbyNotification.body || currentLobbyNotification.text }}</template></p>
        </article>
      </aside>
      <div v-if="playerContextMenu" class="fx-custom-lobby-chat-menu-backdrop" @click="playerContextMenu = null" @keydown.esc="playerContextMenu = null">
        <div class="fx-custom-lobby-chat-context-menu" role="menu" :style="{ left: playerContextMenu.x + 'px', top: playerContextMenu.y + 'px' }" @click.stop>
          <strong :style="playerContextMenu.senderColor ? { color: playerContextMenu.senderColor } : null">{{ playerContextMenu.senderName }}</strong>
          <button type="button" role="menuitem" @click="mentionPlayerFromContextMenu">@ {{ labels.mention }}</button>
        </div>
      </div>
      </Teleport>
      <MapHeader :map="snapshot.currentMap" :map-image="snapshot.currentMapImage" :next-map="snapshot.nextMap" :next-map-image="snapshot.nextMapImage" :next-team-count-label="snapshot.nextTeamCountLabel" :next-game-mode-label="snapshot.nextGameModeLabel" :game-mode-key="snapshot.currentGameModeKey" :next-game-mode-key="snapshot.nextGameModeKey" :next-game-meta="nextGameMeta" :is-contest="snapshot.isContest" :next-is-contest="snapshot.nextIsContest" :no-fullsend="snapshot.noFullsend" :next-no-fullsend="snapshot.nextNoFullsend" :labels="labels" :entries="snapshot.upcomingGames" :current-map-entry-id="snapshot.currentMapEntryId" :current-map-selected="currentMapSelected" :selection-disabled="!currentMapEntry" :entry-title="getEntryTitle" :ready-count="snapshot.readyCount" :ready-clans="readyClanSlices" :ready-clan-total="readyClanTotal" :team-count="snapshot.currentTeamCountLabel" :game-mode-label="snapshot.currentGameModeLabel" :lobby-rating="lobbyRating" @select-entry="selectUpcomingGame" @select-current="toggleCurrentMapEntry" />
      <LobbyProgress :snapshot="snapshot" :labels="labels" />
      <main class="fx-custom-lobby-content">
        <PlayerList ref="playerListComponent" :players="filteredPlayers" :all-players="snapshot.players" :clans="visibleClanGroups" :labels="labels" :count="snapshot.playerCount" :player-count-label="playerCountLabel" :query="query" :sort-by="sortBy" :ready-filter="readyFilter" :affiliation-filter="affiliationFilter" :active-tab="activeTab" :chat-messages="snapshot.chatMessages" :chat-status="chatStatus" :team-mode="isTeamMode" :team-players="filteredTeamPlayers" :team-clan="ownClan" :team-count="teamCount" :clan-count="clanCount" :top-ready-clan="topReadyClan" :only-ready-clans="onlyReadyClans" :current-map="snapshot.currentMap" :next-map="snapshot.nextMap" :next-team-count="snapshot.nextTeamCountLabel" @update:query="query = $event" @update:sort="setSort" @update:ready-filter="setReadyFilter" @update:affiliation-filter="setAffiliationFilter" @reset-filter-groups="resetFilterGroups" @reset-filters="resetFilters" @filter-ready-clans="onlyReadyClans = $event" @select-player="selectPlayer" @select-tab="selectLobbyTab" @send-chat="sendChat" @send-call="sendCall" @send-join="sendJoin" @send-team-message="sendTeamMessage" />
        <aside class="fx-custom-lobby-side-stack">
          <article class="fx-custom-lobby-current-player-card"><span class="fx-custom-lobby-current-player-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></span><div><span>{{ labels.currentPlayer }}</span><strong :title="currentPlayerName">{{ currentPlayerName }}</strong></div></article>
          <ClanOverview :clan="clanOverviewGroup?.tag || ownClan" :ready-count="clanOverviewGroup?.readyCount ?? clanReadyCount" :member-count="clanPlayers.length" :members="clanPlayers" :labels="labels" @select-player="selectPlayer" />
        </aside>
      </main>
    </section>`,
});

const InGameView = defineComponent({ name: "InGameView", render: () => null });
const ClassicView = defineComponent({ name: "ClassicView", render: () => null });

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/lobby", name: "lobby", component: LobbyView },
    { path: "/game", name: "game", component: InGameView },
    { path: "/classic", name: "classic", component: ClassicView },
    { path: "/:pathMatch(.*)*", redirect: "/classic" },
  ],
});

let classicSessionDisabled = false;
let previousGameState = null;
let nativeLobbySuppressionRoot = null;
let nativeLobbySuppressionSawDeparture = false;
let nativeLobbySuppressionReturnState = null;
let observedNativeMenu = null;
let nativeLobbyReturnPending = false;
let nativeLobbyReturnUntil = 0;
let customLobbyReturnLatched = false;

export function initializeCustomLobbyView() {
  migrateLobbyViewPreference();
  const shell = document.getElementById("fx-game-shell");
  if (!shell || document.getElementById(APP_ID)) return () => {};
  const mount = document.createElement("div");
  mount.id = APP_ID;
  document.body.appendChild(mount);
  const app = createApp({ render: () => h(RouterView) });
  app.config.errorHandler = (error, _instance, info) => {
    console.error("[ZFX Client LobbyView] Vue runtime error:", info, error);
  };
  app.config.warnHandler = (message, _instance, info) => {
    console.warn("[ZFX Client LobbyView] Vue warning:", info, message);
  };
  app.use(router);
  app.mount(mount);
  const stopBotProtectionObserver = observeBotProtection(mount);
  let disposed = false;
  let routeTimer = 0;
  const getTargetRoute = () => {
    const gameState = window.__fx?.getGameVar?.("gameState");
    const nativeMenuState = Number(window.__fx?.nativeMenuState);
    const currentLobbyRoot = findLobbyRoot(shell);
    const lobbyRootStyle = currentLobbyRoot ? getComputedStyle(currentLobbyRoot) : null;
    const nativeLobbyVisible = Boolean(currentLobbyRoot?.getClientRects().length
      && lobbyRootStyle?.display !== "none"
      && lobbyRootStyle?.visibility !== "hidden"
      && Number(lobbyRootStyle?.opacity ?? 1) > 0);
    const nativeLobbyConfirmed = nativeMenuState === 0
      && (nativeLobbyReturnPending || customLobbyReturnLatched || previousGameState === 1)
      || (nativeLobbyVisible && (nativeLobbyReturnPending || customLobbyReturnLatched || previousGameState === 1));
    const inGame = gameState === 1 && !nativeLobbyConfirmed;
    const returnedToLobby = nativeLobbySuppressionRoot
      && (!nativeLobbySuppressionRoot.isConnected
        || (currentLobbyRoot && currentLobbyRoot !== nativeLobbySuppressionRoot));
    if (nativeLobbyReturnPending) {
      // The native end-of-game callback fires before the game state and menu
      // finish transitioning. Keep honoring that explicit signal throughout
      // the transition so a late native menu update cannot select /classic.
      previousGameState = gameState;
      if (inGame || Date.now() < nativeLobbyReturnUntil) return "/lobby";
      nativeLobbyReturnPending = false;
    }
    if (inGame || (previousGameState === 1 && !inGame) || returnedToLobby) {
      if (classicSessionDisabled) console.info("[ZFX Client LobbyView] Re-enabling custom lobby", {
        reason: inGame ? "game-state" : returnedToLobby ? "native-lobby-replaced" : "game-ended",
      });
      classicSessionDisabled = false;
      nativeLobbySuppressionRoot = null;
    }
    previousGameState = gameState;
    if (customLobbyReturnLatched && window.__fx?.settings?.customLobbyView !== false) {
      if (!inGame) {
        classicSessionDisabled = false;
        return "/lobby";
      }
      return "/game";
    }
    return inGame ? "/game"
      : classicSessionDisabled || window.__fx?.settings?.customLobbyView === false ? "/classic" : "/lobby";
  };
  const syncRoute = () => {
    const target = getTargetRoute();
    if (router.currentRoute.value.path !== target) {
      console.log("[ZFX Client LobbyView] Route change requested", {
        from: router.currentRoute.value.path,
        to: target,
        enabled: window.__fx?.settings?.customLobbyView,
        gameState: window.__fx?.getGameVar?.("gameState"),
        nativeMenuState: window.__fx?.nativeMenuState,
      });
      router.replace(target).catch(error => console.error("[ZFX Client] View route update failed:", error));
    }
  };
  window.__fx.navigateFxView = path => router.push(path);
  window.__fx.isCustomLobbyViewVisible = () => window.__fx?.settings?.customLobbyView === true
    && router.currentRoute.value.path === "/lobby"
    && Boolean(mount.querySelector("#fx-custom-lobby-view"));
  window.__fx.hideCustomLobbyView = () => {
    if (!window.__fx.isCustomLobbyViewVisible()) return false;
    customLobbyReturnLatched = false;
    classicSessionDisabled = true;
    nativeLobbySuppressionRoot = findLobbyRoot(shell);
    nativeLobbySuppressionSawDeparture = false;
    nativeLobbySuppressionReturnState = observedNativeMenu
      ? observedNativeMenu.manager[observedNativeMenu.stateField]
      : null;
    router.replace("/classic").catch(error => console.error("[ZFX Client] Lobby hide failed:", error));
    return true;
  };
  window.__fx.showCustomLobbyView = () => {
    customLobbyReturnLatched = false;
    classicSessionDisabled = false;
    nativeLobbySuppressionRoot = null;
    nativeLobbySuppressionSawDeparture = false;
    nativeLobbySuppressionReturnState = null;
    router.replace("/lobby").catch(error => console.error("[ZFX Client] Lobby show failed:", error));
  };
  window.__fx.onGameReturnedToLobby = () => {
    classicSessionDisabled = false;
    customLobbyReturnLatched = true;
    nativeLobbyReturnPending = true;
    nativeLobbyReturnUntil = Date.now() + 6000;
    nativeLobbySuppressionRoot = null;
    nativeLobbySuppressionSawDeparture = false;
    nativeLobbySuppressionReturnState = null;
    if (window.__fx?.settings?.customLobbyView === false) {
      customLobbyReturnLatched = false;
      nativeLobbyReturnPending = false;
      nativeLobbyReturnUntil = 0;
      return;
    }
    syncRoute();
    let attempts = 0;
    const restoreLobby = () => {
      if (window.__fx?.settings?.customLobbyView === false || attempts++ >= 24) {
        nativeLobbyReturnPending = false;
        return;
      }
      if (router.currentRoute.value.path !== "/lobby") {
        router.replace("/lobby").catch(error => console.error("[ZFX Client] Lobby return navigation failed:", error));
      }
      window.dispatchEvent(new Event("fx-native-lobby-return"));
      window.setTimeout(restoreLobby, 250);
    };
    restoreLobby();
  };
  window.__fx.installNativeLobbyRouteObserver = (menuManager, setStateKey, stateField) => {
    if (!menuManager || !setStateKey || !stateField
      || typeof menuManager[setStateKey] !== "function"
      || !(stateField in menuManager)) return false;
    observedNativeMenu = { manager: menuManager, stateField, setStateKey };
    window.__fx.setNativeMenuState = state => {
      if (!observedNativeMenu || typeof observedNativeMenu.manager[observedNativeMenu.setStateKey] !== "function") return false;
      observedNativeMenu.manager[observedNativeMenu.setStateKey](state);
      return true;
    };
    window.__fx.nativeMenuState = menuManager[stateField];
    if (menuManager.__fxLobbyRouteObserver) return true;
    const originalSetState = menuManager[setStateKey];
    menuManager[setStateKey] = function (...args) {
      const previousState = menuManager[stateField];
      const result = originalSetState.apply(this, args);
      const nextState = menuManager[stateField];
      window.__fx.onNativeMenuStateChange?.(previousState, nextState);
      return result;
    };
    menuManager.__fxLobbyRouteObserver = true;
    console.info("[ZFX Client LobbyView] Native menu route observer installed", { setStateKey, stateField });
    return true;
  };
  window.__fx.onNativeMenuStateChange = (previousState, nextState) => {
    window.__fx.nativeMenuState = nextState;
    window.dispatchEvent(new CustomEvent("fx-native-menu-state-change", { detail: { previousState, nextState } }));
    // Returning from a match can reach the native lobby through a different
    // menu path than the patched game-end handler. State 0 is the game's
    // original lobby; use that transition as a second, native return signal.
    if (nextState === 0 && previousState !== 0 && !nativeLobbyReturnPending) {
      window.__fx.onGameReturnedToLobby?.();
    }
    if (nextState === 0 && window.__fx?.settings?.customLobbyView !== false) syncRoute();
    if (!classicSessionDisabled) return;
    const returnedToOriginalLobbyState = nativeLobbySuppressionReturnState !== null
      && nextState === nativeLobbySuppressionReturnState;
    if (nextState !== 0 && !returnedToOriginalLobbyState) {
      nativeLobbySuppressionSawDeparture = true;
      return;
    }
    if (!nativeLobbySuppressionSawDeparture || previousState === nextState) return;
    classicSessionDisabled = false;
    nativeLobbySuppressionRoot = null;
    nativeLobbySuppressionSawDeparture = false;
    nativeLobbySuppressionReturnState = null;
    router.replace("/lobby").catch(error => console.error("[ZFX Client] Lobby menu return navigation failed:", error));
  };
  router.onError(error => console.error("[ZFX Client] View navigation failed:", error));
  console.log("[ZFX Client LobbyView] Vue app mounted", {
    enabled: window.__fx?.settings?.customLobbyView,
    gameState: window.__fx?.getGameVar?.("gameState"),
    shellFound: Boolean(shell),
    routerPath: router.currentRoute.value.path,
  });
  syncRoute();
  routeTimer = window.setInterval(() => {
    if (!disposed) syncRoute();
  }, 250);

  return () => {
    disposed = true;
    window.clearInterval(routeTimer);
    stopBotProtectionObserver();
    if (app._instance) app.unmount();
    mount.remove();
    if (window.__fx?.navigateFxView) delete window.__fx.navigateFxView;
    if (window.__fx?.isCustomLobbyViewVisible) delete window.__fx.isCustomLobbyViewVisible;
    if (window.__fx?.hideCustomLobbyView) delete window.__fx.hideCustomLobbyView;
    if (window.__fx?.showCustomLobbyView) delete window.__fx.showCustomLobbyView;
    if (window.__fx?.onGameReturnedToLobby) delete window.__fx.onGameReturnedToLobby;
    if (window.__fx?.installNativeLobbyRouteObserver) delete window.__fx.installNativeLobbyRouteObserver;
    if (window.__fx?.setNativeMenuState) delete window.__fx.setNativeMenuState;
    if (window.__fx?.onNativeMenuStateChange) delete window.__fx.onNativeMenuStateChange;
    classicSessionDisabled = false;
    nativeLobbySuppressionRoot = null;
    nativeLobbySuppressionReturnState = null;
    nativeLobbyReturnPending = false;
    nativeLobbyReturnUntil = 0;
    customLobbyReturnLatched = false;
    previousGameState = null;
  };
}
