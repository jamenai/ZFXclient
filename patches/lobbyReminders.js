import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceRawCode, replaceOne }) => {

    replaceRawCode(
        "function aEP(){var s1=bm.buffer.data[12].value;",
        "function aEP(){if(window.__fx){window.__fx.getGameLanguage=function(){return bm.buffer.data[12].value;};window.__fx.sidebar?.refreshTranslations?.();window.dispatchEvent(new CustomEvent('fx-game-language-change',{detail:{language:bm.buffer.data[12].value}}));}var s1=bm.buffer.data[12].value;"
    );

    replaceRawCode(
        `var packetType=reader.readBits(6);if(packetType===0){`,
        `if(!window.__fx.setNativeLobbyChatMode)window.__fx.setNativeLobbyChatMode=function(mode){var api=b1&&b1.aHV;if(!api||typeof api.aHW!=="function"){window.__fx.lobbyChatActivationStatus="inactive:"+mode;return false;}if(!bq||bq.f7!==1){window.__fx.lobbyChatActivationStatus="waiting-for-session:"+mode;return false;}api.aHW(Number(mode)===1?1:0);window.__fx.lobbyChatActivationStatus="sent:"+(Number(mode)===1?1:0);window.__fx.lobbyChatFeed?.observeChatModeCommand(Number(mode)===1?1:0);return true;};if(!window.__fx.getLobbyChatSenderName)window.__fx.getLobbyChatSenderName=function(senderId){if(senderId==null)return null;var id=Number(senderId);var player=bq&&bq.wo&&bq.wo.aHK?bq.wo.aHK(id):null;return player&&player.username||window.__fx.lobbyChatNamesById?.[String(id)]||null;};if(!window.__fx.getLobbyChatSenderColor)window.__fx.getLobbyChatSenderColor=function(senderId){if(senderId==null)return null;var player=bq&&bq.wo&&bq.wo.aHK?bq.wo.aHK(Number(senderId)):null;return player&&window.__fx.getNativeLobbyPlayerColor?window.__fx.getNativeLobbyPlayerColor(player):null;};if(!window.__fx.resolveLobbyChatMentionId)window.__fx.resolveLobbyChatMentionId=function(shortId){return bJ.f1.f2(shortId,5);};if(!window.__fx.resolveLobbyChatMention)window.__fx.resolveLobbyChatMention=function(shortId){var userId=bJ.f1.f2(shortId,5);var player=bq&&bq.wo&&bq.wo.aHK?bq.wo.aHK(userId):null;return player&&player.username||window.__fx.lobbyChatNamesById?.[String(userId)]||null;};if(!window.__fx.resolveLobbyChatMentionColor)window.__fx.resolveLobbyChatMentionColor=function(shortId){var userId=bJ.f1.f2(shortId,5);var player=bq&&bq.wo&&bq.wo.aHK?bq.wo.aHK(userId):null;return player&&window.__fx.getNativeLobbyPlayerColor?window.__fx.getNativeLobbyPlayerColor(player):null;};var packetType=reader.readBits(6);__fx.lobbyChatFeed?.observeSocketPacket(packetType);if(packetType===0){`
    );

    // The 2.17.x room chat arrives both as a batched history update (aYV)
    // and as a single live message (aYW). Use the native formatter so system
    // entries and prompts retain the game's wording and gold amounts.
    replaceOne(/tU\.push\(aK4\)/g,
        `tU.push(aK4);window.__fx?.lobbyChatFeed?.observeSocketEntry?.(aK4,tU.length-1,bq.ll?.tZ?.(aK4))`);

    // Temporary console probes: these native handlers receive the lobby-chat
    // history and individual live messages, respectively. Keep them distinct
    // from the outer socket packet counters while tracing missing chat.
    try {
        replaceOne(/this\.aYV=function\(oR\)\{/g,
            `$&console.info("[ZFX Client LobbyChat] native history handler",{channel:bq?.z?.aGn,queued:bq?.z?.tU?.length||0});`);
    } catch { console.warn("[ZFX Client LobbyChat] history handler probe was not installed."); }

    // Live lobby messages use a separate packet handler from the batch queue
    // above. Forward these directly too; they are not necessarily appended to
    // bq.z.tU, so the periodic queue replay cannot be relied on for them.
    try {
        replaceOne(/bq\.message\.aHR\(aK4\)/g,
            `bq.message.aHR(aK4);window.__fx?.lobbyChatFeed?.observeSocketEntry?.(aK4,"live:"+Date.now(),bq.ll?.tZ?.(aK4))`);
        replaceOne(/this\.aYW=function\(oR\)\{/g,
            `$&console.info("[ZFX Client LobbyChat] native live-message handler",{channel:bq?.z?.aGn});`);
    } catch (error) { console.info("[ZFX Client] Native live lobby chat hook is absent in this game version.", error); }

    // Make the native shared chat queue inspectable from DevTools. This also
    // confirms whether the game received a message before Vue renders it.
    try {
        replaceOne(
            /(__fx\.lobbyChatFeed\?\.observeSocketPacket\(\w+\);)/g,
            `if(!window.__fx.getNativeLobbyChatState)window.__fx.getNativeLobbyChatState=function(){var state=bq&&bq.z;var messages=state&&Array.isArray(state.tU)?state.tU:[];return {available:!!state,sessionActive:!!(bq&&bq.f7===1),channel:state&&state.aGn,sequence:state&&state.tV,count:messages.length,messages:messages.slice(-60).map(function(message,index){var type=message&&message.id;return {index:Math.max(0,messages.length-60)+index,id:type,senderId:message&&message.ue,text:type===0?message.s:(bq.ll&&bq.ll.tZ?bq.ll.tZ(message):message.s),system:type!==0};})};};$1`
        );
    } catch (error) {
        console.warn("[ZFX Client] Native chat diagnostics hook unavailable:", error);
    }

    // Mirror the original lobby notification queue into an event the custom
    // lobby can render with its own styling.
    replaceRawCode(
        `var sC=bq.lj.tT(aG2,bq.lj.tU(aG2));`,
        `var sC=bq.lj.tT(aG2,bq.lj.tU(aG2));var fxLobbyNotificationManager=bq&&bq.message;var fxLobbyNotificationList=fxLobbyNotificationManager&&typeof fxLobbyNotificationManager.aGG==="function"?fxLobbyNotificationManager.aGG():[];if(window.__fx)window.__fx.getLobbyNotificationHistory=function(){var manager=bq&&bq.message;var history=manager&&typeof manager.aGG==="function"?manager.aGG():[];return Array.isArray(history)?history.map(function(notification,index){return {index:index,id:notification.id,text:bq.lj.tT(notification,bq.lj.tU(notification)).s};}):[];};if(aG2.id!==6&&sC)window.dispatchEvent(new CustomEvent("fx-lobby-notification",{detail:{id:aG2.id,index:fxLobbyNotificationList.indexOf(aG2),text:sC.s,soundAllowed:!!aG2.__fxSoundAllowed}}));`
    );

    // Version 2.17.3 stores native lobby notifications in aJD and renders
    // them through bq.message. Mirror that queue to the existing lobby feed.
    try {
        replaceOne(/aJD\.push\(aI1\);/g,
            `aJD.push(aI1);if(window.__fx){window.__fx.getLobbyNotificationHistory=function(){return aJD.slice(-30).map(function(item,index){return {index:index,id:item.id,senderId:item.ue,text:item.s,soundAllowed:!!item.__fxSoundAllowed};});};if(aI1.id!==0)window.dispatchEvent(new CustomEvent("fx-lobby-notification",{detail:{id:aI1.id,index:aJD.length-1,text:sM&&sM.s||"",soundAllowed:!!aI1.__fxSoundAllowed}}));}`);
    } catch { console.info("[ZFX Client] 2.17.3 notification feed hook is absent in this game version."); }

    // The original message manager renders its notification corner directly.
    // Keep the queue intact for Vue, but close both native notification panels
    // whenever the custom lobby is active.
    const nativeLobbyNotification = `window.__fx&&window.__fx.getGameVar("gameState")!==1`;
    // The current native manager aGf renders its single card in aJJ and the
    // history panel in aJK. Preserve the shared queue while Vue owns the lobby.
    try {
        replaceOne(/function aJJ\(\)\{/g,
            `function aJJ(){if(${nativeLobbyNotification})return;`);
    } catch { console.info("[ZFX Client] Native single-notification panel hook is absent in this game version."); }
    try {
        replaceOne(/function aJK\(\)\{aJG=1;/g,
            `function aJK(){if(${nativeLobbyNotification})return;aJG=1;`);
    } catch { console.info("[ZFX Client] Native notification-history panel hook is absent in this game version."); }

    // Entry reminders consume gameSdk.lobby snapshots. The native notification
    // manager was reshaped in 2.17.x, so the former aG7 sound bridge is obsolete.
})
