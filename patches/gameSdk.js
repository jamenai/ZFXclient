import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  const hook = (pattern, replacement, label) => {
    const before = modUtils.script;
    modUtils.script = modUtils.script.replace(pattern, replacement);
    if (before === modUtils.script) console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`);
  };

  // Native lobby entry model: aH7 parses packets into tJ; xE/xF hold the
  // selected room and participation mode. click/select is the native action.
  hook(/this\.tJ=tJ;aHw\(this\);/g,
    "$&window.__fx?.gameSdk?.lobby?.receiveNativeEntries?.(this.tJ,this.xE,this.xF);", "lobby entries");
  hook(/this\.select=function\(id,xl\)\{/g,
    "if(window.__fx){var fxEntries=this;window.__fx.nativeSelectLobbyEntry=(id,mode)=>fxEntries.select(Number(id)||0,mode==='joined'||mode==='join'?1:0);window.__fx.gameSdk?.lobby?.setNativeEntrySelector?.(window.__fx.nativeSelectLobbyEntry);}this.select=function(id,xl){",
    "lobby entry selection");
  hook(/this\.xE=id;this\.xF=id\?xl:0;/g,
    "$&window.__fx?.gameSdk?.lobby?.receiveNativeSelection?.(this.xE,this.xF);", "lobby selection updates");

  // aH6 owns lobby players in x0. IDs are pg; rank metadata is xo; player
  // changes arrive through aHL and aHU.
  hook(/this\.x0\.push\(aHO\);aHO\.aHQ=this\.xf\.length;this\.xf\.push\(aHO\);/g,
    "$&window.__fx?.gameSdk?.lobby?.receiveNativePlayers?.(this.x0);", "lobby roster updates");
  hook(/player\.color=color;bq\.q7\.aHS\(player\.pg\);aHI\(\);/g,
    "$&window.__fx?.gameSdk?.lobby?.receiveNativePlayers?.(this.x0);", "lobby roster updates");

  // Lobby chat sends use protocol command 3 via aJf(text). Reuse the native
  // send path so mention processing, chat routing and server validation match.
  hook(/function aJf\(aIb\)\{/g,
    "function aJf(aIb){if(window.__fx){window.__fx.sendLobbyMessage=text=>{text=String(text||'').trim();if(!text)return false;aJf(text);return true;};window.__fx.sendClanMessage=(clan,text)=>{var tag=String(clan||'').trim().replace(/^\\[|\\]$/g,'').toUpperCase();text=String(text||'').trim();if(!tag||!text)return false;aJf('@['+tag+'] '+text);aJf('yes');return true;};window.__fx.getLobbyChatSenderIdByName=name=>{var wanted=String(name||'').trim().toLocaleLowerCase(),player=bq.po?.x0?.find(item=>String(item?.username||'').trim().toLocaleLowerCase()===wanted);return player?.pg??null;};}",
    "lobby chat send");

  // The native viewport resize callback delegates to i.a5z.
  hook(/function resize\(\)\{i\.a5z\(\);\}/g,
    "$&window.__fx.requestNativeResize=()=>resize();", "native canvas resize bridge");

  // Match start enters through aE.a8U after native match data is decoded.
  hook(/this\.a8U=function\(\)\{/g,
    'this.a8U=function(){window.__fx?.gameSdk?.match?.reportNativeStart?.({mapIndex:this.data.mapType===0?this.data.mapRealisticIndex:this.data.mapProceduralIndex,mapSeed:this.data.mapSeed,modeCode:this.data.gameMode===0?[7,10,8][this.data.battleRoyaleMode]:this.data.isZombieMode?9:this.data.numberTeams-2,isContest:this.data.isContest===1,playerCount:this.data.playerCount,gameMode:this.data.gameMode,numberTeams:this.data.numberTeams,isZombieMode:this.data.isZombieMode===1,battleRoyaleMode:this.data.battleRoyaleMode,mapType:this.data.mapType});',
    "match start");
});
