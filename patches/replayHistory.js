import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  // Native replay sharing now validates text through bC.aOc.a0c, normalizes it
  // with bC.aZk, and starts playback through bC.aZl. Bind the history loader
  // from the native replay dialog where those APIs are in scope.
  modUtils.replaceOne(/function aZg\(\)\{/g,
    'function aZg(){if(window.__fx){var fxReplayHistory=window.__fx.replayHistory;fxReplayHistory.load=function(saved,timestamp){var code=bC.aZk(String(saved||""));if(!code||!bC.aOc.a0c(code))return false;u.y();bC.aZl();fxReplayHistory.setActiveReplay(timestamp);return true;};}');

  // Match teardown copies the finished native recording to a8T. Save that
  // exact share code into ZFX history before the native UI leaves the match.
  modUtils.replaceOne(
    /this\.a5C=function\(ej\)\{if\(!bC\.sk\.a8g\.length\)\{this\.a8T=bC\.a8h\.a3G\(\);\}else\{this\.a8T=bC\.sk\.a8g;\}/g,
    '$&window.__fx?.replayHistory?.save?.(this.a8T);',
  );
});
