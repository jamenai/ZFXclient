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

    // Native sockets are created in aYJ.aZf. Socket 1 is the lobby channel;
    // route that channel to the custom lobby while keeping all other native
    // game sockets on their normal regional endpoints.
    const socketRoute = /function (?<fn>\w+)\((?<serverArg>\w+)\)\{var (?<url>\w+);if\(m\.e0\)\{\k<url>="ws:\/\/localhost:"\+\(7130\+(?<socketId>\w+)\)\+"\/";\}else\{if\((?<direct>\w+)\)\{/g;
    const socketRouteCount = [...modUtils.script.matchAll(socketRoute)].length;
    if (socketRouteCount === 1) {
        const { groups } = matchOne(socketRoute);
        replaceOne(socketRoute,
            `function ${groups.fn}(${groups.serverArg}){var ${groups.url};if(window.__fx?.customLobby?.isActive()&&${groups.socketId}===1){${groups.url}=window.__fx.customLobby.getSocketURL();}else if(m.e0){${groups.url}="ws://localhost:"+(7130+${groups.socketId})+"/";}else{if(${groups.direct}){`);
    } else {
        console.info(`[ZFX Client] Native custom lobby socket route hook ${socketRouteCount ? 'is ambiguous' : 'is absent'} in this game version.`);
    }

    // Reuse the native socket manager's send path so the custom lobby bridge
    // can send through the socket which was opened above.
    const sendHook = /this\.send=function\((?<socketId>\w+),(?<data>\w+)\)\{if\(\k<socketId>!==0\)\{\w+\(\k<socketId>\);\}(?<sockets>\w+)\[\k<socketId>\]\.send\(\k<data>\);\};/g;
    replaceOnce('custom lobby socket send', sendHook,
        '$&window.__fx?.customLobby?.setSendFunction?.((socketId,data)=>this.send(socketId,data));');
};
