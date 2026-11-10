import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  const optional = (pattern, replacement, label) => {
    const before = modUtils.script;
    try {
      modUtils.replace(pattern, replacement);
      if (modUtils.script === before) console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`);
    } catch { console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`); }
  };

  // The 2.17.4 native client decodes room chat into bq.z.th. Forward the same
  // decoded item and native-formatted text to the custom lobby feed.
  optional(/tj\.push\(aKH\);/g,
    "tj.push(aKH);window.__fx?.lobbyChatFeed?.observeSocketEntry?.(aKH,tj.length-1,bq.ln?.tp?.(aKH))",
    "native room chat feed");

  // System prompts and regular lobby notifications now share aGu.aHg(). Keep
  // the native queue intact, expose it for the lobby UI, and mirror its text.
  optional(/this\.aHj=function\(aIJ\)\{/g,
    "$&if(window.__fx){var fxNotificationText=bq.ln?.tp?.(aIJ)||aIJ?.s||'';window.__fx.getLobbyNotificationHistory=function(){return (bq.message?.aIZ?.()||[]).map(function(item,index){return {index:index,id:item.id,senderId:item.uu,text:bq.ln?.tp?.(item)||item.s||''}})};if(aIJ?.id===6)window.__fx.lobbyChatFeed?.publish?.({id:'native-confirm:'+Date.now(),text:fxNotificationText,system:true,nativeType:6});if(aIJ?.id!==0)window.dispatchEvent(new CustomEvent('fx-lobby-notification',{detail:{id:aIJ.id,index:(bq.message?.aIZ?.()||[]).length,text:fxNotificationText,senderId:aIJ.uu,soundAllowed:!bm.buffer.data[14].value&&aIJ.id!==7}}));}",
    "native lobby notifications");

  // Native system prompts are also available from the live notification
  // stream; use native formatting so gold amounts and confirmation wording
  // stay aligned with the current game version.
  optional(/function aGv\(\)\{/g,
    "$&if(window.__fx){window.__fx.setNativeLobbyChatMode=mode=>{if(!bq?.f9){window.__fx.lobbyChatActivationStatus='waiting-for-session';return false;}window.__fx.lobbyChatActivationStatus='native-stream-active';return true;};window.__fx.getNativeLobbyChatState=()=>({available:!!bq?.z,sessionActive:!!bq?.f9,channel:'room',count:bq?.tx?.tj?.length||0,messages:(bq?.tx?.tj||[]).slice(-60).map(function(item,index){return {index:Math.max(0,(bq.tx.tj.length-60))+index,id:item.id,senderId:item.uu,text:bq.ln?.tp?.(item)||item.s||'',system:item.id!==0}})});}",
    "native lobby chat diagnostics and activation");
});
