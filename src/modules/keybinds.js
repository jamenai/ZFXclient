import { getUIGap, getVar } from "../adapter/gameInterface.js";
import { settingsApi } from "./settings/settings.js";

export const keybindFunctions = {
    setAbsolute: () => {},
    setRelative: () => {},
    repaintAttackPercentageBar: () => {}
};

const publishAttackSelectorHudUpdate = (key, value) => {
    const bridge = window.__fx ||= {};
    bridge[key] = value;
    bridge.gameAttackSelectorHud?.[key === "gameAttackSelectorLayout" ? "receiveLayout" : "receiveState"]?.(value);
};

export const gameAttackSelectorAdapter = {
    receiveNativeLayout: (mainCanvas, x, y, width, height) => {
        const canvas = mainCanvas?.canvas;
        const rect = canvas?.getBoundingClientRect?.();
        if (!canvas || !rect?.width || !rect?.height || !canvas.width || !canvas.height) return;
        const layout = {
            left: rect.left + x * rect.width / canvas.width,
            top: rect.top + y * rect.height / canvas.height,
            width: width * rect.width / canvas.width,
            height: height * rect.height / canvas.height,
        };
        publishAttackSelectorHudUpdate("gameAttackSelectorLayout", layout);
    },
    receiveNativeState: state => {
        if (!state || !Number.isFinite(state.percentage)) return;
        publishAttackSelectorHudUpdate("gameAttackSelectorState", state);
    },
    isReady: () => Boolean(window.__fx?.gameAttackSelectorHud?.isReady?.()),
};

export const keybindHandler = key => {
    const keybindData = settingsApi.getArray("attackPercentageKeybinds").find(keybind => keybind.key === key);
    if (keybindData === undefined) return false;
    if (Number(getVar("gMatchState")) > 0) executeKeybind(keybindData);
    return true;
};
function executeKeybind(keybind) {
    if (keybind.type === "absolute") keybindFunctions.setAbsolute(keybind.value);
    else keybindFunctions.setRelative(keybind.value);
    keybindFunctions.repaintAttackPercentageBar();
}

// mobile keybinds (keybind buttons)

let width = 0;
let height = 0;
let renderKey = "";
const maxCount = 6;

const getKeybindButtons = () => settingsApi.getArray("attackPercentageKeybinds").slice(0, maxCount).map((keybind, index) => ({
    index,
    label: keybind.type === "absolute" ? (keybind.value * 100).toFixed() + "%" : "x " + Math.round(keybind.value * 100) / 100,
}));

function activateKeybind(index) {
    const keybind = settingsApi.getArray("attackPercentageKeybinds")[index];
    if (!keybind || index >= maxCount) return false;
    executeKeybind(keybind);
    return true;
}

export const mobileKeybinds = {
    setSize: (w, h, mainCanvas) => {
        if (!settingsApi.getBoolean("keybindButtons")) return;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
        const keybinds = getKeybindButtons();
        // The native renderer can call this before its 2D context is ready.
        // Font is only part of the redraw key, so an absent context must not
        // abort native game startup.
        const canvasFont = typeof mainCanvas?.font === "string" ? mainCanvas.font : "";
        const nextRenderKey = [w, h, getUIGap(), canvasFont, ...keybinds.map(keybind => keybind.label)].join("|");
        if (renderKey === nextRenderKey) return;
        renderKey = nextRenderKey;
        width = w;
        height = h;
    },
    click: (xRelative) => {
        if (xRelative < 0 || xRelative > width) return false;
        const keybinds = settingsApi.getArray("attackPercentageKeybinds");
        const index = Math.floor(xRelative / width * maxCount);
        if (index >= keybinds.length) return false;
        executeKeybind(keybinds[index]);
        return true;
    },
    draw: (mainCanvas, x, y) => {
        if (!settingsApi.getBoolean("keybindButtons")) return;
        const canvasElement = mainCanvas?.canvas;
        const rect = canvasElement?.getBoundingClientRect?.();
        if (!canvasElement || !rect?.width || !rect?.height || !canvasElement.width || !canvasElement.height) return;
        const scaleX = rect.width / canvasElement.width;
        const scaleY = rect.height / canvasElement.height;
        const left = rect.left + x * scaleX;
        const top = rect.top + (y - (height + getUIGap() / 4)) * scaleY;
        const gap = getUIGap() / 4 * scaleX;
        const layout = {
            left: Math.round(left),
            top: Math.round(top),
            width: Math.round(width * scaleX),
            height: Math.max(1, Math.round(height * scaleY)),
            gap: Math.max(0, Math.round(gap)),
            fontSize: Math.max(10, Math.round(height * scaleY / 2)),
            buttons: getKeybindButtons(),
        };
        const bridge = window.__fx ||= {};
        bridge.gameKeybindHudLayout = layout;
        bridge.gameKeybindHudAdapter?.receiveLayout?.(layout);
    },
    activate: activateKeybind,
    getButtons: getKeybindButtons,
}
