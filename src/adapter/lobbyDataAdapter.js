const EMPTY_SNAPSHOT = Object.freeze({
  source: "none",
  players: [],
  chatChannel: "lobby",
  chatMessages: [],
  upcomingGames: [],
  modes: [],
  currentMap: "",
  currentMapImage: "",
  lobbyBackgroundImage: "",
  currentTeamCountLabel: "",
    currentGameModeLabel: "",
  currentGameModeKey: "",
  nextMap: "",
  nextMapImage: "",
  nextGameEntryId: null,
  rosterEntryId: null,
  currentMapEntryId: null,
  nextGameCountdownSeconds: null,
  nextGamePlayerCount: null,
  nextTeamCountLabel: "",
    nextGameModeLabel: "",
  nextGameModeKey: "",
  readyCount: 0,
  playerCount: 0,
  progressPercent: null,
});

function normalizePlayer(player) {
  const participation = ["joined", "spectator", "none"].includes(player.participation) ? player.participation : "none";
  const readiness = ["ready", "not-ready"].includes(player.readiness) ? player.readiness : "unknown";
  const rankValue = player.rank == null || player.rank === "" ? NaN : Number(player.rank);
  const rankCodeValue = player.rankCode == null || player.rankCode === "" ? NaN : Number(player.rankCode);
  return {
    id: String(player.id ?? ""),
    name: String(player.name ?? ""),
    clan: player.clan ? String(player.clan).toLocaleUpperCase() : null,
    readiness: participation === "spectator" && readiness === "ready" ? "not-ready" : readiness,
    participation,
    entryId: player.entryId != null && Number.isInteger(Number(player.entryId)) ? Number(player.entryId) : null,
    readyEntryLabel: String(player.readyEntryLabel ?? ""),
    readyEntryModeKey: ["team", "battle-royale", "duel", "zombie"].includes(player.readyEntryModeKey) ? player.readyEntryModeKey : "",
    readyEntryModeLabel: String(player.readyEntryModeLabel ?? ""),
    readyEntryMapName: String(player.readyEntryMapName ?? ""),
    readyEntryTeamCountLabel: String(player.readyEntryTeamCountLabel ?? ""),
    rank: Number.isFinite(rankValue) && rankValue > 0 ? rankValue
      : Number.isFinite(rankCodeValue) && rankCodeValue >= 0 ? rankCodeValue + 1 : null,
    rankText: String(player.rankText ?? ""),
    followed: player.followed === true,
    self: player.self === true,
    color: typeof player.color === "string" ? player.color : "",
    territoryBorderColor: typeof player.territoryBorderColor === "string" ? player.territoryBorderColor : "",
    title: typeof player.title === "string" ? player.title : "",
    nativeElement: player.nativeElement ?? null,
  };
}

