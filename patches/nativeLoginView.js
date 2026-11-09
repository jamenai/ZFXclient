import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // In 2.17.x the native account form is aRQ and aVg performs the Terri login
  // submission. Reuse that path so the socket protocol and error handling stay
  // native while the visible form is supplied by Vue.
  replaceOne(
    /function aVg\(\)\{bm\.qt\.qu\(105,bJ\.f1\.zV\(aRq\.sM\[0\]\.s3\[0\]\.e\.value,5\)\);bm\.qt\.qu\(106,bJ\.f1\.zV\(aRq\.sM\[1\]\.s3\[0\]\.e\.value,15\)\);u\.v\(8,u\.a8P\(7\)\.a4a,new ud\(18\)\)\}/g,
    "function aVg(){bm.qt.qu(105,bJ.f1.zV(aRq.sM[0].s3[0].e.value,5));bm.qt.qu(106,bJ.f1.zV(aRq.sM[1].s3[0].e.value,15));u.v(8,u.a8P(7).a4a,new ud(18));}if(window.__fx)window.__fx.nativeLoginAdapter={login:function(accountName,password){if(!aRq||!aRq.sM?.[0]?.s3?.[0]?.e||!aRq.sM?.[1]?.s3?.[0]?.e)return false;aRq.sM[0].s3[0].e.value=String(accountName??\"\");aRq.sM[1].s3[0].e.value=String(password??\"\");aVg();return true;},cancel:function(){u.v(7,u.a8P(7).a4a);return true;}};"
  );
});
