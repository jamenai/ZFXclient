import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceRawCode, replaceOne }) => {

    replaceRawCode(
        "function aEP(){var s1=bm.buffer.data[12].value;",
        "function aEP(){if(window.__fx){window.__fx.getGameLanguage=function(){return bm.buffer.data[12].value;};window.__fx.sidebar?.refreshTranslations?.();window.dispatchEvent(new CustomEvent('fx-game-language-change',{detail:{language:bm.buffer.data[12].value}}));}var s1=bm.buffer.data[12].value;"
    );

    replaceRawCode(
        `var packetType=reader.readBits(6);if(packetType===0){`,
        `if(!window.__fx.setNativeLobbyChatMode)window.__fx.setNativeLobbyChatMode=function(mode){var socket=b1&&b1.aH4;if(!socket||typeof socket.aH5!=="function"){window.__fx.lobbyChatActivationStatus="inactive:"+mode;return false;}socket.aH5(Number(mode)||0);window.__fx.lobbyChatActivationStatus="sent:"+mode;window.__fx.lobbyChatFeed?.observeChatModeCommand(mode);return true;};if(!window.__fx.getLobbyChatSenderName)window.__fx.getLobbyChatSenderName=function(senderId){var player=bq&&bq.wh&&bq.wh.aGv?bq.wh.aGv(Number(senderId)):null;return player&&player.username||null;};if(!window.__fx.getLobbyChatSenderColor)window.__fx.getLobbyChatSenderColor=function(senderId){var player=bq&&bq.wh&&bq.wh.aGv?bq.wh.aGv(Number(senderId)):null;return player&&bq.lk&&bq.lk.wt?bq.lk.wt(player.wu):null;};if(!window.__fx.resolveLobbyChatMentionId)window.__fx.resolveLobbyChatMentionId=function(shortId){return bJ.f1.f2(shortId,5);};if(!window.__fx.resolveLobbyChatMention)window.__fx.resolveLobbyChatMention=function(shortId){var userId=bJ.f1.f2(shortId,5);var player=bq&&bq.wh&&bq.wh.aGv?bq.wh.aGv(userId):null;return player&&player.username||null;};if(!window.__fx.resolveLobbyChatMentionColor)window.__fx.resolveLobbyChatMentionColor=function(shortId){var userId=bJ.f1.f2(shortId,5);var player=bq&&bq.wh&&bq.wh.aGv?bq.wh.aGv(userId):null;return player&&bq.lk&&bq.lk.wt?bq.lk.wt(player.wu):null;};var packetType=reader.readBits(6);__fx.lobbyChatFeed?.observeSocketPacket(packetType);if(packetType===0){`
    );

    // Make the native shared chat queue inspectable from DevTools. This also
    // confirms whether the game received a message before Vue renders it.
    try {
        replaceOne(
            /(__fx\.lobbyChatFeed\?\.observeSocketPacket\(\w+\);)/g,
            `if(!window.__fx.getNativeLobbyChatState)window.__fx.getNativeLobbyChatState=function(){var state=bq&&bq.z;var messages=state&&Array.isArray(state.tN)?state.tN:[];return {available:!!state,sequence:state&&state.tO,count:messages.length,messages:messages.slice(-30).map(function(message,index){return {index:index,id:message&&message.id,senderId:message&&message.uX,text:message&&message.s};})};};$1`
        );
    } catch (error) {
        console.warn("[ZFX Client] Native chat diagnostics hook unavailable:", error);
    }

    // Mirror the original lobby notification queue into an event the custom
    // lobby can render with its own styling.
    replaceRawCode(
        `var sC=bq.lj.tT(aG2,bq.lj.tU(aG2));`,
        `var sC=bq.lj.tT(aG2,bq.lj.tU(aG2));var fxLobbyNotificationManager=bq&&bq.message;var fxLobbyNotificationList=fxLobbyNotificationManager&&typeof fxLobbyNotificationManager.aGG==="function"?fxLobbyNotificationManager.aGG():[];if(window.__fx)window.__fx.getLobbyNotificationHistory=function(){var manager=bq&&bq.message;var history=manager&&typeof manager.aGG==="function"?manager.aGG():[];return Array.isArray(history)?history.map(function(notification,index){return {index:index,id:notification.id,text:bq.lj.tT(notification,bq.lj.tU(notification)).s};}):[];};if(aG2.id!==6&&sC)window.dispatchEvent(new CustomEvent("fx-lobby-notification",{detail:{id:aG2.id,index:fxLobbyNotificationList.indexOf(aG2),text:sC.s}}));`
    );

    // The original message manager renders its notification corner directly.
    // Keep the queue intact for Vue, but close both native notification panels
    // whenever the custom lobby is active.
    const nativeLobbyNotification = `window.__fx&&window.__fx.settings&&window.__fx.settings.customLobbyView===true&&window.__fx.getGameVar("gameState")!==1`;
    // In the current build aIg/aIh render the native single card and history
    // panel. Preserve the shared queue while Vue owns the lobby display.
    replaceOne(/function aIg\(\)\{if\(aIa\.length===0\)\{return\}/g,
        `function aIg(){if(${nativeLobbyNotification})return;if(aIa.length===0){return}`);
    replaceOne(/function aIh\(\)\{aId=1;/g,
        `function aIh(){if(${nativeLobbyNotification})return;aId=1;`);

    // Entry reminders consume gameSdk.lobby snapshots. The native notification
    // manager was reshaped in 2.17.x, so the former aG7 sound bridge is obsolete.
})
