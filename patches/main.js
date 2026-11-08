import ModUtils from "../modUtils.js";
import customLobby from "./customLobby.js";
import duplicateIpHighlight from "./duplicateIpHighlight.js";
import followedAccounts from "./followedAccounts.js";
import gameSdk from "./gameSdk.js";
import highlightSpawnpoints from "./highlightSpawnpoints.js";
import hoveringTooltip from "./hoveringTooltip.js";
import leaderboard from "./leaderboard.js";
import lobbyLayout from "./lobbyLayout.js";
import lobbyReminders from "./lobbyReminders.js";
import misc from "./misc.js";
import mobileKeybinds from "./mobileKeybinds.js";
import nameFilter from "./nameFilter.js";
import nameRendering from "./nameRendering.js";
import passwordReset from "./passwordReset.js";
import gamePatches from "./patches.js";
import pingFilter from "./pingFilter.js";
import quickEmojis from "./quickEmojis.js";
import replayHistory from "./replayHistory.js";
import replayTimebar from "./replayTimebar.js";
import savedAccounts from "./savedAccounts.js";
import selfTerritoryHighlight from "./selfTerritoryHighlight.js";
import titanChatButton from "./titanChatButton.js";

// Preserve the current application order explicitly. Patch dependencies and
// post-minification callbacks should not depend on filesystem enumeration.
export const patchRegistry = [
    ["customLobby.js", customLobby],
    ["duplicateIpHighlight.js", duplicateIpHighlight],
    ["followedAccounts.js", followedAccounts],
    ["gameSdk.js", gameSdk],
    ["highlightSpawnpoints.js", highlightSpawnpoints],
    ["hoveringTooltip.js", hoveringTooltip],
    ["leaderboard.js", leaderboard],
    ["lobbyLayout.js", lobbyLayout],
    ["lobbyReminders.js", lobbyReminders],
    ["misc.js", misc],
    ["mobileKeybinds.js", mobileKeybinds],
    ["nameFilter.js", nameFilter],
    ["nameRendering.js", nameRendering],
    ["passwordReset.js", passwordReset],
    ["patches.js", gamePatches],
    ["pingFilter.js", pingFilter],
    ["quickEmojis.js", quickEmojis],
    ["replayHistory.js", replayHistory],
    ["replayTimebar.js", replayTimebar],
    ["savedAccounts.js", savedAccounts],
    ["selfTerritoryHighlight.js", selfTerritoryHighlight],
    ["titanChatButton.js", titanChatButton],
];

/** @param {ModUtils} modUtils @param {[string, (modUtils: ModUtils) => unknown][]} registry @param {{ continueOnError?: boolean }} [options] */
export function applyPatchRegistry(modUtils, registry = patchRegistry, options = {}) {
    const names = new Set();
    for (const [name, patch] of registry) {
        if (names.has(name)) throw new Error(`Duplicate game patch registration: ${name}`);
        if (typeof patch !== "function") throw new Error(`Invalid game patch registration: ${name}`);
        names.add(name);
        console.info(`[ZFX Client] Applying game patch: ${name}`);
        // A game update can change one native hook without invalidating the
        // rest of the client. Apply each patch atomically so an obsolete hook
        // neither leaves a half-patched game script nor blocks the build.
        const originalScript = modUtils.script;
        const originalDictionary = modUtils.dictionary ? { ...modUtils.dictionary } : null;
        const handlers = Array.isArray(modUtils.postMinifyHandlers) ? modUtils.postMinifyHandlers : null;
        const originalHandlers = handlers ? [...handlers] : null;
        try {
            patch(modUtils);
        } catch (error) {
            if (originalScript !== undefined) modUtils.script = originalScript;
            if (originalDictionary && modUtils.dictionary) {
                for (const key of Object.keys(modUtils.dictionary)) delete modUtils.dictionary[key];
                Object.assign(modUtils.dictionary, originalDictionary);
            }
            if (originalHandlers && Array.isArray(modUtils.postMinifyHandlers)) {
                modUtils.postMinifyHandlers.splice(0, modUtils.postMinifyHandlers.length, ...originalHandlers);
            }
            if (!options.continueOnError) throw error;
            console.warn(`[ZFX Client] Skipping incompatible game patch ${name}:`, error);
        }
    }
}

export default function applyPatches(/** @type {ModUtils} */ modUtils) {
    applyPatchRegistry(modUtils, patchRegistry, { continueOnError: true });
}
