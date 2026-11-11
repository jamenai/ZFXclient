import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // Install on both map-canvas creation paths: aQH creates native map canvases,
  // while a8k attaches a canvas supplied by a custom map.
  replaceOne(
    /bV\.a0A=bV\.a0E\.getContext\("2d",\{alpha:false\}\);bV\.a0B=bV\.a0F=null;/g,
    '$&__fx.selfTerritoryHighlight.install(bV.a0A,{fxOffset:function(x,y){return bP.jK(x,y);},fxIsPlayer:function(player,offset){return ad.a1g(player,offset);}},bV,"fxOffset","fxIsPlayer","fn","fo");',
  );
  replaceOne(
    /this\.a0A=this\.a0E\.getContext\("2d",\{alpha:false\}\);/g,
    "$&__fx.selfTerritoryHighlight.install(this.a0A,{fxOffset:function(x,y){return bP.jK(x,y);},fxIsPlayer:function(player,offset){return ad.a1g(player,offset);}},this,'fxOffset','fxIsPlayer','fn','fo');",
  );
});
