import versionData from '../../version.json';
const { version, lastUpdated, isSignificant } = versionData;

import settingsManager from './settings/settings.js';
import { initializeLobbyEnhancements } from "./lobbyEnhancements.js";
import { initializeCustomLobbyView } from "../components/views/lobby/customLobbyView.js";
import { initializeCustomLobbyJoinView } from "../components/views/lobby/customLobbyJoinView.js";
import { clanFilter, leaderboardFilter } from "./clanFilters.js";
import WindowManager from "./windowManager.js";
import donationsTracker from "./donationsTracker.js";
import winCounter from "./winCounter.js";
import playerList from "./playerList.js";
import gameScriptUtils from "./gameScriptUtils.js";
import hoveringTooltip from "./hoveringTooltip.js";
import { keybindFunctions, keybindHandler, mobileKeybinds } from "./keybinds.js";
import customLobby from './customLobby.js';
import { displayChangelog, initializeChangelogView } from '../components/views/changelog/changelog.js';
import { reportError } from './debugging.js';
import replayHistory from './replayHistory.js';
import replay, { initializeReplayTimebar } from './replay.js';
import lobbyReminders from './lobbyReminders.js';
import lobbyChatFeed from './lobbyChatFeed.js';
import pingFilter from './pingFilter.js';
import nameFilter from './nameFilter.js';
import followedAccounts from './followedAccounts.js';
import passwordReset from './passwordReset.js';
import savedAccounts from './savedAccounts.js';
import { installSelfTerritoryHighlight } from "./selfTerritoryHighlight.js";
import { initializeWorldClock } from "./worldClock.js";
import { createSidebar } from "./sidebar.js";
import { createVueSettingsView } from "../components/views/settings/vueSettingsView.js";
import { initializeSettingsProfiles } from "../components/views/settings/settingsProfilesView.js";
import { createVueHomeView } from "../components/views/home/homeView.js";
import { createVueReplayView } from "../components/views/replay/replayView.js";
import { createVueLeaderboardsView } from "../components/views/leaderboards/leaderboardsView.js";
import { createVueLogsView } from "../components/views/logs/logsView.js";
import { createVueMyAccountView, myAccountAdapter } from "../components/views/account/myAccountView.js";
import { createVueGoldTransferView } from "../components/views/goldTransfer/goldTransferView.js";
import { createVueLoginView } from "../components/views/login/loginView.js";
import { initializeUpdatePromptView } from "../components/views/update/updatePromptView.js";
import { getVar, getGameMapNames } from "../adapter/gameInterface.js";
import { publishFxBridge } from "../adapter/fxBridge.js";
import { createGameSdk } from "../adapter/gameSdk.js";

const gameSdk = createGameSdk({ getMapNames: getGameMapNames });

// Stable bridge used by injected game patches. Keep this surface explicit:
// patched game code must not reach into individual FX modules directly.
const fxBridge = publishFxBridge(window, {
  version: version + " " + lastUpdated,
  isCustomLobbyVersion: window.location.href.startsWith("https://fxclient.github.io/custom-lobbies"),
  settingsManager,
  leaderboardFilter,
  utils: gameScriptUtils,
  WindowManager,
  keybindFunctions,
  keybindHandler,
  mobileKeybinds,
  donationsTracker,
  reportError,
  playerList,
  hoveringTooltip,
  clanFilter,
  wins: winCounter,
  customLobby,
  replayHistory,
  replay,
  lobbyReminders,
  lobbyChatFeed,
  pingFilter,
  nameFilter,
  followedAccounts,
  passwordReset,
  savedAccounts,
  selfTerritoryHighlight: { install: installSelfTerritoryHighlight },
  getGameVar: getVar,
  getGameMapNames,
  gameSdk,
  myAccountAdapter,
});

// Publish the bridge before settings initialization: profile activation can
// touch the native settings adapter and must be reportable if that adapter is
// not ready yet.
initializeSettingsProfiles();

gameSdk.lobby.subscribe(snapshot => lobbyReminders.setLobbySnapshot(snapshot));

initializeChangelogView();
const savedVersion = localStorage.getItem("fx_version");
if (savedVersion !== version && !fxBridge.isCustomLobbyVersion) {
  localStorage.setItem("fx_version", version);
  if (savedVersion !== null && isSignificant) displayChangelog();
}

initializeLobbyEnhancements();
initializeUpdatePromptView();
initializeCustomLobbyView();
initializeCustomLobbyJoinView();
createVueSettingsView(settingsManager);
createVueHomeView();
createVueReplayView();
createVueLeaderboardsView();
createVueLogsView();
createVueMyAccountView();
createVueGoldTransferView();
createVueLoginView();
initializeReplayTimebar();
const sidebar = createSidebar();
fxBridge.sidebar = sidebar;
initializeWorldClock(sidebar.getClockSlot(), sidebar.isCollapsed);

console.log('Successfully loaded ZFX Client');
