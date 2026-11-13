const defaultValues = Object.freeze({
  displayWinCounter: true,
  displayTickNumber: true,
  showCountryFlagsOnLand: false,
  showWorldClock: true,
  useFullscreenMode: false,
  hoveringTooltip: true,
  realisticNames: false,
  showPlayerDensity: true,
  playerDensityFontScale: 100,
  showEstimatedEliminationAttack: false,
  territoryOwnerTooltip: true,
  estimatedAttackFontScale: 100,
  estimatedAttackTroopMultiplier: 2,
  estimatedAttackGreenThreshold: 25,
  coloredDensity: true,
  densityDisplayStyle: "absoluteQuotient",
  hideBotNames: false,
  highlightClanSpawns: false,
  highlightSelfTerritory: false,
  selfTerritoryOutlineWidth: 3,
  selfTerritoryGlow: 6,
  highlightDuplicateIps: false,
  detailedTeamPercentage: false,
  openDonationHistoryFromLb: true,
  showLeaderboardTabs: true,
  customBackgroundUrl: "",
  keybindButtons: false,
  attackPercentageKeybinds: [],
  startingPercentageEnabled: false,
  startingPercentage: 50,
  hidePropagandaPopup: false,
  showLobbyNotificationCloseButton: false,
  clanMentionConfirmationMode: "ui",
  "lobbyNotifications.autoMinimize": true,
  "lobbyNotifications.autoMinimizeDelaySeconds": 6,
  showReplayTimebar: true,
  customQuickEmojisEnabled: false,
  customQuickEmojis: [],
  lobbyReminderRules: [],
  lobbyFontScale: 100,
  uiTransparency: 15,
  gameHudTransparency: 15,
  gameStatusHudStyle: "tiles",
  uiSkin: "zfx",
  showLobbyTabLabels: true,
  mutePingAll: false,
  mutePingEveryone: false,
  mutePingRoom: false,
  mutePingClan: false,
  mutePingLanguage: false,
  mutePingDirect: false,
  hideInappropriateNames: false,
  followedAccountNicknames: {},
  followedAccountColors: {},
  savedAccountLabels: {},
});

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const typeOfDefault = value => Array.isArray(value) ? "array" : isRecord(value) ? "object" : typeof value;

const schemaEntries = Object.fromEntries(
  Object.entries(defaultValues).map(([key, value]) => [key, { type: typeOfDefault(value) }])
);

schemaEntries.estimatedAttackGreenThreshold = { type: "number", min: 5, max: 75 };
schemaEntries.estimatedAttackTroopMultiplier = { type: "number", min: 1, max: 4 };
schemaEntries.playerDensityFontScale = { type: "number", min: 50, max: 200 };
schemaEntries.estimatedAttackFontScale = { type: "number", min: 50, max: 200 };
schemaEntries.selfTerritoryOutlineWidth = { type: "number", min: 1, max: 6 };
schemaEntries.selfTerritoryGlow = { type: "number", min: 0, max: 12 };
schemaEntries.startingPercentage = { type: "number", min: 0, max: 100 };
schemaEntries.lobbyFontScale = { type: "number", min: 75, max: 300 };
schemaEntries.uiTransparency = { type: "number", min: 0, max: 45 };
schemaEntries.gameHudTransparency = { type: "number", min: 0, max: 70 };
schemaEntries.gameStatusHudStyle = { type: "string", values: ["tiles", "strip", "rows"] };
schemaEntries["lobbyNotifications.autoMinimizeDelaySeconds"] = { type: "number", min: 1, max: 30 };
schemaEntries.clanMentionConfirmationMode = { type: "string", values: ["ui", "chat", "auto"] };
schemaEntries.uiSkin = { type: "string", values: ["zfx", "blue", "violet", "amber", "rose"] };
schemaEntries.densityDisplayStyle = { type: "string", values: ["percentage", "absoluteQuotient"] };
for (const definition of Object.values(schemaEntries)) Object.freeze(definition);
Object.freeze(schemaEntries.densityDisplayStyle.values);
Object.freeze(schemaEntries.gameStatusHudStyle.values);
Object.freeze(schemaEntries.clanMentionConfirmationMode.values);
export const SETTINGS_SCHEMA = Object.freeze(schemaEntries);

export const DISCONTINUED_SETTINGS = Object.freeze([
  "hideAllLinks", "fontName", "showSidebar", "vueSidebar", "enhancedLobbyLayout",
  "customLobbyView", "customHomeView", "showClanLobbyDashboard", "highlightSameClan",
]);

export function createDefaultSettings() {
  return {
    ...defaultValues,
    attackPercentageKeybinds: [],
    customQuickEmojis: [],
    lobbyReminderRules: [],
    followedAccountNicknames: {},
    followedAccountColors: {},
    savedAccountLabels: {},
  };
}

export function isValidSettingValue(key, value, fallbackValue) {
  const schema = SETTINGS_SCHEMA[key];
  if (!schema) return isValidByDefaultType(fallbackValue, value);
  if (schema.type === "array") return Array.isArray(value);
  if (schema.type === "object") return isRecord(value);
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return false;
  if (typeof value !== schema.type) return false;
  if (schema.min !== undefined && value < schema.min) return false;
  if (schema.max !== undefined && value > schema.max) return false;
  if (schema.values && !schema.values.includes(value)) return false;
  return true;
}

function isValidByDefaultType(defaultValue, value) {
  if (Array.isArray(defaultValue)) return Array.isArray(value);
  if (isRecord(defaultValue)) return isRecord(value);
  if (typeof defaultValue === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === typeof defaultValue;
}

/** Migrates known historical settings in place and reports whether data changed. */
export function migrateSettings(settings) {
  if (settings.emojiBar === undefined && settings.customEmojiBar === undefined) return false;

  if (settings.customQuickEmojis.length === 0 && !settings.customQuickEmojisEnabled) {
    if (Array.isArray(settings.emojiBar) && settings.emojiBar.length === 9)
      settings.customQuickEmojis = settings.emojiBar;
    if (settings.customEmojiBar) settings.customQuickEmojisEnabled = true;
  }
  delete settings.emojiBar;
  delete settings.customEmojiBar;
  return true;
}
