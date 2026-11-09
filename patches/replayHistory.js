import { definePatch, insert } from "../modUtils.js"

export default definePatch(({ matchCode, modifyCode, replace, waitForMinification }) => {
  // keep a rolling history of last 5 replays.
  modifyCode(`this.a3d = function(eY) {
		if (!bC.re.a6x.length) {
			this.a6l = bC.a6y.a1i();
		} else {
			this.a6l = bC.re.a6x;
		} ${insert(`__fx.replayHistory.save(this.a6l);`)} /*...*/}`)

  const { protocol, stripPrefix, parser, parseReplay, watchReplay, menuSystem, closeMenu,
    textArea, getText, game, gameState, recorder, replayData, input } = matchCode(`
    function watchInput() {
      menuSystem.closeMenu();
      var input = protocol.stripPrefix(textArea.getText());
      if (game.gameState && input.length > 0 && input === protocol.recorder.replayData) {
        protocol.watchReplay();
        return;
      }
      if (!protocol.parser.parseReplay(input)) {
        return;
      }
      protocol.watchReplay();
    }`)

  modifyCode(`function watchInput() {
    ${menuSystem}.${closeMenu}();
    var ${input} = ${protocol}.${stripPrefix}(${textArea}.${getText}());
    if (${game}.${gameState} && ${input}.length > 0 && ${input} === ${protocol}.${recorder}.${replayData}) {
      /*insert line:*/ __fx.replayHistory.setActiveReplay(null);
      ${protocol}.${watchReplay}();
      return;
    }
    if (!${protocol}.${parser}.${parseReplay}(${input})) {
      return;
    }
    /*insert line:*/ __fx.replayHistory.setActiveReplay(null);
    ${protocol}.${watchReplay}();
  }`)
  waitForMinification(() => {
    try {
      replace(/__fx\.replay\.restartReplay\s*=\s*\(\)\s*=>\s*this\.aWC\(\)\s*,\s*this\.aWC\s*=\s*function\(\)\s*\{\s*var\s+\w+\s*=/,
        `__fx.replayHistory.load = function(saved, timestamp) {
          saved = ${protocol}.${stripPrefix}(saved);
          ${menuSystem}.${closeMenu}();
          if (${protocol}.${parser}.${parseReplay}(saved)) {
            __fx.replayHistory.setActiveReplay(timestamp);
            ${protocol}.${watchReplay}();
            return true;
          }
          __fx.replayHistory.setActiveReplay(null);
          return false;
        };$&`);
    } catch (error) {
      console.warn("[ZFX Client] Native replay input adapter changed; replay history loading is unavailable.", error);
    }
  });
})
