import { definePatch } from "../modUtils.js";

export default definePatch(({ replace, replaceRawCode }) => {
  // The native account security page now uses tU inputs and opens password
  // reset screen 15. Add the optional custom password beside the current one.
  replace(
    /(function aT3\(\)\{var wc=new sO\(\);wc\.sR\(L\(207\)\);var aTU=new tU\(bm\.buffer\.data\[106\]\);aTU\.e\.readOnly=true;aTU\.e\.type="password";wc\.sb\(aTU\);)/g,
    "$1var customPasswordInput=new tU({value:\"\",eL:-1});customPasswordInput.e.placeholder=\"Custom new password (optional)\";wc.sb(customPasswordInput);",
  );

  replace(
    /(function aT3\(\)\{[\s\S]*?)function\(\)\{u\.v\(8,u\.a4v\(\)\.a4w,new ux\(15\)\);\}/g,
    "$1function(){if(!__fx.passwordReset.setCustomPassword(customPasswordInput.e.value))return;u.v(8,u.a4v().a4w,new ux(15));}",
  );

  // Screen 15 sends the chosen value from buffer 110. Keep the game's random
  // password as the fallback when the optional field is left blank.
  replaceRawCode(
    "bm.r0.r1(110,bI.f3.uy(bI.f3.uz(15)))",
    "bm.r0.r1(110,__fx.passwordReset.getCustomPassword()||bI.f3.uy(bI.f3.uz(15)))",
  );
});
