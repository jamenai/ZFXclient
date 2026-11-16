import { definePatch } from "../modUtils.js";

export default definePatch(({ replaceOne }) => {
  // Publish the current native emoji list from the manager that owns the
  // catalog. The current catalog starts after the 676 flag glyphs.
  try {
    replaceOne(
      /this\.q7=new a2H\(\);this\.a2I=new a2J\(\);/g,
      'this.q7=new a2H();window.__fx.quickEmojis=window.__fx.quickEmojis||{};window.__fx.quickEmojis.emojiList=this.q7.emojis;window.__fx.quickEmojis.emojiBaseCode=this.q7.a2c;this.a2I=new a2J();',
    );
    console.info("[ZFX Client] Mapped the current native emoji catalog and base code.");
  } catch (error) {
    console.info("[ZFX Client] Native emoji catalog hook is absent in this game version.", error.message);
  }

  // The native quick bar persists nine emoji codes in setting 120. Preserve
  // the native full picker list, then substitute the chosen ZFX slots.
  try {
    replaceOne(
      /function a2f\(\)\{var aC;var pY=bm\.buffer\.data\[120\]\.value;/g,
      'function a2f(){if(__fx.settingsApi.getBoolean("customQuickEmojisEnabled")){var customEmojis=__fx.settingsApi.getArray("customQuickEmojis");for(var fxEmojiIndex=0;fxEmojiIndex<9;fxEmojiIndex++){var fxEmojiCode=parseInt(customEmojis[fxEmojiIndex],10);a2Q[fxEmojiIndex]={s9:Number.isInteger(fxEmojiCode)&&fxEmojiCode>=0&&fxEmojiCode<1024?fxEmojiCode:1015+fxEmojiIndex,lB:0};}return;}var aC;var pY=bm.buffer.data[120].value;',
    );
    replaceOne(
      /function a2h\(s9\)\{var aC;/g,
      'function a2h(s9){if(__fx.settingsApi.getBoolean("customQuickEmojisEnabled"))return;var aC;',
    );
    console.info("[ZFX Client] Connected custom quick emojis to the current native picker state.");
  } catch (error) {
    console.info("[ZFX Client] Native quick emoji state hook is absent in this game version.", error.message);
  }
});
