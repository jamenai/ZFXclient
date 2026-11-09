import ModUtils from "../modUtils.js";
import { patchLobbyLayout } from "../patchUtils/lobbyLayoutAst.js";

export default (/** @type {ModUtils} */ modUtils) => {
    try {
        const result = patchLobbyLayout(modUtils.script);
        modUtils.script = result.script;
        console.info(`[ZFX Client] Lobby AST patches: ${result.results.length}/${result.results.length} applied.`);
    } catch (error) {
        if (!String(error?.message).includes("Expected one lobby resize function, found 0")) throw error;
        console.info("[ZFX Client] Native lobby resize hook is absent; lobby sizing is handled by the Vue lobby view.");
    }
};
