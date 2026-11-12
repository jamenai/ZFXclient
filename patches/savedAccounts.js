import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne, replace }) => {
  // 2.17.9 renamed the native saved-account dialog from aT8 to aTj.
  // Keep the native selector and actions, but decorate its account rows with
  // the ZFX labels and provide the label editor in the dialog itself.
  let currentDialogInstalled = false;
  replace(/function aTj\(\)\{([\s\S]*?)return xD;\}/g, (match, body) => {
    const selector = "tW=new yZ(bm.buffer.data[117],aUA);";
    if (!body.includes(selector)) return match;
    body = body.replace(selector,
      `${selector}window.__fx.savedAccounts.decorate(tW.tX,bm.buffer.data[117].oW);`);
    const actionRow = "xD.tY((new um([aU9[1].button])));";
    if (body.includes(actionRow)) {
      body = body.replace(actionRow,
        `${actionRow}xD.tY((new um([(new x("Edit Label",function(){window.__fx.savedAccounts.edit(bm.buffer.data[117].value);},bE.qf,1)).button])));`);
    }
    currentDialogInstalled = true;
    return `function aTj(){${body}return xD;}`;
  });
  if (currentDialogInstalled) console.info("[ZFX Client] Installed saved-account labels in the current native account dialog.");

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
