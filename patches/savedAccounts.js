import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne, replace }) => {
  // The current saved-account selector is built by aT8.
  replace(/(function aT8\(\)[\s\S]*?)(function aTB\()/g, (match, accountBlock, nextFunction) => {
    accountBlock = accountBlock.replace(
      /sZ=new xz\(bm\.buffer\.data\[117\],\w+\);\w+\(0\);/,
      "$&__fx.savedAccounts.decorate(sZ.sa,bm.buffer.data[117].oS);",
    );
    accountBlock = accountBlock.replace(
      "wc.sY(sZ);",
      "wc.sY(sZ);wc.sb((new u9([(new x(\"Edit Label\",function(){__fx.savedAccounts.edit(bm.buffer.data[117].value);},bE.pg,1)).button])));",
    );
    return accountBlock + nextFunction;
  });
});
