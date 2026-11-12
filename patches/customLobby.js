import ModUtils from '../modUtils.js';

// Custom lobby patches for the current native socket and menu architecture.
export default (/** @type {ModUtils} */ modUtils) => {
    const { replace, replaceOne, matchOne } = modUtils;
    const replaceOnce = (label, pattern, replacement) => {
        const count = [...modUtils.script.matchAll(pattern)].length;
        if (count !== 1) {
            console.info(`[ZFX Client] Native ${label} hook ${count ? 'is ambiguous' : 'is absent'} in this game version.`);
            return;
        }
        replace(pattern, replacement);
    };

    // The native multiplayer action opens state 5/5. Keep that as the native
    // join action used by custom lobby hash links.
    replaceOnce(
        'custom lobby join',
        /this\.a0=function\(\)\{u\.v\(5,5\);\};/g,
        '$&window.__fx?.customLobby?.setJoinFunction?.(()=>this.a0());'
    );

    // In the current socket wrapper aaP opens each native channel. Route only
    // lobby channel 1 to ZFX while preserving native local and regional paths.
    const currentSocketRoute = /function aaP\(aYz\)\{var mN;if\(m\.e4\)\{/g;
    if ([...modUtils.script.matchAll(currentSocketRoute)].length === 1) {
        replaceOne(currentSocketRoute,
            'function aaP(aYz){var mN;if(window.__fx?.customLobby?.isActive()&&aaL===1){mN=window.__fx.customLobby.getSocketURL();}else if(m.e4){');
    } else {
        // Compatibility matcher for earlier native socket wrappers.
        const socketRoute = /function (?<fn>\w+)\((?<serverArg>\w+)\)\{var (?<url>\w+);if\(m\.e0\)\{\k<url>="ws:\/\/localhost:"\+\(7130\+(?<socketId>\w+)\)\+"\/";\}else\{if\((?<direct>\w+)\)\{/g;
        const socketRouteCount = [...modUtils.script.matchAll(socketRoute)].length;
        if (socketRouteCount === 1) {
            const { groups } = matchOne(socketRoute);
            replaceOne(socketRoute,
                `function ${groups.fn}(${groups.serverArg}){var ${groups.url};if(window.__fx?.customLobby?.isActive()&&${groups.socketId}===1){${groups.url}=window.__fx.customLobby.getSocketURL();}else if(m.e0){${groups.url}="ws://localhost:"+(7130+${groups.socketId})+"/";}else{if(${groups.direct}){`);
        } else {
            console.info(`[ZFX Client] Native custom lobby socket route hook ${socketRouteCount ? 'is ambiguous' : 'is absent'} in this game version.`);
        }
    }

    // Count native game WebSocket traffic only while the diagnostics HUD is
    // open. The socket index is kept so the HUD can distinguish channels.
    if ([...modUtils.script.matchAll(/b\.onmessage=aaR;/g)].length === 1) {
        replaceOne(/b\.onmessage=aaR;/g,
            'b.onmessage=function(fxEvent){window.__fx?.networkDebug?.record(aaL,"in",fxEvent.data);aaR(fxEvent)};');
    } else {
        replaceOnce('network packet receive', /b\.onmessage=aZn/g,
            'b.onmessage=function(fxEvent){window.__fx?.networkDebug?.record(aZh,"in",fxEvent.data);aZn(fxEvent)}');
    }
    if ([...modUtils.script.matchAll(/this\.send=function\(aD\)\{if\(this\.em\(\)\)\{b\.send\(aD\);\}\};/g)].length === 1) {
        replaceOne(/this\.send=function\(aD\)\{if\(this\.em\(\)\)\{b\.send\(aD\);\}\};/g,
            'this.send=function(aD){if(this.em()){window.__fx?.networkDebug?.record(aaL,"out",aD);b.send(aD);}};');
    }
    if (!modUtils.script.includes('networkDebug?.record(aaL,"out"')) {
        const nativeSocketSend = /this\.send=function\((?<data>\w+)\)\{if\(this\.ei\(\)\)\{b\.send\(\k<data>\);\}\}/g;
        const nativeSocketSendCount = [...modUtils.script.matchAll(nativeSocketSend)].length;
        if (nativeSocketSendCount === 1) {
            const { data } = matchOne(nativeSocketSend).groups;
            replaceOne(nativeSocketSend,
                `this.send=function(${data}){this.ei()&&(window.__fx?.networkDebug?.record(aZh,"out",${data}),b.send(${data}))}`);
        } else {
            console.info(`[ZFX Client] Native network packet send hook ${nativeSocketSendCount ? 'is ambiguous' : 'is absent'} in this game version.`);
        }
    }

    // Reuse the native socket manager's send path so the custom lobby bridge
    // can send through the socket which was opened above.
    const sendHook = /this\.send=function\((?<socketId>\w+),(?<data>\w+)\)\{if\(\k<socketId>!==0\)\{\w+\(\k<socketId>\);\}(?<sockets>\w+)\[\k<socketId>\]\.send\(\k<data>\);\};/g;
    replaceOnce('custom lobby socket send', sendHook,
        '$&window.__fx?.customLobby?.setSendFunction?.((socketId,data)=>this.send(socketId,data));');
    const currentSendHook = /this\.send=function\(oX,aD\)\{if\(oX!==0\)\{aYt\(oX\);\}aYn\[oX\]\.send\(aD\);\};/g;
    if ([...modUtils.script.matchAll(currentSendHook)].length === 1) {
        replaceOne(currentSendHook,
            '$&window.__fx?.customLobby?.setSendFunction?.((socketId,data)=>this.send(socketId,data));');
    }
};