function normalizeSnapshot(snapshot, source, previousSnapshot = EMPTY_SNAPSHOT) {
  const players = Array.isArray(snapshot?.players) ? snapshot.players.map(normalizePlayer) : [];
  const percentage = snapshot?.progressPercent == null ? NaN : Number(snapshot.progressPercent);
  const reportedPlayers = Number(snapshot?.playerCount);
  const reportedReady = Number(snapshot?.readyCount);
  const playerCount = Number.isInteger(reportedPlayers) && reportedPlayers >= 0 ? reportedPlayers : players.length;
  const readyCount = Number.isInteger(reportedReady) && reportedReady >= 0
    ? Math.min(reportedReady, playerCount)
    : players.filter(player => player.readiness === "ready").length;
  return {
    source,
    players,
    chatChannel: "lobby",
    upcomingGames: Array.isArray(snapshot?.upcomingGames) ? snapshot.upcomingGames.map(game => ({
      id: Number.isInteger(Number(game.id)) ? Number(game.id) : null,
      countdownSeconds: game.countdownSeconds != null && Number.isFinite(Number(game.countdownSeconds)) ? Number(game.countdownSeconds) : null,
      playerCount: game.playerCount != null && Number.isFinite(Number(game.playerCount)) ? Number(game.playerCount) : null,
      maxPlayers: game.maxPlayers != null && Number.isFinite(Number(game.maxPlayers)) ? Number(game.maxPlayers) : null,
      readyCount: game.readyCount != null && Number.isFinite(Number(game.readyCount)) ? Number(game.readyCount) : null,
      players: Array.isArray(game.players) ? game.players.map(player => {
        const name = String(player.name ?? "");
        const clan = player.clan || name.match(/\[([^\]]{1,16})\]/)?.[1] || null;
        return normalizePlayer({
          ...player,
          clan,
          rank: player.rank ?? (player.rankCode != null && player.rankCode !== ""
            && Number.isFinite(Number(player.rankCode)) && Number(player.rankCode) >= 0
            ? Number(player.rankCode) + 1 : null),
          readiness: player.readiness ?? (player.ready === true ? "ready" : player.ready === false ? "not-ready" : "unknown"),
        });
      }) : null,
      mapIndex: game.mapIndex != null && Number.isFinite(Number(game.mapIndex)) ? Number(game.mapIndex) : null,
      mapName: String(game.mapName ?? ""),
      mapImage: String(game.mapImage ?? ""),
      mapSeed: game.mapSeed != null && Number.isFinite(Number(game.mapSeed)) ? Number(game.mapSeed) : null,
      modeCode: game.modeCode != null && Number.isFinite(Number(game.modeCode)) ? Number(game.modeCode) : null,
      modeKey: String(game.modeKey ?? "unknown"),
      modeLabel: String(game.modeLabel ?? ""),
      teamCountLabel: String(game.teamCountLabel ?? ""),
      isContest: game.isContest === true,
      selected: game.selected === true,
      active: game.active === true,
      joined: game.joined === true,
      spectating: game.spectating === true,
    })) : [],
    chatMessages: Array.isArray(snapshot?.chatMessages) ? snapshot.chatMessages
      .map((message, index) => ({
        id: String(message.id ?? index),
        rawText: String(message.rawText ?? message.text ?? "").trim(),
        text: String(message.text ?? "").trim(),
        senderId: Number.isInteger(Number(message.senderId)) ? Number(message.senderId) : null,
        senderName: String(message.senderName ?? ""),
        senderColor: typeof message.senderColor === "string" ? message.senderColor : "",
        senderTerritoryColor: typeof message.senderTerritoryColor === "string" ? message.senderTerritoryColor : "",
        receivedAt: Number.isFinite(Number(message.receivedAt)) ? Number(message.receivedAt) : Date.now(),
        system: message.system === true,
        nativeType: message.nativeType != null && Number.isInteger(Number(message.nativeType)) ? Number(message.nativeType) : null,
        confirmationMode: ["ui", "chat", "auto"].includes(message.confirmationMode) ? message.confirmationMode : null,
        confirmationState: ["pending", "confirmed", "cancelled"].includes(message.confirmationState) ? message.confirmationState : null,
        segments: Array.isArray(message.segments) ? message.segments.map(segment => ({
          text: String(segment?.text ?? ""),
          color: typeof segment?.color === "string" ? segment.color : "",
          resolvedPlayer: segment?.resolvedPlayer === true,
          mentionId: segment?.mentionId != null && Number.isInteger(Number(segment.mentionId))
            ? Number(segment.mentionId) : null,
        })) : [],
      }))
      .filter(message => message.text)
      .slice(-60) : [],
    modes: Array.isArray(snapshot?.modes) ? snapshot.modes.map(mode => {
      const id = String(mode.id ?? "");
      const previous = previousSnapshot?.modes?.find(item => String(item.id) === id);
      const label = String(mode.label ?? previous?.label ?? "");
      return {
        id,
        label,
        clock: String(mode.clock || previous?.clock || ""),
        count: String(mode.count || previous?.count || ""),
        map: String(mode.map || previous?.map || ""),
        // Team counts describe the current map/mode selection and can change
        // independently of the mode tab. Never carry a previous count forward.
        teamCountLabel: /team/i.test(label)
          ? String(mode.teamCountLabel || previous?.teamCountLabel || "") : "",
        isContest: mode.isContest === true || previous?.isContest === true,
        active: mode.active === true,
        nativeElement: mode.nativeElement ?? previous?.nativeElement ?? null,
      };
    }) : [],
    currentMap: String(snapshot?.currentMap ?? ""),
    currentMapImage: String(snapshot?.currentMapImage
      ?? (String(snapshot?.currentMap ?? "") === previousSnapshot?.currentMap ? previousSnapshot.currentMapImage : "") ?? ""),
    lobbyBackgroundImage: String(snapshot?.lobbyBackgroundImage ?? previousSnapshot?.lobbyBackgroundImage ?? ""),
    currentTeamCountLabel: String(snapshot?.currentTeamCountLabel ?? ""),
    currentGameModeLabel: String(snapshot?.currentGameModeLabel ?? ""),
    currentGameModeKey: String(snapshot?.currentGameModeKey ?? ""),
    nextMap: String(snapshot?.nextMap ?? ""),
    nextGameEntryId: snapshot?.nextGameEntryId != null && Number.isInteger(Number(snapshot.nextGameEntryId)) ? Number(snapshot.nextGameEntryId) : null,
    rosterEntryId: snapshot?.rosterEntryId != null && Number.isInteger(Number(snapshot.rosterEntryId)) ? Number(snapshot.rosterEntryId) : null,
    currentMapEntryId: snapshot?.currentMapEntryId != null && Number.isInteger(Number(snapshot.currentMapEntryId)) ? Number(snapshot.currentMapEntryId) : null,
    nextGameCountdownSeconds: snapshot?.nextGameCountdownSeconds != null && Number.isFinite(Number(snapshot.nextGameCountdownSeconds))
      ? Number(snapshot.nextGameCountdownSeconds) : null,
    nextGamePlayerCount: snapshot?.nextGamePlayerCount != null && Number.isFinite(Number(snapshot.nextGamePlayerCount))
      ? Number(snapshot.nextGamePlayerCount) : null,
    nextMapImage: String(snapshot?.nextMapImage
      ?? (String(snapshot?.nextMap ?? "") === previousSnapshot?.nextMap ? previousSnapshot.nextMapImage : "") ?? ""),
    nextTeamCountLabel: String(snapshot?.nextTeamCountLabel ?? ""),
    nextGameModeLabel: String(snapshot?.nextGameModeLabel ?? ""),
    nextGameModeKey: String(snapshot?.nextGameModeKey ?? ""),
    isContest: snapshot?.isContest === true || snapshot?.modes?.find(mode => mode.active)?.isContest === true,
    nextIsContest: typeof snapshot?.nextIsContest === "boolean" ? snapshot.nextIsContest : null,
    noFullsend: snapshot?.noFullsend === true,
    nextNoFullsend: snapshot?.nextNoFullsend === true,
    readyCount,
    playerCount,
    progressPercent: Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : null,
  };
}

