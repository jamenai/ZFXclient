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

    // ac8 opens each native channel. Route only lobby channel 1 to ZFX while
    // preserving the native local and regional paths.
    const currentSocketRoute = /function ac8\(aaj\)\{var mR;if\(m\.e8\)\{/g;
    if ([...modUtils.script.matchAll(currentSocketRoute)].length === 1) {
        replaceOne(currentSocketRoute,
            'function ac8(aaj){var mR;if(window.__fx?.customLobby?.isActive?.()&&ac4===1){mR=window.__fx.customLobby.getSocketURL();}else if(m.e8){');
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

    // Record current native per-socket traffic for the diagnostics HUD.
    replaceOnce('network packet receive', /function acA\(e\)\{b1\.aAa\.aM9\(ac4,new Uint8Array\(e\.data\)\);\}/g,
        'function acA(e){window.__fx?.networkDebug?.record(ac4,"in",e.data);b1.aAa.aM9(ac4,new Uint8Array(e.data));}');
    replaceOnce('network packet send', /this\.send=function\(aD\)\{if\(this\.eq\(\)\)\{b\.send\(aD\);\}\};/g,
        'this.send=function(aD){if(this.eq()){window.__fx?.networkDebug?.record(ac4,"out",aD);b.send(aD);}};');

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
