import { settingsApi } from "./settings/settings.js";
import { describeGame, matchesFilters } from "./lobbyFilters.js";


const SOUND_REPEATS = 3;
const SOUND_INTERVAL = 260;

let rooms = null;
let selectedGame = null;
let playGameSound = null;
let showPopup = text => window.dispatchEvent(new CustomEvent("fx-lobby-notification", {
    detail: { id: 7, text },
}));
const entryStates = new Map();

function playReminderSound() {
    for (let i = 0; i < SOUND_REPEATS; i++) setTimeout(() => playGameSound?.(), i * SOUND_INTERVAL);
}

function setLobbySnapshot(snapshot) {
    rooms = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
    selectedGame = rooms.find(entry => entry.selected) ?? null;
    const currentIds = new Set(rooms.map(entry => entry.id).filter(Number.isInteger));
    for (const id of entryStates.keys()) {
        if (!currentIds.has(id)) entryStates.delete(id);
    }
    check();
}

function getSelectedRoom() {
    return selectedGame;
}

function getSelectedGame() {
    const room = getSelectedRoom();
    if (!room) return null;
    return {
        selectedId: room.id,
        map: room.mapIndex,
        mode: room.modeCode,
        isContest: room.isContest,
        countdownSeconds: room.countdownSeconds,
        playerCount: room.playerCount,
    };
}

function getRoomChatSummary() {
    if (!Array.isArray(rooms)) return [];
    return rooms.map(room => ({
        id: room.id,
        selected: room.selected,
        mapIndex: room.mapIndex,
        modeCode: room.modeCode,
        countdownSeconds: room.countdownSeconds,
        playerCount: room.playerCount,
    }));
}

function setSound(playSound) {
    playGameSound = playSound;
}

function setPopupHandler(handler) {
    showPopup = handler;
}

function check() {
    if (rooms === null) return;
    const rules = settingsApi.getArray("lobbyReminderRules");
    for (const room of rooms) {
        if (!Number.isInteger(room?.id)) continue;
        const timeLeft = Number(room.countdownSeconds);
        const state = entryStates.get(room.id) ?? { signature: "", timeLeft: NaN, reminded: false };
        const game = {
            map: room.mapIndex,
            mode: room.modeCode,
            isContest: room.isContest === true,
        };
        const signature = `${game.map}:${game.mode}:${game.isContest}:${room.mapSeed}`;
        if (signature !== state.signature || timeLeft > state.timeLeft) state.reminded = false;
        state.signature = signature;
        state.timeLeft = timeLeft;
        entryStates.set(room.id, state);
        if (state.reminded || rules.length === 0 || !matchesFilters(rules, game)) continue;
        state.reminded = true;
        const description = describeGame(game);
        console.log(`FX lobby reminder: ${description} (starts in ${timeLeft}s)`);
        showPopup?.(`Reminder: ${description}`);
        playReminderSound();
    }

}

export default { setLobbySnapshot, getSelectedRoom, getSelectedGame, getRoomChatSummary, setSound, setPopupHandler, check };
