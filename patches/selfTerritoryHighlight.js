import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // The current map canvas is created by aQw; territory cell offsets come
  // from bP.jK and ad.a1g verifies ownership in the native territory buffer.
  replaceOne(
    /this\.a0A=this\.a0E\.getContext\("2d",\{alpha:false\}\);/g,
    "$&__fx.selfTerritoryHighlight.install(this.a0A,{fxOffset:function(x,y){return bP.jK(x,y);},fxIsPlayer:function(player,offset){return ad.a1g(player,offset);}},this,'fxOffset','fxIsPlayer','fn','fo');",
  );
});
