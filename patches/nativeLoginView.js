import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // The account view now opens login as a nested native view (vY(18)). Keep
  // authentication and error handling native, while exposing that action to
  // the Vue login screen.
  replaceOne(
    /function aT7\(data\)\{/g,
    "$&if(window.__fx)window.__fx.nativeLoginAdapter={login:function(accountName,password){var loginMenu=u.a5T();if(!loginMenu||loginMenu.a5U==null)return false;bm.r0.r1(105,bJ.f3.zq(String(accountName||\"\"),5));bm.r0.r1(106,bJ.f3.zq(String(password||\"\"),15));u.v(8,loginMenu.a5U,new vY(18));return true;},cancel:function(){var loginMenu=u.a5T();if(!loginMenu||loginMenu.a5U==null)return false;u.v(6,loginMenu.a5U);return true;}};",
  );
});
