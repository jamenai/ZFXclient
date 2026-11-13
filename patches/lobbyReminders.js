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
    "$&if(window.__fx){window.__fx.nativeLobbyChatTransport=window.__fx.nativeLobbyChatTransport||{};window.__fx.nativeLobbyChatTransport.sendMessage=message=>{var text=String(message);if(!bq?.fD||typeof bq?.pe?.a4I!=='function'||window.__fx.nativeNotificationAdapter?.canSendChatMessage?.(text)===false)return false;bq.pe.a4I(text);window.__fx.nativeNotificationAdapter?.handleManualResponse?.(text,!bq.pe.aK3?.());return true;};window.__fx.nativeLobbyChatTransport.respondClanConfirmation=accept=>{if(!bq?.fD||!bq?.pe?.aK3?.()||typeof bq?.pe?.a4I!=='function')return false;bq.pe.a4I(accept?'yes':'no');return !bq.pe.aK3?.();};}",
    "native lobby chat send");

  // Confirm a clan action only when Terri's native chat parser actually opened
  // its confirmation state. Sending "yes" unconditionally can turn into a
  // separate chat message when the tag was rejected or the prompt is absent.
  optional(/this\.aK3=function\(\)\{return aJn;\};/g,
    "$&if(window.__fx){delete window.__fx.sendLobbyMessage;delete window.__fx.sendClanMessage;window.__fx.nativeLobbyChatTransport=window.__fx.nativeLobbyChatTransport||{};window.__fx.nativeLobbyChatTransport.sendClanMessage=(clan,message)=>{var tag=String(clan||'').trim().replace(/^\\[|\\]$/g,'').toUpperCase(),text=String(message||'').trim();if(!tag||tag.length>6||!/^[A-Z0-9_-]+$/.test(tag)||!text||!bq?.fD||typeof bq?.pe?.a4I!=='function'||bq.pe.aK3?.())return false;bq.pe.a4I('@['+tag+'] '+text);return window.__fx.nativeNotificationAdapter?.isConfirmationPending?.()===true;};}",
    "native clan call confirmation");

});
