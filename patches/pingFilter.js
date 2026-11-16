import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
    const { matchCode, replace } = modUtils;

    let currentLanguageCodesHookInstalled = false;
    const currentLanguageCodesHook = /this\.aGg=function\(\)\{/g;
    const beforeLanguageCodesHook = modUtils.script;
    modUtils.script = modUtils.script.replace(currentLanguageCodesHook,
        '$&window.__fx.getGameLanguageCodes=()=>Array.isArray(this.h)?this.h:null;');
    currentLanguageCodesHookInstalled = modUtils.script !== beforeLanguageCodesHook;

    try {
        matchCode(`if (!isNaN(mentionIndex) && mentionIndex >= 0 && mentionIndex < languageHolder.languageData.languageCodes.length) {
            text = text.replace("@" + mention, "@" + languageHolder.languageData.languageCodes[mentionIndex])
        }`, { addToDictionary: ["languageHolder", "languageData", "languageCodes"] });
    } catch {
        if (!currentLanguageCodesHookInstalled) console.info("[ZFX Client] Native language-code adapter hook is absent in this game version.");
    }

    // aHC.aHx receives Native Terri notification entries. Adapt confirmations
    // and clan pings before native queueing and sound playback.
    const currentNotificationHook = /this\.aHx=function\(pe\)\{/g;
    const before = modUtils.script;
    replace(currentNotificationHook,
        'this.aHx=function(pe){var fxNativeNotificationHandled=false;if(window.__fx){var fxNativeNotificationText=bq.lv.py(pe,bq.lv.pz(pe))||pe?.s||"";fxNativeNotificationHandled=window.__fx.nativeNotificationAdapter?.receive?.(pe,fxNativeNotificationText)===true;}if(Number(pe?.id)===6&&fxNativeNotificationHandled)return;if(window.__fx?.pingFilter?.isMuted?.(pe,"s"))return;');
    if (modUtils.script === before) {
        // Older native bundles used aJX/aIJ instead.
        const legacyNotificationHook = /aJX\.push\(aIJ\);!bm\.buffer\.data\[14\]\.value&&aIJ\.id!==7&&bt\.play\(\);?/g;
        replace(legacyNotificationHook,
            'if(window.__fx?.pingFilter?.isMuted?.(aIJ,"s"))return;aJX.push(aIJ);!bm.buffer.data[14].value&&aIJ.id!==7&&bt.play();');
    }
    if (modUtils.script === before) console.info("[ZFX Client] Native notification mute hook is absent in this game version.");
})
