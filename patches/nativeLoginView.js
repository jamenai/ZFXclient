import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // Current build login lives in vY(18). Saved-account login fills protocol
  // fields 105/106 through bm.rv.q1 before opening that native view; reuse
  // the same path for the Vue login form.
  replaceOne(
    /function vY\(id,a7l,aXo\)\{/g,
    "$&if(window.__fx)window.__fx.nativeLoginAdapter={login:function(accountName,password){var menu=u.a52();if(!menu||menu.a53==null)return false;bm.rv.q1(105,String(accountName||\"\"));bm.rv.q1(106,String(password||\"\"));u.v(8,menu.a53,new vY(18));return true;},cancel:function(){var menu=u.a52();if(!menu||menu.a53==null)return false;u.v(6,menu.a53);return true;}};",
  );
});
