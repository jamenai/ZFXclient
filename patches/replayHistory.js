import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // The current game finalizes replay data when leaving a match. Save that
  // native replay string into the rolling ZFX history at this point.
  replaceOne(
    /(this\.a55=function\(eb\)\{if\(!bC\.rq\.a8X\.length\)\{this\.a8K=bC\.a8Y\.a39\(\);\}else\{this\.a8K=bC\.rq\.a8X;\})/g,
    "$1;__fx.replayHistory.save(this.a8K);",
  );

  // Expose the current native parser and replay start routine to the Vue
  // history view so saved entries can launch through the game's own loader.
  replaceOne(
    /this\.aXN=function\(\)\{/g,
    "$&window.__fx.replayHistory.load=function(saved,timestamp){saved=bC.aXM(String(saved||\"\"));if(!bC.aNq.a00(saved))return false;window.__fx.replayHistory.setActiveReplay(timestamp);bC.aXN();return true;};",
  );

  // Pasted or otherwise native-loaded replays are not entries from our saved
  // history, so clear the active history marker before playback starts.
  replaceOne(
    /if\(!bC\.aNq\.a00\(sA\)\)\{return;\}bC\.aXN\(\);/g,
    "if(!bC.aNq.a00(sA)){return;}__fx.replayHistory.setActiveReplay(null);bC.aXN();",
  );
});
