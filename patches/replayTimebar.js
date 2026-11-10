import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // The replay engine now advances through agm.agw/agt, with playback speed
  // held by d7. Expose those current native controls to the ZFX timebar.
  replaceOne(
    /function agp\(\)\{/g,
    "$&this.fxAdvance=function(){agt();};this.fxFinishTick=function(){nJ();be.render();};",
  );
  replaceOne(
    /this\.aCc=function\(\)\{return aCa\[aCb\];\};/g,
    "$&this.fxGetSpeedIndex=function(){return aCb;};this.fxSetSpeedIndex=function(index){aCb=Math.max(0,Math.min(aCa.length-1,index|0));bi.du=true;};",
  );
  replaceOne(
    /if\(aE\.hl\)\{this\.a3p=new agp\(\);this\.a3p\.dm\(\);return;\}/g,
    "if(aE.hl){this.a3p=new agp();this.a3p.dm();__fx.replay.controls={fxIsPlaying:function(){return !bF.a8d;},fxGetSpeedIndex:function(){return bF.fxGetSpeedIndex();},fxSetSpeedIndex:function(index){bF.fxSetSpeedIndex(index);}};__fx.replay.registerHooks({advance:function(){bi.a3p.fxAdvance();},finishTick:function(){bi.a3p.fxFinishTick();},requestRedraw:function(){bi.du=true;},isEnded:function(){return aE.a3f===2;},getTickInterval:function(){return bi.aFO/bF.aCc();}});return;}",
  );
  replaceOne(
    /this\.aXN=function\(\)\{/g,
    "this.aXN=function(){__fx.replay.restartReplay=function(){bC.aXN();};",
  );
  replaceOne(
    /this\.a5q=function\(aCf\)\{/g,
    "this.a5q=function(aCf){__fx.replay.togglePlayPause=function(){bF.a5q(true);};",
  );
});
