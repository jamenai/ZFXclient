import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // 2.17.9 composites the current territory image in dV.render. Draw the
  // cached own-territory contour after each dirty map region is restored.
  replaceOne(
    /a92\.putImageData\(a93,0,0,o5,o6,oI-o5\+1,oJ-o6\+1\);\}\};/g,
    'a92.putImageData(a93,0,0,o5,o6,oI-o5+1,oJ-o6+1);}if(window.__fx?.drawSelfTerritoryHighlightOnGameMap){window.__fx.drawSelfTerritoryHighlightOnGameMap(a92,{fxCell:function(x,y){return ad.a1t(x,y);},fxIsPlayer:function(player,cell){return ad.hG(cell)&&ad.fY(cell)===player;}},bV,"fxCell","fxIsPlayer",aE.fQ,0,0,1);}};',
  );
  // Mark the cached contour dirty whenever a map pixel changes owner or type.
  replaceOne(
    /function aMu\(fK\)\{/g,
    '$&window.__fx&&(window.__fx.selfTerritoryHighlightRevision=(window.__fx.selfTerritoryHighlightRevision||0)+1);',
  );
});
