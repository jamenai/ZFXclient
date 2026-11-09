const EMPTY_LOBBY = Object.freeze({
  source: "none",
  revision: 0,
  selectedEntryId: null,
  entries: Object.freeze([]),
});

const ENTRY_FIELDS = ["countdownSeconds", "playerCount", "maxPlayers", "mapIndex", "mapSeed", "modeCode", "isContest", "readyCount", "players"];

/** Stable public facade over values decoded by the native game client. */
export function createGameSdk({ getMapNames = () => null } = {}) {
  let lobbySnapshot = EMPTY_LOBBY;
  let latestNativeEntries = [];
  let selectedEntryId = null;
  let nativeEntrySelector = null;
  const rostersByEntryId = new Map();
  let roster = Object.freeze({
    entryId: null,
    selectedEntryIdAtUpdate: null,
    sequence: null,
    updateNumber: 0,
    updatedAt: null,
    readyCount: 0,
    playerCount: 0,
    players: Object.freeze([]),
  });
  let nativeUpdateCount = 0;
  let lastNativeUpdateAt = null;
  let activeSequence = null;
  let lastSequence = null;
  let matchStartCount = 0;
  let currentMatch = null;
  const eventListeners = new Map();
  const snapshotListeners = new Set();

  function emit(type, detail) {
    for (const listener of eventListeners.get(type) ?? []) {
      try { listener(detail); } catch (error) { console.error("[ZFX SDK] Event listener failed:", type, error); }
    }
    for (const listener of eventListeners.get("*") ?? []) {
      try { listener({ type, detail }); } catch (error) { console.error("[ZFX SDK] Event listener failed:", type, error); }
    }
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    snapshotListeners.add(listener);
    try { listener(lobbySnapshot); } catch (error) { console.error("[ZFX SDK] Lobby subscriber failed:", error); }
    return () => snapshotListeners.delete(listener);
  }

  function on(type, listener) {
    if (typeof listener !== "function") return () => {};
    const listeners = eventListeners.get(type) ?? new Set();
    listeners.add(listener);
    eventListeners.set(type, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) eventListeners.delete(type);
    };
  }

  function publishSnapshot(source) {
    let mapNames = null;
    try { mapNames = getMapNames(); } catch { /* Keep protocol data available if map metadata is not ready. */ }
    const entries = latestNativeEntries.map((entry, index) => {
      const id = Number(entry?.id);
      const mapIndex = Number(entry?.fG);
      const modeCode = Number(entry?.w2);
      const maxPlayersValue = entry?.MaxPlayers ?? entry?.maxPlayers ?? entry?.max_players;
      return Object.freeze({
        id: Number.isInteger(id) ? id : null,
        index,
        selected: Number.isInteger(id) && id === selectedEntryId,
        countdownSeconds: Number(entry?.wN),
        playerCount: Number(entry?.h3),
        maxPlayers: maxPlayersValue != null && Number.isFinite(Number(maxPlayersValue))
          ? Number(maxPlayersValue) : null,
        mapIndex,
        mapName: Number.isInteger(mapIndex) ? String(mapNames?.[mapIndex] ?? "") : "",
        mapSeed: Number(entry?.mapSeed),
        modeCode,
        isContest: entry?.wR === 1,
        readyCount: rostersByEntryId.get(id)?.readyCount ?? null,
        players: rostersByEntryId.get(id)?.players ?? null,
      });
    });
    const next = Object.freeze({
      source,
      sequence: activeSequence,
      revision: lobbySnapshot.revision + 1,
      selectedEntryId,
      rosterEntryId: roster.entryId,
      readyCount: roster.readyCount,
      playerCount: roster.playerCount,
      players: roster.players,
      entries: Object.freeze(entries),
    });

    const previousById = new Map(lobbySnapshot.entries.filter(entry => entry.id !== null).map(entry => [entry.id, entry]));
    const nextById = new Map(entries.filter(entry => entry.id !== null).map(entry => [entry.id, entry]));
    for (const entry of entries) {
      const previous = previousById.get(entry.id);
      if (!previous) emit("lobby.entry.added", entry);
      else if (ENTRY_FIELDS.some(field => previous[field] !== entry[field])) {
        emit("lobby.entry.updated", Object.freeze({ previous, current: entry }));
      }
    }
    for (const entry of lobbySnapshot.entries) {
      if (entry.id !== null && !nextById.has(entry.id)) emit("lobby.entry.removed", entry);
    }

    const previousSelectedId = lobbySnapshot.selectedEntryId;
    lobbySnapshot = next;
    for (const listener of snapshotListeners) {
      try { listener(lobbySnapshot); } catch (error) { console.error("[ZFX SDK] Lobby subscriber failed:", error); }
    }
    emit("lobby.updated", lobbySnapshot);
    if (previousSelectedId !== selectedEntryId) {
      emit("lobby.selection", Object.freeze({ previousId: previousSelectedId, currentId: selectedEntryId }));
    }
    return lobbySnapshot;
  }

  function receiveNativeEntries(entries, selectedId = selectedEntryId) {
    if (!Array.isArray(entries)) return false;
    latestNativeEntries = entries.map(entry => ({ ...entry }));
    const parsedSelectedId = Number(selectedId);
    selectedEntryId = Number.isInteger(parsedSelectedId) && parsedSelectedId > 0
      && latestNativeEntries.some(entry => Number(entry?.id) === parsedSelectedId) ? parsedSelectedId : null;
    const currentEntryIds = new Set(latestNativeEntries.map(entry => Number(entry?.id)).filter(Number.isInteger));
    for (const id of rostersByEntryId.keys()) {
      if (!currentEntryIds.has(id)) rostersByEntryId.delete(id);
    }
    nativeUpdateCount++;
    lastNativeUpdateAt = Date.now();
    publishSnapshot("native-websocket-decoded");
    return true;
  }

  function receiveNativeSelection(id) {
    const nextId = Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : null;
    if (nextId === selectedEntryId) return false;
    selectedEntryId = nextId;
    publishSnapshot("native-selection");
    return true;
  }

  function receiveNativePlayers(players, entries = latestNativeEntries, selectedId = selectedEntryId, sequence = null) {
    if (!Array.isArray(players)) return false;
    const normalizedPlayers = players.map((player, index) => Object.freeze({
      id: Number.isInteger(Number(player?.ua)) ? Number(player.ua) : null,
      name: String(player?.username ?? ""),
      ready: Number(player?.wk) > 0,
      entryId: Number.isInteger(Number(player?.wk)) && Number(player.wk) > 0 ? Number(player.wk) : null,
      rankCode: Number.isFinite(Number(player?.a75)) && Number(player.a75) >= 0 && Number(player.a75) !== 1234566
        ? Number(player.a75) : null,
      rankText: String(window.__fx?.getNativeLobbyPlayerRankText?.(player) ?? ""),
      colorCode: Number.isFinite(Number(player?.color)) ? Number(player.color) : null,
    }));
    const entryList = Array.isArray(entries) ? entries : latestNativeEntries;
    for (const entry of entryList) {
      const id = Number(entry?.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      const entryPlayers = normalizedPlayers.filter(player => player.entryId === id);
      const previous = rostersByEntryId.get(id);
      const entryRoster = Object.freeze({
        entryId: id,
        selectedEntryIdAtUpdate: Number.isInteger(Number(selectedId)) && Number(selectedId) > 0 ? Number(selectedId) : null,
        sequence: sequence || activeSequence,
        updateNumber: (previous?.updateNumber ?? 0) + 1,
        updatedAt: Date.now(),
        readyCount: entryPlayers.length,
        playerCount: entryPlayers.length,
        players: Object.freeze(entryPlayers),
      });
      rostersByEntryId.set(id, entryRoster);
    }
    const parsedEntryId = Number(entryList.find(entry => Number(entry?.id) === Number(selectedId))?.id ?? entryList[0]?.id);
    const currentEntryPlayers = normalizedPlayers.filter(player => player.entryId === parsedEntryId);
    roster = Object.freeze({
      entryId: Number.isInteger(parsedEntryId) && parsedEntryId > 0 ? parsedEntryId : null,
      selectedEntryIdAtUpdate: Number.isInteger(Number(selectedId)) && Number(selectedId) > 0 ? Number(selectedId) : null,
      sequence: sequence || activeSequence,
      updateNumber: roster.updateNumber + 1,
      updatedAt: Date.now(),
      readyCount: currentEntryPlayers.length,
      playerCount: normalizedPlayers.length,
      // The lobby-wide player list includes everyone. `entryId` and `ready`
      // describe each player's upcoming-game assignment; they must not filter
      // players out of the shared roster.
      players: Object.freeze(normalizedPlayers),
    });
    if (roster.entryId !== null) rostersByEntryId.set(roster.entryId, roster);
    publishSnapshot("native-websocket-roster");
    emit("lobby.players.updated", roster);
    return true;
  }

  function beginNativeSequence(name) {
    activeSequence = String(name || "unknown");
    emit("protocol.sequence", Object.freeze({ name: activeSequence, phase: "begin", at: Date.now() }));
  }

  function endNativeSequence(name) {
    const completed = String(name || activeSequence || "unknown");
    lastSequence = completed;
    emit("protocol.sequence", Object.freeze({ name: completed, phase: "end", at: Date.now() }));
    activeSequence = null;
  }

  function reportNativeMatchStart(nativeMatch) {
    const match = Object.freeze({
      id: ++matchStartCount,
      source: "native-websocket-decoded",
      startedAt: Date.now(),
      mapIndex: Number(nativeMatch?.mapIndex),
      modeCode: Number(nativeMatch?.modeCode),
      mapSeed: Number(nativeMatch?.mapSeed),
      isContest: nativeMatch?.isContest === 1 || nativeMatch?.isContest === true,
      playerCount: Number(nativeMatch?.playerCount),
      gameMode: Number(nativeMatch?.gameMode),
      numberTeams: Number.isFinite(Number(nativeMatch?.numberTeams)) ? Number(nativeMatch.numberTeams) : null,
      isZombieMode: nativeMatch?.isZombieMode === 1 || nativeMatch?.isZombieMode === true,
      battleRoyaleMode: Number.isFinite(Number(nativeMatch?.battleRoyaleMode)) ? Number(nativeMatch.battleRoyaleMode) : null,
      mapType: Number(nativeMatch?.mapType),
    });
    currentMatch = match;
    emit("match.started", match);
    return match;
  }

  return Object.freeze({
    apiVersion: 1,
    on,
    protocol: Object.freeze({
      beginNativeSequence,
      endNativeSequence,
      getDiagnostics: () => ({ activeSequence, lastSequence }),
    }),
    lobby: Object.freeze({
      getSnapshot: () => lobbySnapshot,
      /** Returns the latest upcoming-game entries received from the active lobby stream. */
      getUpcomingGames: () => lobbySnapshot.entries,
      subscribe,
      receiveNativeEntries,
      receiveNativeSelection,
      deselectEntry() {
        const selector = nativeEntrySelector ?? window.__fx?.nativeSelectLobbyEntry;
        if (typeof selector !== "function") return false;
        try { return selector(0) !== false; }
        catch (error) {
          console.warn("[ZFX SDK] Could not clear lobby entry selection:", error);
          return false;
        }
      },
      selectEntry(id) {
        const entryId = Number(id);
        if (Number.isInteger(entryId) && entryId === lobbySnapshot.selectedEntryId) {
          const selector = nativeEntrySelector ?? window.__fx?.nativeSelectLobbyEntry;
          if (typeof selector !== "function") return false;
          try { return selector(0) !== false; }
          catch (error) {
            console.warn("[ZFX SDK] Could not clear lobby entry selection:", error);
            return false;
          }
        }
        const selector = nativeEntrySelector ?? window.__fx?.nativeSelectLobbyEntry;
        if (!Number.isInteger(entryId) || !lobbySnapshot.entries.some(entry => entry.id === entryId)
          || typeof selector !== "function") return false;
        try { return selector(entryId) !== false; }
        catch (error) {
          console.warn("[ZFX SDK] Could not select lobby entry:", error);
          return false;
        }
      },
      setNativeEntrySelector(selector) {
        nativeEntrySelector = typeof selector === "function" ? selector : null;
      },
      receiveNativePlayers,
      getPlayers: () => roster.players,
      getPlayersForEntry: id => rostersByEntryId.get(Number(id))?.players ?? null,
      getRosterTrace: () => roster,
      getRostersByEntry: () => Object.fromEntries(rostersByEntryId),
      getDiagnostics: () => ({
        nativeUpdateCount,
        lastNativeUpdateAt,
        entryCount: lobbySnapshot.entries.length,
        selectedEntryId: lobbySnapshot.selectedEntryId,
        source: lobbySnapshot.source,
        sequence: lobbySnapshot.sequence,
        rosterEntryId: roster.entryId,
        rosterSelectedEntryIdAtUpdate: roster.selectedEntryIdAtUpdate,
        rosterSequence: roster.sequence,
        rosterUpdateNumber: roster.updateNumber,
        rosterUpdatedAt: roster.updatedAt,
        readyCount: roster.readyCount,
        playerCount: roster.playerCount,
        players: roster.players,
        rosterEntryIds: [...rostersByEntryId.keys()],
        entries: lobbySnapshot.entries,
      }),
    }),
    match: Object.freeze({
      getCurrent: () => currentMatch,
      reportNativeStart: reportNativeMatchStart,
      getDiagnostics: () => ({ matchStartCount, currentMatch }),
    }),
  });
}
