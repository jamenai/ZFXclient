import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // In 2.17.9 the replay cursor lives inside ahT. Count completed native
  // replay intervals from its private group cursor instead of relying on the
  // removed agp/agt hooks used by older builds.
  replaceOne(
    /function ahT\(\)\{var ahU;var ahV;var ahW;var aM1;var ahX;var eP=0;var eg=bi\.eg;this\.ahL=0;/g,
    "$&this.fxGetReplayCursor=function(){var total=0;var counts=bC.so.abH||[];for(var index=0;index<ahU&&index<counts.length;index++)total+=counts[index]||0;return total+(ahW||0);};",
  );

  // The native speed selector is still the source of truth. Expose a bounded
  // setter for the custom HUD controls without changing Terri's playback loop.
  replaceOne(
    /this\.aD9=function\(\)\{return aD7\[aD8\];\};/g,
    "$&this.fxGetSpeedIndex=function(){return aD8;};this.fxSetSpeedIndex=function(index){aD8=Math.max(0,Math.min(aD7.length-1,index|0));bi.dy=true;};",
  );
});
