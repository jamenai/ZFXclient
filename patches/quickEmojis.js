import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  const { replaceRawCode, replaceOne } = modUtils;
  // The native emoji catalog moved to a2k in 2.17.9. Publish its current
  // emoji list and code range for the settings UI.
  if (/this\.a32=1024;/g.test(modUtils.script)) {
    replaceOne(/this\.a32=1024;/g,
      'this.a32=1024;window.__fx.quickEmojis=window.__fx.quickEmojis||{};window.__fx.quickEmojis.emojiList=this.emojis;window.__fx.quickEmojis.emojiBaseCode=this.a34;');
  } else {
    try { replaceRawCode("this.a2T=1024;", "this.a2T=1024;window.__fx.quickEmojis=window.__fx.quickEmojis||{};window.__fx.quickEmojis.emojiList=this.emojis;window.__fx.quickEmojis.emojiBaseCode=this.a2T;"); }
    catch { console.info("[ZFX Client] Native emoji catalog hook is absent in this game version."); }
  }

  // Native quick slots are stored in setting 120. When the custom profile
  // option is enabled, populate the current nine slots from the ZFX setting.
  if (/function a2Y\(\)\{/g.test(modUtils.script)) {
    replaceOne(
      /function a2Y\(\)\{/g,
      "$&if(__fx.settingsApi.getBoolean(\"customQuickEmojisEnabled\")){var customEmojis=__fx.settingsApi.getArray(\"customQuickEmojis\");for(var q=0;q<9;q++){var code=parseInt(customEmojis[q],10);a2J[q]={rF:isNaN(code)?1015+q:code,l3:0};}return;}",
    );
  }

  // Keep the chosen custom slots fixed when a player uses an emoji.
  if (/function a2a\(rF\)\{/g.test(modUtils.script)) {
    replaceOne(
      /function a2a\(rF\)\{/g,
      "$&if(__fx.settingsApi.getBoolean(\"customQuickEmojisEnabled\"))return;",
    );
  }
});
