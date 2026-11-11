import { definePatch } from "../modUtils.js";

export default definePatch(({ replace }) => {
  // The native lobby already owns the UTC contest schedule and its countdown
  // formatter. aB1 returns the native localized countdown summary.
  replace(/aP=new cK\(\);/g, "$&if(window.__fx)window.__fx.getNativeContestTimers=function(){return aP.aB1();};");
});
