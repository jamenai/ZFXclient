import ModUtils from "../modUtils.js";

// The native renderer draws all spawn markers through aez() in the current
// game version, including the markers shown during spawn selection.
export default (/** @type {ModUtils} */ { replaceRawCode }) => {
  replaceRawCode(
    "function aez(aC,ih,a6X,iZ){if(ah.na[aC]===0||ah.hQ[aC]===0){return;}var fj=(ah.jW[aC]+ah.jX[aC]+1-iZ-2)>>1;var fl=(ah.jY[aC]+ah.jZ[aC]+1-iZ-2)>>1;ih.drawImage(a6X[aE.iX?((aE.lG===9&&aF.iM[aC]===5)?3:bj.fa[aC]):(aC<aE.ky?1:0)],fj,fl);}",
    "function aez(aC,ih,a6X,iZ){if(ah.na[aC]===0||ah.hQ[aC]===0){return;}var fxHighlight=__fx.settingsApi.getBoolean(\"highlightClanSpawns\")&&__fx.clanFilter.isInOwnClan(aC);if(fxHighlight)iZ*=2;var fj=(ah.jW[aC]+ah.jX[aC]+1-iZ-2)>>1;var fl=(ah.jY[aC]+ah.jZ[aC]+1-iZ-2)>>1;var fxImage=a6X[aE.iX?((aE.lG===9&&aF.iM[aC]===5)?3:bj.fa[aC]):(aC<aE.ky?1:0)];if(fxHighlight)ih.drawImage(fxImage,fj,fl,iZ,iZ);else ih.drawImage(fxImage,fj,fl);}",
  );
};
