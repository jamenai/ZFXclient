import ModUtils from "../modUtils.js";

export default (/** @type {ModUtils} */ { replaceOne, waitForMinification }) => {
  // Native right-click handling already resolves the exact map cell. Route
  // owned territory info through the ZFX tooltip and keep the native popup as
  // the fallback for unowned cells.
  waitForMinification(() => {
    try {
      replaceOne(
        /this\.a9w\s*=\s*function\s*\((?<cell>\w+)\)\s*\{/g,
        `$&if(window.__fx?.hoveringTooltip?.showNativeTerritory?.(ad.hG($<cell>)?ad.fY($<cell>):-1,bP.fo($<cell>>>2),bP.fq($<cell>>>2)))return;`,
      );
      console.info("[ZFX Client] Native territory info now uses the ZFX tooltip on right-click.");
    } catch (error) {
      console.info("[ZFX Client] Native territory info hook is absent; the native popup remains active.", error);
    }
  });
};
