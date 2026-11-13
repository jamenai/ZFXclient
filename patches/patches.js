import assets from '../assets.js';
import ModUtils from '../modUtils.js';

function replaceRequired(modUtils, expression, replacement, featureName) {
    if (!expression.global) throw new Error(`${featureName}: expected a global regular expression`);
    const matches = Array.from(modUtils.script.matchAll(expression)).length;
    if (matches === 0) {
        console.info(`[Sidebar integration] Native hook for ${featureName} is absent in this game version.`);
        return 0;
    }
    modUtils.replace(expression, replacement);
    return matches;
}

export default (/** @type {ModUtils} */ modUtils) => {
    const { insertCode, waitForMinification } = modUtils

    // Catch native multiplayer socket errors against the current pre-minified
    // close-handler signature. Keep the retry for 4215 and expose 4527 as the
    // server's "already logged in" rejection.
    const socketCloseLogPattern = /this\.(?<handler>\w+)=function\((?<socketIndex>\w+),(?<errorCode>\w+)\)\{console\.log\("socket close index "\+\k<socketIndex>\+" error "\+\k<errorCode>\);/g;
    const { socketIndex, errorCode } = modUtils.matchOne(socketCloseLogPattern).groups;
    const { socketManager, closeConnections } = modUtils.matchOne(
        /(?<socketManager>\w+\.\w+)\.(?<closeConnections>\w+)\(3260\)/g,
    ).groups;
    modUtils.fxSocketManager = socketManager;
    modUtils.fxCloseConnections = closeConnections;
    modUtils.replaceOne(
        socketCloseLogPattern,
        `$&if(${errorCode}===4215&&window.__fx.multiplayerRetryAvailableUntil>Date.now()){window.__fx.multiplayerRetryAvailableUntil=0;${socketManager}.close(0,3260);window.__fx.multiplayerResetUntil=Date.now()+1000;window.__fx.multiplayerStartPending=true;setTimeout(()=>{window.__fx.multiplayerStartPending=false;window.__fx.nativeStartMultiplayer(true)},1050);return;}if(${errorCode}===4527&&${socketIndex}===0)window.__fx.gameSdk?.lobby?.reportConnectionError?.(${errorCode},${socketIndex});`,
    );
    modUtils.replaceOne(/"Player already in lobby"/g, '"Already logged in to the multiplayer lobby"');

    // The native lobby creates one exact map preview canvas per game entry.
    // Forward it together with that entry's map index and seed before attaching it.
    modUtils.replaceRawCode(
        "sE.canvas=canvas;sE.vx=bq.wC.wD(wE.fF,wE.mapSeed);",
        "sE.canvas=canvas;if(window.__fx&&window.__fx.onNativeMapPreview)window.__fx.onNativeMapPreview(wE.fF,wE.mapSeed,canvas);sE.vx=bq.wC.wD(wE.fF,wE.mapSeed);"
    );

    // Render win count. The native game has moved this renderer; keep it an
    // optional decoration so the settings/game adapters still get installed.
    try { insertCode(`var s = Math.floor((Device.a1.largeUIEnabled() ? 0.018 : 0.0137) * h___.hz);
		ctx.font = Util.qd.sS(0, Math.max(5, s));
		Util.qd.textBaseline(ctx, 0);
		Util.qd.textAlign(ctx, 2);
		ctx.fillStyle = Colors.nl;
		ctx.fillText(clientInfo.gameVersion, h___.w, 0);
        /* here */`,
        `const text = "Win count: " + __fx.wins.count;
        const textLength = ctx.measureText(text).width;
        const size = Math.max(5, s);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(text, ctx.canvas.width - textLength - size / 2, size * 2);`); }
    catch { console.info("[ZFX Client] Native win-counter renderer hook is absent in this game version."); }

    // Make the main canvas context have an alpha channel if a custom background is being used
    try { insertCode(`mainCanvasElement = document.getElementById("canvasA");
		if (Device.id === 2) { mainCanvasElement.style.webkitUserSelect = "none"; }
		mainCanvas = mainCanvasElement.getContext("2d", { alpha: /* here */ false });`,
    `__fx.makeMainMenuTransparent ? true :`); }
    catch { console.info("[ZFX Client] Native main-canvas background hook is absent in this game version."); }

	// Reset donation history and leaderboard filter when a new game is started
	try { insertCode(`an.init();ai.a5l();bA.pQ.qC = [];bA.hZ.pT = 1;/* here */`,
	`__fx.donationsTracker.reset(), __fx.leaderboardFilter.reset(), __fx.customLobby.isActive() && __fx.customLobby.hideWindow();`); }
	catch { console.info("[ZFX Client] Native new-game reset hook is absent in this game version."); }

    // Capture the native profile payload before the game's final minification
    // changes its local function names. The client adapter maps this payload to
    // named account fields for the Vue account view.
    const currentAccountProfilePattern = /function aT7\(data\)\{/g;
    const accountProfilePattern = /function (?<profileFunction>\w+)\(data\)\{var \w+;var \w+;function \w+\(\)\{\w+=new \w+\(data\.username,/g;
    try {
        if (currentAccountProfilePattern.test(modUtils.script)) {
            currentAccountProfilePattern.lastIndex = 0;
            modUtils.replaceOne(currentAccountProfilePattern, "$&if(data&&data.pk!=null&&bq?.pq?.pk!=null&&Number(data.pk)===Number(bq.pq.pk)&&window.__fx.myAccountAdapter?.setNativeProfile)window.__fx.myAccountAdapter.setNativeProfile(data);");
        } else {
            const { profileFunction } = modUtils.matchOne(accountProfilePattern).groups;
            modUtils.replaceOne(new RegExp(`function ${profileFunction}\\(data\\)\\{`, "g"), "$&if(data&&data.uY!=null&&String(data.uY).toLowerCase()===String(window.__fx.getNativeAccountId?window.__fx.getNativeAccountId():\"\").toLowerCase()&&window.__fx.myAccountAdapter&&window.__fx.myAccountAdapter.setNativeProfile)window.__fx.myAccountAdapter.setNativeProfile(data);");
        }
    } catch { console.info("[Sidebar integration] Native account profile capture hook is absent in this game version."); }
    waitForMinification(() => applyPatches(modUtils))
}
//export const requiredVariables = ["game", "playerId", "playerData", "rawPlayerNames", "gIsSingleplayer", "playerTerritories"];

function applyPatches(/** @type {ModUtils} */ modUtils) {
    const { replace, replaceOne, replaceRawCode, safeDictionary, matchOne, matchRawCode, escapeRegExp } = modUtils;
    const homeNameInputPattern = /(?<nameInput>\w+)\s*=\s*new\s+\w+\(\s*(?<settingsBuffer>\w+)\.buffer\.data\[122\]\s*\)\s*;/g;
    const { nameInput, settingsBuffer } = matchOne(homeNameInputPattern).groups;
    replaceOne(homeNameInputPattern, `$&window.__fx.getNativeHomeNameInput=()=>${nameInput}.e;window.__fx.getNativeAccountId=()=>(${settingsBuffer}.buffer.data[105]&&${settingsBuffer}.buffer.data[105].value)||"";window.__fx.getNativeGameLabel=id=>L(id);window.__fx.getNativePlayerColor=()=>{var value=Number((bm.buffer.data[121]&&bm.buffer.data[121].value));if(!Number.isInteger(value)||value<0||value>262143)return null;return bD.color.a7C(value)};window.__fx.setNativePlayerColor=value=>{var match=/^#?([0-9a-f]{6})$/i.exec(String(value||""));if(!match)return false;var hex=match[1],rgb=[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];var packed=(Math.round(rgb[0]*63/255)<<12)|(Math.round(rgb[1]*63/255)<<6)|Math.round(rgb[2]*63/255);bm.rz.q5(121,packed);return true};window.__fx.setNativeHomeName=value=>{var input=${nameInput}.e;if(!input)return false;input.value=String(value).slice(0,20);input.dispatchEvent(new Event("blur"));return true};window.__fx.gameSettingsAdapter={getSnapshot:function(){var currentLanguage=(bm&&bm.buffer&&bm.buffer.data&&bm.buffer.data[12]&&bm.buffer.data[12].value)||"en";var values={},defaults={};[1,2,5,7,8,9,11,12,13,14,15,16].forEach(function(id){values[id]=(bm.buffer.data[id]&&bm.buffer.data[id].value);defaults[id]=(bm.buffer.data[id]&&bm.buffer.data[id].yq);});var languageOptions=[{value:"en",label:"English"},{value:"de",label:"Deutsch"}];if(!languageOptions.some(function(option){return option.value===currentLanguage;}))languageOptions.push({value:currentLanguage,label:currentLanguage});var shortcutDefaults=["Space","","KeyB","","KeyW","","KeyS","","KeyD","","KeyA","","KeyH","","NumpadAdd","","NumpadSubtract","","ArrowLeft","","ArrowRight","","ArrowUp","","ArrowDown","","KeyM","","KeyP","","KeyI",""];var shortcutValues=((ba&&ba.aFh)||shortcutDefaults).slice();return{values:values,defaults:defaults,connection:aa.aKu,defaultConnection:0,shortcuts:shortcutValues,shortcutDefaults:shortcutDefaults};},setField:function(id,value){if(!bm.buffer.data[id]||typeof (bm.rz&&bm.rz.q5)!=="function")return false;bm.rz.q5(id,value);return true;},setConnection:function(value){aa.aKu=Number(value)||0;},setShortcut:function(index,value){if(typeof (ba&&ba.aXV)!=="function")return false;ba.aXV(Number(index),String(value||""));return true;},resetShortcuts:function(){if(typeof (ba&&ba.aXS)!=="function")return false;ba.aXS();return true;},reset:function(){u.y();bm.qy.z7();u.v(2);}};`);
    replaceOne(/reset:function\(\)\{u\.y\(\);bm\.qy\.z7\(\);u\.v\(2\);\}\};/g,
        '$&window.dispatchEvent(new Event("fx-native-settings-adapter-ready"));');


    // The current game lazily creates overlay 29, while several live lobby
    // callbacks still call it as if it were always initialized.
    replaceRequired(modUtils, /u\.a8B\(29\)\.aGo\(\)/g, "u.a8B(29)?.aGo()", "lazy lobby overlay refresh");
    replaceRequired(modUtils, /u\.a8B\(29\)\.aHl\(\)/g, "u.a8B(29)?.aHl()", "lazy lobby overlay close");
    replaceRequired(modUtils, /u\.a8B\(29\)\.aIN\(\)\.tU\(sE\)/g, "u.a8B(29)?.aIN()?.tU(sE)", "lazy lobby overlay message");

    // Constants for easy usage of otherwise long variable access expressions
    const dict = safeDictionary;

    const playerId = `${dict.game}.${dict.playerId}`;
    const rawPlayerNames = `${dict.playerData}.${dict.rawPlayerNames}`;
    const gIsSingleplayer = `${dict.game}.${dict.gIsSingleplayer}`;

    // Replace assets
    replaceOne(/(\(4,"crown",4,")[^"]+"\),/g, "$1" + assets.crownIcon + "\"),");
    // Add update information
    try { replaceRawCode(`new k("🚀 New Game Update","The game was updated! Please reload the game. An internet connection is required.",!0,[`,
        `new k("🚀 New Game Update","The game was updated! Please reload the game. An internet connection is required."
        + "<div style='border: white; border-width: 1px; border-style: solid; margin: 10px; padding: 5px;'><h2>ZFX Client is not yet compatible with the latest version of the game.</h2><p>Updates should normally be available within a few hours.<br>You can still use ZFX in singleplayer mode.</p></div>",!0,[`
    ); } catch (error) {
        console.info("[ZFX Client] Native game-update dialog changed; compatibility notice hook is unavailable.");
    }

    // Max size for custom maps: from 4096x4096 to 8192x8192
    // TODO: test this; it might cause issues with new boat mechanics?

    try { // Add Troop Density and Maximum Troops in side panel
        const { valuesArray } = replaceRawCode(`,labels[5]=__L(0,"Interest"),labels[6]=__L(),labels[7]=__L(),(truncatedLabels=new Array(labels.length)).fill(""),(valuesArray=new Array(labels.length))[0]=game.io?`,
            `,labels[5]=__L(0,"Interest"),labels[6]=__L(),labels[7]=__L(),
		labels.push("Max Troops", "Density"), // add labels
		(truncatedLabels=new Array(labels.length)).fill(""),(valuesArray=new Array(labels.length))[0]=game.io?`);
        replaceOne(new RegExp(/(:(?<valueIndex>\w+)<7\?\w+\.\w+\.\w+\(valuesArray\[\2\]\)):(\w+\.\w+\(valuesArray\[7\]\))}/
            .source.replace(/valuesArray/g, valuesArray), "g"),
            '$1 : $<valueIndex> === 7 ? $3 '
            + `: $<valueIndex> === 8 ? __fx.utils.getMaxTroops(${dict.playerData}.${dict.playerTerritories}, ${playerId}) `
            + `: __fx.utils.getDensity(${playerId}) }`);
        // increase the size of the side panel by 25% to make the text easier to read
        replaceOne(/(this\.\w+=Math\.floor\(\(\w+\.\w+\.\w+\(\)\?\.1646:\.126\))\*(\w+\.\w+\),)/g, "$1 * 1.25 * $2");
    } catch (error) {
        console.info("[ZFX Client] Native troop-density panel hook is absent in this game version.");
    }

    try { // Feed the native status values into the Vue HUD and suppress the duplicate native panel.
        if (/gameStatusHudAdapter\?\.receiveNativeSnapshot\&\&fxStatusNow/.test(modUtils.script)) {
            console.info("[ZFX Client] Current native status-data adapter is installed.");
        } else if (/function cU\(\)\{/.test(modUtils.script)
            && /this\.el=function\(\)\{aFj\(\);aFk\(\);this\.nH\(\);aFl\(\);aFc\(\);aFm\(\);aFn\(\);aFo\(\);\};/.test(modUtils.script)) {
            replaceOne(/this\.el=function\(\)\{aFj\(\);aFk\(\);this\.nH\(\);aFl\(\);aFc\(\);aFm\(\);aFn\(\);aFo\(\);\};/g,
                'this.el=function(){aFj();aFk();this.nH();aFl();aFc();aFm();aFn();aFo();var fxStatusNow=Date.now();if(window.__fx?.gameStatusHudAdapter?.receiveNativeSnapshot&&fxStatusNow-(window.__fx.gameStatusHudLastSent||0)>=250){window.__fx.gameStatusHudLastSent=fxStatusNow;window.__fx.gameStatusHudAdapter.receiveNativeSnapshot({updatedAt:fxStatusNow,rows:aFU.map(function(label,index){return{index:index,label:label,value:aFd(index),visible:!!aFX[index]};}).filter(function(row){return row.visible&&row.label;})});}};');
            replaceOne(/this\.yr=function\(\)\{ys\.drawImage\(canvas,fn,fp\);\};/g,
                'this.yr=function(){};');
            console.info("[ZFX Client] Installed native status-data adapter for the current game HUD.");
        } else {
            replaceOne(/(p0\.fillStyle=bE\.pR),p0\.fillRect\(0,0,aX\.j,aX\.k\),p0\.fillStyle=bE\.po/g,
                '$1,p0.globalAlpha=1-Math.max(0,Math.min(70,__fx.settingsApi.getNumber("gameHudTransparency",15)))/100,p0.fillRect(0,0,aX.j,aX.k),p0.globalAlpha=1,p0.fillStyle=bE.po');
            replaceOne(/(function aF8\(\)\{)/g,
                '$1var fxStatusNow=Date.now();if(window.__fx.gameStatusHudAdapter?.receiveNativeSnapshot&&fxStatusNow-(window.__fx.gameStatusHudLastSent||0)>=250){window.__fx.gameStatusHudLastSent=fxStatusNow;window.__fx.gameStatusHudAdapter.receiveNativeSnapshot({updatedAt:fxStatusNow,rows:aEx.map(function(label,index){return{index:index,label:label,value:aF6(index),visible:!!aF0[index]};}).filter(function(row){return row.visible&&row.label;})});}');
            replaceOne(/this\.yI=function\(\)\{yJ\.drawImage\(canvas,fj,fl\)\}/g,
                'this.yI=function(){}');
            console.info("[ZFX Client] Native status HUD transparency hook installed.");
        }
    } catch (error) {
        console.info("[ZFX Client] Native status HUD transparency hook is absent in this game version.");
    }

    // Increment win counter on wins
    replaceRawCode(`=function(sE){a8.gD[sE]&&(o.ha(sE,2),b.h9<100?xD(0,__L([a8.jx[sE]]),3,sE,ad.gN,ad.kl,-1,!0):xD(0,__L([a8.jx[sE]]),3,sE,ad.gN,ad.kl,-1,!0))`,
        `=function(sE){
		if (${playerId} === sE && !${gIsSingleplayer} && !${dict.game}.${dict.gIsReplay})
			__fx.wins.count++, window.localStorage.setItem("fx_winCount", __fx.wins.count),
			xD(0,"Your Win Count is now " + __fx.wins.count,3,sE,ad.gN,ad.kl,-1,!0);
		a8.gD[sE]&&(o.ha(sE,2),b.h9<100?xD(0,__L([a8.jx[sE]]),3,sE,ad.gN,ad.kl,-1,!0):xD(0,__L([a8.jx[sE]]),3,sE,ad.gN,ad.kl,-1,!0))`);


    try { { // Add settings button and custom lobby button
        // add buttons
        replaceRawCode(`,new nQ("☰<br>"+__L(),function(){aD6(3)},aa.ks),new nQ("",function(){at.d5(12)},aa.kg,!1)]`,
            `,new nQ("☰<br>"+__L(),function(){aD6(3)},aa.ks),new nQ("",function(){at.d5(12)},aa.kg,!1),
            new nQ("ZFX Client settings", function() { if(typeof __fx.openVueSettings==="function")__fx.openVueSettings();else __fx.WindowManager.openWindow("settings"); }, "rgba(0, 0, 20, 0.5)"),
            new nQ("Join/Create custom lobby", function() { __fx.customLobby.showJoinPrompt(); }, "rgba(20, 9, 77, 0.5)")]`)
        // set position
        replaceRawCode(`aZ.g5.vO(aD3[3].button,x+a0S+gap,a3X+h+gap,a0S,h);`,
            `aZ.g5.vO(aD3[3].button,x+a0S+gap,a3X+h+gap,a0S,h);
            aZ.g5.vO(aD3[5].button, x, a3X + h * 2 + gap * 2, a0S * 2 + gap, h / 3);
            aZ.g5.vO(aD3[6].button, x, a3X + h * 2.33 + gap * 3, a0S * 2 + gap, h / 3);`);
    } } catch (error) {
        console.info("[ZFX Client] Native menu button layout changed; sidebar actions remain available.");
    }

    try { // Keybinds; this legacy post-minify hook is optional on newer games.
        // Native 2.18 attack percentage control. The relative setter is the
        // same method used by the built-in keyboard shortcuts (1/32 step).
        // Expose it directly; older builds exposed this through a separate
        // attack-bar object that no longer exists.
        const nativeRelativeAttack = /else if\(ba\.em\(code,10\)\)\{aS\.a5l\(31\/32\);\}else if\(ba\.em\(code,8\)\)\{aS\.a5l\(32\/31\);\}/g;
        if (nativeRelativeAttack.test(modUtils.script)) {
            nativeRelativeAttack.lastIndex = 0;
            replaceOne(nativeRelativeAttack,
                '$&window.__fx.keybindFunctions.setRelative=value=>{var factor=Number(value);if(Number.isFinite(factor)&&factor>0)aS.a5l(factor);};');
            replaceOne(/this\.a5l=function\(oD\)\{if\(aE\.a3f===0\|\|!this\.iP\(\)\)\{return;\}if\(aCV\(oD\)\)\{bi\.du=true;\}\};function aCV\(a66\)\{/g,
                '$&window.__fx.keybindFunctions.setAbsolute=value=>{var percentage=Math.max(1/1024,Math.min(1,Number(value)));if(Number.isFinite(percentage)&&aE.a3f!==0&&this.iP()){jG=percentage;aCL();bi.du=true;}};');
            replaceOne(/function a5Q\(e\)\{if\(a5T\(\)\)\{return;\}if\(i\.uc>0\)\{return;\}var code=e\.code;if\(!code\|\|!code\.length\)\{return;\}/g,
                '$&if(window.__fx?.keybindHandler?.(e)){e.preventDefault();return;}');
        } else {
        // match required variables
        const { 0: match, groups: { attackBarObject, setRelative } } = matchOne(/:\w+\.\w+\(\w+,8\)\?(?<attackBarObject>\w+)\.(?<setRelative>\w+)\(32\/31\):/g);
        // create a setAbsolutePercentage function on the attack percentage bar object,
        // and also register the keybind handler functions
        replaceOne(/}(function \w+\((\w+)\){return!\(1<\2&&1===(?<attackPercentage>\w+)\|\|\(1<\2&&\2\*\3-\3<1\/1024\?\2=\(\3\+1\/1024\)\/\3:\2<1)/g,
            "} this.setAbsolutePercentage = function(newPercentage) { $<attackPercentage> = newPercentage; }; "
            + "__fx.keybindFunctions.setAbsolute = this.setAbsolutePercentage; "
            + `__fx.keybindFunctions.setRelative = (arg1) => ${attackBarObject}.${setRelative}(arg1); $1`);
        // insert keybind handling code into the keyDown handler function
        replaceOne(new RegExp(/(function \w+\((?<event>\w+)\){)([^}]+matched)/g.source.replace(/matched/g, escapeRegExp(match)), "g"),
            "$1 if (__fx.keybindHandler($<event>)) return; $3");
        }
    } catch (error) {
        console.info("[ZFX Client] Legacy post-minification keybind hook is unavailable; native keybind adapter remains active.");
    }

    // Custom starting attack percentage
    replaceRawCode(`il=(bm.eU.data[182].value+1)/1024`,
        `il = __fx.settingsApi.getBoolean("startingPercentageEnabled") ? __fx.settingsApi.getNumber("startingPercentage", 50) / 100 : (bm.eU.data[182].value+1)/1024`)

    // Set the default font to Trebuchet MS
    replace(/sans-serif"/g, 'Trebuchet MS"');

    // Realistic bot names setting
    // matches c4[i] = c4[i].replace(a6U[dx], a6V[dx])
    replaceOne(/(((\w+)\[\w+\])=\2\.replace\(\w+(\[\w+\]),\w+\4\))/g, "$1; if (__fx.settingsApi.getBoolean(\"realisticNames\")) $3 = realisticNames;")

    // Hide all links in main menu depending on settings
    //replaceOne(/(this\.\w+=function\(\){)((\w+\.\w+)\[2\]=\3\[3\]=\3\[4\]=(?<linksHidden>!this\.\w+\.\w+),)/g,
    //"$1 if (settings.hideAllLinks) $3[0] = $3[1] = $<linksHidden>; else $3[0] = $3[1] = true; $2")

    // Clear canvas background if a custom background is being used
    try { replaceRawCode(`,this.qk=function(){var a4n,a4m;aq.pd?(a4m=aL.gA/aq.eE,a4n=aL.gF/aq.eF,canvas.setTransform(a4m=a4n<a4m?a4m:a4n,0,0,a4m,`,
        `,this.qk=function(){var a4n,a4m;
        if (__fx.makeMainMenuTransparent) canvas.clearRect(0,0,aL.gA,aL.gF);
        else aq.pd?(a4m=aL.gA/aq.eE,a4n=aL.gF/aq.eF,canvas.setTransform(a4m=a4n<a4m?a4m:a4n,0,0,a4m,`);
    } catch { console.info("[ZFX Client] Native custom-background transform hook is absent in this game version."); }

    // Track donations
    replaceOne(/(this\.\w+=function\((\w+),(\w+)\)\{)(\2===\w+\.\w+&&\(\w+\.\w+\((\w+\.\w+)\[0\],\5\[1\],\3\),this\.(\w+)\[12\]\+=\5\[1\],this\.\6\[16\]\+=\5\[0\]\),\3===\w+\.\w+&&\()/g,
        `$1 __fx.donationsTracker.logDonation($2, $3, $5[0], ${dict.sidebar}.${dict.getTime}()); if(Number($3)===aE.fQ&&Number($2)!==aE.fQ)window.__fx?.gameTickHudAdapter?.receiveDonation?.({amount:Number($5[0]),at:Date.now()}); $4`)


    // Keep the team pie labels readable when two-decimal percentages are on.
    try {
        modUtils.replaceOne(/fontSize\s*=\s*1\s*\*\s*eK\s*\*\s*Math\.min\(g4,\s*\.37\)/g,
            'fontSize=(__fx.settingsApi.getBoolean("detailedTeamPercentage")?0.68:0.85)*eK*Math.min(g4,.37)')
    } catch { console.info("[ZFX Client] Native team percentage font hook is absent in this game version."); }

    // Reserve the sidebar width in the game's logical viewport and keep mouse/touch coordinates aligned.
    replaceOne(/document\.body\.firstChild/g, 'document.getElementById("fx-game-shell").firstChild');
    const socketManager = modUtils.fxSocketManager;
    const closeConnections = modUtils.fxCloseConnections;
    if (!socketManager || !closeConnections) throw new Error("Native socket manager hook is unavailable.");
    const { isConnectedMethod } = matchOne(
        /this\.(?<isConnectedMethod>\w+)=function\(\w+\)\{return \w+\[\w+\]\.\w+&&\w+\[\w+\]\.\w+\(\);?\}/g
    ).groups;
    const socketActivePattern = /function (?<activeSocketMethod>\w+)\((?<socketIndex>\w+)\)\{return \w+\[\k<socketIndex>\]\.\w+&&\w+\[\k<socketIndex>\]\.\w+\(\)\}/g;
    const { activeSocketMethod } = matchOne(socketActivePattern).groups;
    replaceOne(socketActivePattern, `$&;window.__fx.isSocketActive=id=>${activeSocketMethod}(id)`);
    const homeMethodPattern = /this\.(?<homeMethod>\w+)=function\(\)\{(?<menuManager>\w+)\.(?<menuStateMethod>\w+)\(5,5\)\}/g;
    const { menuManager, menuStateMethod } = matchOne(homeMethodPattern).groups;
    const menuStateFieldPattern = new RegExp(
        `this\\.${menuStateMethod}=function\\((?<stateArgument>\\w+)[^)]*\\)\\{(?<setterBody>[^}]*?this\\.tZ\\(\\)[^}]*?this\\.(?<menuStateField>\\w+)===\\k<stateArgument>)`, "g"
    );
    let stateFieldMatches = [...modUtils.script.matchAll(menuStateFieldPattern)];
    // Current native menu manager (dK/u) stores its state in `uw`; its setter
    // has nested branches, so the older single-block signature above cannot
    // reach the assignment. Derive the field from the setter's first argument.
    if (stateFieldMatches.length === 0) {
        const currentMenuStateSetterPattern = new RegExp(
            `this\\.${menuStateMethod}=function\\((?<stateArgument>\\w+),[^)]*\\)\\{[\\s\\S]{0,1000}?this\\.(?<menuStateField>\\w+)=\\k<stateArgument>;`, "g"
        );
        stateFieldMatches = [...modUtils.script.matchAll(currentMenuStateSetterPattern)];
    }
    if (stateFieldMatches.length > 1) throw new Error(`Expected at most one native menu state field, found ${stateFieldMatches.length}.`);
    const menuStateField = stateFieldMatches[0]?.groups.menuStateField;
    const observeNativeLobby = menuStateField
        ? `(()=>{let attempts=0;const install=()=>{if(window.__fx?.installNativeLobbyRouteObserver?.(${menuManager},${JSON.stringify(menuStateMethod)},${JSON.stringify(menuStateField)}))return;if(++attempts<120)setTimeout(install,250)};install()})();`
        : `console.info("[ZFX Client] Native lobby route observer unavailable in this game version.");`;
    replaceOne(
        homeMethodPattern,
        `$&,${observeNativeLobby}window.__fx.openHome=()=>{${socketManager}.${closeConnections}(3260);__fx.multiplayerResetUntil=Date.now()+1000;this.$<homeMethod>()}`
    );
    const accountMenuButtonsPattern = /for\(var (?<index>\w+)=0;\k<index><(?<buttons>\w+)\.length;\k<index>\+\+\)\k<buttons>\[\k<index>\]\.button\.style\.position="absolute";/g;
    const { buttons: accountMenuButtons } = matchOne(accountMenuButtonsPattern).groups;
    replaceOne(accountMenuButtonsPattern, `$&window.__fx.setNativeMenuState=state=>${menuManager}.${menuStateMethod}(state);__fx.nativeHomeMenuButtons=${accountMenuButtons}.map(entry=>entry.button);__fx.nativeHomeControlVisibility=__fx.nativeHomeControlVisibility||new WeakMap();__fx.setNativeHomeControlsHidden=__fx.setNativeHomeControlsHidden||function(hidden){var controls=(__fx.nativeHomeMenuButtons||[]).concat([__fx.getNativeHomeNameInput?.()]);var map=__fx.nativeHomeControlVisibility;controls.forEach(function(element){if(!element)return;if(!map.has(element))map.set(element,[element.style.getPropertyValue("visibility"),element.style.getPropertyPriority("visibility")]);if(hidden)element.style.setProperty("visibility","hidden","important");else{var previous=map.get(element);if(previous[0])element.style.setProperty("visibility",previous[0],previous[1]);else element.style.removeProperty("visibility");}});};__fx.setNativeHomeControlsHidden(true);__fx.openAccount=function(){${accountMenuButtons}[2].button.click()};__fx.openCustomScenario=function(){${accountMenuButtons}[1].button.click()};__fx.openGameMenu=function(){${accountMenuButtons}[3].button.click()};__fx.isMultiplayerConnected=()=>__fx.isSocketActive(0)&&${socketManager}.${isConnectedMethod}(0);__fx.reconnectMultiplayer=function(){if(!__fx.isMultiplayerConnected())return false;if(__fx.multiplayerStartPending)return true;__fx.multiplayerRetryAvailableUntil=Date.now()+10000;${socketManager}.close(0,3260);__fx.multiplayerResetUntil=Date.now()+1050;__fx.multiplayerStartPending=true;setTimeout(()=>{__fx.multiplayerStartPending=false;${accountMenuButtons}[0].button.click()},1100);return true};__fx.nativeStartMultiplayer=function(isRetry){__fx.requestCustomLobbyView?.();__fx.installNativeLobbyRouteObserver?.(${menuManager},${JSON.stringify(menuStateMethod)},${JSON.stringify(menuStateField)});if(__fx.multiplayerStartPending)return;if(!isRetry)__fx.multiplayerRetryAvailableUntil=Date.now()+10000;var wait=__fx.multiplayerResetUntil-Date.now();if(wait>0){__fx.multiplayerStartPending=true;setTimeout(()=>{__fx.multiplayerStartPending=false;__fx.nativeStartMultiplayer(isRetry)},wait+50);return;}if(__fx.isSocketActive(0)){${accountMenuButtons}[0].button.click();return;}${accountMenuButtons}[0].button.click()};__fx.openGameMenuAction=function(key){var action=__fx.gameMenuActions?.[key];return typeof action==="function"?action():false};`);
    replaceOne(accountMenuButtonsPattern, `$&__fx.nativeHomeMenuButtons=${accountMenuButtons}.map(entry=>entry.button);__fx.nativeHomeControlVisibility=__fx.nativeHomeControlVisibility||new WeakMap();__fx.setNativeHomeControlsHidden=__fx.setNativeHomeControlsHidden||function(hidden){var controls=(__fx.nativeHomeMenuButtons||[]).concat([__fx.getNativeHomeNameInput?.()]);var map=__fx.nativeHomeControlVisibility;controls.forEach(function(element){if(!element)return;if(!map.has(element))map.set(element,[element.style.getPropertyValue("visibility"),element.style.getPropertyPriority("visibility")]);if(hidden)element.style.setProperty("visibility","hidden","important");else{var previous=map.get(element);if(previous[0])element.style.setProperty("visibility",previous[0],previous[1]);else element.style.removeProperty("visibility");}});};__fx.setNativeHomeControlsHidden(true);__fx.openAccount=function(){${accountMenuButtons}[2].button.click()};__fx.openCustomScenario=function(){${accountMenuButtons}[1].button.click()};__fx.openGameMenu=function(){${accountMenuButtons}[3].button.click()};__fx.isMultiplayerConnected=()=>__fx.isSocketActive(0)&&${socketManager}.${isConnectedMethod}(0);__fx.reconnectMultiplayer=function(){if(!__fx.isMultiplayerConnected())return false;if(__fx.multiplayerStartPending)return true;__fx.multiplayerRetryAvailableUntil=Date.now()+10000;${socketManager}.close(0,3260);__fx.multiplayerResetUntil=Date.now()+1050;__fx.multiplayerStartPending=true;setTimeout(()=>{__fx.multiplayerStartPending=false;${accountMenuButtons}[0].button.click()},1100);return true};__fx.startMultiplayer=function(isRetry){__fx.requestCustomLobbyView?.();__fx.installNativeLobbyRouteObserver?.(${menuManager},${JSON.stringify(menuStateMethod)},${JSON.stringify(menuStateField)});if(__fx.multiplayerStartPending)return;if(!isRetry)__fx.multiplayerRetryAvailableUntil=Date.now()+10000;var wait=__fx.multiplayerResetUntil-Date.now();if(wait>0){__fx.multiplayerStartPending=true;setTimeout(()=>{__fx.multiplayerStartPending=false;__fx.startMultiplayer(isRetry)},wait+50);return;}if(__fx.isSocketActive(0)){${accountMenuButtons}[0].button.click();return;}${accountMenuButtons}[0].button.click()};__fx.openGameMenuAction=function(key){var action=__fx.gameMenuActions?.[key];return typeof action==="function"?action():false};`);
    modUtils.replace(/__fx\.startMultiplayer(?=[=(])/g, "__fx.nativeStartMultiplayer");
    try { replaceOne(
        /function dJ\(\)\{/g,
        `window.__fx.nativeLoginAdapter=window.__fx.nativeLoginAdapter||{login:function(accountName,password){var loginMenu=u.a4v();if(!loginMenu||loginMenu.a4w==null)return false;return bm.r0.r1(105,bJ.f3.zq(String(accountName||""),5)),bm.r0.r1(106,bJ.f3.zq(String(password||""),15)),u.v(8,loginMenu.a4w,new ux(18)),true;},cancel:function(){var loginMenu=u.a4v();if(!loginMenu||loginMenu.a4w==null)return false;return u.v(loginMenu.a4w),true;}};window.__fx.startNativeAccountCreation=function(){var parent=u.uw;if(!parent||!bm?.buffer?.data?.[140])return false;if(0!==a1.id||bm.buffer.data[140].value)u.v(8,parent,new ux(16));else u.z.aWE(parent,16);return true;};window.__fx.gameMenuActions={leaderboard:()=>u.v(16),logs:()=>u.v(17),replays:()=>u.v(3,1),goldTransfer:()=>u.v(18),settings:()=>u.v(2)};window.__fx.goldTransferAdapter={getSnapshot:function(){return{accountId:String(bm?.buffer?.data?.[105]?.value||""),recipient:String(bm?.buffer?.data?.[148]?.value||""),amount:String(bm?.buffer?.data?.[149]?.value||""),loggedIn:!!b1?.z?.eg?.(0)};},resolveRecipientId:function(name){var normalize=function(value){return String(value||"").trim().toLocaleLowerCase();};var wanted=normalize(name);if(!wanted||!bq||!bq.wo||!Array.isArray(bq.wo.w9))return null;var matches=bq.wo.w9.filter(function(player){if(!player||player.ue==null)return false;var raw=normalize(player.username);var filtered=normalize(window.__fx?.nameFilter?.filter?.(player.username)||player.username);return raw===wanted||filtered===wanted;});return matches.length===1?String(matches[0].ue):null;},send:function(recipient,amount){var target=String(recipient||"").trim();var value=Number(amount);if(!b1?.z?.eg?.(0)||!target||!Number.isInteger(value)||value<1)return false;bm.qt.qu(148,target);bm.qt.qu(149,String(value));b1.aIy.aIz({action:0,ua:target,value:value});return true;}};window.__fx.setNativeMenuState=state=>u.v(state);$&`
    ); } catch (error) { console.info("[ZFX Client] Native game-menu adapter hook is absent in this game version."); }
    try { replaceOne(
        /function dJ\(\)\{/g,
        `window.__fx.refreshSavedAccounts=function(){if(!bm||!bm.z||typeof bm.z.zE!=="function"||!bm.buffer?.data?.[117])return false;bm.z.zE();var data=bm.buffer.data[117];var adapter=window.__fx.myAccountAdapter;if(typeof adapter?.setSavedAccounts!=="function")return false;adapter.setSavedAccounts(data,function(index){data.value=index;},function(){var credentials=bm.z.zJ(data.value);if(!credentials)return false;bm.r0.r1(105,credentials.uu);bm.r0.r1(106,credentials.password);var currentMenu=u.a4v();if(!currentMenu||currentMenu.a4w==null)return false;u.v(8,currentMenu.a4w,new ux(18));return true;},function(index){index=Number(index)||0;if(index<1)return;bm.z.zH(index);bm.z.zE();window.__fx.refreshSavedAccounts();});return true;};$&`
    ); } catch (error) { console.info("[ZFX Client] Native saved-account bridge hook is absent in this game version."); }
    const { viewportWidth, viewportHeight, dimension } = matchOne(
        /(?<viewportWidth>\w+)=(?<dimension>\w+)\(document\.documentElement\.clientWidth\)(?=,(?<viewportHeight>\w+)=\k<dimension>\(window\.visualViewport)/g
    ).groups;
    replaceOne(
        new RegExp(`${viewportWidth}=${dimension}\\(document\\.documentElement\\.clientWidth\\)`, "g"),
        `${viewportWidth}=Math.max(128,${dimension}(document.documentElement.clientWidth)-(__fx.sidebar?.getWidth?.()||0))`
    );

    replaceOne(
        new RegExp(`(?<canvas>\\w+)\\.style\\.width=${viewportWidth}\\+"px"[,;](?=\\k<canvas>\\.style\\.height=${viewportHeight}\\+"px")`, "g"),
        '$<canvas>.style.left="0px",$&'
    );

    const { scaleObject, scaleField } = matchOne(
        /\w+=Math\.floor\(\.5\+\w+\*(?<scaleObject>\w+)\.(?<scaleField>\w+)\),\w+=Math\.floor\(\.5\+\w+\*\k<scaleObject>\.\k<scaleField>\)/g
    ).groups;
    const scaleExpression = `${scaleObject}\\.${scaleField}\\*`;
    replaceRequired(
        modUtils,
        new RegExp(`${scaleExpression}(\\w+)\\.touches\\[(\\d+)\\]\\.clientX`, "g"),
        (_match, event, touchIndex) => `${scaleObject}.${scaleField}*(__fx.sidebar?.toGameX?.(${event}.touches[${touchIndex}],${event})??${event}.touches[${touchIndex}].clientX)`,
        "touch coordinate mapping"
    );
    replaceRequired(
        modUtils,
        new RegExp(`${scaleExpression}(\\w+)\\.clientX`, "g"),
        (_match, event) => `${scaleObject}.${scaleField}*(__fx.sidebar?.toGameX?.(${event})??${event}.clientX)`,
        "mouse coordinate mapping"
    );

    console.log('Removing ads...');
    // Remove ads
    replace('//api.adinplay.com/libs/aiptag/pub/TRT/territorial.io/tag.min.js', '');
}
