import { definePatch } from "../modUtils.js";

export default definePatch(({ replace }) => {
  // The native lobby already owns the UTC contest schedule and its countdown
  // formatter. Expose that formatter so the Vue lobby can display the same
  // values without duplicating the schedule.
  replace(/aP=new cK\(\);/g, "$&if(window.__fx)window.__fx.getNativeContestTimers=function(){return aP.aAy();};");
});
