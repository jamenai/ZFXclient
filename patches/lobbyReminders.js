import { definePatch, insert } from "../modUtils.js";

export default definePatch(({ matchCode, insertCode, modifyCode, matchRawCode, replaceRawCode, replaceOne }) => {

    replaceRawCode(
        "function aEP(){var s1=bm.buffer.data[12].value;",
        "function aEP(){if(window.__fx){window.__fx.getGameLanguage=function(){return bm.buffer.data[12].value;};window.__fx.sidebar?.refreshTranslations?.();window.dispatchEvent(new CustomEvent('fx-game-language-change',{detail:{language:bm.buffer.data[12].value}}));}var s1=bm.buffer.data[12].value;"
    );

    replaceRawCode(
        `var packetType=reader.readBits(6);if(packetType===0){`,
        `if(!window.__fx.setNativeLobbyChatMode)window.__fx.setNativeLobbyChatMode=function(mode){var token=window.__fx.lobbyChatActivationToken=(window.__fx.lobbyChatActivationToken||0)+1;var started=Date.now();window.__fx.lobbyChatActivationStatus="requested:"+mode;var sendMode=()=>{if(token!==window.__fx.lobbyChatActivationToken)return;var manager=b1;if(!manager||!manager.z||!manager.aGx||!manager.aGx.aGy||!manager.z.ef(manager.z.f7)){window.__fx.lobbyChatActivationStatus="waiting:"+mode;if(mode===0&&Date.now()-started<60000){setTimeout(sendMode,250);return;}window.__fx.lobbyChatActivationStatus="inactive:"+mode;return;}window.__fx.lobbyChatActivationStatus="sent:"+mode;__fx.lobbyChatFeed?.observeChatModeCommand(mode);manager.aGx.aGy(mode);};sendMode();};if(!window.__fx.getLobbyChatSenderName)window.__fx.getLobbyChatSenderName=function(senderId){var player=bq&&bq.wZ&&bq.wZ.aGc?bq.wZ.aGc(senderId):null;if(!player&&bq&&bq.wZ&&Array.isArray(bq.wZ.aGC)){for(var index=bq.wZ.aGC.length-1;index>=0;index--){if(bq.wZ.aGC[index].uX===senderId){player=bq.wZ.aGC[index];break;}}}return player&&player.username||null;};if(!window.__fx.getLobbyChatSenderColor)window.__fx.getLobbyChatSenderColor=function(senderId){var player=bq&&bq.wZ&&bq.wZ.aGc?bq.wZ.aGc(senderId):null;if(!player&&bq&&bq.wZ&&Array.isArray(bq.wZ.aGC)){for(var index=bq.wZ.aGC.length-1;index>=0;index--){if(bq.wZ.aGC[index].uX===senderId){player=bq.wZ.aGC[index];break;}}}return player&&bq.lj&&bq.lj.wg?bq.lj.wg(player.wh):null;};if(!window.__fx.resolveLobbyChatMentionId)window.__fx.resolveLobbyChatMentionId=function(shortId){return bJ.f0.f1(shortId,5);};if(!window.__fx.resolveLobbyChatMention)window.__fx.resolveLobbyChatMention=function(shortId){var userId=bJ.f0.f1(shortId,5);var player=bq&&bq.wZ&&bq.wZ.aGc?bq.wZ.aGc(userId):null;if(!player&&bq&&bq.wZ&&Array.isArray(bq.wZ.aGC)){for(var index=bq.wZ.aGC.length-1;index>=0;index--){if(bq.wZ.aGC[index].uX===userId){player=bq.wZ.aGC[index];break;}}}if(!player&&bq&&bq.wZ&&bq.wZ.aGK)player=bq.wZ.aGK(userId,shortId,1,999999,999999,0,0,0,0,1);return player&&player.username||null;};if(!window.__fx.resolveLobbyChatMentionColor)window.__fx.resolveLobbyChatMentionColor=function(shortId){var userId=bJ.f0.f1(shortId,5);var player=bq&&bq.wZ&&bq.wZ.aGc?bq.wZ.aGc(userId):null;if(!player&&bq&&bq.wZ&&Array.isArray(bq.wZ.aGC)){for(var index=bq.wZ.aGC.length-1;index>=0;index--){if(bq.wZ.aGC[index].uX===userId){player=bq.wZ.aGC[index];break;}}}if(!player&&bq&&bq.wZ&&bq.wZ.aGK)player=bq.wZ.aGK(userId,shortId,1,999999,999999,0,0,0,0,1);return player&&bq.lj&&bq.lj.wg?bq.lj.wg(player.wh):null;};var packetType=reader.readBits(6);__fx.lobbyChatFeed?.observeSocketPacket(packetType);if(packetType===0){`
    );

    // The native chat selector sends action 0 through aGm.aGn. Waiting for an
    // already-active chat socket is circular because this request initializes it.
    replaceOne(
        /!manager\|\|!manager\.z\|\|!manager\.aGx\|\|!manager\.aGx\.aGy\|\|!manager\.z\.ef\(manager\.z\.f7\)/g,
        "!manager||!manager.aGm||!manager.aGm.aGn"
    );
    replaceOne(
        /window\.__fx\.lobbyChatActivationStatus="sent:"\+mode;__fx\.lobbyChatFeed\?\.observeChatModeCommand\(mode\);manager\.aGx\.aGy\(mode\);/g,
        `manager.aGm.aGn(mode);window.__fx.lobbyChatActivationStatus="sent:"+mode;__fx.lobbyChatFeed?.observeChatModeCommand(mode);`
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
    // This UI-only hook changes between native game builds. Keep it optional:
    // a missing notification panel must not prevent the WebSocket chat hook below.
    try {
        replaceOne(
            /aH3\.show\(aH4\[aH5\]\);/g,
            `(${nativeLobbyNotification})?(aH3.vx(),aH3=null):aH3.show(aH4[aH5]);`
        );
        replaceOne(
            /aH3\.show\(\);/g,
            `(${nativeLobbyNotification})?(aH3.vx(),aH3=null):aH3.show();`
        );
    } catch (error) {
        console.warn("[ZFX Client] Native lobby notification hook unavailable:", error);
    }

    // These legacy lobby reminder hooks depend on constructor details that
    // have changed in the current native build. They are optional and must not
    // roll back the independent WebSocket chat hook above.
    try {
    matchCode(`function LobbyRoom() {
        this.lobbyRoomState = 0;
        this.lobbyRoomMap = 0;
        this.lobbyRoomMapSeed = 0;
        this.lobbyRoomMode = 0;
        this.lobbyRoomNextMap = 0;
        this.lobbyRoomNextMapSeed = 0;
        this.lobbyRoomNextMode = 0;
        this.lobbyRoomIsContest = 0;
        this.lobbyRoomTimeLeft = 0;
        this.lobbyRoomSpawningSeed = 0;
        this.lobbyRoomPlayerIndex = 0;
        this.lobbyRoomTeamOffset = 0;
        this.lobbyRoomChatLog = [];
        this.lobbyRoomChatId = 1048575;
        /*...*/
    }`, {
        addToDictionary: ["lobbyRoomState", "lobbyRoomMap", "lobbyRoomMode", "lobbyRoomNextMap", "lobbyRoomNextMode",
            "lobbyRoomIsContest", "lobbyRoomTimeLeft", "lobbyRoomChatLog", "lobbyRoomChatId"]
    })

    matchCode(`function getMapName(mapIndex, unusedMapSeed) { return mapHolder.mapInfo.mapNames[mapIndex] }`,
        { addToDictionary: ["mapHolder", "mapInfo", "mapNames"] })

    const { container, pushMessage, messageTextField } = matchRawCode(
        `resultText=formatList(entries," is"," are"," in the lobby.");if(resultText.length){container.message.pushMessage({id:7,messageTextField:resultText})}list1=[];list2=[];counter=0}`
    )

    insertCode(`this.di = function () {
        for (var index = 0; index < this.lobbyRooms.length; index++) { this.lobbyRooms[index] = new LobbyRoom }
        this.lobbySelection[0] = settingsHolder.userSettings.data[158].value
        /* here */
    }`, `__fx.lobbyReminders.setLobbySource(this.lobbyRooms, this.lobbySelection);
    __fx.lobbyReminders.setPopupHandler(function (text) { bq.message.aEd({ id: 7, s: text }); });`,
        { dictionary: { bq: container, aEd: pushMessage, s: messageTextField } })

    modifyCode(`this.onFullLobbyUpdate = function () {
        updateLobbyUI(true);
        lobbyManager.joinTracker.di();
        ${insert(`__fx.lobbyReminders.check();`)}
    };
    this.onLobbyUpdate = function () {
        lobbyManager.joinTracker.onLobbyUpdate();
        updateRoomTimers();
        updateLobbyUI(false);
        ${insert(`__fx.lobbyReminders.check();`)}
    }`)

    insertCode(`/* here */
    function replayPendingSound() { pendingSoundCount++; notificationSound.play() }
    this.play = function () {
        if (!soundsLoaded) { return }
        var timeNow = performance.now();
        /*...*/
    }`, `__fx.lobbyReminders.setSound(function () { notificationSound.play(); });`)
    } catch (error) {
        console.warn("[ZFX Client] Legacy lobby reminder hooks unavailable:", error);
    }
})
