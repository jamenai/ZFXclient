import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // Native 2.17.x creates a fresh password in vY's aXt() reset action.
  // Substitute the validated ZFX value only when the user supplied one.
  replaceOne(
    /bm\.rv\.q1\(110,bI\.fB\.vZ\(bI\.fB\.va\(15\)\)\)/g,
    'bm.rv.q1(110,window.__fx?.passwordReset?.getCustomPassword?.()||bI.fB.vZ(bI.fB.va(15)))',
  );
});
