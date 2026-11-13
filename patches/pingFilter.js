import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
    const { matchCode, replace } = modUtils;

    let currentLanguageCodesHookInstalled = false;
    const currentLanguageCodesHook = /this\.aKC=function\(s\)\{/g;
    const beforeLanguageCodesHook = modUtils.script;
    modUtils.script = modUtils.script.replace(currentLanguageCodesHook,
        '$&window.__fx.getGameLanguageCodes=()=>Array.isArray(bA?.data?.h)?bA.data.h:null;');
    currentLanguageCodesHookInstalled = modUtils.script !== beforeLanguageCodesHook;

    try {
        matchCode(`if (!isNaN(mentionIndex) && mentionIndex >= 0 && mentionIndex < languageHolder.languageData.languageCodes.length) {
            text = text.replace("@" + mention, "@" + languageHolder.languageData.languageCodes[mentionIndex])
        }`, { addToDictionary: ["languageHolder", "languageData", "languageCodes"] });
    } catch {
        if (!currentLanguageCodesHookInstalled) console.info("[ZFX Client] Native language-code adapter hook is absent in this game version.");
    }

    // aHZ.aIK receives both server entries and local chat confirmation prompts.
    // Forward them through one adapter before native popup filtering/rendering.
    const currentNotificationHook = /this\.aIK=function\(pi\)\{/g;
    const before = modUtils.script;
    replace(currentNotificationHook,
        'this.aIK=function(pi){var fxNativeNotificationHandled=false;if(window.__fx){var fxNativeNotificationText=bq.lr?.q2?.(pi,bq.lr?.q3?.(pi))?.s||pi?.s||"";fxNativeNotificationHandled=window.__fx.nativeNotificationAdapter?.receive?.(pi,fxNativeNotificationText)===true;}if(Number(pi?.id)===6&&fxNativeNotificationHandled)return;if(window.__fx?.pingFilter?.isMuted?.(pi,"s"))return;');
    if (modUtils.script === before) {
        // Older native bundles used aJX/aIJ instead.
        const legacyNotificationHook = /aJX\.push\(aIJ\);!bm\.buffer\.data\[14\]\.value&&aIJ\.id!==7&&bt\.play\(\);?/g;
        replace(legacyNotificationHook,
            'if(window.__fx?.pingFilter?.isMuted?.(aIJ,"s"))return;aJX.push(aIJ);!bm.buffer.data[14].value&&aIJ.id!==7&&bt.play();');
    }
    if (modUtils.script === before) console.info("[ZFX Client] Native notification mute hook is absent in this game version.");
})
