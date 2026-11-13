import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  const optional = (pattern, replacement, label) => {
    const before = modUtils.script;
    try {
      modUtils.script = modUtils.script.replace(pattern, replacement);
      if (modUtils.script === before) console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`);
    } catch { console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`); }
  };

  // 2.17.9 decodes room-chat history in aZU and each live entry in aZV.
  // Observe both paths; the feed adapter deduplicates history/live overlap.
  optional(/py\.push\(aKy\);/g,
    "py.push(aKy);window.__fx?.lobbyChatFeed?.observeSocketEntry?.(aKy,py.length-1,(aKy?.id===0?aKy?.s:bq.lr?.q2?.(aKy,bq.lr?.q3?.(aKy))?.s),'queue');",
    "native room chat history");
  optional(/bq\.message\.aIK\(aKy\);/g,
    "window.__fx?.lobbyChatFeed?.observeSocketEntry?.(aKy,null,(aKy?.id===0?aKy?.s:bq.lr?.q2?.(aKy,bq.lr?.q3?.(aKy))?.s),'live');bq.message.aIK(aKy);",
    "native live room chat");

  // Native aHa.a4I is the transport endpoint behind the chat adapter. Keep
  // the patched native method private to the low-level transport bridge.
  optional(/function aHa\(\)\{/g,
    "$&if(window.__fx){window.__fx.nativeLobbyChatTransport=window.__fx.nativeLobbyChatTransport||{};window.__fx.nativeLobbyChatTransport.sendMessage=message=>{if(!bq?.fD||typeof bq?.pe?.a4I!=='function')return false;bq.pe.a4I(String(message));return true;};}",
    "native lobby chat send");

  // Confirm a clan action only when Terri's native chat parser actually opened
  // its confirmation state. Sending "yes" unconditionally can turn into a
  // separate chat message when the tag was rejected or the prompt is absent.
  optional(/this\.aK3=function\(\)\{return aJn;\};/g,
    "$&if(window.__fx){delete window.__fx.sendLobbyMessage;delete window.__fx.sendClanMessage;window.__fx.nativeLobbyChatTransport=window.__fx.nativeLobbyChatTransport||{};window.__fx.nativeLobbyChatTransport.sendClanMessage=(clan,message)=>{var tag=String(clan||'').trim().replace(/^\\[|\\]$/g,'').toUpperCase(),text=String(message||'').trim();if(!tag||tag.length>6||!/^[A-Z0-9_-]+$/.test(tag)||!text||!bq?.fD||typeof bq?.pe?.a4I!=='function'||bq.pe.aK3?.())return false;bq.pe.a4I('@['+tag+'] '+text);if(!bq.pe.aK3?.())return false;bq.pe.a4I('yes');return !bq.pe.aK3?.();};}",
    "native clan call confirmation");

  // aZV is the current decoded native lobby-notification entry point. Preserve
  // the native UI and mirror non-chat notifications to the Vue notification
  // panel using the game's own localized formatter.
  optional(/bq\.message\.aIK\(aKy\);/g,
    "if(window.__fx&&aKy?.id!==0){var fxNotificationText=bq.lr?.q2?.(aKy,bq.lr?.q3?.(aKy))?.s||aKy?.s||'';if(aKy?.id===6)window.__fx.lobbyChatFeed?.publish?.({id:'native-confirm:'+Date.now(),text:fxNotificationText,system:true,nativeType:6});window.dispatchEvent(new CustomEvent('fx-lobby-notification',{detail:{id:aKy.id,index:null,text:fxNotificationText,senderId:aKy.pk,soundAllowed:!bm.buffer.data[14].value&&aKy.id!==7,mention:false}}));}bq.message.aIK(aKy);",
    "native lobby notifications");
});
