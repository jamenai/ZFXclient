import { definePatch } from "../modUtils.js"

export default definePatch((modUtils) => {
  const { insertCode, replaceCode, replaceRawCode, matchOne, replaceOne } = modUtils;
  const optional = (label, action) => {
    try { action(); }
    catch (error) { console.info(`[ZFX Client] Native ${label} hook is absent in this game version.`, error?.message || error); }
  };

  // The current cU renderer draws balance and tick on the same compact canvas.
  let tickNumberHookInstalled = false;
  try {
    replaceOne(
      /var aE5=bD\.pc\.a35\(a7Q\);p6\.fillText\(aE5,Math\.floor\(j\/2\),aE0\);var vc=p6\.measureText\(aE5\)\.width;p6\.font=aDv;/g,
      'var aE5=bD.pc.a35(a7Q);p6.fillText(aE5,Math.floor(j/2),aE0);var vc=p6.measureText(aE5).width;if(__fx.settingsApi.getBoolean("displayTickNumber")){var fxTickText=String(bi.l3());p6.font=aDv;p6.fillStyle=bE.qP;if(p6.measureText(fxTickText).width<(j-vc)/2-aE9)p6.fillText(fxTickText,Math.floor((j-vc)/4),aE0);p6.font=a9e;}p6.font=aDv;'
    );
    tickNumberHookInstalled = true;
  } catch {}
  if (!tickNumberHookInstalled) console.info("[ZFX Client] Native tick-number renderer hook is absent in this game version.");

  // The current native balance HUD is cU. Its renderer exposes the countdown,
  // balance and income directly while painting the canvas in aE1.
  try {
    replaceOne(
      /var eu=this\.aE3\(\);this\.aE4\(\);p6\.fillStyle=ah\.hm\[aE\.fU\]>=af\.km\(aE\.fU\)\?bE\.qy:bE\.qP;/g,
      'var eu=this.aE3();if(window.__fx?.gameTickHudAdapter?.receiveNativeSnapshot){var fxTickNow=Date.now();if(fxTickNow-(window.__fx.gameTickHudLastSent||0)>=200){window.__fx.gameTickHudLastSent=fxTickNow;var fxBalance=ah.hm[aE.fU],fxCycleTick=bi.l3()%10;window.__fx.gameTickHudAdapter.receiveNativeSnapshot({updatedAt:fxTickNow,tick:bi.l3(),displayTick:bi.l3(),cycleTick:fxCycleTick,cycle:10,totalTicks:bi.l3(),totalCycles:Math.floor(bi.l3()/10),tickProgress:1-eu/9,balance:fxBalance,income:af.aE7,balanceRatio:Math.max(0,Math.min(1,fxBalance/Math.max(1,aDw))),isGrowing:aDx,visible:ah.ni[aE.fU]!==0&&!aE.i9&&ah.a7G[aE.fU]!==2});}}this.aE4();p6.fillStyle=ah.hm[aE.fU]>=af.km(aE.fU)?bE.qy:bE.qP;'
    );
    replaceOne(
      /yw\.drawImage\(canvas,\s*this\.fr,\s*ft\)/g,
      'window.__fx?.gameTickHudReady||yw.drawImage(canvas,this.fr,ft)'
    );
    console.info("[ZFX Client] Connected balance and tick HUD to the current native cU renderer.");
  } catch (error) {
    console.info("[ZFX Client] Native balance HUD adapter is absent in this game version.", error?.message || error);
  }

  // Version links are provided by the ZFX UI; the native version dialog was
  // removed in the current game build.
  
  // Route the current Native propaganda manager to Vue and retain its receipt
  // (action 0) and dismissal (action 1) acknowledgements.
  try {
    const propagandaShowPattern = /\(new\s+(?<dialogClass>\w+)\s*\(\)\)\.(?<showMethod>\w+)\(\s*(?<state>\w+)\.(?<message>\w+)\s*,\s*\k<state>\.(?<colors>\w+)\s*,\s*\k<state>\.(?<id>\w+)\s*\)/g;
    const { groups } = matchOne(propagandaShowPattern);
    const nativeAckPatterns = [
      /(?<idArg>\w+)\s*>=\s*0\s*&&\s*(?<socket>\w+(?:\.\w+)*)\.(?<active>\w+)\(0\)\s*&&\s*(?<manager>\w+(?:\.\w+)*)\.(?<ack>\w+)\(0\s*,\s*\k<idArg>\)/g,
      /if\s*\(\s*(?<idArg>\w+)\s*>=\s*0\s*\)\s*\{\s*if\s*\(\s*(?<socket>\w+(?:\.\w+)*)\.(?<active>\w+)\(0\)\s*\)\s*\{\s*(?<manager>\w+(?:\.\w+)*)\.(?<ack>\w+)\(0\s*,\s*\k<idArg>\)\s*;?\s*\}\s*\}/g,
    ];
    let ack = null;
    for (const pattern of nativeAckPatterns) {
      try { ack = matchOne(pattern).groups; break; } catch {}
    }
    if (!ack) throw new Error("Native propaganda acknowledgement body changed");
    const overlayPattern = new RegExp(`(function\\s+${groups.dialogClass}\\s*\\(\\)\\s*\\{[\\s\\S]*?)(?<overlay>\\w+)\\.style\\.zIndex\\s*=\\s*"6"` , "g");
    replaceOne(overlayPattern, '$1$<overlay>.id="fx-propaganda-overlay";$<overlay>.style.zIndex="2147483647"');
    replaceOne(propagandaShowPattern,
      `(function(fxPropagandaId){return window.__fx?.showPropagandaInVue?.(${groups.state}.${groups.message},${groups.state}.${groups.colors},fxPropagandaId,null,function(){if(fxPropagandaId>=0&&${ack.socket}.${ack.active}(0))${ack.manager}.${ack.ack}(1,fxPropagandaId)})===true?(fxPropagandaId>=0&&${ack.socket}.${ack.active}(0)&&${ack.manager}.${ack.ack}(0,fxPropagandaId),void 0):(new ${groups.dialogClass}).${groups.showMethod}(${groups.state}.${groups.message},${groups.state}.${groups.colors},fxPropagandaId)} )(${groups.state}.${groups.id})`);
    console.info("[ZFX Client] Connected Native propaganda display and acknowledgements to Vue.");
  } catch (error) {
    console.info("[ZFX Client] Native propaganda handoff hook is absent in this game version.", error?.message || error);
  }

  // Keep native reloads on the current host and preserve active URL options.
  try {
    replaceOne(/new URL\("https:\/\/territorial\.io\/"\)/g, 'new URL(window.location.href)');
    console.info("[ZFX Client] Kept native reloads on the current host.");
  } catch {
    console.info("[ZFX Client] Native refresh URL hook is absent in this game version.");
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

  try {
    replaceOne(/aco\("account",5\)/g,
      'typeof URLSearchParams==="undefined"?null:__fx.utils.parseAccountId(new URLSearchParams(window.location.search).get("account"))');
    replaceOne(/aco\("a",5\)/g,
      'typeof URLSearchParams==="undefined"?null:__fx.utils.parseAccountId(new URLSearchParams(window.location.search).get("a"))');
  } catch {
    console.warn("[ZFX Client] Native account query route hook is absent in this game version.");
  }

})
