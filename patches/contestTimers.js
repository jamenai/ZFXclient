import { definePatch } from "../modUtils.js";

export default definePatch(({ replace }) => {
  // The native lobby owns the UTC contest schedule. Newer versions expose
  // the formatted countdown list through aBZ(start, end); older versions used
  // aB1() for the same summary.
  replace(/aP=new c(?:K|M)\(\);/g, "$&if(window.__fx)window.__fx.getNativeContestTimers=function(){return typeof aP.aBZ===\"function\"?aP.aBZ(0,4):typeof aP.aB1===\"function\"?aP.aB1():\"\";};");
});
