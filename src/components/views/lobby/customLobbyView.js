import {
  computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch,
} from "vue/dist/vue.esm-bundler.js";
import { createApp, h } from "vue/dist/vue.esm-bundler.js";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { createLobbyDataAdapter } from "../../../adapter/lobbyDataAdapter.js";
import { calculateLobbyRating } from "../../../modules/lobbyRating.js";
import { settingsApi } from "../../../modules/settings/settings.js";
import { isReadyPlayer } from "../../../modules/lobbyParticipation.js";
import { getMapName } from "../../../modules/lobbyFilters.js";
import { LobbyPlayerName } from "../../shared/lobby/lobbyPlayerName.js";
import { LobbyProgress } from "../../shared/lobby/lobbyProgress.js";
import { MapHeader } from "../../shared/lobby/mapHeader.js";
import { PlayerList } from "../../shared/lobby/playerList.js";

const APP_ID = "fx-app-mount";
const lastDiagnostic = new Map();
const mapImageCache = new Map();
let nativeLobbyBackgroundImage = "";
const MAP_IMAGE_CACHE_LIMIT = 20;
const MAP_IMAGE_DB_NAME = "zfx-client-cache";
const MAP_IMAGE_DB_STORE = "map-images";
let mapImageCacheHydrated = false;
let mapImageCacheLoadPromise = null;
let mapImageDbPromise;

function mapImageCacheKey(mapIndex, mapSeed) {
  const index = Number(mapIndex);
  const seed = Number(mapSeed);
  if (!Number.isInteger(index) || !Number.isFinite(seed)) return "";
  return `map-v3:${index}:${seed}`;
}

function rememberMapImage(mapIndex, mapSeed, image) {
  const key = mapImageCacheKey(mapIndex, mapSeed);
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
  if (mapImageCacheHydrated) return;
  if (mapImageCacheLoadPromise) return mapImageCacheLoadPromise;
  mapImageCacheLoadPromise = (async () => {
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
        if (record?.key?.startsWith("map-v3:") && record?.image
          && isSafeMapImageUrl(record.image) && !mapImageCache.has(record.key)) {
          mapImageCache.set(record.key, record.image);
        }
      }
    } catch {
      // The lobby can still use images captured during this page session.
    } finally {
      mapImageCacheHydrated = true;
    }
  })();
  return mapImageCacheLoadPromise;
}

