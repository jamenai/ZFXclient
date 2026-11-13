import { getUIGap } from "../adapter/gameInterface.js";
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

const normalizeKey = value => String(value ?? "").trim().toLocaleLowerCase();

export const keybindHandler = keyEvent => {
    const key = typeof keyEvent === "object" && keyEvent !== null ? keyEvent.key : keyEvent;
    const code = typeof keyEvent === "object" && keyEvent !== null ? keyEvent.code : "";
    const pressedKeys = new Set([normalizeKey(key), normalizeKey(code)].filter(Boolean));
    if (!pressedKeys.size) return false;
    const keybindData = settingsApi.getArray("attackPercentageKeybinds").find(keybind =>
        pressedKeys.has(normalizeKey(keybind?.key)) || pressedKeys.has(normalizeKey(keybind?.code)));
    if (keybindData === undefined) return false;
    executeKeybind(keybindData);
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
let buttonHeightScale = 1;
const maxCount = 12;
const columns = 6;

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
    setButtonHeightScale: value => {
        const nextScale = Math.max(1, Math.min(2, Number(value) / 100 || 1));
        if (nextScale === buttonHeightScale) return;
        buttonHeightScale = nextScale;
        renderKey = "";
    },
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
        const index = Math.floor(xRelative / width * columns);
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
        const buttons = getKeybindButtons();
        const rows = buttons.length > columns ? 2 : 1;
        const gap = getUIGap() / 4 * scaleX;
        const rowHeight = Math.max(1, height * scaleY * buttonHeightScale);
        const totalHeight = rowHeight * rows + gap * Math.max(0, rows - 1);
        const top = rect.top + (y - getUIGap() / 4) * scaleY - totalHeight;
        const layout = {
            left: Math.round(left),
            top: Math.round(top),
            width: Math.round(width * scaleX),
            height: Math.max(1, Math.round(totalHeight)),
            gap: Math.max(0, Math.round(gap)),
            fontSize: Math.max(10, Math.round(rowHeight / 2)),
            rows,
            buttons,
        };
        const bridge = window.__fx ||= {};
        bridge.gameKeybindHudLayout = layout;
        bridge.gameKeybindHudAdapter?.receiveLayout?.(layout);
    },
    activate: activateKeybind,
    getButtons: getKeybindButtons,
}
