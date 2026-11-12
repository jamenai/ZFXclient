import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  const installedNativeHooks = new Set();
  const optional = (pattern, replacement, label) => {
    const before = modUtils.script;
    try {
      // Keep this local to the mutable native source. The bound replace helper
      // can retain a stale function reference when this patch is composed
      // after other adapters have wrapped the ModUtils instance.
      modUtils.script = modUtils.script.replace(pattern, replacement);
      if (modUtils.script === before) {
        if (!installedNativeHooks.has(label)) console.info(`[ZFX Client] Native ${label} adapter hook is absent in this game version.`);
      } else installedNativeHooks.add(label);
    } catch {
      if (!installedNativeHooks.has(label)) console.info(`[ZFX Client] Native ${label} adapter hook is absent in this game version.`);
    }
  };

  // Territorial.io 2.17.9 stores upcoming entries in bq.tb and lobby players
  // in bq.ps. Publish decoded values directly from those native models.
  optional(/this\.tb=tb;/g,
    "$&window.__fx?.gameSdk?.lobby?.receiveNativeEntries?.(tb,this.xE,this.xF);", "lobby entries");
  optional(/this\.select=function\(id,xl\)\{/g,
    "if(window.__fx){var fxEntryManager=this;window.__fx.nativeSelectLobbyEntry=(entryId,participation)=>fxEntryManager.select(Number(entryId)||0,participation==='joined'||participation==='join'?0:1);window.__fx.gameSdk?.lobby?.setNativeEntrySelector?.(window.__fx.nativeSelectLobbyEntry);}this.select=function(id,xl){",
    "lobby entry selection adapter");
  optional(/this\.xE=id;this\.xF=id\?xl:0;/g,
    "$&window.__fx?.gameSdk?.lobby?.receiveNativeSelection?.(this.xE,this.xF);", "lobby selection updates");
  optional(/function aHf\(\)\{bq\.z\.aHg\+=u\.vX===29&&bq\.z\.aHh===1;\}/g,
    "function aHf(){bq.z.aHg+=u.vX===29&&bq.z.aHh===1;if(window.__fx){var fxMentionAlphabet='-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';var fxEncodeMention=function(value){var number=Number(value);if(!Number.isInteger(number)||number<=0||number>1073741823)return '';var code='';for(var i=0;i<5;i++){code=fxMentionAlphabet.charAt(number%64)+code;number=Math.floor(number/64);}return code;};var fxDecodeMention=function(value){var token=String(value||'').replace(/^@/,'');if(token.length!==5)return null;var number=0;for(var i=0;i<token.length;i++){var digit=fxMentionAlphabet.indexOf(token.charAt(i));if(digit<0)return null;number=number*64+digit;}return number;};var fxPlayerById=function(id){return bq.ps?.pt(Number(id))||null;};window.__fx.encodeNativeLobbyMentionId=fxEncodeMention;window.__fx.getLobbyChatMentionToken=fxEncodeMention;window.__fx.getNativeLobbyPlayerAccountCode=player=>player?'@'+fxEncodeMention(player.pk):'';window.__fx.getNativeOwnLobbyPlayerAccountCode=()=>window.__fx.getNativeLobbyPlayerAccountCode(fxPlayerById(bq.aHO));window.__fx.getNativeOwnPlayerIdentity=()=>{var player=fxPlayerById(bq.aHO);return{id:bq.aHO,username:player?.username||'',name:player?.username||''};};window.__fx.getNativeLobbyPlayerColor=player=>{var color=Number(player?.color);if(!Number.isInteger(color))return '';var r=(color>>12&63)<<2,g=(color>>6&63)<<2,b=(color&63)<<2;return 'rgba('+r+','+g+','+b+',.82)'};window.__fx.getNativeLobbyPlayerTerritoryBorderColor=window.__fx.getNativeLobbyPlayerColor;window.__fx.getLobbyChatSenderName=id=>{var player=fxPlayerById(id);return player?.username?window.__fx.nameFilter.filter(player.username):null;};window.__fx.getLobbyChatSenderColor=id=>window.__fx.getNativeLobbyPlayerColor(fxPlayerById(id));window.__fx.resolveLobbyChatMentionId=fxDecodeMention;window.__fx.resolveLobbyChatMention=code=>{var player=fxPlayerById(fxDecodeMention(code));return player?.username?window.__fx.nameFilter.filter(player.username):null;};window.__fx.resolveLobbyChatMentionColor=code=>window.__fx.getNativeLobbyPlayerColor(fxPlayerById(fxDecodeMention(code)));window.__fx.setNativeLobbyChatMode=mode=>{if(!bq?.fD||typeof b1?.aIO?.aIP!=='function'){window.__fx.lobbyChatActivationStatus='waiting-for-session';return false;}b1.aIO.aIP(Number(mode)===0?0:1);window.__fx.lobbyChatActivationStatus='native-stream-active';return true;};window.__fx.getNativeLobbyChatState=()=>{var messages=bq.z?.py||[];return{available:!!bq.z,sessionActive:!!bq.fD,channel:'lobby',count:messages.length,messages:messages.slice(-60).map(function(item,index){return{index:Math.max(0,messages.length-60)+index,id:item.id,senderId:item.pk,text:bq.lr?.q2?.(item,bq.lr?.q3?.(item))||item.s||'',system:item.id!==0};})};};}window.__fx?.gameSdk?.lobby?.receiveNativePlayers?.(bq.ps?.x0,bq.tb?.tb,bq.tb?.xE);}",
    "lobby player updates");

  optional(/bq\.qB\.aKx\(aKy\);bq\.qB\.aL3\(aKy\);py\.push\(aKy\);/g,
    "bq.qB.aKx(aKy);bq.qB.aL3(aKy);py.push(aKy);window.__fx?.lobbyChatFeed?.observeSocketEntry?.(aKy,null,bq.lr?.q2?.(aKy,bq.lr?.q3?.(aKy)),'live');",
    "live lobby chat entries");
  optional(/function aHa\(\)\{/g,
    "function aHa(){if(window.__fx){window.__fx.sendLobbyMessage=message=>{if(!bq?.fD||typeof bq?.pe?.a4I!=='function')return false;bq.pe.a4I(String(message));return true;};window.__fx.sendClanMessage=(clan,message)=>{var tag=String(clan||'').trim().replace(/^\\[|\\]$/g,'').toUpperCase(),text=String(message||'').trim();if(!tag||!text||!bq?.fD||typeof bq?.pe?.a4I!=='function')return false;bq.pe.a4I('@['+tag+'] '+text);bq.pe.a4I('yes');return true;};window.__fx.getLobbyChatSenderIdByName=name=>{var wanted=String(name||'').trim().toLocaleLowerCase(),player=(bq?.ps?.x0||[]).find(item=>String(item?.username||'').trim().toLocaleLowerCase()===wanted);return player?.pk??null;};}",
    "lobby chat send and mention adapters");

  optional(/this\.sf=sf;aHi\(this\);/g,
    "$&window.__fx?.gameSdk?.lobby?.receiveNativeEntries?.(this.sf,this.wd,this.we)", "lobby entries");
  optional(/this\.select=function\(id,xB\)\{/g,
    "if(window.__fx){var fxEntryManager=this;window.__fx.nativeSelectLobbyEntry=(entryId,participation)=>fxEntryManager.select(Number(entryId)||0,participation==='joined'||participation==='join'?0:1);window.__fx.gameSdk?.lobby?.setNativeEntrySelector?.(window.__fx.nativeSelectLobbyEntry);}this.select=function(id,xB){",
    "lobby entry selection adapter");
  optional(/this\.wd=id;this\.we=id\?xB:0;/g,
    "$&window.__fx?.gameSdk?.lobby?.receiveNativeSelection?.(this.wd,this.we);", "lobby selection updates");
  optional(/function aH3\(\)\{bq\.z\.aH4\+=u\.uw===29&&bq\.z\.aH5===1;\}/g,
    "function aH3(){bq.z.aH4+=u.uw===29&&bq.z.aH5===1;if(window.__fx){var fxMentionAlphabet='-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';window.__fx.encodeNativeLobbyMentionId=value=>{var number=Number(value);if(!Number.isInteger(number)||number<0||number>1073741823)return '';var code='';for(var i=0;i<5;i++){code=fxMentionAlphabet.charAt(number%64)+code;number=Math.floor(number/64);}return code;};var fxDecodeMentionId=function(shortId){var token=String(shortId||'').replace(/^@/,''),alphabet=fxMentionAlphabet;if(token.length!==5)return null;var value=0;for(var i=0;i<token.length;i++){var digit=alphabet.indexOf(token.charAt(i));if(digit<0)return null;value=value*64+digit;}return value;};window.__fx.getNativeLobbyPlayerRankText=player=>bq.ln.aIW(player.xE,player.a7W,player.aH7);window.__fx.getNativeLobbyPlayerAccountCode=player=>{var id=Number(player?.uu);return Number.isInteger(id)&&id>0?'@'+window.__fx.encodeNativeLobbyMentionId(id):''};window.__fx.getNativeOwnLobbyPlayerAccountCode=()=>window.__fx.getNativeLobbyPlayerAccountCode(bq.x4?.aHc?.(bq.aGk));window.__fx.getNativeLobbyPlayerColor=player=>{var color=Number(player?.color);if(!Number.isInteger(color))return '';var r=(color>>12&63)<<2,g=(color>>6&63)<<2,b=(color&63)<<2;return 'rgba('+r+','+g+','+b+',.82)'};window.__fx.getNativeLobbyPlayerTerritoryBorderColor=window.__fx.getNativeLobbyPlayerColor;}window.__fx?.gameSdk?.lobby?.receiveNativePlayers?.(bq.x4?.wP,bq.sf?.sf,bq.sf?.wd);window.__fx?.followedAccounts?.syncAccountNames?.((bq.x4?.wP||[]).filter(player=>bq.aGn?.aHC?.(player.uu)).map(player=>player.username));if(window.__fx){window.__fx.getLobbyChatSenderName=id=>{var name=bq.x4?.aHc?.(Number(id))?.username||window.__fx.lobbyChatNamesById?.[String(id)]||null;return name?window.__fx.nameFilter.filter(name):null};window.__fx.getLobbyChatSenderColor=id=>{var player=bq.x4?.aHc?.(Number(id));return player?window.__fx.getNativeLobbyPlayerColor(player):null};window.__fx.resolveLobbyChatMentionId=shortId=>fxDecodeMentionId(shortId);window.__fx.resolveLobbyChatMention=shortId=>{var name=bq.x4?.aHc?.(fxDecodeMentionId(shortId))?.username||null;return name?window.__fx.nameFilter.filter(name):null};window.__fx.resolveLobbyChatMentionColor=shortId=>{var player=bq.x4?.aHc?.(fxDecodeMentionId(shortId));return player?window.__fx.getNativeLobbyPlayerColor(player):null};}}",
    "lobby player updates");
  optional(/function aGv\(\)\{/g,
    "$&if(window.__fx){window.__fx.sendLobbyMessage=message=>{if(!bq?.f9||typeof bq?.aGm?.a3j!=='function')return false;bq.aGm.a3j(String(message));return true;};window.__fx.sendClanMessage=(clan,message)=>{var tag=String(clan||'').trim().replace(/^\\[|\\]$/g,'').toUpperCase(),text=String(message||'').trim();if(!tag||!text||!bq?.f9||typeof bq?.aGm?.a3j!=='function')return false;bq.aGm.a3j('@['+tag+'] '+text);bq.aGm.a3j('yes');return true;};window.__fx.getLobbyChatMentionToken=accountId=>window.__fx.encodeNativeLobbyMentionId(accountId);window.__fx.getLobbyChatSenderIdByName=name=>{var wanted=String(name||'').trim().toLocaleLowerCase(),player=(bq?.x4?.wP||[]).find(item=>String(item?.username||'').trim().toLocaleLowerCase()===wanted)||(bq?.x1?.wM||[]).find(item=>String(item?.username||'').trim().toLocaleLowerCase()===wanted);return player?.uu??player?.ur??player?.ue??null;};}",
    "lobby chat send and mention adapters");
  // The live room message packet is decoded one entry at a time through
  // aYr. tj.push is only used for the initial/backfill batch.
  optional(/var aKK=aZG\(\);bq\.tx\.aKJ\(aKK\)[,;]bq\.message\.aHj\(aKK\)/g,
    "var aKK=aZG();bq.tx.aKJ(aKK);window.__fx?.lobbyChatFeed?.observeSocketEntry?.(aKK,null,bq.ln?.tp?.(aKK),'live');bq.message.aHj(aKK)",
    "legacy live lobby chat entries");
  optional(/bq\.x4\.aH6\(bK\.re\(30\),bJ\.zj\.a00\(5\),bK\.re\(4\),bK\.re\(30\),bK\.re\(7\),bK\.re\(16\),bK\.re\(18\),bK\.re\(11\),bK\.re\(12\),bK\.re\(6\),bK\.re\(13\),bK\.re\(1\)\);/g,
    "$&window.__fx?.gameSdk?.lobby?.beginNativeSequence?.('lobby-roster');", "lobby roster decode");
  optional(/bq\.z\.aIq\(true\);/g,
    "$&window.__fx?.gameSdk?.lobby?.endNativeSequence?.('lobby-roster');", "lobby roster completion");
  optional(/this\.aIC=function\(aGo,aI1,aI3\)\{/g,
    "this.aIC=function(aGo,aI1,aI3){window.__fx?.gameSdk?.match?.reportNativeStart?.({mapIndex:aGo.fI,mapSeed:aGo.mapSeed,modeCode:aGo.wN,isContest:aGo.wo,playerCount:aI1.length,gameMode:aGo.wN<7||aGo.wN===9?1:0,numberTeams:aGo.wN<7?aGo.wN+2:aGo.wN===9?2:null,isZombieMode:aGo.wN===9,battleRoyaleMode:aGo.wN===7?0:aGo.wN===10?1:2,mapType:bV.aID(aGo.fI)?0:1});",
    "match start");
  optional(/this\.aIn=function\(aHQ,aIc,aIe\)\{/g,
    "this.aIn=function(aHQ,aIc,aIe){window.__fx?.gameSdk?.match?.reportNativeStart?.({mapIndex:aHQ.fM,mapSeed:aHQ.mapSeed,modeCode:aHQ.wy,isContest:aHQ.xP===1,playerCount:aIc.length,gameMode:aHQ.wy<7||aHQ.wy===9?1:0,numberTeams:aHQ.wy<7?aHQ.wy+2:aHQ.wy===9?2:null,isZombieMode:aHQ.wy===9,battleRoyaleMode:aHQ.wy===7?0:aHQ.wy===10?1:2,mapType:bV.aIo(aHQ.fM)?0:1});",
    "match start");

});