function logLobbyDiagnostic(stage, signature, details) {
  if (lastDiagnostic.get(stage) === signature) return;
  lastDiagnostic.set(stage, signature);
  console.log(`[ZFX Client LobbyView] ${stage}`, details);
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
  const tokenPattern = /https:\/\/[^\s<>"']+|@([a-zA-Z0-9_-]{5})(?=$|[\s:!.?,)])/g;
  let previousEnd = 0;
  let match;
  while ((match = tokenPattern.exec(source))) {
    if (match.index > previousEnd) segments.push({ text: source.slice(previousEnd, match.index) });
    if (match[0].startsWith("https://")) {
      let url = match[0];
      while (/[.,!?;:]$/.test(url)) url = url.slice(0, -1);
      for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
        while (url.endsWith(close) && (url.split(close).length - 1) > (url.split(open).length - 1)) url = url.slice(0, -1);
      }
      try {
        if (new URL(url).protocol === "https:") segments.push({ text: url, href: url });
        else segments.push({ text: url });
      } catch {
        segments.push({ text: url });
      }
      if (url.length < match[0].length) segments.push({ text: match[0].slice(url.length) });
      previousEnd = match.index + match[0].length;
      continue;
    }
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

function captureGameCanvasImage() {
  const candidates = Array.from(document.querySelectorAll("canvas"))
    .filter(canvas => canvas.width > 0 && canvas.height > 0
      && canvas.getClientRects().length > 0
      && !canvas.closest("#fx-app-mount, #fx-sidebar"))
    .sort((left, right) => right.width * right.height - left.width * left.height);
  for (const source of candidates) {
    try {
      const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      output.getContext("2d")?.drawImage(source, 0, 0, width, height);
      const image = output.toDataURL("image/jpeg", .82);
      if (isSafeMapImageUrl(image) && image.length > 8000) return image;
    } catch {
      // Cross-origin or WebGL canvases may not permit capture.
    }
  }
  return "";
}

function getNativeMapImage(mapIndex, mapSeed) {
  return mapImageCache.get(mapImageCacheKey(mapIndex, mapSeed)) || "";
}

function isSafeMapImageUrl(value) {
  return /^(https?:|blob:|data:image\/)/i.test(value);
}

const getLobbyLabels = (language = window.__fx?.getGameLanguage?.() || "en") => {
  const selectedLanguage = String(language || "en");
  const german = selectedLanguage.toLowerCase().startsWith("de");
  return german ? {
    viewGrid: "Kacheln", viewTable: "Tabelle", viewList: "Liste",
    title: "Lobby-Übersicht", currentMap: "Aktuelle Karte", nextMap: "Ausgewähltes Spiel", selectedGame: "Ausgewähltes Spiel", joinedGame: "Beigetretenes Spiel", spectatingGame: "Spiel wird beobachtet", spectateGame: "Zuschauen", spectatingActive: "Zuschauen", active: "AKTIV", stopSpectating: "Beobachten beenden", selectGame: "Spiel auswählen", noGameSelected: "Kein Spiel ausgewählt", chooseGameHint: "Wähle oben ein anstehendes Spiel aus.", modes: "Spielmodi", upcomingGames: "Anstehende Spiele", noOtherUpcomingGames: "Keine weiteren anstehenden Spiele", gameEntry: "Spiel", map: "Karte", modeTeamGame: "Team", modeTeams: "Teams", modeBattleRoyale: "Battle Royale", modeDuel: "1v1", modeZombie: "Zombie", modeUnknown: "Spielmodus", selected: "Ausgewählt", joinGame: "Beitreten", leaveGame: "Verlassen", joinSelected: "Ausgewählt · beitreten", copyGameLink: "Spiel-Link kopieren", linkCopied: "Link kopiert", waitingForGames: "Warte auf anstehende Spiele …", unknownPlayer: "Unbekannter Spieler", clans: "Clans",
    joinedStatus: "Du bist beigetreten und spielst mit.", spectatingStatus: "Du schaust zu und nimmst nicht am Spiel teil.",
    lobbyRating: "Lobby-Rating", lobbyRatingUnavailable: "Warte auf Spieler mit Rang",
    teams: "Teams", currentPlayer: "Du spielst als", changeName: "Namen ändern", upcomingContests: "Nächste Contests", gameMode: "Spielmodus", gamePanel: "Spiel", gamePanelHint: "Ausgew\u00e4hltes Spiel", lobbyPanel: "Lobby", lobbyPanelHint: "Alle in der Lobby", readyPlayers: "Bereite Spieler", quickFilters: "Schnellfilter", lobbyInfo: "Lobby-Info", lobbyViews: "Lobby-Bereiche", lobby: "Lobby",
    people: "Personen", overview: "Info", topReadyPlayers: "Top 3 bereite Spieler", noReadyPlayers: "Keine bereiten Spieler",
    topReadyClan: "Top-Clan (bereit)",
    overviewLeadersNote: "Beste Weltränge unter den bereiten Spielern",
    progress: "Spielstart", players: "Spieler", team: "Team", search: "Spieler suchen …", allGames: "Alle Spiele", currentMapSelection: "Current Map",
    etaUnavailable: "Warte auf Startzeit …", startsIn: "Start in", startingNow: "Spiel startet jetzt",
    readyClansByClan: "Bereite Spieler nach Clan", noReadyClanPlayers: "Keine bereiten Clan-Spieler", others: "Andere",
    all: "Alle", ready: "Bereit", notReady: "Nicht bereit", waiting: "Wartend", spectator: "Zuschauer", watchers: "Zuschauer", clan: "Clan", followed: "Following", noClans: "Keine Clans in der Lobby", noClanMembers: "Keine Mitglieder des eigenen Clans in der Lobby", noGameClanMembers: "Keine Mitglieder deines Clans sind in diesem Spiel",
    onlyReadyClans: "Nur Clans mit Bereiten", noReadyClans: "Keine Clans mit bereiten Spielern",
    readinessFilters: "Bereitschaftsfilter", affiliationFilters: "Zugehörigkeitsfilter", gameFilters: "Spielauswahl", resetFilters: "Filter zurücksetzen",
    filters: "Filter", showFilters: "Filter anzeigen", hideFilters: "Filter ausblenden",
    rank: "Rang", status: "Status", online: "Online", followJoin: "Mitbeitreten", showGame: "Spiel anzeigen", sendGold: "Gold senden", noPlayers: "Keine Spieler gefunden",
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
    viewGrid: "Grid", viewTable: "Table", viewList: "List",
    title: "Lobby overview", currentMap: "Current map", nextMap: "Your selection", selectedGame: "Your selection", joinedGame: "Joined game", spectatingGame: "Spectating game", spectateGame: "Watch", spectatingActive: "Spectating", active: "ACTIVE", stopSpectating: "Stop spectating", selectGame: "Select game", noGameSelected: "No game selected", chooseGameHint: "Choose an upcoming game above.", modes: "Game modes", upcomingGames: "Upcoming games", noOtherUpcomingGames: "No other upcoming games", gameEntry: "Game", map: "Map", modeTeamGame: "Team", modeTeams: "Teams", modeBattleRoyale: "Battle Royale", modeDuel: "1v1", modeZombie: "Zombie", modeUnknown: "Game mode", selected: "Selected", joinGame: "Join", leaveGame: "Leave", joinSelected: "Selected · join", copyGameLink: "Copy game link", linkCopied: "Link copied", waitingForGames: "Waiting for upcoming games …", unknownPlayer: "Unknown player", clans: "Clans",
    joinedStatus: "You joined and will play in this game.", spectatingStatus: "You are watching and will not play in this game.",
    lobbyRating: "Lobby rating", lobbyRatingUnavailable: "Waiting for joined players with rank data",
    teams: "Teams", currentPlayer: "Playing as", changeName: "Change name", upcomingContests: "Upcoming contests", gameMode: "Game mode", gamePanel: "Game", gamePanelHint: "Selected game", lobbyPanel: "Lobby", lobbyPanelHint: "Everyone in the lobby", readyPlayers: "Ready players", quickFilters: "Quick filters", lobbyInfo: "Lobby info", lobbyViews: "Lobby views", lobby: "Lobby",
    people: "People", overview: "Info", topReadyPlayers: "Top 3 ready players", noReadyPlayers: "No ready players",
    topReadyClan: "Top ready clan",
    overviewLeadersNote: "Highest global ranks among ready players",
    progress: "Game start", players: "Players", team: "Team", search: "Search players …", allGames: "All games", currentMapSelection: "Current map",
    etaUnavailable: "Waiting for start time …", startsIn: "Starts in", startingNow: "Starting now",
    readyClansByClan: "Ready players by clan", noReadyClanPlayers: "No ready clan players", others: "Others",
    all: "All", ready: "Ready", notReady: "Not ready", waiting: "Waiting", spectator: "Spectator", watchers: "Watchers", clan: "Clan", followed: "Following", noClans: "No clans in this lobby", noClanMembers: "No members of your clan are in this lobby", noGameClanMembers: "No members of your clan are in this game",
    onlyReadyClans: "Only clans with ready players", noReadyClans: "No clans with ready players",
    readinessFilters: "Readiness filters", affiliationFilters: "Affiliation filters", gameFilters: "Game selection", resetFilters: "Reset filters",
    filters: "Filters", showFilters: "Show filters", hideFilters: "Hide filters",
    rank: "Rank", status: "Status", online: "Online", followJoin: "Follow join", showGame: "Show Game", sendGold: "Send Gold", noPlayers: "No players found",
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
  components: { MapHeader, LobbyProgress, PlayerList, LobbyPlayerName },
  setup() {
    const shell = document.getElementById("fx-game-shell");
    const labels = getLobbyLabels();
    const adapter = createLobbyDataAdapter();
    const snapshot = shallowRef(adapter.getSnapshot());
    const resolvedChatMessages = computed(() => {
      const messages = Array.isArray(snapshot.value?.chatMessages) ? snapshot.value.chatMessages : [];
      return messages.filter(Boolean).map(message => {
        const rawText = String(message.rawText || message.text || "");
        let segments;
        try {
          segments = resolveLobbyChatSegments(rawText);
        } catch (error) {
          console.warn("[ZFX Client LobbyChat] Could not format message; showing plain text:", error);
          segments = [{ text: rawText }];
        }
        const sdkPlayer = window.__fx?.gameSdk?.lobby?.getSnapshot?.()?.players
          ?.find(player => Number(player.id) === Number(message.senderId));
        return {
          ...message,
          senderName: message.system ? "" : window.__fx?.getLobbyChatSenderName?.(message.senderId)
            || sdkPlayer?.name
            || message.senderName,
          senderColor: sdkPlayer?.color || message.senderColor || window.__fx?.getLobbyChatSenderColor?.(message.senderId) || "",
          senderTerritoryColor: sdkPlayer?.territoryBorderColor || message.senderTerritoryColor,
          text: segments.map(segment => String(segment?.text ?? "")).join(""),
          segments: segments.filter(segment => segment && typeof segment.text === "string"),
        };
      });
    });
    const lobbyBackgroundStyle = computed(() => ({
      "--fx-custom-lobby-map-background": snapshot.value.currentMapImage || snapshot.value.lobbyBackgroundImage
        ? `url("${snapshot.value.currentMapImage || snapshot.value.lobbyBackgroundImage}")`
        : "linear-gradient(145deg, rgba(6, 15, 29, .985), rgba(9, 20, 35, .97))",
    }));
    const lobbyRating = shallowRef(null);
    const gameQuery = ref("");
    const lobbyQuery = ref("");
    const sortBy = ref("rank-asc");
    const lobbyReadyFilter = ref("all");
    const affiliationFilter = ref("all");
    const entryFilter = ref("all");
    const chatStatus = ref("");
    const lobbyNotifications = ref([]);
    const notificationIndex = ref(-1);
    const notificationPanelOpen = ref(false);
    const notificationPanelMinimized = ref(true);
    const showLobbyNotificationCloseButton = ref(settingsApi.getBoolean("showLobbyNotificationCloseButton"));
    const currentLobbyNotification = computed(() => lobbyNotifications.value[notificationIndex.value] ?? null);
    let notificationAutoMinimizeTimer = null;
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
    const readSavedLobbyTab = (key, allowedTabs, fallback) => {
      try {
        const savedTab = localStorage.getItem(key);
        return allowedTabs.includes(savedTab) ? savedTab : fallback;
      } catch {
        return fallback;
      }
    };
    const saveLobbyTab = (key, tab) => {
      try { localStorage.setItem(key, tab); } catch { /* Keep tab selection usable if storage is unavailable. */ }
    };
    const gameTab = ref(readSavedLobbyTab("fx_lobby_game_tab", ["overview", "players", "watchers", "clan", "calls"], "overview"));
    const lobbyTab = ref(readSavedLobbyTab("fx_lobby_people_tab", ["chat", "lobby", "clan", "clans"], "chat"));
    const currentSelectionOverride = ref(undefined);
    const joinLinkCopied = ref(false);
    let joinLinkCopyTimer = 0;
    const playerContextMenu = ref(null);
    const playerListComponent = ref(null);
    const startupLobbyCandidate = shell ? findLobbyRoot(shell) : null;
    // This component is only mounted on /lobby, so do not gate its first render
    // on native DOM selectors. Those selectors vary between game builds and
    // previously left the native lobby visible with no Vue replacement.
    const active = ref(Number(window.__fx?.nativeMenuState) !== 5 || multiplayerLobbyRequested);
    let nativeRoot = null;
    let savedStyles = null;
    if (active.value) suppressNativeRoot(startupLobbyCandidate);
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
      settingsApi.getNumber("lobbyFontScale", 100) / 100)));
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
      const needle = gameQuery.value.trim().toLocaleLowerCase();
      const watchersTab = gameTab.value === "watchers";
      const playersTab = gameTab.value === "players";
      const clanTab = gameTab.value === "clan";
      const rosterMapEntryId = selectedGameEntry.value?.id ?? snapshot.value.currentMapEntryId ?? null;
      const players = snapshot.value.players.filter(player => {
        if (!clanTab && needle && !player.name.toLocaleLowerCase().includes(needle)) return false;
        if (rosterMapEntryId == null || Number(player.entryId) !== Number(rosterMapEntryId)) return false;
        if (watchersTab && player.participation !== "spectator") return false;
        if (playersTab && player.participation !== "joined") return false;
        if (clanTab && (player.clan !== ownClan.value
          || !["joined", "spectator"].includes(player.participation))) return false;
        if (!watchersTab && !clanTab && player.participation === "spectator") return false;
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
    const lobbyPlayers = computed(() => {
      const needle = lobbyQuery.value.trim().toLocaleLowerCase();
      const players = snapshot.value.players.filter(player => {
        if (needle && !player.name.toLocaleLowerCase().includes(needle)) return false;
        if (lobbyReadyFilter.value === "waiting"
          && (player.participation === "spectator" || player.readiness !== "not-ready")) return false;
        if (lobbyReadyFilter.value === "joined" && player.participation !== "joined") return false;
        if (lobbyReadyFilter.value === "spectator" && player.participation !== "spectator") return false;
        if (affiliationFilter.value === "clan" && !player.clan) return false;
        if (affiliationFilter.value === "followed" && !player.followed) return false;
        if (entryFilter.value === "current" && (selectedGameEntry.value?.id == null
          || Number(player.entryId) !== Number(selectedGameEntry.value.id))) return false;
        return true;
      });
      if (sortBy.value === "name") players.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
      else if (sortBy.value === "rank-desc") players.sort((left, right) => (right.rank ?? Number.NEGATIVE_INFINITY) - (left.rank ?? Number.NEGATIVE_INFINITY));
      else players.sort((left, right) => (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY));
      return players;
    });
    const clanGroups = computed(() => {
      const groups = new Map();
      for (const player of snapshot.value.players) {
        if (!player.clan) continue;
        const group = groups.get(player.clan) ?? { tag: player.clan, players: [], readyCount: 0 };
        group.players.push(player);
        if (isReadyPlayer(player)) group.readyCount++;
        groups.set(player.clan, group);
      }
      return [...groups.values()].sort((a, b) => b.readyCount - a.readyCount
        || b.players.length - a.players.length
        || a.tag.localeCompare(b.tag));
    });
    function readyPlayersForEntry(entry) {
      const entryId = entry?.id;
      if (entryId == null) return [];
      const assignedPlayers = snapshot.value.players.filter(player => player.entryId != null
        && Number(player.entryId) === Number(entryId)
        && isReadyPlayer(player));
      if (assignedPlayers.length || snapshot.value.players.some(player => player.entryId != null)) return assignedPlayers;
      return Array.isArray(entry.players)
        ? entry.players.filter(player => isReadyPlayer(player)
          && (player.entryId == null || Number(player.entryId) === Number(entryId)))
        : [];
    }
    function joinedPlayersForEntry(entry) {
      const entryId = entry?.id;
      if (entryId == null) return [];
      const assignedPlayers = snapshot.value.players.filter(player => player.entryId != null
        && Number(player.entryId) === Number(entryId)
        && player.participation === "joined");
      if (assignedPlayers.length || snapshot.value.players.some(player => player.entryId != null)) return assignedPlayers;
      return Array.isArray(entry.players)
        ? entry.players.filter(player => player.participation === "joined"
          && (player.entryId == null || Number(player.entryId) === Number(entryId)))
        : [];
    }
    const topReadyClan = computed(() => clanGroups.value.find(clan => clan.readyCount > 0) ?? null);
    const selectedEntryReadyPlayers = computed(() => {
      return readyPlayersForEntry(selectedGameEntry.value);
    });
    const selectedEntryPlayers = computed(() => joinedPlayersForEntry(selectedGameEntry.value));
    const selectedEntryReadyCount = computed(() => Number.isFinite(Number(selectedGameEntry.value?.readyCount))
      ? Number(selectedGameEntry.value.readyCount) : selectedEntryReadyPlayers.value.length);
    const readyClanTotal = computed(() => selectedEntryReadyPlayers.value.length);
    const readyClanSlices = computed(() => {
      const counts = new Map();
      const othersSliceId = "__fx_others__";
      let untaggedCount = 0;
      for (const player of selectedEntryReadyPlayers.value) {
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
    const clanCount = computed(() => String(clanGroups.value.length));
    const onlyReadyClans = ref(false);
    const visibleClanGroups = computed(() => onlyReadyClans.value
      ? clanGroups.value.filter(clan => clan.readyCount > 0)
      : clanGroups.value);
    const rosterMapEntryId = computed(() => selectedGameEntry.value?.id ?? snapshot.value.currentMapEntryId ?? null);
    const currentEntryPlayers = computed(() => rosterMapEntryId.value == null ? []
      : snapshot.value.players.filter(player => Number(player.entryId) === Number(rosterMapEntryId.value)));
    const watcherCount = computed(() => currentEntryPlayers.value.filter(player => player.participation === "spectator").length);
    const currentJoinedPlayers = computed(() => currentEntryPlayers.value.filter(player => player.participation === "joined"));
    const playerCountLabel = computed(() => String(currentJoinedPlayers.value.length));
    const lobbyCount = computed(() => snapshot.value.players.length);
    const currentPlayerName = computed(() => {
      const self = getSelfLobbyPlayer(snapshot.value.players);
      const nativeIdentity = window.__fx?.getNativeOwnPlayerIdentity?.();
      const playerId = window.__fx?.getGameVar?.("playerId");
      const rawPlayerName = window.__fx?.getGameVar?.("rawPlayerNames")?.[playerId];
      const homeName = window.__fx?.getNativeHomeNameInput?.()?.value;
      const accountName = window.__fx?.myAccountAdapter?.getSnapshot?.()?.accountName;
      return self?.name || rawPlayerName || nativeIdentity?.username || homeName || accountName || labels.unknownPlayer;
    });
    const currentPlayerTerritoryColor = computed(() => {
      const self = getSelfLobbyPlayer(snapshot.value.players);
      return window.__fx?.getNativePlayerColor?.() || self?.color || self?.territoryBorderColor || "";
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
    const displayedUpcomingGames = computed(() => {
      const entries = snapshot.value.upcomingGames ?? [];
      const previewEntryId = currentSelectionOverride.value !== undefined
        ? currentSelectionOverride.value
        : entries.find(entry => entry.selected)?.id
          ?? entries.find(entry => entry.joined)?.id
          ?? (snapshot.value.currentMapEntryId == null ? null
            : entries.find(entry => Number(entry.id) === Number(snapshot.value.currentMapEntryId))?.id)
          ?? entries[0]?.id
          ?? null;
      return entries.map(entry => {
          const joinedPlayers = joinedPlayersForEntry(entry);
        return {
          ...entry,
          active: Number(entry.id) === Number(previewEntryId),
          watcherCount: snapshot.value.players.filter(player => Number(player.entryId) === Number(entry.id)
            && player.participation === "spectator").length,
            rating: calculateLobbyRating(joinedPlayers.map(player => player.rank),
            key => window.__fx?.translateFX?.(key) ?? labels[key] ?? key),
        };
      });
    });
    const selectedGameEntry = computed(() => displayedUpcomingGames.value.find(entry => entry.active) ?? null);
    const joinedGameEntry = computed(() => displayedUpcomingGames.value.find(entry => entry.joined) ?? null);
    const spectatingGameEntry = computed(() => displayedUpcomingGames.value.find(entry => entry.spectating) ?? null);
    const joinCardEntry = computed(() => joinedGameEntry.value ?? spectatingGameEntry.value
      ?? selectedGameEntry.value
      ?? (snapshot.value.currentMapEntryId == null ? null
        : displayedUpcomingGames.value.find(entry => Number(entry.id) === Number(snapshot.value.currentMapEntryId)))
      ?? null);
    const selectedGameParticipation = computed(() => joinedGameEntry.value ? "joined" : spectatingGameEntry.value ? "spectator" : "none");
    const nextGameMeta = computed(() => {
      const selectedEntry = joinCardEntry.value;
      const values = [];
      if (selectedEntry?.playerCount != null || selectedEntry?.maxPlayers != null) {
        const count = selectedEntry.playerCount == null ? "—" : selectedEntry.playerCount;
        const capacity = selectedEntry.maxPlayers == null ? "" : `/${selectedEntry.maxPlayers}`;
        values.push(`${count}${capacity} ${labels.players.toLowerCase()}`);
      }
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
    const gameClanCount = computed(() => {
      const entryId = selectedGameEntry.value?.id ?? snapshot.value.currentMapEntryId ?? null;
      if (!ownClan.value || entryId == null) return 0;
      const players = snapshot.value.players.filter(player =>
        player.clan === ownClan.value && Number(player.entryId) === Number(entryId)
        && ["joined", "spectator"].includes(player.participation));
      return players.length;
    });
    const filteredClanPlayers = computed(() => filteredPlayers.value
      .filter(player => ownClan.value && player.clan === ownClan.value));
    const currentMapEntry = computed(() => {
      const entries = snapshot.value.upcomingGames ?? [];
      return entries.find(entry => entry.id === snapshot.value.currentMapEntryId) ?? entries[0] ?? null;
    });

    let observer = null;
    let frame = 0;
    let unsubscribe = () => {};
    let unsubscribeGameSdk = () => {};
    let unsubscribeLobbyChat = () => {};
    let getLobbyDataDiagnostics = null;
    let chatReplayTimer = 0;
    let missingLobbyTimer = 0;
    let readinessRefreshTimer = 0;
    let ratingRefreshTimer = 0;

    function refreshLobbyRating() {
      lobbyRating.value = calculateLobbyRating(
        selectedEntryPlayers.value.map(player => player.rank),
        key => window.__fx?.translateFX?.(key) ?? labels[key] ?? key,
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

    function suppressNativeRoot(root) {
      if (!root || root === shell) return false;
      if (nativeRoot === root && root.dataset.fxCustomLobbyHidden === "true") return true;
      if (nativeRoot && nativeRoot !== root) restoreNativeRoot();
      nativeRoot = root;
      savedStyles = ["visibility", "pointer-events"].map(property => [
        property, root.style.getPropertyValue(property), root.style.getPropertyPriority(property),
      ]);
      root.style.setProperty("visibility", "hidden", "important");
      root.style.setProperty("pointer-events", "none", "important");
      root.dataset.fxCustomLobbyHidden = "true";
      return true;
    }

    function publishSdkLobbySnapshot(sdkLobby = window.__fx?.gameSdk?.lobby?.getSnapshot?.()) {
      if (!sdkLobby) return false;
      const entries = Array.isArray(sdkLobby.entries) ? sdkLobby.entries : [];
      const sdkPlayers = Array.isArray(sdkLobby.players) ? sdkLobby.players : [];
      if (sdkLobby.source === "none" && entries.length === 0 && sdkPlayers.length === 0) return false;

      const mapNames = window.__fx?.getGameMapNames?.();
      const resolveMap = entry => entry?.mapName || (Number.isInteger(Number(entry?.mapIndex))
        ? String(mapNames?.[Number(entry.mapIndex)] || getMapName(Number(entry.mapIndex))) : "");
      const resolveMode = code => {
        const value = Number(code);
        if (value >= 0 && value <= 6) return { key: "team", label: labels.modeTeamGame, teams: `${value + 2} ${labels.modeTeams}` };
        if (value === 7 || value === 10) return { key: "battle-royale", label: labels.modeBattleRoyale, teams: "" };
        if (value === 8) return { key: "duel", label: labels.modeDuel, teams: "" };
        if (value === 9) return { key: "zombie", label: labels.modeZombie, teams: "" };
        return { key: "unknown", label: labels.modeUnknown, teams: "" };
      };
      const currentEntry = entries.find(entry => entry.id === sdkLobby.rosterEntryId) ?? entries[0] ?? null;
      const joinedEntryId = sdkLobby.selectedEntryId ?? null;
      if (currentSelectionOverride.value != null
        && !entries.some(entry => Number(entry.id) === Number(currentSelectionOverride.value))) {
        currentSelectionOverride.value = undefined;
      }
      const activeSelectionId = currentSelectionOverride.value !== undefined
        ? currentSelectionOverride.value : joinedEntryId;
      const selectedEntry = entries.find(entry => Number(entry.id) === Number(activeSelectionId)) ?? null;
      const currentMode = resolveMode(currentEntry?.modeCode);
      const nextMode = resolveMode(selectedEntry?.modeCode);
      const currentMap = resolveMap(currentEntry);
      const nextMap = resolveMap(selectedEntry);
      const entriesById = new Map(entries.map(entry => [Number(entry.id), entry]));
      if (!mapImageCacheHydrated) {
        void loadPersistentMapImages().then(() => {
          if (active.value) publishSdkLobbySnapshot(sdkLobby);
        });
      }
      let currentMapImage = getNativeMapImage(currentEntry?.mapIndex, currentEntry?.mapSeed);
      const identity = window.__fx?.getNativeOwnPlayerIdentity?.();
      const ownId = identity?.id ?? window.__fx?.getGameVar?.("playerId");
      const players = sdkPlayers.map(player => ({
        id: player.id,
        senderId: player.id,
        name: player.name,
        clan: getPlayerClan(player.name),
        entryId: player.entryId,
        readiness: player.ready ? "ready" : "not-ready",
        participation: player.participation,
        ready: player.ready === true,
        readyEntryModeKey: player.entryId != null
          ? resolveMode(entriesById.get(Number(player.entryId))?.modeCode).key : "",
        readyEntryModeLabel: player.entryId != null
          ? resolveMode(entriesById.get(Number(player.entryId))?.modeCode).label : "",
        readyEntryMapName: player.entryId != null
          ? resolveMap(entriesById.get(Number(player.entryId))) || (labels.map + " " + (entriesById.get(Number(player.entryId))?.mapIndex ?? "")).trim() : "",
        readyEntryTeamCountLabel: player.entryId != null
          ? resolveMode(entriesById.get(Number(player.entryId))?.modeCode).teams : "",
          readyEntryLabel: player.entryId != null
          ? (() => {
            const entry = entriesById.get(Number(player.entryId));
            if (!entry) return `${labels.gameEntry} #${player.entryId}`;
            const mapName = resolveMap(entry) || `${labels.map} ${entry.mapIndex ?? ""}`.trim();
            const mode = resolveMode(entry.modeCode).label;
            const modeMeta = resolveMode(entry.modeCode);
            return [mapName, mode !== labels.modeUnknown ? mode : "", modeMeta.teams].filter(Boolean).join(" · ");
            })()
            : "",
          followJoinAvailable: player.ready && entries.some(entry => Number(entry.id) === Number(player.entryId)),
        rankCode: player.rankCode,
        rankText: player.rankText,
        self: (ownId != null && String(ownId) === String(player.id))
          || (identity?.username && normalizeLobbyPlayerName(identity.username) === normalizeLobbyPlayerName(player.name)),
        color: player.color || window.__fx?.getLobbyChatSenderColor?.(player.id) || "",
        territoryBorderColor: player.territoryBorderColor || "",
      }));
      const upcomingGames = entries.map(entry => {
        const mode = resolveMode(entry.modeCode);
        const mapName = resolveMap(entry);
        return {
          ...entry,
          selected: entry.selected === true,
          active: Number(entry.id) === Number(activeSelectionId),
          joined: entry.joined === true,
          spectating: entry.spectating === true,
          mapName,
          mapImage: getNativeMapImage(entry.mapIndex, entry.mapSeed),
          modeKey: mode.key,
          modeLabel: mode.label,
          teamCountLabel: mode.teams,
        };
      });
      const nextSnapshot = adapter.publish({
        ...adapter.getSnapshot(),
        players,
        playerCount: Number.isInteger(Number(sdkLobby.playerCount)) ? Number(sdkLobby.playerCount) : players.length,
        readyCount: Number.isInteger(Number(sdkLobby.readyCount)) ? Number(sdkLobby.readyCount) : players.filter(player => player.ready).length,
        upcomingGames,
        currentMap,
        currentMapImage,
        lobbyBackgroundImage: captureGameCanvasImage()
          || nativeLobbyBackgroundImage || adapter.getSnapshot().lobbyBackgroundImage,
        currentMapEntryId: currentEntry?.id ?? null,
        rosterEntryId: sdkLobby.rosterEntryId ?? null,
        currentTeamCountLabel: currentMode.teams,
        currentGameModeLabel: currentMode.label,
        currentGameModeKey: currentMode.key,
        nextMap,
        nextMapImage: getNativeMapImage(selectedEntry?.mapIndex, selectedEntry?.mapSeed),
        // The roster entry is the lobby's actual next start. The selected
        // entry can be empty or belong to a different future game, so it must
        // not delay the countdown/progress bar.
        nextGameEntryId: currentEntry?.id ?? null,
        nextGameCountdownSeconds: currentEntry?.countdownSeconds ?? null,
        nextGamePlayerCount: currentEntry?.playerCount ?? null,
        nextTeamCountLabel: nextMode.teams,
        nextGameModeLabel: selectedEntry ? nextMode.label : "",
        nextGameModeKey: selectedEntry ? nextMode.key : "",
        isContest: currentEntry?.isContest === true,
        nextIsContest: selectedEntry ? selectedEntry.isContest === true : null,
        noFullsend: Number(currentEntry?.modeCode) === 10,
        nextNoFullsend: Number(selectedEntry?.modeCode) === 10,
      }, sdkLobby.source || "native-websocket");
      logLobbyDiagnostic("sdk-lobby-data", `${sdkLobby.revision}:${entries.length}:${players.length}`, {
        source: sdkLobby.source,
        revision: sdkLobby.revision,
        entryCount: entries.length,
        playerCount: players.length,
        rosterEntryId: sdkLobby.rosterEntryId,
      });
      return nextSnapshot;
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
          gameState: window.__fx?.getGameVar?.("gameState"),
        });
        // Some native builds only render the selected Chat or roster panel.
        if (!nativeRoot?.isConnected) {
          const root = findLobbyRoot(shell);
          if (root) {
            suppressNativeRoot(root);
            active.value = true;
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
        suppressNativeRoot(root);
      }

      const ownPlayerId = window.__fx?.getGameVar?.("playerId");
      const ownPlayerName = window.__fx?.getGameVar?.("rawPlayerNames")?.[ownPlayerId];
      const ownIdentity = window.__fx?.getNativeOwnPlayerIdentity?.();
      const sdkLobbySnapshot = window.__fx?.gameSdk?.lobby?.getSnapshot?.();
      const hasDecodedRoster = sdkLobbySnapshot?.rosterEntryId != null
        && sdkLobbySnapshot.entries?.some(entry => entry.id === sdkLobbySnapshot.rosterEntryId)
        && Array.isArray(sdkLobbySnapshot.players);
      const sdkPlayersById = hasDecodedRoster
        ? new Map(sdkLobbySnapshot.players.filter(player => player.id != null)
          .map(player => [String(player.id), player]))
        : null;
      const sdkPlayersByName = hasDecodedRoster
        ? sdkLobbySnapshot.players.reduce((playersByName, player) => {
          const key = normalizeLobbyPlayerName(player.name);
          const matches = playersByName.get(key) ?? [];
          matches.push(player);
          playersByName.set(key, matches);
          return playersByName;
        }, new Map())
        : null;
      const sdkEntriesById = new Map((sdkLobbySnapshot?.entries ?? []).map(entry => [Number(entry.id), entry]));
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
        const rowPlayerId = metadata.dataset.fxPlayerId || row.dataset.fxPlayerId || senderId;
        const nameMatches = sdkPlayersByName?.get(normalizeLobbyPlayerName(name)) ?? [];
        const sdkPlayer = (rowPlayerId != null ? sdkPlayersById?.get(String(rowPlayerId)) : null)
          ?? (nameMatches.length === 1 ? nameMatches[0] : null);
        if (sdkPlayer?.participation) row.dataset.fxLobbyParticipation = sdkPlayer.participation;
        else delete row.dataset.fxLobbyParticipation;
        const sdkEntry = sdkPlayer?.entryId != null ? sdkEntriesById.get(Number(sdkPlayer.entryId)) : null;
        const sdkEntryMapName = sdkEntry?.mapName
          || (Number.isInteger(Number(sdkEntry?.mapIndex))
            ? window.__fx?.getGameMapNames?.()?.[Number(sdkEntry.mapIndex)] || getMapName(Number(sdkEntry.mapIndex))
            : "");
        const sdkEntryModeCode = Number(sdkEntry?.modeCode);
        const sdkEntryModeKey = sdkEntryModeCode >= 0 && sdkEntryModeCode <= 6 ? "team"
          : sdkEntryModeCode === 7 || sdkEntryModeCode === 10 ? "battle-royale"
            : sdkEntryModeCode === 8 ? "duel" : sdkEntryModeCode === 9 ? "zombie" : "";
        const sdkEntryMode = sdkEntryModeCode >= 0 && sdkEntryModeCode <= 6 ? labels.modeTeamGame
          : sdkEntryModeCode === 7 || sdkEntryModeCode === 10 ? labels.modeBattleRoyale
            : sdkEntryModeCode === 8 ? labels.modeDuel : sdkEntryModeCode === 9 ? labels.modeZombie : "";
        const readinessMark = rawText.codePointAt(0);
        if (readinessMark === 0x1F7E2) row.dataset.fxLobbyReady = "ready";
        else if (readinessMark === 0x26AA) row.dataset.fxLobbyReady = "not-ready";
        else if (!row.dataset.fxLobbyReady) row.dataset.fxLobbyReady = "unknown";
        return {
          id: metadata.dataset.fxPlayerId || row.dataset.fxPlayerId || `${name}-${index}`,
          senderId,
          name,
          entryId: sdkPlayer?.entryId ?? null,
          participation: sdkPlayer?.participation ?? "none",
          readyEntryLabel: sdkPlayer?.entryId != null && sdkEntry
            ? [sdkEntryMapName || `${labels.gameEntry} #${sdkEntry.id}`, sdkEntryMode,
              sdkEntryModeKey === "team" ? `${sdkEntryModeCode + 2} ${labels.modeTeams}` : ""].filter(Boolean).join(" · ")
            : "",
          readyEntryModeKey: sdkPlayer?.entryId != null ? sdkEntryModeKey : "",
          readyEntryModeLabel: sdkPlayer?.entryId != null ? sdkEntryMode : "",
          readyEntryMapName: sdkPlayer?.entryId != null ? sdkEntryMapName || (labels.gameEntry + " #" + (sdkEntry?.id ?? "")) : "",
          readyEntryTeamCountLabel: sdkPlayer?.entryId != null && sdkEntryModeKey === "team"
            ? (sdkEntryModeCode + 2) + " " + labels.modeTeams : "",
          followJoinAvailable: Boolean(sdkPlayer?.ready && sdkEntry),
          clan: metadata.dataset.fxClan || row.dataset.fxClan
            || getPlayerClan(name) || getPlayerClan(rawText),
          readiness: sdkPlayer?.participation === "spectator" ? "not-ready" : row.dataset.fxLobbyReady || "unknown",
          nativeReadiness: readinessMark === 0x1F7E2 || readinessMark === 0x26AA,
          rank: sdkPlayer?.rank ?? (Number(metadata.dataset.fxRank) || null),
          rankText: metadata.dataset.fxRankText || sdkPlayer?.rankText || (sdkPlayer?.rank != null
            ? `#${new Intl.NumberFormat().format(sdkPlayer.rank)}` : ""),
          sdkReadiness: sdkPlayer ? (sdkPlayer.ready ? "ready" : "not-ready") : null,
          followed: metadata.dataset.fxFollowed === "true" || metadata.classList.contains("fx-followed-player"),
          self: metadata.dataset.fxSelf === "true" || row.dataset.fxSelf === "true"
            || String(metadata.dataset.fxPlayerId || row.dataset.fxPlayerId || "") === String(ownPlayerId ?? "")
            || (ownIdentity?.id != null
              && String(metadata.dataset.fxPlayerId || row.dataset.fxPlayerId || "") === String(ownIdentity.id))
            || (typeof ownIdentity?.username === "string"
              && normalizeLobbyPlayerName(ownIdentity.username) === normalizeLobbyPlayerName(name))
            || (typeof ownPlayerName === "string"
              && normalizeLobbyPlayerName(ownPlayerName) === normalizeLobbyPlayerName(name)),
          color: sdkPlayer?.color || window.__fx?.getLobbyChatSenderColor?.(senderId) || metadata.style.color || row.style.color,
          territoryBorderColor: sdkPlayer?.territoryBorderColor || "",
          title: metadata.title || row.title,
          nativeElement: metadata,
        };
      });
      const players = hasDecodedRoster
        ? nativePlayers.map(player => ({
          ...player,
          readiness: player.participation === "spectator" ? "not-ready" : player.nativeReadiness ? player.readiness
            : player.sdkReadiness ?? player.readiness,
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
      const joinedEntryId = sdkLobby?.selectedEntryId ?? null;
      if (currentSelectionOverride.value != null
        && !upcomingGames.some(entry => Number(entry.id) === Number(currentSelectionOverride.value))) {
        currentSelectionOverride.value = undefined;
      }
      const activeSelectionId = currentSelectionOverride.value !== undefined
        ? currentSelectionOverride.value : joinedEntryId;
      const rosterEntry = upcomingGames.find(game => game.id === sdkLobby?.rosterEntryId)
        ?? upcomingGames[0]
        ?? null;
      const selectedNextEntry = upcomingGames.find(game => Number(game.id) === Number(activeSelectionId)) ?? null;
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
      const currentMapImage = getNativeMapImage(currentMapEntry?.mapIndex ?? roomMap, currentMapEntry?.mapSeed ?? room?.mapSeed)
        || (snapshot?.currentMap === currentMap ? snapshot?.currentMapImage : "");
      const nextMapImage = getNativeMapImage(selectedNextEntry?.mapIndex, selectedNextEntry?.mapSeed);
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
        return {
          ...entry,
          selected: entry.selected === true,
          active: Number(entry.id) === Number(activeSelectionId),
          joined: entry.joined === true,
          spectating: entry.spectating === true,
          mapName,
          mapImage: getNativeMapImage(entry.mapIndex, entry.mapSeed),
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

    function selectGameTab(tab) {
      if (!["overview", "players", "watchers", "clan", "calls"].includes(tab)) return;
      gameTab.value = tab;
      saveLobbyTab("fx_lobby_game_tab", tab);
      // Keep the native roster mounted for live player/readiness data.
      findNativePlayerTab(nativeRoot)?.click();
      [80, 220].forEach(delay => window.setTimeout(scheduleRead, delay));
    }

    function selectLobbyTab(tab) {
      if (!["chat", "lobby", "clan", "clans"].includes(tab)) return;
      lobbyTab.value = tab;
      saveLobbyTab("fx_lobby_people_tab", tab);
    }

    function openPlayerContextMenu(player, event) {
      event?.preventDefault();
      event?.stopPropagation();
      if (!player?.name) return;
      const matchedPlayer = snapshot.value.players.find(candidate => player.senderId != null
        && String(candidate.senderId ?? candidate.id) === String(player.senderId))
        ?? snapshot.value.players.find(candidate => normalizeLobbyPlayerName(candidate.name) === normalizeLobbyPlayerName(player.name));
      playerContextMenu.value = {
        senderId: player.senderId,
        accountId: player.accountId ?? null,
        senderName: player.name,
        senderColor: player.color || "",
        entryId: player.entryId ?? matchedPlayer?.entryId ?? null,
        participation: player.participation ?? matchedPlayer?.participation ?? null,
        ready: isReadyPlayer(player) || (player.ready === true && player.participation !== "spectator")
          || isReadyPlayer(matchedPlayer),
        self: player.self === true || matchedPlayer?.self === true,
        x: Math.max(8, Math.min(event?.clientX ?? 8, window.innerWidth - 176)),
        y: Math.max(8, Math.min(event?.clientY ?? 8, window.innerHeight - 190)),
      };
    }

    function showPlayerGameFromContextMenu() {
      const player = playerContextMenu.value;
      playerContextMenu.value = null;
      if (player?.entryId == null || !["joined", "spectator"].includes(player.participation)) return false;
      return selectUpcomingGame({ id: player.entryId });
    }

    function followJoinFromContextMenu() {
      const player = playerContextMenu.value;
      playerContextMenu.value = null;
      if (!player?.ready || player.self || player.entryId == null) return false;
      return followPlayerJoin(player);
    }

    function sendGoldFromContextMenu() {
      const player = playerContextMenu.value;
      playerContextMenu.value = null;
      if (!player) return false;
      // Resolve against the native lobby player records. Their `ua` is the ID
      // consumed by the native gold transfer action; SDK/session IDs and the
      // chat name index are not used as fallbacks.
      const accountId = player.accountId
        ?? window.__fx?.goldTransferAdapter?.resolveRecipientId?.(player.senderName)
        ?? "";
      const accountCode = accountId ? window.__fx?.getLobbyChatMentionToken?.(Number(accountId)) : "";
      return window.__fx?.openVueGoldTransfer?.(String(accountCode || "")) ?? false;
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

    function handleNativeMapPreview() {
      publishSdkLobbySnapshot();
      scheduleRead();
    }

    function handleNativeLobbyReturn() {
      active.value = true;
      scheduleRead();
    }

    function handleNativeMenuStateChange(event) {
      const nextState = Number(event.detail?.nextState);
      if (nextState === 5) {
        active.value = false;
        restoreNativeRoot();
        return;
      }
      if (nextState !== 0
        || (Number(window.__fx?.getGameVar?.("gameState")) === 1 && !multiplayerLobbyRequested)) return;
      active.value = true;
      suppressNativeRoot(findLobbyRoot(shell));
      scheduleRead();
    }

    function clearNotificationAutoMinimizeTimer() {
      if (notificationAutoMinimizeTimer !== null) {
        window.clearTimeout(notificationAutoMinimizeTimer);
        notificationAutoMinimizeTimer = null;
      }
    }

    function expandLobbyNotificationsTemporarily() {
      clearNotificationAutoMinimizeTimer();
      notificationPanelMinimized.value = false;
      notificationPanelOpen.value = true;
      if (!settingsApi.getBoolean("zfx.lobbyNotifications.autoMinimize")) return;
      const delaySeconds = Math.max(1, Math.min(30,
        settingsApi.getNumber("zfx.lobbyNotifications.autoMinimizeDelaySeconds", 6)));
      notificationAutoMinimizeTimer = window.setTimeout(() => {
        notificationAutoMinimizeTimer = null;
        minimizeLobbyNotifications();
      }, delaySeconds * 1000);
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
        const existing = lobbyNotifications.value[existingIndex];
        lobbyNotifications.value[existingIndex] = {
          ...existing, text, ...presentation,
          categoryKey, category: labels[categoryKey],
        };
        notificationIndex.value = existingIndex;
        expandLobbyNotificationsTemporarily();
        return;
      }
      const categoryKey = presentation.kind === "followers" ? "followers"
        : Number(event.detail?.id) === 7 ? "lobbyCategory" : "noticeCategory";
      const nextNotifications = [...lobbyNotifications.value, {
        id,
        text,
        receivedAt: Number.isFinite(Number(event.detail?.timestamp)) ? Number(event.detail.timestamp) : Date.now(),
        ...presentation,
        categoryKey,
        category: labels[categoryKey],
      }];
      while (nextNotifications.length > 100) nextNotifications.shift();
      lobbyNotifications.value = nextNotifications;
      notificationIndex.value = nextNotifications.length - 1;
      expandLobbyNotificationsTemporarily();
    }

    function formatLobbyNotificationTime(value) {
      const date = new Date(Number(value));
      return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function minimizeLobbyNotifications() {
      clearNotificationAutoMinimizeTimer();
      notificationPanelOpen.value = false;
      notificationPanelMinimized.value = true;
    }

    function restoreLobbyNotifications() {
      notificationPanelMinimized.value = false;
      notificationPanelOpen.value = Boolean(currentLobbyNotification.value);
    }

    function closeLobbyNotifications() {
      clearNotificationAutoMinimizeTimer();
      notificationPanelOpen.value = false;
      notificationPanelMinimized.value = false;
    }

    function markLobbyNotificationRead() {
      if (notificationIndex.value < 0 || notificationIndex.value >= lobbyNotifications.value.length) return;
      const nextNotifications = [...lobbyNotifications.value];
      nextNotifications.splice(notificationIndex.value, 1);
      lobbyNotifications.value = nextNotifications;
      if (!nextNotifications.length) {
        clearNotificationAutoMinimizeTimer();
        notificationIndex.value = -1;
        notificationPanelOpen.value = false;
        notificationPanelMinimized.value = true;
        return;
      }
      notificationIndex.value = Math.min(notificationIndex.value, nextNotifications.length - 1);
      notificationPanelOpen.value = true;
      notificationPanelMinimized.value = false;
    }

    function previousLobbyNotification() {
      notificationIndex.value = Math.max(0, notificationIndex.value - 1);
    }

    function nextLobbyNotification() {
      notificationIndex.value = Math.min(lobbyNotifications.value.length - 1, notificationIndex.value + 1);
    }

    function selectUpcomingGame(entry) {
      const entryId = Number(entry?.id);
      if (!Number.isInteger(entryId) || !snapshot.value.upcomingGames.some(game => Number(game.id) === entryId)) return false;
      currentSelectionOverride.value = entryId;
      return true;
    }

    async function copyGameJoinLink() {
      const entryId = Number(joinCardEntry.value?.id);
      if (!Number.isInteger(entryId) || entryId <= 0) return false;
      const link = new URL(`/join/${entryId}`, window.location.origin).href;
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
        else {
          const input = document.createElement("textarea");
          input.value = link;
          input.style.position = "fixed";
          input.style.opacity = "0";
          document.body.append(input);
          input.select();
          const copied = document.execCommand("copy");
          input.remove();
          if (!copied) throw new Error("Clipboard access is unavailable");
        }
        joinLinkCopied.value = true;
        if (joinLinkCopyTimer) window.clearTimeout(joinLinkCopyTimer);
        joinLinkCopyTimer = window.setTimeout(() => { joinLinkCopied.value = false; }, 1800);
        return true;
      } catch (error) {
        console.warn("[ZFX Client LobbyView] Could not copy game join link:", error);
        return false;
      }
    }

    function restoreJoinCardPreview() {
      return joinCardEntry.value ? selectUpcomingGame(joinCardEntry.value) : false;
    }

    function changePlayerName() {
      window.__fx?.openPlayerNameView?.();
    }

    function followPlayerJoin(player) {
      const entryId = Number(player?.entryId);
      const lobby = window.__fx?.gameSdk?.lobby;
      const entry = snapshot.value.upcomingGames.find(game => Number(game.id) === entryId)
        ?? lobby?.getUpcomingGames?.().find(game => Number(game.id) === entryId);
      if (!player || !entry || !Number.isInteger(entryId)) {
        console.warn("[ZFX Client LobbyView] Player's ready game entry is not available:", {
          playerId: player?.id ?? null,
          playerName: player?.name ?? "",
          entryId: player?.entryId ?? null,
          availableEntryIds: (lobby?.getUpcomingGames?.() ?? snapshot.value.upcomingGames).map(game => Number(game.id)),
        });
        return false;
      }
      const joinedEntryId = lobby?.getSnapshot?.()?.selectedEntryId ?? null;
      const state = lobby?.getSnapshot?.();
      if (Number(joinedEntryId) !== entryId || state?.selectedEntryMode !== "joined") {
        if (typeof lobby?.selectEntry !== "function" || !lobby.selectEntry(entryId, "joined")) {
          console.warn("[ZFX Client LobbyView] Could not follow player's game entry:", {
            playerId: player.id ?? null,
            playerName: player.name,
            entryId,
          });
          return false;
        }
      }

      currentSelectionOverride.value = entryId;
      return true;
    }

    function toggleSelectedGameJoin(participation = "joined") {
      const entry = selectedGameEntry.value ?? joinCardEntry.value;
      const lobby = window.__fx?.gameSdk?.lobby;
      if (!entry || typeof lobby?.selectEntry !== "function") {
        console.warn("[ZFX Client LobbyView] No upcoming game is selected for joining:", {
          entryId: entry?.id ?? null,
          selectedEntryId: entry?.id ?? null,
          lobbySdkAvailable: Boolean(lobby),
        });
        return false;
      }
      const current = lobby.getSnapshot?.();
      const joinedEntryId = current?.selectedEntryId ?? null;
      const sameEntry = Number(joinedEntryId) === Number(entry.id);
      const sameState = sameEntry && (participation === "none" || current?.selectedEntryMode === participation);
      const changed = sameState ? lobby.deselectEntry?.() : lobby.selectEntry(entry.id, participation);
      if (!changed) {
        console.warn("[ZFX Client LobbyView] Could not toggle selected game join state:", {
          entryId: entry.id,
          participation,
          joinedEntryId,
        });
        return false;
      }
      if (currentSelectionOverride.value === undefined) currentSelectionOverride.value = entry.id;
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
      const nextMap = String(selectedGameEntry.value?.mapName || "").trim();
      const teamCount = String(selectedGameEntry.value?.teamCountLabel || "").match(/\d+/)?.[0] || "";
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
        gameTab: gameTab.value,
        lobbyTab: lobbyTab.value,
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

    function syncNativeLobbyChat() {
      const native = window.__fx?.getNativeLobbyChatState?.();
      if (!native?.available) return 0;
      let replayed = 0;
      for (const message of native.messages ?? []) {
        const text = String(message?.text ?? "").trim();
        const type = Number(message?.id);
        if (!text) continue;
        const senderId = type === 0 ? message.senderId : null;
        const messageId = `native:${message.index}:${type}:${senderId ?? ""}:${text}`;
        const exists = adapter.getSnapshot().chatMessages.some(entry => entry.id === messageId);
        if (exists) continue;
        window.__fx?.lobbyChatFeed?.publish?.({
          id: messageId,
          senderId,
          text,
          system: type !== 0,
          nativeType: type,
        });
        replayed++;
      }
      return replayed;
    }

    function replayNativeLobbyChat() {
      const replayed = syncNativeLobbyChat();
      console.info(`[ZFX Client LobbyChat] replayed ${replayed} native messages into the Vue feed.`);
      return debugLobbyChat();
    }

    onMounted(() => {
      console.log("[ZFX Client LobbyView] Vue route mounted; waiting for native lobby data.");
      void loadPersistentMapImages().then(() => {
        publishSdkLobbySnapshot();
      });
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
            receivedAt: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now(),
            ...presentation,
            categoryKey,
            category: labels[categoryKey],
          };
        });
      refreshLobbyLanguage();
      notificationIndex.value = lobbyNotifications.value.length - 1;
      if (lobbyNotifications.value.length) expandLobbyNotificationsTemporarily();
      else {
        notificationPanelOpen.value = false;
        notificationPanelMinimized.value = true;
      }
      unsubscribe = adapter.subscribe(value => {
        snapshot.value = value;
        refreshLobbyRating();
        if (currentSelectionOverride.value !== undefined) {
          const participatingId = value.upcomingGames.find(entry => entry.joined || entry.spectating)?.id ?? null;
          if (participatingId === currentSelectionOverride.value) {
            currentSelectionOverride.value = undefined;
          }
        }
      });
      window.__fx.getCustomLobbyClanDiagnostics = getClanDiagnostics;
      getLobbyDataDiagnostics = () => ({
        sdk: window.__fx?.gameSdk?.lobby?.getDiagnostics?.() ?? null,
        nativeLobbyRootFound: Boolean(findLobbyRoot(shell)),
        adapterSource: adapter.getSnapshot().source,
        adapterPlayers: adapter.getSnapshot().players.length,
        adapterEntries: adapter.getSnapshot().upcomingGames.length,
      });
      window.__fx.getCustomLobbyDataDiagnostics = getLobbyDataDiagnostics;
      unsubscribeGameSdk = window.__fx?.gameSdk?.lobby?.subscribe?.(sdkSnapshot => {
        publishSdkLobbySnapshot(sdkSnapshot);
        if (nativeRoot?.isConnected) readLobby();
      }) ?? (() => {});
      unsubscribeLobbyChat = window.__fx?.lobbyChatFeed?.subscribe?.(message => {
        const current = adapter.getSnapshot();
        const socketPlayerName = window.__fx?.getLobbyChatSenderName?.(message.senderId);
        const sdkPlayer = window.__fx?.gameSdk?.lobby?.getSnapshot?.()?.players
          ?.find(player => Number(player.id) === Number(message.senderId));
        const playerName = message.system ? "" : socketPlayerName || sdkPlayer?.name
          || (message.senderId != null ? `Player ${message.senderId}` : labels.unknownPlayer);
        adapter.publish({
          ...current,
          chatChannel: "lobby",
          chatMessages: [...current.chatMessages, {
            ...message,
            rawText: message.text,
            senderName: playerName,
            senderColor: sdkPlayer?.color || window.__fx?.getLobbyChatSenderColor?.(message.senderId) || "",
            senderTerritoryColor: sdkPlayer?.territoryBorderColor || "",
            text: message.text,
            segments: [],
          }].slice(-60),
        }, current.source === "none" ? "lobby-socket" : current.source);
      }) ?? (() => {});
      syncNativeLobbyChat();
      chatReplayTimer = window.setInterval(syncNativeLobbyChat, 1000);
      console.info("[ZFX Client LobbyChat] view subscribed", window.__fx?.lobbyChatFeed?.getDiagnostics?.());
      if (!shell) return;
      window.addEventListener("fx-bot-protection-state", handleBotProtectionState);
      window.addEventListener("fx-native-map-preview", handleNativeMapPreview);
      window.addEventListener("fx-native-lobby-return", handleNativeLobbyReturn);
      window.addEventListener("fx-native-menu-state-change", handleNativeMenuStateChange);
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
        if (!active.value) return;
        if (nativeRoot?.isConnected) scheduleRead();
        // Native entry previews are cached by map index + seed at their source hook.
        if (snapshot.value.currentMap && !snapshot.value.lobbyBackgroundImage) {
          const image = captureGameCanvasImage();
          if (image) adapter.publish({ ...adapter.getSnapshot(), lobbyBackgroundImage: image }, adapter.getSnapshot().source);
        }
      }, 1000);
      ratingRefreshTimer = window.setInterval(() => refreshLobbyRating(), 1000);
      refreshLobbyRating();
      readLobby();
    });

    onBeforeUnmount(() => {
      observer?.disconnect();
      clearNotificationAutoMinimizeTimer();
      if (readinessRefreshTimer) window.clearInterval(readinessRefreshTimer);
      if (ratingRefreshTimer) window.clearInterval(ratingRefreshTimer);
      if (chatReplayTimer) window.clearInterval(chatReplayTimer);
      if (frame) cancelAnimationFrame(frame);
      if (missingLobbyTimer) window.clearTimeout(missingLobbyTimer);
      window.removeEventListener("fx-bot-protection-state", handleBotProtectionState);
      window.removeEventListener("fx-native-map-preview", handleNativeMapPreview);
      window.removeEventListener("fx-native-lobby-return", handleNativeLobbyReturn);
      window.removeEventListener("fx-native-menu-state-change", handleNativeMenuStateChange);
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
      if (window.__fx?.getCustomLobbyDataDiagnostics === getLobbyDataDiagnostics) delete window.__fx.getCustomLobbyDataDiagnostics;
      unsubscribeGameSdk();
      unsubscribeLobbyChat();
      restoreNativeRoot();
      adapter.clear();
    });

    return {
      active, labels, snapshot, lobbyRating, lobbyBackgroundStyle, scale, gameQuery, lobbyQuery, sortBy, lobbyReadyFilter, affiliationFilter, entryFilter, filteredPlayers, lobbyPlayers, ownClanPlayers, filteredClanPlayers, clanGroups, topReadyClan, readyClanSlices, readyClanTotal, gameTab, lobbyTab,
      lobbyNotifications, notificationIndex, notificationPanelOpen, notificationPanelMinimized, showLobbyNotificationCloseButton, currentLobbyNotification,
      formatLobbyNotificationTime,
      propagandaDialog, propagandaMessage, closePropagandaMessage,
      previousLobbyNotification, nextLobbyNotification, minimizeLobbyNotifications, restoreLobbyNotifications, closeLobbyNotifications, markLobbyNotificationRead,
      ownClan, currentPlayerName, currentPlayerTerritoryColor, gameClanCount, clanCount, playerCountLabel, watcherCount, lobbyCount, onlyReadyClans, visibleClanGroups, resolvedChatMessages, chatStatus, nextGameMeta, isTeamMode,
      displayedUpcomingGames, selectedGameEntry, joinedGameEntry, joinCardEntry, joinLinkCopied, selectedEntryReadyCount,
      currentMapEntry,
      selectedGameParticipation,
      playerContextMenu, playerListComponent, mentionPlayerFromContextMenu, followJoinFromContextMenu, showPlayerGameFromContextMenu, sendGoldFromContextMenu,
      selectUpcomingGame,
      restoreJoinCardPreview,
      copyGameJoinLink,
      selectGameTab,
      changePlayerName,
      followPlayerJoin,
      getEntryTitle,
      selectPlayer: openPlayerContextMenu,
      setSort: value => { sortBy.value = ["rank-desc", "rank-asc", "name"].includes(value) ? value : "rank-asc"; },
      setLobbyReadyFilter: value => { lobbyReadyFilter.value = value; },
      setAffiliationFilter: value => { affiliationFilter.value = affiliationFilter.value === value ? "all" : value; },
      setEntryFilter: value => { entryFilter.value = ["all", "current"].includes(value) ? value : "all"; },
      resetFilterGroups: () => { lobbyReadyFilter.value = "all"; affiliationFilter.value = "all"; entryFilter.value = "all"; },
      resetFilters: () => { gameQuery.value = ""; lobbyQuery.value = ""; lobbyReadyFilter.value = "all"; affiliationFilter.value = "all"; entryFilter.value = "all"; },
      sendChat: (message, callback) => sendMessage(message, callback),
      sendCall: sendSpawnCall,
      sendJoin: sendJoinCall,
      sendTeamMessage,
      selectLobbyTab,
      toggleSelectedGameJoin,
    };
  },
  template: `
    <section v-if="active" id="fx-custom-lobby-view" class="fx-custom-lobby" :style="{ '--fx-custom-lobby-scale': scale, ...lobbyBackgroundStyle }" :aria-label="labels.title">
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
          <button type="button" class="fx-lobby-notification-read" aria-label="Als gelesen markieren" title="Gelesen" @click="markLobbyNotificationRead">✓</button>
          <button type="button" aria-label="Meldungen minimieren" title="Minimieren" @click="minimizeLobbyNotifications">−</button>
          <button v-if="showLobbyNotificationCloseButton" type="button" class="fx-lobby-notification-close" aria-label="Close notifications" title="Close" @click="closeLobbyNotifications">?</button>
        </div>
        <article class="fx-lobby-notification" :class="{ 'is-followers': currentLobbyNotification.kind === 'followers' }">
          <span class="fx-lobby-notification-category">{{ currentLobbyNotification.category }}</span>
          <time v-if="currentLobbyNotification.receivedAt" class="fx-lobby-notification-time" :datetime="new Date(currentLobbyNotification.receivedAt).toISOString()">{{ formatLobbyNotificationTime(currentLobbyNotification.receivedAt) }}</time>
          <LobbyPlayerName v-if="currentLobbyNotification.senderName" class="fx-lobby-notification-sender" :name="currentLobbyNotification.senderName" :color="currentLobbyNotification.senderColor" @activate="openPlayerContextMenu({ name: currentLobbyNotification.senderName, senderId: currentLobbyNotification.senderId, accountId: currentLobbyNotification.senderId, color: currentLobbyNotification.senderColor }, $event)" />
          <p><template v-if="currentLobbyNotification.bodySegments?.length"><template v-for="(segment, index) in currentLobbyNotification.bodySegments" :key="index"><LobbyPlayerName v-if="segment.resolvedPlayer" :name="segment.text" :color="segment.color" @activate="openPlayerContextMenu({ name: segment.text, senderId: segment.mentionId, accountId: segment.mentionId, color: segment.color }, $event)" /><a v-else-if="segment.href" :href="segment.href" target="_blank" rel="noopener noreferrer">{{ segment.text }}</a><span v-else :style="segment.color ? { color: segment.color } : null">{{ segment.text }}</span></template></template><template v-else>{{ currentLobbyNotification.body || currentLobbyNotification.text }}</template></p>
        </article>
      </aside>
      <aside v-else-if="notificationPanelMinimized" class="fx-lobby-notifications is-minimized" aria-label="Minimierte Lobby-Benachrichtigungen" @pointerdown.stop @mousedown.stop @click.stop>
        <button type="button" class="fx-lobby-notification-restore" :disabled="!currentLobbyNotification" :aria-label="lobbyNotifications.length + ' notifications'" title="Notifications" @click="restoreLobbyNotifications"><svg class="fx-lobby-notification-bell" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><strong>{{ lobbyNotifications.length }}</strong></button>
      </aside>
      <div v-if="playerContextMenu" class="fx-custom-lobby-chat-menu-backdrop" @click="playerContextMenu = null" @keydown.esc="playerContextMenu = null">
        <div class="fx-custom-lobby-chat-context-menu" role="menu" :style="{ left: playerContextMenu.x + 'px', top: playerContextMenu.y + 'px' }" @click.stop>
          <strong :style="playerContextMenu.senderColor ? { color: playerContextMenu.senderColor } : null">{{ playerContextMenu.senderName }}</strong>
          <button v-if="playerContextMenu.entryId != null && ['joined', 'spectator'].includes(playerContextMenu.participation)" type="button" role="menuitem" @click="showPlayerGameFromContextMenu">{{ labels.showGame }}</button>
          <button v-if="playerContextMenu.ready && !playerContextMenu.self && playerContextMenu.entryId != null" type="button" role="menuitem" @click="followJoinFromContextMenu">{{ labels.followJoin }}</button>
          <button v-if="!playerContextMenu.self" type="button" role="menuitem" @click="sendGoldFromContextMenu">{{ labels.sendGold }}</button>
          <button type="button" role="menuitem" @click="mentionPlayerFromContextMenu">@ {{ labels.mention }}</button>
        </div>
      </div>
      </Teleport>
      <div class="fx-custom-lobby-pre-game">
        <LobbyProgress :snapshot="{ ...snapshot, nextGameEntryId: selectedGameEntry?.id ?? null, nextGameCountdownSeconds: selectedGameEntry?.countdownSeconds ?? null }" :labels="labels" />
        <button type="button" class="fx-custom-lobby-current-player-card" :style="{ '--fx-custom-player-color': currentPlayerTerritoryColor || null, '--fx-custom-player-territory-border': currentPlayerTerritoryColor || null }" :title="labels.changeName" :aria-label="labels.changeName + ': ' + currentPlayerName" @click="changePlayerName"><span class="fx-custom-lobby-current-player-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></span><span class="fx-custom-lobby-current-player-copy"><span>{{ labels.currentPlayer }}</span><strong>{{ currentPlayerName }}</strong></span><span class="fx-custom-lobby-current-player-edit-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z"/><path d="m14.8 5.7 3.5 3.5"/></svg></span></button>
      </div>
      <MapHeader :map="selectedGameEntry?.mapName || snapshot.currentMap" :map-image="selectedGameEntry?.mapImage || snapshot.currentMapImage" :next-map="joinCardEntry?.mapName || ''" :next-map-image="joinCardEntry?.mapImage || ''" :next-team-count-label="joinCardEntry?.teamCountLabel || ''" :next-game-mode-label="joinCardEntry?.modeLabel || ''" :game-mode-key="selectedGameEntry?.modeKey || snapshot.currentGameModeKey" :next-game-mode-key="joinCardEntry?.modeKey || ''" :next-game-meta="nextGameMeta" :is-contest="selectedGameEntry ? selectedGameEntry.isContest : snapshot.isContest" :next-is-contest="joinCardEntry ? joinCardEntry.isContest : null" :no-fullsend="selectedGameEntry ? Number(selectedGameEntry.modeCode) === 10 : snapshot.noFullsend" :next-no-fullsend="Number(joinCardEntry?.modeCode) === 10" :labels="labels" :entries="displayedUpcomingGames" :current-map-entry-id="snapshot.currentMapEntryId" :selected-game-participation="selectedGameParticipation" :selection-disabled="!joinCardEntry" :entry-title="getEntryTitle" :ready-count="selectedEntryReadyCount" :ready-clans="readyClanSlices" :ready-clan-total="readyClanTotal" :team-count="selectedGameEntry?.teamCountLabel || snapshot.currentTeamCountLabel" :game-mode-label="selectedGameEntry?.modeLabel || snapshot.currentGameModeLabel" :lobby-rating="lobbyRating" :share-entry-id="joinCardEntry?.id ?? null" :link-copied="joinLinkCopied" @select-entry="selectUpcomingGame" @join-selected="toggleSelectedGameJoin" @restore-selection="restoreJoinCardPreview" @share-join-link="copyGameJoinLink" />
      <main class="fx-custom-lobby-content">
        <PlayerList ref="playerListComponent" :players="filteredPlayers" :clan-game-players="filteredClanPlayers" :lobby-players="lobbyPlayers" :clan-lobby-players="ownClanPlayers" :all-players="snapshot.players" :clans="visibleClanGroups" :labels="labels" :player-count-label="playerCountLabel" :watcher-count="watcherCount" :lobby-count="lobbyCount" :game-clan-count="gameClanCount" :game-query="gameQuery" :lobby-query="lobbyQuery" :sort-by="sortBy" :lobby-ready-filter="lobbyReadyFilter" :affiliation-filter="affiliationFilter" :entry-filter="entryFilter" :current-entry-available="selectedGameEntry?.id != null" :game-tab="gameTab" :lobby-tab="lobbyTab" :chat-messages="resolvedChatMessages" :chat-status="chatStatus" :team-clan="ownClan" :clan-count="clanCount" :top-ready-clan="topReadyClan" :only-ready-clans="onlyReadyClans" :current-map="snapshot.currentMap" :next-map="snapshot.nextMap" :next-team-count="snapshot.nextTeamCountLabel" @update:game-query="gameQuery = $event" @update:lobby-query="lobbyQuery = $event" @update:sort="setSort" @update:lobby-ready-filter="setLobbyReadyFilter" @update:affiliation-filter="setAffiliationFilter" @update:entry-filter="setEntryFilter" @reset-filter-groups="resetFilterGroups" @reset-filters="resetFilters" @filter-ready-clans="onlyReadyClans = $event" @select-player="selectPlayer" @select-game-tab="selectGameTab" @select-lobby-tab="selectLobbyTab" @send-chat="sendChat" @send-call="sendCall" @send-join="sendJoin" @send-team-message="sendTeamMessage" />
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
    { path: "/:pathMatch(.*)*", redirect: "/lobby" },
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
let multiplayerLobbyRequested = false;
let multiplayerLobbyStateObserved = false;
let nativeMatchActive = false;
let joinLinkPollTimer = 0;

export function initializeCustomLobbyView() {
  const shell = document.getElementById("fx-game-shell");
  if (!shell || document.getElementById(APP_ID)) return () => {};
  const onNativeMapPreview = (mapIndex, mapSeed, canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) return false;
    const key = mapImageCacheKey(mapIndex, mapSeed);
    if (!key || mapImageCache.has(key)) return false;
    try {
      const image = canvas.toDataURL("image/png");
      if (!isSafeMapImageUrl(image) || image.length < 1500) return false;
      rememberMapImage(mapIndex, mapSeed, image);
      window.dispatchEvent(new CustomEvent("fx-native-map-preview", {
        detail: { mapIndex: Number(mapIndex), mapSeed: Number(mapSeed) },
      }));
      return true;
    } catch {
      return false;
    }
  };
  window.__fx.onNativeMapPreview = onNativeMapPreview;
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
  const clearMapImageCache = async () => {
    mapImageCache.clear();
    nativeLobbyBackgroundImage = "";
    mapImageCacheHydrated = true;
    try {
      const database = await openMapImageDb();
      if (!database) return { cleared: true, persistent: false };
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(MAP_IMAGE_DB_STORE, "readwrite");
        transaction.objectStore(MAP_IMAGE_DB_STORE).clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("Map image cache clear was aborted"));
      });
      console.info("[ZFX Client LobbyView] Map image cache cleared.");
      return { cleared: true, persistent: true };
    } catch (error) {
      console.error("[ZFX Client LobbyView] Could not clear persistent map image cache:", error);
      return { cleared: false, persistent: false, error: String(error) };
    }
  };
  window.__fx.clearMapImageCache = clearMapImageCache;
  const stopBotProtectionObserver = observeBotProtection(mount);
  let disposed = false;
  let routeTimer = 0;
  let unsubscribeMatchStarted = () => {};
  const getTargetRoute = () => {
    const gameState = Number(window.__fx?.getGameVar?.("gameState"));
    const rawNativeMenuState = window.__fx?.nativeMenuState;
    const nativeMenuState = rawNativeMenuState != null && Number.isFinite(Number(rawNativeMenuState))
      ? Number(rawNativeMenuState) : Number.NaN;
    const currentLobbyRoot = findLobbyRoot(shell);
    const lobbyRootStyle = currentLobbyRoot ? getComputedStyle(currentLobbyRoot) : null;
    const nativeLobbyVisible = Boolean(currentLobbyRoot?.getClientRects().length
      && lobbyRootStyle?.display !== "none"
      && lobbyRootStyle?.visibility !== "hidden"
      && Number(lobbyRootStyle?.opacity ?? 1) > 0);
    // Native menu state 5 is the home screen. Saving settings reloads the app
    // while this state is active, so the lobby route must not become the
    // router's default during that reload. Reaching it explicitly also ends
    // the in-game overlay, including from a post-match results screen.
    if (nativeMenuState === 5 && gameState !== 1) {
      nativeMatchActive = false;
      previousGameState = gameState;
      return "/classic";
    }
    // The native results screen uses a non-playing game state too. Only state
    // 0 means the player actually left that screen for the lobby; state 2 is
    // the post-match screen and must remain available for screenshots/replays.
    if (nativeMatchActive && gameState === 0) {
      nativeMatchActive = false;
      nativeLobbyBackgroundImage = captureGameCanvasImage() || nativeLobbyBackgroundImage;
      window.__fx?.onGameReturnedToLobby?.();
      return "/lobby";
    }
    // A game-state transition can mean a victory/peace results screen, where
    // users may want to take a screenshot or watch the replay. Stay on the
    // native in-game view until the native menu explicitly returns to lobby.
    if (nativeMatchActive) return "/game";
    if (multiplayerLobbyRequested) return "/lobby";
    // The visible native lobby is the strongest signal. Menu/game state can
    // lag during startup, which used to route to the empty in-game view.
    const nativeLobbyConfirmed = nativeMenuState === 0 || nativeLobbyVisible;
    if (nativeLobbyConfirmed && !nativeLobbyBackgroundImage) {
      nativeLobbyBackgroundImage = captureGameCanvasImage();
    }
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
    if (customLobbyReturnLatched) {
      if (!inGame) {
        classicSessionDisabled = false;
        return "/lobby";
      }
      return "/game";
    }
    return inGame ? "/game"
      : classicSessionDisabled || (nativeMenuState !== 0 && !nativeLobbyVisible) ? "/classic" : "/lobby";
  };
  const syncRoute = () => {
    const target = getTargetRoute();
    if (router.currentRoute.value.path !== target) {
      console.log("[ZFX Client LobbyView] Route change requested", {
        from: router.currentRoute.value.path,
        to: target,
        gameState: window.__fx?.getGameVar?.("gameState"),
        nativeMenuState: window.__fx?.nativeMenuState,
      });
      router.replace(target).catch(error => console.error("[ZFX Client] View route update failed:", error));
    }
  };
  unsubscribeMatchStarted = window.__fx?.gameSdk?.on?.("match.started", match => {
    nativeMatchActive = true;
    multiplayerLobbyRequested = false;
    multiplayerLobbyStateObserved = false;
    customLobbyReturnLatched = false;
    nativeLobbyReturnPending = false;
    nativeLobbyReturnUntil = 0;
    classicSessionDisabled = false;
    console.info("[ZFX Client LobbyView] Match started; switching to in-game route.", match);
    router.replace("/game").catch(error => console.error("[ZFX Client] Match route update failed:", error));
  }) ?? (() => {});
  window.__fx.navigateFxView = path => router.push(path);
  window.__fx.requestCustomLobbyView = () => {
    multiplayerLobbyRequested = true;
    multiplayerLobbyStateObserved = false;
    nativeMatchActive = false;
    classicSessionDisabled = false;
    router.replace("/lobby").catch(error => console.error("[ZFX Client] Multiplayer lobby navigation failed:", error));
    return true;
  };
  window.__fx.isCustomLobbyViewVisible = () => router.currentRoute.value.path === "/lobby"
    && Boolean(mount.querySelector("#fx-custom-lobby-view"));
  window.__fx.hideCustomLobbyView = () => {
    if (!window.__fx.isCustomLobbyViewVisible()) return false;
    customLobbyReturnLatched = false;
    multiplayerLobbyRequested = false;
    multiplayerLobbyStateObserved = false;
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
    multiplayerLobbyRequested = false;
    multiplayerLobbyStateObserved = false;
    nativeMatchActive = false;
    classicSessionDisabled = false;
    nativeLobbySuppressionRoot = null;
    nativeLobbySuppressionSawDeparture = false;
    nativeLobbySuppressionReturnState = null;
    router.replace("/lobby").catch(error => console.error("[ZFX Client] Lobby show failed:", error));
  };
  window.__fx.onGameReturnedToLobby = () => {
    nativeMatchActive = false;
    classicSessionDisabled = false;
    customLobbyReturnLatched = true;
    nativeLobbyReturnPending = true;
    nativeLobbyReturnUntil = Date.now() + 6000;
    nativeLobbySuppressionRoot = null;
    nativeLobbySuppressionSawDeparture = false;
    nativeLobbySuppressionReturnState = null;
    window.__fx.lobbyChatChannelRequested = false;
    window.dispatchEvent(new Event("fx-native-lobby-return-chat"));
    syncRoute();
    let attempts = 0;
    const restoreLobby = () => {
      if (attempts++ >= 24) {
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
    if (nextState === 0) {
      nativeLobbyBackgroundImage = captureGameCanvasImage() || nativeLobbyBackgroundImage;
    }
    window.dispatchEvent(new CustomEvent("fx-native-menu-state-change", { detail: { previousState, nextState } }));
    if (multiplayerLobbyRequested) {
      if (nextState === 0) multiplayerLobbyStateObserved = true;
      else if (multiplayerLobbyStateObserved) {
        multiplayerLobbyRequested = false;
        multiplayerLobbyStateObserved = false;
      }
    }
    // Returning from a match can reach the native lobby through a different
    // menu path than the patched game-end handler. State 0 is the game's
    // original lobby; use that transition as a second, native return signal.
    if (nextState === 0 && (previousState !== 0 || nativeMatchActive)
      && !nativeLobbyReturnPending && !multiplayerLobbyRequested) {
      window.__fx.onGameReturnedToLobby?.();
    }
    if (nextState === 0) syncRoute();
    else if (multiplayerLobbyRequested) syncRoute();
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
    gameState: window.__fx?.getGameVar?.("gameState"),
    shellFound: Boolean(shell),
    routerPath: router.currentRoute.value.path,
  });
  syncRoute();
  const joinLinkMatch = /^\/join\/([1-9][0-9]*)\/?$/.exec(window.location.pathname);
  if (joinLinkMatch) {
    const entryId = Number(joinLinkMatch[1]);
    let attempts = 0;
    let multiplayerStartRequested = false;
    joinLinkPollTimer = window.setInterval(() => {
      attempts += 1;
      const fx = window.__fx;
      const lobby = fx?.gameSdk?.lobby;
      const lobbyState = lobby?.getSnapshot?.();
      const entryAvailable = lobbyState?.entries?.some(entry => Number(entry.id) === entryId);
      if (entryAvailable) {
        const alreadyJoined = Number(lobbyState.selectedEntryId) === entryId
          && lobbyState.selectedEntryMode === "joined";
        if (alreadyJoined || lobby.selectEntry(entryId, "joined")) {
          window.clearInterval(joinLinkPollTimer);
          joinLinkPollTimer = 0;
          window.history.replaceState(null, "", "/");
          console.info("[ZFX Client LobbyView] Joined game from share link", { entryId });
          return;
        }
      }
      const startMultiplayer = fx?.startMultiplayerFromHome ?? fx?.startMultiplayer;
      if (!multiplayerStartRequested && typeof startMultiplayer === "function") {
        multiplayerStartRequested = true;
        try { startMultiplayer.call(fx); }
        catch (error) {
          multiplayerStartRequested = false;
          console.warn("[ZFX Client LobbyView] Could not open the lobby for a game link:", error);
        }
      }
      if (attempts >= 120) {
        window.clearInterval(joinLinkPollTimer);
        joinLinkPollTimer = 0;
        const isGerman = /^de/i.test(String(fx?.getGameLanguage?.() ?? navigator.language));
        window.alert(isGerman
          ? "Dieses Spiel ist nicht mehr in der Lobby verfügbar."
          : "This game is no longer available in the lobby.");
        window.history.replaceState(null, "", "/");
      }
    }, 250);
  }
  routeTimer = window.setInterval(() => {
    if (!disposed) syncRoute();
  }, 250);

  return () => {
    disposed = true;
    window.clearInterval(routeTimer);
    if (joinLinkPollTimer) window.clearInterval(joinLinkPollTimer);
    joinLinkPollTimer = 0;
    unsubscribeMatchStarted();
    stopBotProtectionObserver();
    if (app._instance) app.unmount();
    mount.remove();
    if (window.__fx?.navigateFxView) delete window.__fx.navigateFxView;
    if (window.__fx?.clearMapImageCache === clearMapImageCache) delete window.__fx.clearMapImageCache;
    if (window.__fx?.onNativeMapPreview === onNativeMapPreview) delete window.__fx.onNativeMapPreview;
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
