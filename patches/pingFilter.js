import { definePatch } from "../modUtils.js";

export default definePatch(({ matchCode, replaceOne }) => {

    matchCode(`if (!isNaN(mentionIndex) && mentionIndex >= 0 && mentionIndex < languageHolder.languageData.languageCodes.length) {
        text = text.replace("@" + mention, "@" + languageHolder.languageData.languageCodes[mentionIndex])
    }`, { addToDictionary: ["languageHolder", "languageData", "languageCodes"] })

    // The current native build queues decoded messages in aGR.aIa as aHS.
    // Filtering at the queue boundary also prevents muted mentions from
    // opening a notification popup or playing its sound.
    replaceOne(
        /aIa\.push\(aHS\);!bm\.buffer\.data\[14\]\.value&&aHS\.id!==7&&bs\.play\(\);/g,
        'if(__fx.pingFilter.isMuted(aHS,"s"))return;aIa.push(aHS);!bm.buffer.data[14].value&&aHS.id!==7&&bs.play();'
    );
})
