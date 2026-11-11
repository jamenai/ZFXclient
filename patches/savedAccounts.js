import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne, replace }) => {
  // The current saved-account selector is built by aT8.
  replace(/(function aT8\(\)[\s\S]*?)(function aTB\()/g, (match, accountBlock, nextFunction) => {
    accountBlock = accountBlock.replace(
      "bm.z.zE();",
      `bm.z.zE();window.__fx.refreshSavedAccounts=function(){if(!bm||!bm.z||typeof bm.z.zE!=="function")return false;bm.z.zE();var data=bm.buffer.data[117];if(!data)return false;window.__fx.myAccountAdapter?.setSavedAccounts?.(data,function(index){data.value=index;},function(){var credentials=bm.z.zJ(data.value);if(!credentials)return false;bm.r0.r1(105,credentials.uu);bm.r0.r1(106,credentials.password);u.v(8,u.a4v().a4w,new ux(18));return true;},function(index){index=Number(index)||0;if(index<1)return;bm.z.zH(index);bm.z.zE();window.__fx.refreshSavedAccounts();});return true;};window.__fx.refreshSavedAccounts();`,
    );
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
