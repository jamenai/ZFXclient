import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceRawCode, replaceOne }) => {
  // Publish the native emoji catalog and flag codes to the settings UI.
  replaceRawCode(
    "this.a2T=1024;",
    "this.a2T=1024;window.__fx.quickEmojis=window.__fx.quickEmojis||{};window.__fx.quickEmojis.emojiList=this.emojis;window.__fx.quickEmojis.emojiBaseCode=this.a2T;",
  );
  replaceRawCode(
    "var a2W=ak.tx.a2X(bN.a2W);",
    "var a2W=ak.tx.a2X(bN.a2W);window.__fx.quickEmojis.realFlagCodes=a2W.slice();",
  );

  // Native quick slots are stored in setting 120. When the custom profile
  // option is enabled, populate the current nine slots from the ZFX setting.
  replaceOne(
    /function a2Y\(\)\{/g,
    "$&if(__fx.settingsApi.getBoolean(\"customQuickEmojisEnabled\")){var customEmojis=__fx.settingsApi.getArray(\"customQuickEmojis\");for(var q=0;q<9;q++){var code=parseInt(customEmojis[q],10);a2J[q]={rF:isNaN(code)?1015+q:code,l3:0};}return;}",
  );

  // Keep the chosen custom slots fixed when a player uses an emoji.
  replaceOne(
    /function a2a\(rF\)\{/g,
    "$&if(__fx.settingsApi.getBoolean(\"customQuickEmojisEnabled\"))return;",
  );
});
