import { getUIGap, getVar } from "../adapter/gameInterface.js";
import { settingsApi } from "./settings/settings.js";

export const keybindFunctions = {
    setAbsolute: () => {},
    setRelative: () => {},
    repaintAttackPercentageBar: () => {}
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
        const keybinds = getKeybindButtons();
        const nextRenderKey = [w, h, getUIGap(), mainCanvas.font, ...keybinds.map(keybind => keybind.label)].join("|");
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
        window.__fx?.gameKeybindHudAdapter?.receiveLayout?.({
            left: Math.round(left),
            top: Math.round(top),
            width: Math.round(width * scaleX),
            height: Math.max(1, Math.round(height * scaleY)),
            gap: Math.max(0, Math.round(gap)),
            fontSize: Math.max(10, Math.round(height * scaleY / 2)),
            buttons: getKeybindButtons(),
        });
    },
    activate: activateKeybind,
    getButtons: getKeybindButtons,
}
