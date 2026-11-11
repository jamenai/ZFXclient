import { definePatch, insert } from "../modUtils.js"

export default definePatch(({ insertCode, modifyCode, replaceCode, replaceRawCode, matchOne, replaceOne }) => {
  const optional = (label, action) => {
    try { action(); }
    catch (error) { console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`, error?.message || error); }
  };

  // The latest native balance renderer keeps the same coordinates but its
  // surrounding function changed. Hook the final balance draw directly.
  try {
    replaceOne(
      /if\(nV\+tS\+aAv<=i\)\{zH\.fillText\(aB9,Math\.floor\(nV\+\.5\*tS\),Math\.floor\(\.3\*this\.j\)\)\}\}/g,
      '$&if(__fx.settingsApi.getBoolean("displayTickNumber"))zH.fillText(9-eh,Math.floor(aAv*2+aBA),Math.floor(.3*this.j));'
    );
  } catch { console.info("[ZFX Client] Native tick-number renderer hook is absent in this game version."); }

  // Version links are provided by the ZFX UI; the native version dialog was
  // removed in the current game build.
  
  // Hide propaganda popup
  // The native propaganda dialog is appended directly to body; put its backdrop
  // above custom lobby and Vue views so the whole prompt remains visible.
  replaceRawCode('w9.style.zIndex="6"', 'w9.id="fx-propaganda-overlay";w9.style.zIndex="2147483647"');
  const propagandaShowPattern = /\(new (?<dialogClass>\w+)\(\)\)\.(?<showMethod>\w+)\(\s*(?<messageState>\w+)\.(?<messageKey>\w+)\s*,\s*\k<messageState>\.(?<colorsKey>\w+)\s*,\s*\k<messageState>\.(?<idKey>\w+)\s*\)/g;
  const { groups: propagandaShow } = matchOne(propagandaShowPattern);
  const propagandaAckPattern = /if\((?<idArg>\w+)>=0\)\{if\((?<manager>\w+)\.(?<socketManager>\w+)\.(?<socketActiveMethod>\w+)\(0\)\)\{\k<manager>\.(?<messageManager>\w+)\.(?<ackMethod>\w+)\(0,\k<idArg>\)\}\}/g;
  try {
    const { groups: propagandaAck } = matchOne(propagandaAckPattern);
    replaceOne(
      propagandaShowPattern,
      `window.__fx?.showPropagandaInVue?.(${propagandaShow.messageState}.${propagandaShow.messageKey},${propagandaShow.messageState}.${propagandaShow.colorsKey},${propagandaShow.messageState}.${propagandaShow.idKey})===true?(0<=${propagandaShow.messageState}.${propagandaShow.idKey}&&${propagandaAck.manager}.${propagandaAck.socketManager}.${propagandaAck.socketActiveMethod}(0)&&${propagandaAck.manager}.${propagandaAck.messageManager}.${propagandaAck.ackMethod}(0,${propagandaShow.messageState}.${propagandaShow.idKey}),void 0):(new ${propagandaShow.dialogClass}).${propagandaShow.showMethod}(${propagandaShow.messageState}.${propagandaShow.messageKey},${propagandaShow.messageState}.${propagandaShow.colorsKey},${propagandaShow.messageState}.${propagandaShow.idKey})`,
    );
  } catch {
    console.info("[ZFX Client] Native propaganda acknowledgement hook is absent; using the native dialog fallback.");
    try {
      replaceOne(propagandaShowPattern,
        `!__fx.settingsApi.getBoolean("hidePropagandaPopup")&&(new ${propagandaShow.dialogClass}).${propagandaShow.showMethod}(${propagandaShow.messageState}.${propagandaShow.messageKey},${propagandaShow.messageState}.${propagandaShow.colorsKey},${propagandaShow.messageState}.${propagandaShow.idKey})`);
    } catch { console.info("[ZFX Client] Native propaganda dialog hook is absent in this game version."); }
  }

  // Don't reload FX users to main terri page.
  try { replaceCode(
    `var url = new URL("https://territorial.io/");
    url.searchParams.set("v", "" + Math.floor(Math.random() * 1000));
    window.location.href = url.toString();`,

    `var url = new URL(window.location);
    url.searchParams.set("v", "" + Math.floor(Math.random() * 1000));
    window.location.href = url.toString();`
  ) } catch { console.info("[ZFX Client] Native refresh URL hook is absent in this game version."); }

  // Disable built-in Territorial.io error reporting
  optional("native error reporting", () => insertCode(
    `window.removeEventListener("error", err);
    msg = e.lineno + " " + e.colno + "|" + stack; /* here */`,
    `__fx.reportError(e, msg);
    return alert("Error:\\n" + e.filename + " " + e.lineno + " " + e.colno + " " + e.message);`
  ));

  // use textContent so that usernames dont get parsed that contain html code
  optional("native leaderboard text rendering", () => replaceCode(
    `cell.style.width = data.columnWidths[columnIndex] + "%";
    cell.innerHTML = rows[rowIndex][columnIndex].content;`,

    `cell.style.width = data.columnWidths[columnIndex] + "%";
    cell.textContent = rows[rowIndex][columnIndex].content;`
  ));

  optional("native account summary", () => replaceCode(
    `d0 = a.b.c(d0, 1, 1000000);
    var rW = __L([tQ]);
    rW += "<br>";
    rW += __L([lp]);`,

    `d0 = a.b.c(d0, 1, 1000000);
    var rW = __L([tQ]);
    rW += "<br>";
    rW += __L([__fx.utils.escapeHtml("" + lp)]);`
  ));

  try { insertCode(
    `var value = getParam("account");
    if (!value) {
      value = getParam("a");
      if (!value) {
        b.clear();
        return false;
      }
    } /* here */
    b.clear();`,
    `value = __fx.utils.parseAccountId(value);
    if (!value) {
      b.clear();
      return false;
    }`
  ) } catch (error) {
    console.warn("[ZFX Client] Account query normalization hook is absent in this native version.");
  }

  // for the custom lobby version
  try {
    modifyCode(`new a("⚔️<br>" + __L(), function() {
      ${insert(`if (__fx.isCustomLobbyVersion) alert("This version is for use with custom lobbies only. For normal multiplayer, use the version at https://jamenai.github.io/ZFXclient/")
      else`)} b(0);
		}, ${insert(`__fx.isCustomLobbyVersion ? "rgba(50, 50, 50, 0.6)" : `)} c.d)`)
  } catch {
    console.info("[ZFX Client] Native custom-lobby version notice hook is absent in this game version.");
  }
})
