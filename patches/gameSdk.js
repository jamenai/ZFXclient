import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceCode, replaceRawCode }) => {
  // Let the Vue lobby request the same entry selection as the native list.
  // The selected flag is updated only after the server acknowledges the entry.
  // The bridge calls the native high-level selector so its pending selection
  // counter and lobby refresh run alongside the WebSocket request.
  replaceCode(
    "this.aGn=function(aXz,a6x){bH.dk();bH.a9(1,0);bH.a9(6,2);bH.a9(3,aXz);if(aXz===4){bH.a9(13,a6x);}else if(aXz===3){bI.zB.a2b(a6x,7,bH);}else if(aXz===5){bH.a9(3,a6x.id);bH.a9(3,a6x.value);bH.a9(30,a6x.uX);}b1.z.send(b1.z.f7,bH.aXx());};",
    "this.aGn=function(aXz,a6x){bH.dk();bH.a9(1,0);bH.a9(6,2);bH.a9(3,aXz);if(aXz===4){bH.a9(13,a6x);}else if(aXz===3){bI.zB.a2b(a6x,7,bH);}else if(aXz===5){bH.a9(3,a6x.id);bH.a9(3,a6x.value);bH.a9(30,a6x.uX);}b1.z.send(b1.z.f7,bH.aXx());};window.__fx.nativeSelectLobbyEntry=function(id){return bq.sH.select(id);};if(window.__fx.gameSdk&&window.__fx.gameSdk.lobby)window.__fx.gameSdk.lobby.setNativeEntrySelector(window.__fx.nativeSelectLobbyEntry);window.__fx.sendLobbyMessage=function(message){if(!b1.z.ef(b1.z.f7))return false;b1.aGm.aGn(3,String(message));return true;};if(!window.__fx.sendClanMessage)window.__fx.sendClanMessage=function(clanTag,message){if(typeof clanTag!==\"string\"||!clanTag.trim()||typeof message!==\"string\"||!message.trim())return false;return window.__fx.sendLobbyMessage(\"@[\"+clanTag.trim()+\"] \"+message.trim());};window.__fx.getLobbyChatSenderName=function(senderId){var lobby=window.__fx.gameSdk&&window.__fx.gameSdk.lobby;var players=lobby&&lobby.getSnapshot().players||[];for(var i=0;i<players.length;i++){if(Number(players[i].id)===Number(senderId))return players[i].name;}return null;};"
  );

  // Decode lobby chat from the current native message parser (server opcodes
  // 17 and 19), where a text record is { id: 0, uX: senderId, s: text }.
  replaceCode(
    "if(id===0){return{id:id,uX:bK.rU(30),s:bq.aFw.aIH(bJ.zB.zS(7))};}",
    "if(id===0){var senderId=bK.rU(30);var text=bq.aFw.aIH(bJ.zB.zS(7));if(window.__fx&&window.__fx.lobbyChatFeed){window.__fx.lobbyChatFeed.observeSocketEntry({id:id,uX:senderId,s:text});window.__fx.lobbyChatFeed.publish({text:text,senderId:senderId});}return{id:id,uX:senderId,s:text};}"
  );

  // The new lobby renderer creates one span per native roster player. Attach
  // identity and the native rank formatter's output to that row for Vue.
  replaceRawCode(
    "function wd(tP,sE,we,wb){var tJ=document.createElement(\"span\");",
    "function wd(tP,sE,we,wb){var tJ=document.createElement(\"span\");tJ.dataset.fxLobbyPlayer=\"true\";tJ.dataset.fxPlayerId=String(sE.uX);tJ.dataset.fxAccountName=sE.username;var fxOwnEntry=bq&&bq.ownEntry;if(window.__fx)window.__fx.getNativeOwnPlayerIdentity=function(){var entry=bq&&bq.ownEntry;return entry?{id:entry.idField,username:entry.username,clan:entry.clan||entry.clanTag||null}:null;};if(fxOwnEntry&&(fxOwnEntry.username===sE.username||(fxOwnEntry.idField!=null&&String(fxOwnEntry.idField)===String(sE.uX))))tJ.dataset.fxSelf=\"true\";if(sE.a6r!==1234566){tJ.dataset.fxRank=String(sE.a6r+1);tJ.dataset.fxRankText=bq.lj.aHM(sE.wh,sE.a6r,sE.aGH);}",
    { wd: "wd" }
  );

  // Both the initial full lobby packet and subsequent delta packets pass
  // through the native list decoder. Label the sequence at each call site.
  replaceCode(
    "bq.z.vN=bK.rU(10);bq.sH.aGf();var playerCount=bK.rU(16);",
    "bq.z.vN=bK.rU(10);window.__fx?.gameSdk?.protocol?.beginNativeSequence?.('lobby.full');bq.sH.aGf();window.__fx?.gameSdk?.protocol?.endNativeSequence?.('lobby.full');var playerCount=bK.rU(16);"
  );
  replaceCode(
    "u.v(29);bq.z.aHd(true);",
    "window.__fx?.gameSdk?.lobby?.receiveNativePlayers?.(bq.wZ.w1,bq.wZ.wa,bq.sH.sH[0]?.id,bq.sH.wF,'lobby.full');u.v(29);bq.z.aHd(true);"
  );
  replaceRawCode(
    "bq.wZ.aGa(aXg)}bq.sH.aGf();bq.z.aGw()",
    "bq.wZ.aGa(aXg)}window.__fx?.gameSdk?.protocol?.beginNativeSequence?.('lobby.delta');bq.sH.aGf();window.__fx?.gameSdk?.protocol?.endNativeSequence?.('lobby.delta');bq.z.aGw();window.__fx?.gameSdk?.lobby?.receiveNativePlayers?.(bq.wZ.w1,bq.wZ.wa,bq.sH.sH[0]?.id,bq.sH.wF,'lobby.delta')"
  );

  // Hook after the native packet decoder has built the current lobby entries.
  // This runs for both the initial lobby payload and incremental updates.
  replaceCode(
    "this.sH=sH;if(wb!==this.wc()){bq.z.aGE++;}aGg(this);",
    "this.sH=sH;window.__fx?.gameSdk?.lobby?.receiveNativeEntries?.(sH,this.wF);if(wb!==this.wc()){bq.z.aGE++;}aGg(this);"
  );

  // The server can acknowledge a changed selected entry without sending a
  // complete list. Publish that sequence through the same lobby facade.
  replaceCode(
    "this.aGp=function(id){aGe=Math.max(aGe-1,0);if(aGe===0){this.wF=id;}};",
    "this.aGp=function(id){aGe=Math.max(aGe-1,0);if(aGe===0){this.wF=id;}window.__fx?.gameSdk?.lobby?.receiveNativeSelection?.(this.wF);};"
  );

  // This native handler is only called after the server's match-start payload
  // has been decoded into the actual game state (players, map and mode).
  replaceCode(
    "bV.a8(aFy.fF,fc.mapSeed);aE.a7g();aE.a7e=2;",
    "bV.a8(aFy.fF,fc.mapSeed);aE.a7g();aE.a7e=2;window.__fx?.gameSdk?.match?.reportNativeStart?.({mapIndex:aFy.fF,modeCode:aFy.vz,mapSeed:aFy.mapSeed,isContest:aFy.wN,playerCount:fc.humanCount,gameMode:fc.gameMode,numberTeams:fc.numberTeams,isZombieMode:fc.isZombieMode,battleRoyaleMode:fc.battleRoyaleMode,mapType:fc.mapType});"
  );
});
