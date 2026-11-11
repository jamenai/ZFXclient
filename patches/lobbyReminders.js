import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  const optional = (pattern, replacement, label) => {
    const before = modUtils.script;
    try {
      modUtils.replace(pattern, replacement);
      if (modUtils.script === before) console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`);
    } catch { console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`); }
  };

  // Mirror decoded entries from the native room-chat queue. The adapter
  // classifies native types and handles live/history duplicate detection.
  optional(/tj\.push\(aKK\);/g,
    "tj.push(aKK);window.__fx?.lobbyChatFeed?.observeSocketEntry?.(aKK,tj.length-1,bq.ln?.tp?.(aKK),'queue');",
    "native room chat queue");

  // System prompts and regular lobby notifications now share aGu.aHg(). Keep
  // the native queue intact, expose it for the lobby UI, and mirror its text.
  optional(/this\.aHj=function\(aIJ\)\{/g,
    "$&if(window.__fx){var fxNotificationText=bq.ln?.tp?.(aIJ)||aIJ?.s||'',fxMentionNotification=aIJ?.id===0&&!!bq.aGm?.aJT?.(aIJ.s);window.__fx.getLobbyNotificationHistory=function(){return (bq.message?.aIZ?.()||[]).map(function(item,index){return {index:index,id:item.id,senderId:item.uu,text:bq.ln?.tp?.(item)||item.s||''}})};if(aIJ?.id===6)window.__fx.lobbyChatFeed?.publish?.({id:'native-confirm:'+Date.now(),text:fxNotificationText,system:true,nativeType:6});if(aIJ?.id!==0||fxMentionNotification)window.dispatchEvent(new CustomEvent('fx-lobby-notification',{detail:{id:aIJ.id,index:aIJ.id===0?null:(bq.message?.aIZ?.()||[]).length,text:fxNotificationText,senderId:aIJ.uu,soundAllowed:!bm.buffer.data[14].value&&aIJ.id!==7,mention:fxMentionNotification}}));}",
    "native lobby notifications");

  // Native system prompts are also available from the live notification
  // stream; use native formatting so gold amounts and confirmation wording
  // stay aligned with the current game version.
  optional(/function aGv\(\)\{/g,
    "$&if(window.__fx){window.__fx.setNativeLobbyChatMode=mode=>{if(!bq?.f9){window.__fx.lobbyChatActivationStatus='waiting-for-session';return false;}try{var fxChatMode=Number(mode)||0,fxAccountId=bm?.buffer?.data?.[105]?.value;if(fxChatMode===0&&String(fxAccountId||'').length===0){if(typeof b1?.ej?.ek!=='function'){window.__fx.lobbyChatActivationStatus='native-subscribe-hook-unavailable';return false;}b1.ej.ek(0);}else{if(typeof b1?.aTQ?.aZM!=='function'){window.__fx.lobbyChatActivationStatus='native-subscribe-hook-unavailable';return false;}b1.aTQ.aZM(fxChatMode);}window.__fx.lobbyChatActivationStatus='native-stream-active';return true;}catch(error){window.__fx.lobbyChatActivationStatus='native-subscribe-failed';console.warn('[ZFX Client LobbyChat] Could not activate native room chat:',error);return false;}};window.__fx.getNativeLobbyChatState=()=>({available:!!bq?.z,sessionActive:!!bq?.f9,channel:'room',count:bq?.z?.tj?.length||0,messages:(bq?.z?.tj||[]).slice(-60).map(function(item,index){return {index:Math.max(0,(bq.z.tj.length-60))+index,id:item.id,senderId:item.uu,text:bq.ln?.tp?.(item)||item.s||'',system:item.id!==0}})});}",
    "native lobby chat diagnostics and activation");
});
