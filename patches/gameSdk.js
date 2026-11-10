import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  const { replace } = modUtils;
  const optional = (pattern, replacement, label) => {
    const before = modUtils.script;
    try {
      replace(pattern, replacement);
      if (modUtils.script === before) console.info(`[ZFX Client] Native ${label} adapter hook is absent in this game version.`);
    } catch { console.info(`[ZFX Client] Native ${label} adapter hook is absent in this game version.`); }
  };

  // 2.17.3 lobby model: bq.wo owns players, bq.sP owns entries and
  // selection, bq.ll formats chat and bq.aGU handles chat sends/mentions.
  optional(/\baGl\(\)(?!\s*\{)/g,
    "aGl();window.__fx?.gameSdk?.lobby?.receiveNativePlayers?.(bq.wo?.w9,bq.sP?.sP,bq.sP?.wN)",
    "lobby player state updates");
  optional(/this\.sP\s*=\s*sP\s*[,;]\s*aHQ\(this\)\s*;?/g,
    "this.sP=sP;aHQ(this);if(window.__fx){window.__fx.nativeSelectLobbyEntry=(entryId,participation)=>this.select(Number(entryId)||0,participation==='joined'||participation==='join'?0:1);window.__fx.gameSdk?.lobby?.setNativeEntrySelector?.(window.__fx.nativeSelectLobbyEntry);}window.__fx?.gameSdk?.lobby?.receiveNativeEntries?.(this.sP,this.wN,this.wO);",
    "lobby entries");
  optional(/this\.wN=id;this\.wO=id\?wv:0;/g,
    "this.wN=id;this.wO=id?wv:0;window.__fx?.gameSdk?.lobby?.receiveNativeSelection?.(this.wN,this.wO);",
    "lobby selection");
  optional(/this\.a3S=function\(s\)\{/g,
    "if(window.__fx)window.__fx.sendLobbyMessage=message=>{if(!bq||bq.f7!==1)return false;this.a3S(String(message));return true;};this.a3S=function(s){",
    "lobby chat send");
  optional(/this\.aID\s*=\s*function\(wy,\s*a7G,\s*aGp\)\s*\{/g,
    "this.aID=function(wy,a7G,aGp){if(window.__fx)window.__fx.getNativeLobbyPlayerRankText=player=>bq.ll.aID(player.wy,player.a7G,player.aGp);",
    "lobby player rank formatting");
  optional(/this\.wx\s*=\s*function\(wy\)\s*\{/g,
    "if(window.__fx){window.__fx.getNativeLobbyPlayerColor=player=>{var color=Number(player?.color);return Number.isInteger(color)?bD.color.pM((color>>12&63)<<2,(color>>6&63)<<2,(color&63)<<2,.82):null;};window.__fx.getNativeLobbyPlayerTerritoryBorderColor=player=>{var color=Number(player?.color);return Number.isInteger(color)?bD.color.pM((color>>12&63)<<2,(color>>6&63)<<2,(color&63)<<2,.82):null;};}this.wx=function(wy){",
    "lobby player colors");

  // The current client creates its match data in aHu(), then initializes the
  // game from that data in aE.a85(). Report the normalized model at that point.
  optional(/aE\.a85\(\);aE\.a3q=aGW\.a3q;aE\.a83=2/g,
    "aE.a85();window.__fx?.gameSdk?.match?.reportNativeStart?.({mapIndex:aGW.fG,mapSeed:fd.mapSeed,modeCode:aGW.w7,isContest:fd.isContest,playerCount:fd.humanCount,gameMode:fd.gameMode,numberTeams:fd.numberTeams,isZombieMode:fd.isZombieMode,battleRoyaleMode:fd.battleRoyaleMode,mapType:fd.mapType});aE.a3q=aGW.a3q;aE.a83=2",
    "match start");
});
