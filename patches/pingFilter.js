import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
    const { matchCode, replace } = modUtils;

    try {
        matchCode(`if (!isNaN(mentionIndex) && mentionIndex >= 0 && mentionIndex < languageHolder.languageData.languageCodes.length) {
            text = text.replace("@" + mention, "@" + languageHolder.languageData.languageCodes[mentionIndex])
        }`, { addToDictionary: ["languageHolder", "languageData", "languageCodes"] });
    } catch { console.info("[ZFX Client] Native legacy mention normalization hook is absent in this game version."); }

    // The current native build queues decoded messages in aGR.aIa as aHS.
    // Filtering at the queue boundary also prevents muted mentions from
    // opening a notification popup or playing its sound. When Vue owns the
    // lobby, defer the native sound until its notification has been surfaced.
    const nativeSoundHook = /aJX\.push\(aIJ\);!bm\.buffer\.data\[14\]\.value&&aIJ\.id!==7&&bt\.play\(\);?/g;
    const before = modUtils.script;
    replace(nativeSoundHook,
        'if(window.__fx?.pingFilter?.isMuted?.(aIJ,"s"))return;aIJ.__fxSoundAllowed=!bm.buffer.data[14].value&&aIJ.id!==7;aJX.push(aIJ);if(aIJ.__fxSoundAllowed&&!aIJ.__fxSoundPlayed){aIJ.__fxSoundPlayed=true;bt.play();}');
    if (modUtils.script === before) console.info("[ZFX Client] Native lobby notification sound hook is absent in this game version.");
})
