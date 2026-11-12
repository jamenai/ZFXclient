import ModUtils from "../modUtils.js";

// The native renderer draws spawn markers through aez(). During selectable
// spawn placement players have no territory yet, so the native hQ guard must
// be relaxed for that phase or the clan marker never reaches this renderer.
export default (/** @type {ModUtils} */ { replaceRawCode }) => {
  replaceRawCode(
    "function aez(aC,ih,a6X,iZ){if(ah.na[aC]===0||ah.hQ[aC]===0){return;}var fj=(ah.jW[aC]+ah.jX[aC]+1-iZ-2)>>1;var fl=(ah.jY[aC]+ah.jZ[aC]+1-iZ-2)>>1;ih.drawImage(a6X[aE.iX?((aE.lG===9&&aF.iM[aC]===5)?3:bj.fa[aC]):(aC<aE.ky?1:0)],fj,fl);}",
    "function aez(aC,ih,a6X,iZ){var fxDiag=__fx.mapFeatureRenderDiagnostics||(__fx.mapFeatureRenderDiagnostics={});fxDiag.spawnMarkers=(fxDiag.spawnMarkers||0)+1;if(ah.na[aC]===0||ah.hQ[aC]===0&&!aE.i1){return;}var fxInOwnClan=__fx.clanFilter.isInOwnClan(aC);if(fxInOwnClan)fxDiag.ownClanSpawnMarkers=(fxDiag.ownClanSpawnMarkers||0)+1;var fxHighlight=__fx.settingsApi.getBoolean(\"highlightClanSpawns\")&&fxInOwnClan;if(fxHighlight)iZ*=2;var fj=(ah.jW[aC]+ah.jX[aC]+1-iZ-2)>>1;var fl=(ah.jY[aC]+ah.jZ[aC]+1-iZ-2)>>1;var fxImage=a6X[aE.iX?((aE.lG===9&&aF.iM[aC]===5)?3:bj.fa[aC]):(aC<aE.ky?1:0)];if(fxHighlight){fxDiag.highlightedClanSpawnMarkers=(fxDiag.highlightedClanSpawnMarkers||0)+1;ih.save();var fxCenterX=fj+iZ/2,fxCenterY=fl+iZ/2,fxGlow=ih.createRadialGradient(fxCenterX,fxCenterY,0,fxCenterX,fxCenterY,iZ*.72);fxGlow.addColorStop(0,\"rgba(255,255,220,.42)\");fxGlow.addColorStop(.55,\"rgba(255,230,120,.2)\");fxGlow.addColorStop(1,\"rgba(255,220,90,0)\");ih.fillStyle=fxGlow;ih.beginPath();ih.arc(fxCenterX,fxCenterY,iZ*.72,0,Math.PI*2);ih.fill();ih.shadowColor=\"rgba(255,245,170,.95)\";ih.shadowBlur=iZ*.38;ih.drawImage(fxImage,fj,fl,iZ,iZ);ih.restore();}else ih.drawImage(fxImage,fj,fl);}",
  );
};
