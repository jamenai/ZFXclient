import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // The replay serializer/decoder moved under d8 in 2.17.9. Install the Vue
  // history bridge there, while all native replay APIs are in scope.
  replaceOne(
    /function d8\(\)\{/g,
    '$&if(window.__fx){var fxReplayHistory=window.__fx.replayHistory;fxReplayHistory.load=function(saved,timestamp){var encoded=String(saved||"").trim();if(!encoded)return false;u.y();var loaded=bC.aOS.a0Z(bC.aY0(encoded));if(!loaded&&aE.data.mapType!==2)return false;fxReplayHistory.setActiveReplay(timestamp);if(loaded)bC.aY1();return true;};window.__fx.getNativeReplayTickStats=function(){var flags=bC?.so?.abG,counts=bC?.so?.abH,total=0;if(flags&&counts){for(var index=0;index<counts.length;index++)total+=counts[index]||0;}var cursor=bi?.a4O?.fxGetReplayCursor;return{flags:flags||null,counts:counts||null,totalTicks:total,currentTick:typeof cursor===\"function\"?cursor():0};};}',
  );

  // On match exit the game has the complete native replay string available
  // as a8s. Store that exact string in the rolling local history.
  replaceOne(
    /this\.a5d=function\(ef\)\{if\(!bC\.so\.a95\.length\)\{this\.a8s=bC\.a96\.a3i\(\);\}else\{this\.a8s=bC\.so\.a95;\}/g,
    '$&window.__fx?.replayHistory?.save?.(this.a8s);',
  );
});
