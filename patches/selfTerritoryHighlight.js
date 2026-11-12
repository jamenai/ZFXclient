import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // Render the outline over the live territory layer on every map frame. The
  // static base map canvas is drawn underneath this layer and loses overlays.
  replaceOne(
    /yJ\.drawImage\(a1p,aT\.a1m\(\),aT\.a1n\(\)\);/g,
    '$&__fx.drawSelfTerritoryHighlightOnGameMap(yJ,{fxOffset:function(x,y){return bP.jK(x,y);},fxIsPlayer:function(player,offset){return ad.a1g(player,offset);}},bV,"fxOffset","fxIsPlayer",aE.fM,aT.a1m(),aT.a1n(),ir);',
  );
  // The renderer can cache its owner-boundary path until one of Terri's
  // territory pixels changes. Mark the path dirty at that native mutation.
  replaceOne(
    /function aMI\(fG\)\{/g,
    '$&window.__fx.selfTerritoryHighlightRevision=(window.__fx.selfTerritoryHighlightRevision||0)+1;',
  );
});
