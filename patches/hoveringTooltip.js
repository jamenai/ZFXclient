import ModUtils, { insert } from "../modUtils.js"

export default (/** @type {ModUtils} */ { modifyCode, replaceOne, replaceRawCode, waitForMinification }) => {

    modifyCode(`
        ${insert(`__fx.hoveringTooltip.display = function(mouseX, mouseY) {
            var coordX = bO.hP(mouseX), coordY = bO.hR(mouseY), point = bO.ez(bO.fW(coordX, coordY));
            if (bO.isInMapBounds(coordX, coordY)) (function(lj, lk, en) {
                a6b(lj, lk, en);
            }(mouseX, mouseY, point))
        }`)}
        this.click = function(lj, lk, a39) {
		var hO = bO.hP(lj);
		var hQ = bO.hR(lk);
		var ev = bO.fW(hO, hQ);
		var en = bO.ez(ev);
		var a6a = (a0.a1.iI() ? 0.025 : 0.0144) * h___.iJ;
		var eY = performance.now();
		if (Math.abs(lj - a6H) > a6a || Math.abs(lk - a6I) > a6a || eY > eX + 500) { return false; }
		eX = eY;
		if (bL.rU()) {
			bL.hE = lj;
			bL.hF = lk;
			b7.ec(1);
			b8.ec(1);
		}
		if (!bO.isInMapBounds(hO, hQ)) { return false; }
		if (a39) {
			a6b(lj, lk, en);
			return false;
		}
        /*...*/}`)

    try {
        const replaySelectionHook = "if(aE.hj||aE.hk){aE.fK=player;}";
        if (!modUtils.script.includes(replaySelectionHook)) throw new Error("Replay player selection hook not found");
        modUtils.script = modUtils.script.replace(replaySelectionHook,
            "if((aE.hj||aE.hk)&&__fx.hoveringTooltip.active===false){aE.fK=player;}");
    } catch (error) {
        console.info("[ZFX Client] Native replay tooltip hook is absent in this game version.");
    }
    
    waitForMinification(() => {
        replaceRawCode("aK.nH=(window.devicePixelRatio||1)*aEr,",
            `aK.nH = (window.devicePixelRatio || 1) * aEr, __fx.hoveringTooltip.canvasPixelScale = aK.nH,`)
    })

}
