import { settingsApi } from "./settings/settings.js";
import { getGameLanguageCodes } from "../adapter/gameInterface.js";

const mentionExpression = /\B@[-\w\[\]]+/g;
const chatMessageId = 0;
const everyoneAliases = ["@0ya", "@0og", "@0pl"];

const settingForType = {
    everyone: "mutePingEveryone",
    room: "mutePingRoom",
    clan: "mutePingClan",
    language: "mutePingLanguage",
    direct: "mutePingDirect"
};

function getMentionType(mention) {
    if (mention.startsWith("@[") && mention.endsWith("]")) return "clan";
    if (mention === "@all" || mention === "@everyone" || everyoneAliases.includes(mention)) return "everyone";
    if (/^@room[1-9]$/.test(mention)) return "room";
    const name = mention.slice(1);
    const languageCodes = getGameLanguageCodes();
    if (languageCodes !== null)
        return languageCodes.some(code => code.toLowerCase() === name) ? "language"
            : name.length === 5 ? "direct" : "other";
    return name.length === 5 ? "direct" : name.length <= 3 ? "language" : "other";
}

function isMentionMuted(mention) {
    if (settingsApi.getBoolean("mutePingAll")) return true;
    const settingName = settingForType[getMentionType(mention)];
    return settingName !== undefined && settingsApi.getBoolean(settingName);
}

function isMuted(message, textField) {
    if (!message || message.id !== chatMessageId || typeof message[textField] !== "string") return false;
    const mentions = message[textField].toLowerCase().match(mentionExpression);
    if (mentions === null) return false;
    // A single muted category is enough to suppress the notification. Using
    // every() let mixed mentions through (for example @all plus @room1).
    return mentions.some(isMentionMuted);
}

export default { isMuted };