function mergeChatMessages(previous, incoming) {
  const isLobbyMetrics = message => /^MP:\s*\d+\s+SP:\s*\d+\s+Lobby:\s*\d+\s*$/i.test(message.text);
  const retained = previous.filter(message => !isLobbyMetrics(message));
  const cleanIncoming = (Array.isArray(incoming) ? incoming : []).filter(message => !isLobbyMetrics(message));
  if (cleanIncoming.length === 0) return retained.length === previous.length ? previous : retained;
  const byId = new Map(retained.map((message, index) => [message.id, index]));
  const merged = [...retained];
  for (const message of cleanIncoming) {
    const existingIndex = byId.get(message.id);
    if (existingIndex !== undefined) {
      merged[existingIndex] = message;
      continue;
    }
    // Keep repeated text when it has distinct stable IDs; only legacy entries
    // without a meaningful source identity use text as their duplicate key.
    if (!message.id || /^\d+$/.test(message.id)) {
      if (merged.some(existing => existing.id === message.id || existing.text === message.text)) continue;
    }
    byId.set(message.id, merged.length);
    merged.push(message);
  }
  return merged.slice(-300);
}

/** Stable normalized boundary between the game data source and lobby UI. */
export function createLobbyDataAdapter() {
  let snapshot = EMPTY_SNAPSHOT;
  const listeners = new Set();
  const chatHistoryByChannel = new Map();

  function publish(nextSnapshot, source = "game") {
    const normalized = normalizeSnapshot(nextSnapshot, source, snapshot);
    const channelHistory = chatHistoryByChannel.get(normalized.chatChannel) ?? [];
    normalized.chatMessages = mergeChatMessages(channelHistory, normalized.chatMessages);
    chatHistoryByChannel.set(normalized.chatChannel, normalized.chatMessages);
    snapshot = normalized;
    for (const listener of listeners) listener(snapshot);
    return snapshot;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener(snapshot);
    return () => listeners.delete(listener);
  }

  return {
    getSnapshot: () => snapshot,
    publish,
    subscribe,
    clear() {
      snapshot = EMPTY_SNAPSHOT;
      for (const listener of listeners) listener(snapshot);
    },
    clearChatHistory() {
      chatHistoryByChannel.clear();
      snapshot = { ...snapshot, chatMessages: [] };
      for (const listener of listeners) listener(snapshot);
    },
  };
}
