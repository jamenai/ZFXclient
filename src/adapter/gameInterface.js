const playerDataProperties = [
    "playerTerritories",
    "playerBalances",
    "rawPlayerNames",
    "playerCommitted",
    "playerAlive",
    "playerStates"
];
const gameObjectProperties = [
    "playerId",
    "gIsTeamGame",
    "gHumans",
    "gBots",
    "gSpectators",
    "gLobbyMaxJoin",
    "gameState",
    "gMatchState",
    "gIsSingleplayer",
    "gIsReplay",
    "gSelectableSpawn",
    "uiHidden"
];
const replayRecorderProperties = [
    "tickFlags",
    "tickCounts"
];
const arrayLikeProperties = new Set([
    "playerTerritories",
    "playerBalances",
    "rawPlayerNames",
    "playerCommitted",
    "playerAlive",
    "playerStates",
    "tickFlags",
    "tickCounts",
]);
const numericProperties = new Set([
    "playerId",
    "gHumans",
    "gBots",
    "gSpectators",
    "gLobbyMaxJoin",
    "gameState",
    "gMatchState"
]);

function isArrayLike(value) {
    return value !== null && typeof value === "object"
        && Number.isInteger(value.length) && value.length >= 0;
}

/**
 * Creates an adapter around the game's changing global object layout.
 * @param {() => Record<string, any>} getTarget
 * @param {() => Record<string, string>} getDictionary
 */
export function createGameInterface(getTarget, getDictionary, onInvalidValue = (name, value) => {
    console.warn(`[ZFX Client] Ignoring game value "${name}" with unexpected shape:`, value);
}) {
    const getPath = (...keys) => keys.reduce((value, key) => value?.[getDictionary()[key]], getTarget());
    const reportedInvalidValues = new Set();

    const getValidatedVar = varName => {
        if (varName === "gIsTeamGame") {
            const gameType = getPath("game", "gGameType");
            return Number.isFinite(gameType) ? gameType < 7 || gameType === 9 : undefined;
        }
        let keys = [varName];
        if (playerDataProperties.includes(varName)) keys = ["playerData", varName];
        else if (gameObjectProperties.includes(varName)) keys = ["game", varName];
        else if (replayRecorderProperties.includes(varName)) keys = ["protocol", "replayRecorder", varName];
        const value = getPath(...keys);
        if (value === undefined || value === null) return value;

        const valid = arrayLikeProperties.has(varName) ? isArrayLike(value)
            : numericProperties.has(varName) ? Number.isFinite(value)
                : true;
        if (valid) return value;

        if (!reportedInvalidValues.has(varName)) {
            reportedInvalidValues.add(varName);
            onInvalidValue(varName, value);
        }
        return undefined;
    };

    return {
        getVar: getValidatedVar,
        getPlayerData(playerId) {
            if (!Number.isInteger(Number(playerId)) || Number(playerId) < 0) return null;
            const id = Number(playerId);
            const read = name => {
                const value = getValidatedVar(name)?.[id];
                const number = Number(value);
                return value == null || !Number.isFinite(number) ? null : number;
            };
            return {
                id,
                balance: read("playerBalances"),
                territories: read("playerTerritories"),
                committed: read("playerCommitted"),
                alive: read("playerAlive"),
                state: read("playerStates"),
            };
        },
        getUIGap() {
            return Math.floor(getPath("uiSizes", "gap") ?? 10);
        },
        getMapNames() {
            const names = getPath("mapHolder", "mapInfo", "mapNames");
            return Array.isArray(names) && names.length ? names : null;
        },
        getLanguageCodes() {
            const currentCodes = window.__fx?.getGameLanguageCodes?.();
            if (Array.isArray(currentCodes)) return currentCodes;
            const codes = getPath("languageHolder", "languageData", "languageCodes");
            return Array.isArray(codes) ? codes : null;
        },
        getEmojiTile(index) {
            return getPath("emojiHolder", "emojiPicker", "emojiTiles")?.[index];
        },
    };
}

const gameInterface = createGameInterface(() => window, () => dictionary);

export const getVar = gameInterface.getVar;
export const gameDataAdapter = gameInterface;
export const getUIGap = gameInterface.getUIGap;
export const getGameMapNames = gameInterface.getMapNames;
export const getGameLanguageCodes = gameInterface.getLanguageCodes;
export const getGameEmojiTile = gameInterface.getEmojiTile;
