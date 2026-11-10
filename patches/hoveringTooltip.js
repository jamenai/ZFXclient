import ModUtils from "../modUtils.js";

export default (/** @type {ModUtils} */ { replaceRawCode, waitForMinification }) => {
  // Keep the native map-cell tooltip renderer, but expose it to the ZFX hover
  // handler. This version computes the map cell through bP.ht/hv/fz/fS.
  replaceRawCode(
    "this.click=function(mouseX,mouseY,clickState){var mapX=map.ht(mouseX);var mapY=map.hv(mouseY);var point=map.fz(mapX,mapY);var cell=map.fS(point);",
    "this.click=function(mouseX,mouseY,clickState){var mapX=map.ht(mouseX);var mapY=map.hv(mouseY);var point=map.fz(mapX,mapY);var cell=map.fS(point);__fx.hoveringTooltip.display=function(hoverX,hoverY){var hoverMapX=map.ht(hoverX),hoverMapY=map.hv(hoverY);var hoverPoint=map.fz(hoverMapX,hoverMapY);var hoverCell=map.fS(hoverPoint);if(map.hw(hoverMapX,hoverMapY))a9G(hoverX,hoverY,hoverCell);};",
  );

  try {
    const replaySelectionHook = "if(aE.hj||aE.hk){aE.fK=player;}";
    if (!replaceRawCode) throw new Error("Replay player selection hook not found");
    replaceRawCode(replaySelectionHook,
      "if((aE.hj||aE.hk)&&__fx.hoveringTooltip.active===false){aE.fK=player;}");
  } catch {
    console.info("[ZFX Client] Native replay tooltip hook is absent in this game version.");
  }

  waitForMinification(() => {
    try {
      replaceRawCode("aK.nH=(window.devicePixelRatio||1)*aEr,",
        `aK.nH = (window.devicePixelRatio || 1) * aEr, __fx.hoveringTooltip.canvasPixelScale = aK.nH,`);
    } catch {
      console.info("[ZFX Client] Native tooltip canvas scale hook is absent in this game version.");
    }
  });
};
