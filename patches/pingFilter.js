import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
    const { matchCode, replace } = modUtils;

    matchCode(`if (!isNaN(mentionIndex) && mentionIndex >= 0 && mentionIndex < languageHolder.languageData.languageCodes.length) {
        text = text.replace("@" + mention, "@" + languageHolder.languageData.languageCodes[mentionIndex])
    }`, { addToDictionary: ["languageHolder", "languageData", "languageCodes"] })

    // The current native build queues decoded messages in aGR.aIa as aHS.
    // Filtering at the queue boundary also prevents muted mentions from
    // opening a notification popup or playing its sound. When Vue owns the
    // lobby, defer the native sound until its notification has been surfaced.
    const nativeSoundHook = /aJD\.push\(aI1\)[;,]!?bm\.buffer\.data\[14\]\.value&&aI1\.id!==7&&bs\.play\(\);?/g;
    const before = modUtils.script;
    replace(nativeSoundHook,
        'if(window.__fx?.pingFilter?.isMuted?.(aI1,"s"))return;aI1.__fxSoundAllowed=!bm.buffer.data[14].value&&aI1.id!==7;aJD.push(aI1);if(aI1.__fxSoundAllowed){if(window.__fx&&window.__fx.isCustomLobbyViewVisible&&window.__fx.isCustomLobbyViewVisible())window.__fx.playLobbyNotificationSound=function(){bs.play();};else bs.play();}');
    if (modUtils.script === before) console.info("[ZFX Client] Native lobby notification sound hook is absent in this game version.");
})
