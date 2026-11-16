import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  // In the current Native build cO owns the UTC schedule and formats the
  // next four events in aBB(start, end). Bind the adapter from inside its
  // constructor so the closure retains the live instance and schedule.
  const scheduleConstructor = /function cO\(\)\{/g;
  if (scheduleConstructor.test(modUtils.script)) {
    scheduleConstructor.lastIndex = 0;
    modUtils.replaceOne(scheduleConstructor,
      'function cO(){if(window.__fx)window.__fx.getNativeContestTimers=(start,end)=>this.aBB(start??0,end??4);');
    console.info("[ZFX Client] Connected contest timer adapter to native UTC schedule.");
    return;
  }

  // Keep a callable adapter while reporting that the expected schedule
  // owner changed. A later Native signature can be mapped without crashing
  // unrelated patches.
  modUtils.script = modUtils.script.replace(/window\.__fxStartNativeGame=function\(\)/,
    'window.__fx.getNativeContestTimers=window.__fx.getNativeContestTimers||function(){return "";};window.__fxStartNativeGame=function()');
  console.info("[ZFX Client] Native contest schedule constructor was not found.");
});
