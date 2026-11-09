import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // 2.17.x moved lobby state into aGL (players), aGM (entries), and aWq
  // (socket packet handlers). Bridge the decoded native models to the Vue SDK.
  replaceOne(
    /this\.sK=sK[;,]aGz\(this\)/g,
    "this.sK=sK;window.__fx?.gameSdk?.lobby?.receiveNativeEntries?.(sK,this.wI);aGz(this);"
  );
  replaceOne(
    /this\.aH7=function\(id\)\{aGx=Math\.max\(aGx-1,0\);if\(aGx===0\)\{this\.wI=id\}\};/g,
    "this.aH7=function(id){aGx=Math.max(aGx-1,0);if(aGx===0){this.wI=id;}window.__fx?.gameSdk?.lobby?.receiveNativeSelection?.(this.wI);};"
  );
  replaceOne(
    /u\.v\(29\);bq\.z\.aHu\(true\)/g,
    "window.__fx?.gameSdk?.lobby?.receiveNativePlayers?.(bq.wh.w4,bq.sK.sK,bq.sK.wI,'lobby.full');u.v(29);bq.z.aHu(true);"
  );
  replaceOne(
    /bq\.sK\.aGy\(\);bq\.z\.aHD\(\)/g,
    "bq.sK.aGy();window.__fx?.gameSdk?.lobby?.receiveNativePlayers?.(bq.wh.w4,bq.sK.sK,bq.sK.wI,'lobby.delta');bq.z.aHD();"
  );
  replaceOne(
    /bV\.a8\(aGI\.fG,fd\.mapSeed\);aE\.a7u\(\);aE\.a3k=aGI\.a3k;aE\.a7s=2/g,
    "bV.a8(aGI.fG,fd.mapSeed);aE.a7u();aE.a3k=aGI.a3k;aE.a7s=2;window.__fx?.gameSdk?.match?.reportNativeStart?.({mapIndex:aGI.fG,mapSeed:aGI.mapSeed,modeCode:aGI.w2,isContest:aGI.wR,playerCount:fd.humanCount,gameMode:fd.gameMode,numberTeams:fd.numberTeams,isZombieMode:fd.isZombieMode,battleRoyaleMode:fd.battleRoyaleMode,mapType:fd.mapType});"
  );

  // Native chat uses action 3 to send and packet 17 records to receive. Keep
  // the native protocol as the transport, while publishing the decoded data.
  replaceOne(
    /if\(id===0\)\{return\{id:id,ua:bK\.rX\(30\),s:bq\.aGG\.aIY\(bJ\.zO\.zf\(7\)\)\}\}/g,
    "if(id===0){var senderId=bK.rX(30);var text=bq.aGG.aIY(bJ.zO.zf(7));window.__fx?.lobbyChatFeed?.observeSocketEntry?.({id:id,ua:senderId,s:text});window.__fx?.lobbyChatFeed?.publish?.({text:text,senderId:senderId});return{id:id,ua:senderId,s:text};}"
  );

  replaceOne(
    /this\.aXV=function\(oQ\)\{if\(oQ!==b1\.z\.f8\)\{b1\.z\.close\(oQ,3239\);return\}if\(ab\.a4V\(\)!==6\)\{b1\.z\.close\(oQ,3271\);return\}bq\.dk\(\);/g,
    "$&if(window.__fx){window.__fx.nativeSelectLobbyEntry=function(id){return bq.sK.select(id);};window.__fx.sendLobbyMessage=function(message){if(!bq.f7||!b1.aH4)return false;b1.aH4.aH5(3,String(message));return true;};window.__fx.getLobbyChatSenderName=function(senderId){var player=bq.wh&&bq.wh.aGv?bq.wh.aGv(Number(senderId)):null;return player&&player.username||null;};window.__fx.getNativeLobbyPlayerRankText=function(player){return player&&bq.lk&&bq.lk.aHd?bq.lk.aHd(player.wu,player.a75,player.aGb):'';};if(window.__fx.gameSdk?.lobby)window.__fx.gameSdk.lobby.setNativeEntrySelector(window.__fx.nativeSelectLobbyEntry);}"
  );
});
