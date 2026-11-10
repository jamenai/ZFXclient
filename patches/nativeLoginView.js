import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // Current native login screen is state 6 (aSV). Keep authentication and
  // server error handling native by saving into the native settings buffer
  // and opening its own credential submission screen (ux(18)).
  replaceOne(
    /function aSV\(\)\{/g,
    "$&if(window.__fx)window.__fx.nativeLoginAdapter={login:function(accountName,password){bm.r0.r1(105,bJ.f3.zq(String(accountName||\"\"),5));bm.r0.r1(106,bJ.f3.zq(String(password||\"\"),15));u.v(8,u.a8s(7).a4w,new ux(18));return true;},cancel:function(){u.v(7,u.a8s(7).a4w);return true;}};",
  );
});
