import { definePatch, insert } from "../modUtils.js"

export default definePatch(({ insertCode, modifyCode, replaceCode, replaceRawCode, matchOne, replaceOne }) => {
  const optional = (label, action) => {
    try { action(); }
    catch (error) { console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`, error?.message || error); }
  };

  // The latest native balance renderer keeps the same coordinates but its
  // surrounding function changed. Hook the final balance draw directly.
  let tickNumberHookInstalled = false;
  try {
    replaceOne(
      /if\(nV\+tS\+aAv<=i\)\{zH\.fillText\(aB9,Math\.floor\(nV\+\.5\*tS\),Math\.floor\(\.3\*this\.j\)\)\}\}/g,
      '$&if(__fx.settingsApi.getBoolean("displayTickNumber"))zH.fillText(9-eh,Math.floor(aAv*2+aBA),Math.floor(.3*this.j));'
    );
    tickNumberHookInstalled = true;
  } catch {}
  try {
    // 2.18.x moved the balance/tick indicator into cS.aEO. The native eq value
    // is only the per-tick countdown used by its side bars; bi.kz() is the
    // actual elapsed game tick shown by the Vue replacement.
    replaceOne(
      /var aES=bD\.pg\.a3X\(a7p\);p4\.fillText\(aES,Math\.floor\(j\/2\),aEN\);var vc=p4\.measureText\(aES\)\.width;p4\.font=aEI;/g,
      'var aES=bD.pg.a3X(a7p);p4.fillText(aES,Math.floor(j/2),aEN);var vc=p4.measureText(aES).width,aEW=Math.floor(this.k/12);if(__fx.settingsApi.getBoolean("displayTickNumber")){var fxTickAlign=p4.textAlign;p4.textAlign="right";p4.font=aEI;p4.fillText(eq,Math.floor(j/2-vc/2-aEW),aEN);p4.textAlign=fxTickAlign;}p4.font=aEI;'
    );
    tickNumberHookInstalled = true;
  } catch {}
  if (!tickNumberHookInstalled) console.info("[ZFX Client] Native tick-number renderer hook is absent in this game version.");

  // Publish the native balance indicator's values to its standalone Vue HUD.
  // Keep the native canvas visible until the first Vue snapshot has arrived.
  try {
    // ahM tracks simulation ticks inside a fixed-length cycle. Preserve a
    // completed-cycle count so the HUD can show cycle tick and match totals.
    replaceOne(/this\.dr=function\(\)\{this\.aM1=0;this\.ahN=\[\];this\.eP=0;this\.ahL=0;\};/g,
      'this.dr=function(){this.aM1=0;this.ahN=[];this.eP=0;this.ahL=0;this.fxTotalCycles=0;};');
    replaceOne(/this\.aFw=function\(aD\)\{if\(aE\.a4E===2\)\{return;\}bB\.rt\.el\(aD\);bC\.el\(\);aX\.aFw\(this\.aM1\);if\(this\.aM1===aE\.a8n\)\{/g,
      'this.aFw=function(aD){if(aE.a4E===2){return;}bB.rt.el(aD);bC.el();aX.aFw(this.aM1);if(this.aM1===aE.a8n){this.fxTotalCycles++;');
    replaceOne(/this\.fxTotalCycles\+\+;aE\.sq\.el\(\);this\.aM1=0;this\.eP=0;this\.ahL=0;this\.eg=bi\.eg;return;/g,
      'this.fxTotalCycles++;aE.sq.el();this.aM1=0;this.eP=0;this.ahL=0;window.__fx?.gameTickHudAdapter?.receiveCycleSnapshot?.({cycleTick:0,cycle:aE.a8n,totalCycles:this.fxTotalCycles,totalTicks:this.fxTotalCycles*aE.a8n});this.eg=bi.eg;return;');
    replaceOne(/this\.aM1\+\+;ag\.a8g\(\);ag\.nQ\(true\);be\.render\(\);/g,
      'this.aM1++;window.__fx?.gameTickHudAdapter?.receiveCycleSnapshot?.({cycleTick:this.aM1,cycle:aE.a8n,totalCycles:this.fxTotalCycles||0,totalTicks:(this.fxTotalCycles||0)*aE.a8n+this.aM1});ag.a8g();ag.nQ(true);be.render();');
    replaceOne(/bi\.a4O\.el\(\)[,;]window\.requestAnimationFrame\(ahj\)/g,
      'bi.a4O.el();if(window.__fx?.gameTickHudAdapter?.receiveCycleSnapshot){var fxCycleNow=Date.now();if(fxCycleNow-(window.__fx.gameTickHudCycleLastSent||0)>=200){window.__fx.gameTickHudCycleLastSent=fxCycleNow;var fxCycle=Math.max(1,aE.a8n||100),fxCycleSource=bi.a4O,fxCycleTick=Number.isFinite(fxCycleSource?.aM1)?fxCycleSource.aM1:bi.kz()%fxCycle,fxTotalCycles=Number(fxCycleSource?.fxTotalCycles)||0;window.__fx.gameTickHudAdapter.receiveCycleSnapshot({cycleTick:fxCycleTick,cycle:fxCycle,totalCycles:fxTotalCycles,totalTicks:fxTotalCycles*fxCycle+fxCycleTick});}}window.requestAnimationFrame(ahj);');
    replaceOne(
      /p4\.fillRect\(j-1,0,1,this\.k\)/g,
      '$&;if(window.__fx?.gameTickHudAdapter?.receiveNativeSnapshot){var fxTickNow=Date.now();if(fxTickNow-(window.__fx.gameTickHudLastSent||0)>=200){window.__fx.gameTickHudLastSent=fxTickNow;var fxCycleTick=bi.a4O?.aM1||0,fxCycle=Math.max(1,aE.a8n||1),fxTotalCycles=bi.a4O?.fxTotalCycles||0;window.__fx.gameTickHudAdapter.receiveNativeSnapshot({updatedAt:fxTickNow,tick:eq,displayTick:eq,cycleTick:eq,cycle:10,totalTicks:fxTotalCycles*fxCycle+fxCycleTick,totalCycles:fxTotalCycles,tickProgress:1-eq/9,balance:aES,income:aET,balanceRatio:Math.max(0,Math.min(1,ah.hi[aE.fQ]/aEJ)),isGrowing:aEK,visible:ah.ne[aE.fQ]!==0&&!aE.i5&&ah.a7f[aE.fQ]!==2});}}'
    );
    replaceOne(
      /this\.yr=function\(\)\{if\(ah\.ne\[aE\.fQ\]===0\|\|aE\.i5\|\|ah\.a7f\[aE\.fQ\]===2\)\{return;\}ys\.drawImage\(canvas,this\.fn,fp\);\}/g,
      'this.yr=function(){if(window.__fx?.gameTickHudReady)return;if(ah.ne[aE.fQ]===0||aE.i5||ah.a7f[aE.fQ]===2){return;}ys.drawImage(canvas,this.fn,fp);}'
    );
  } catch (error) {
    console.info("[ZFX Client] Native balance HUD adapter is absent in this game version.", error?.message || error);
  }

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

  // 2.17.9 stores the native home URL in its string table. Keep reloads on
  // the current ZFX URL instead of navigating back to territorial.io/.
  try {
    const refreshPattern = /var\s+a5K\s*=\s*new URL\((?:S\[113\]|"https:\/\/territorial\.io\/")\);a5K\.searchParams\.set\("v",""\+Math\.floor\((?:Math\.random\(\)\*1000|1e3\*Math\.random\(\))\)\);window\.location\.href=a5K\.toString\(\);/g;
    replaceOne(refreshPattern,
      'var a5K=new URL(window.location.href);a5K.searchParams.set("v",""+Math.floor(Math.random()*1000));window.location.href=a5K.toString();');
  } catch {
    try { replaceCode(
    `var url = new URL("https://territorial.io/");
    url.searchParams.set("v", "" + Math.floor(Math.random() * 1000));
    window.location.href = url.toString();`,

    `var url = new URL(window.location);
    url.searchParams.set("v", "" + Math.floor(Math.random() * 1000));
    window.location.href = url.toString();`
    ) } catch { console.info("[ZFX Client] Native refresh URL hook is absent in this game version."); }
  }

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
