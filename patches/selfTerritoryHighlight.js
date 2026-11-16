import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // 2.17.9 composites the current territory image in dV.render. Draw the
  // cached own-territory contour after each dirty map region is restored.
  const renderer = /(?<draw>\w+)\.putImageData\((?<image>\w+),0,0,(?<left>\w+),(?<top>\w+),(?<width>\w+)-\k<left>\+1,(?<height>\w+)-\k<top>\+1\);\}\};/g;
  replaceOne(renderer,
    '$<draw>.putImageData($<image>,0,0,$<left>,$<top>,$<width>-$<left>+1,$<height>-$<top>+1);if(window.__fx?.drawSelfTerritoryHighlightOnGameMap){window.__fx.drawSelfTerritoryHighlightOnGameMap($<draw>,{fxCell:function(x,y){return ad.a1P(x,y);},fxIsPlayer:function(player,cell){return ad.hG(cell)&&ad.fY(cell)===player;}},bV,"fxCell","fxIsPlayer",aE.fQ,0,0,1);}}};');
  // Mark the cached contour dirty whenever a map pixel changes owner or type.
  replaceOne(
    /function (?:aMu|\w+)\(fK\)\{/g,
    '$&window.__fx?.updateSelfTerritoryHighlightCell?.(fK,ad,bV,aE.fQ);',
  );
});
