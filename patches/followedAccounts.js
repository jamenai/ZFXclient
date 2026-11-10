import { definePatch } from "../modUtils.js";

export default definePatch(({ script }) => {
  // The latest native game no longer contains the old Settings > Follow list
  // view this patch extended. Followed account identities are now synchronized
  // from the live native lobby roster in gameSdk.js; nickname/color editing is
  // still provided by the ZFX account-label editor.
  if (!script.includes("storage.followList") && !script.includes("getListData")) {
    console.info("[ZFX Client] Native followed-account settings view was removed; using the ZFX account-label bridge.");
  }
});
