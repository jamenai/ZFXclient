import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // aHC is the current native notification queue. Forward live entries and
  // replay its existing queue for the Vue lobby chat feed.
  try {
    replaceOne(/this\.aHx=function\(pe\)\{/g,
      '$&var fxNativeChatText=bq.lv.py(pe,bq.lv.pz(pe));window.__fx?.lobbyChatFeed?.observeSocketEntry?.(pe,null,fxNativeChatText,"live");');
    replaceOne(/this\.aIm=function\(\)\{return aK0;\};/g,
      'this.aIm=function(){for(var fxChatIndex=0;fxChatIndex<aK0.length;fxChatIndex++){var fxChatEntry=aK0[fxChatIndex];window.__fx?.lobbyChatFeed?.observeSocketEntry?.(fxChatEntry,fxChatIndex,bq.lv.py(fxChatEntry,bq.lv.pz(fxChatEntry)),"queue");}return aK0;};');
    console.info("[ZFX Client] Connected lobby chat feed to the current native notification queue.");
  } catch (error) {
    console.info("[ZFX Client] Native lobby chat queue hooks are absent in this game version.", error.message);
  }

  // aHD is the current lobby chat parser. Use its text parser for both sends
  // and confirmation responses, so native mention checks remain in effect.
  try {
    replaceOne(/function aHD\(\)\{/g,
      'function aHD(){if(window.__fx){var fxNativeChat=this,fxChatTransport=window.__fx.nativeLobbyChatTransport=window.__fx.nativeLobbyChatTransport||{};fxChatTransport.subscribeLobby=()=>bq.fH===1;fxChatTransport.sendMessage=message=>{var text=String(message??"").trim();if(!text||!bq.fH||typeof fxNativeChat.a3q!=="function")return false;fxNativeChat.a3q(text);return true;};fxChatTransport.respondClanConfirmation=accept=>{if(!fxNativeChat.aJo?.())return false;fxNativeChat.a3q(accept?"yes":"no");return !fxNativeChat.aJo?.();};fxChatTransport.sendClanMessage=(clan,message)=>{var tag=String(clan??"").trim().replace(/^\\[|\\]$/g,"").toUpperCase(),text=String(message??"").trim();if(!tag||tag.length>6||!/^[A-Z0-9_-]+$/.test(tag)||!text||!bq.fH||typeof fxNativeChat.a3q!=="function"||fxNativeChat.aJo?.())return false;fxNativeChat.a3q("@["+tag+"] "+text);return window.__fx.nativeNotificationAdapter?.isConfirmationPending?.()===true;};}');
    console.info("[ZFX Client] Connected lobby chat send and clan confirmation to native aHD.");
  } catch (error) {
    console.info("[ZFX Client] Native lobby chat parser hook is absent in this game version.", error.message);
  }
});
