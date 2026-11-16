import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // The Native replay controller is ajE. ajO consumes one recorded replay
  // tick, ajL advances game simulation after it, and aE.a8U restarts the match.
  // Bind the ZFX scrubber to those current operations while keeping Native's
  // normal frame loop and controls in charge outside an active seek.
  replaceOne(
    /this\.dv=function\(\)\{ajF=0;ajG=0;ajH=0;aMA=0;ajI=0;\};this\.ep=function\(\)\{i\.ep\(\);/g,
    'this.dv=function(){ajF=0;ajG=0;ajH=0;aMA=0;ajI=0;};window.__fx&& (window.__fx.nativeReplayRuntimeAdapter={getTickStats:function(){var fxCounts=bC.sk.ad5||[],fxFlags=bC.sk.ad4||[],total=0,current=0;for(var fxI=0;fxI<fxCounts.length;fxI++){var fxLength=fxFlags[fxI]?1:fxCounts[fxI];total+=fxLength;if(fxI<ajF)current+=fxLength;}if(ajF<fxCounts.length&&!fxFlags[ajF])current+=ajH;return{totalTicks:total,currentTick:current};},isEnded:function(){return ajF>=(bC.sk.ad5||[]).length;},advance:function(){ajL();},restart:function(){aE.a8U();}});window.__fx.getNativeReplayTickStats=function(){return window.__fx.nativeReplayRuntimeAdapter?.getTickStats?.()||null;};window.__fx.replay?.registerHooks?.({getTickInterval:function(){return bi.aFY;},isEnded:function(){return ajF>=(bC.sk.ad5||[]).length;},advance:function(){ajL();},finishTick:function(){nR();},requestRedraw:function(){bi.e2=false;a1p();}});window.__fx.replay&&(window.__fx.replay.controls={fxIsPlaying:function(){return !!bF.a8m;},fxGetSpeedIndex:function(){return window.__fx.nativeReplaySpeedAdapter?.getIndex?.()??5;},fxSetSpeedIndex:function(index){return window.__fx.nativeReplaySpeedAdapter?.setIndex?.(index);}},window.__fx.replay.togglePlayPause=function(){bF.a5x(false);},window.__fx.replay.restartReplay=function(){aE.a8U();});this.ep=function(){if(window.__fx?.replay?.frame?.())return;i.ep();',
  );

  // ajO advances either one empty tick or one command-bearing tick. Count
  // both forms so seeks and the visible playhead track Native replay progress.
  replaceOne(
    /if\(\+\+ajH>=m1\)\{ajF\+\+;ajH=0;\}return true;/g,
    'if(++ajH>=m1){ajF++;ajH=0;}window.__fx?.replay&&(window.__fx.replay.tick++);return true;',
  );
  replaceOne(
    /ajG\+=m1;ajF\+\+;return true;/g,
    'ajG+=m1;ajF++;window.__fx?.replay&&(window.__fx.replay.tick++);return true;',
  );
});
