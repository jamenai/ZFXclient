import ModUtils, { insert } from "../modUtils.js"

// Name rendering patches - Display density of other players & Hide bot names features

export default (/** @type {ModUtils} */ modUtils) => {
  const { modifyCode, waitForMinification, matchCode, replaceOne } = modUtils;

  // Current name renderer is aP8. Preserve native balance text while adding
  // ZFX name filtering, optional bot hiding, density, and elimination estimate.
  if (/function aP8\(aC,fontSize,fj,fl,ih\)\{ih\.fillText\(ah\.a2A\[aC\],fj,fl\);/.test(modUtils.script)) {
    const nativeFields = {
      game: "aE", playerId: "fM", playerData: "ah", playerNames: "a2A", rawPlayerNames: "a4O",
      playerTerritories: "hQ", playerBalances: "he", playerBalance: "he", playerCommitted: "a7G",
      playerStates: "a77", gHumans: "ky", gameState: "a3c",
    };
    for (const [key, value] of Object.entries(nativeFields)) {
      if (modUtils.dictionary[key] === undefined) modUtils.dictionary[key] = value;
    }
    replaceOne(/function aP8\(aC,fontSize,fj,fl,ih\)\{ih\.fillText\(ah\.a2A\[aC\],fj,fl\);/g,
      'function aP8(aC,fontSize,fj,fl,ih){if(aC>=aE.ky&&__fx.settingsApi.getBoolean("hideBotNames"))return;var fxAccountLabel=__fx.followedAccounts.getLobbyDetails(ah.a2A[aC]);var fxDisplayName=__fx.nameFilter.filter(fxAccountLabel.nickname||ah.a2A[aC]),fxOldNameColor=ih.fillStyle;if(fxAccountLabel.color)ih.fillStyle=fxAccountLabel.color;if(!__fx.settingsApi.getBoolean("showCountryFlagsOnLand")||!__fx.utils.drawPlayerNameWithCountryFlags(ih,fxDisplayName,fj,fl))ih.fillText(fxDisplayName,fj,fl);ih.fillStyle=fxOldNameColor;if(aC<aE.ky&&ah.a77[aC]!==2)return;if(__fx.settingsApi.getBoolean("showPlayerDensity")){var fxOldFill=ih.fillStyle;__fx.settingsApi.getBoolean("coloredDensity")&&(ih.fillStyle=__fx.utils.textStyleBasedOnDensity(aC));ih.fillText(__fx.utils.getDensity(aC),fj,fl+fontSize);var fxAttack=__fx.settingsApi.getBoolean("showEstimatedEliminationAttack")?__fx.utils.getEstimatedEliminationAttack(aC,ah.he[aC]-ah.a7G[aC]):"";fxAttack&&__fx.utils.drawEstimatedEliminationAttack(ih,aC,fxAttack,fj,fl+2*fontSize);ih.fillStyle=fxOldFill;}');
    return;
  }

  // Current native code renders names in aP5 and balances in aP4.
  if (/function aP5\(aC,fontSize,fj,fl,ih\)\{ih\.fillText\(ah\.a2A\[aC\],fj,fl\);/.test(modUtils.script)) {
    const nativeFields = {
      game: "aE", playerId: "fM", playerData: "ah", playerNames: "a2A", rawPlayerNames: "a4O",
      playerTerritories: "hQ", playerBalances: "he", playerBalance: "he", playerCommitted: "a7G",
      playerStates: "a77", gHumans: "ky", gameState: "a3c",
    };
    for (const [key, value] of Object.entries(nativeFields)) {
      if (modUtils.dictionary[key] === undefined) modUtils.dictionary[key] = value;
    }
    replaceOne(/function aP5\(aC,fontSize,fj,fl,ih\)\{ih\.fillText\(ah\.a2A\[aC\],fj,fl\);/g,
      'function aP5(aC,fontSize,fj,fl,ih){if(aC>=aE.ky&&__fx.settingsApi.getBoolean("hideBotNames"))return;var fxAccountLabel=__fx.followedAccounts.getLobbyDetails(ah.a2A[aC]);var fxDisplayName=__fx.nameFilter.filter(fxAccountLabel.nickname||ah.a2A[aC]),fxOldNameColor=ih.fillStyle;if(fxAccountLabel.color)ih.fillStyle=fxAccountLabel.color;if(!__fx.settingsApi.getBoolean("showCountryFlagsOnLand")||!__fx.utils.drawPlayerNameWithCountryFlags(ih,fxDisplayName,fj,fl))ih.fillText(fxDisplayName,fj,fl);ih.fillStyle=fxOldNameColor;');
    waitForMinification(() => replaceOne(
      /if\(aOl\)\{aP5\(aC,aP1,aOy,aOz,ih\);\}else\{aP4\(ih,aC,aP1,aOy,aOz,aP0\);\}/g,
      '$&;if(__fx.settingsApi.getBoolean("showPlayerDensity")){var fxOldFill=ih.fillStyle;__fx.settingsApi.getBoolean("coloredDensity")&&(ih.fillStyle=__fx.utils.textStyleBasedOnDensity(aC));ih.fillText(__fx.utils.getDensity(aC),aOy,aOz+aP1);var fxAttack=__fx.settingsApi.getBoolean("showEstimatedEliminationAttack")?__fx.utils.getEstimatedEliminationAttack(aC,ah.he[aC]-ah.a7G[aC]):"";fxAttack&&__fx.utils.drawEstimatedEliminationAttack(ih,aC,fxAttack,aOy,aOz+2*aP1);ih.fillStyle=fxOldFill;}'
    ));
    return;
  }

  const playerDataFieldNames = matchCode(`var playerCommitted = playerData.playerCommitted[playerID];
    var balanceText = formatter.one.two(playerData.playerBalance[playerID] - playerCommitted);`, {
    addToDictionary: ["playerData", "playerCommitted", "playerBalance"],
  })

  const { placeBalanceAbove } = matchCode(`aLT += Math.floor(0.78 * fontSize);
    if (placeBalanceAbove) {/*...*/}`)

  // Balance rendering; Renders density when the "Reverse Name/Balance" setting is off (default)
  modifyCode(
    `function aLY(ctx, i, fontSize, x, y, aLU) {
    var committedAttack = playerData.playerCommitted[i];
    var aLe = Util.s1.formatNumber(playerData.playerBalance[i] - committedAttack);
    ${insert(`function drawDensity() {
      if (!placeBalanceAbove && __fx.settingsApi.getBoolean("showPlayerDensity")) {
        __fx.settingsApi.getBoolean("coloredDensity") && (ctx.fillStyle = __fx.utils.textStyleBasedOnDensity(i));
        ctx.fillText(__fx.utils.getDensity(i), x, y + fontSize);
        const eliminationEstimate = __fx.settingsApi.getBoolean("showEstimatedEliminationAttack")
          ? __fx.utils.getEstimatedEliminationAttack(
              i,
              playerData[${JSON.stringify(playerDataFieldNames.playerBalance)}]?.[i] - committedAttack
            )
          : "";
        eliminationEstimate && __fx.utils.drawEstimatedEliminationAttack(ctx, i, eliminationEstimate, x, y + 2 * fontSize);
      }
    }`)}
    if (committedAttack) {
      var eY = ctx.fillStyle;
      ctx.fillStyle = aLX(fontSize, 2 + aLU % 2);
      ctx.fillText(aLe, x, y);
      ctx.fillStyle = eY;
      ${insert(`drawDensity();`)}
      return;
    }
    if (((aLU >> 1) & 1)) {
      ctx.lineWidth = 0.05 * fontSize;
      ctx.strokeStyle = aLX(fontSize, aLU % 2);
      ctx.strokeText(aLe, x, y);
      ${insert(`drawDensity();`)}
      return;
    }
    if (aLU > 1) {
      ctx.lineWidth = 0.12 * fontSize;
      ctx.strokeStyle = aLX(fontSize, aLU);
      ctx.strokeText(aLe, x, y);
    }
    ctx.fillText(aLe, x, y);
    ${insert(`drawDensity();`)}
  }`,
    { dictionary: { playerData: playerDataFieldNames.playerData, playerCommitted: playerDataFieldNames.playerCommitted, playerBalance: playerDataFieldNames.playerBalance, placeBalanceAbove } },
  )

  waitForMinification(() => {
    // Name rendering; Renders density when the "Reverse Name/Balance" setting is on
    // also powers the feature for hiding bot names
    replaceOne(
      /(function \w+\((?<i>\w+),(?<fontSize>\w+),(?<x>\w+),(?<y>\w+),(?<canvas>\w+)\){)(\6\.fillText\((?<playerData>\w+)\.(?<playerNames>\w+)\[\2\],\4,\5\)),(\2<(?<game>\w+)\.(?<gHumans>\w+)&&2!==\8\.(?<playerStates>\w+)\[[^}]+)}/g,
      `$1 var ___id = $2;
        var showName = $<i> < $<game>.$<gHumans> || !__fx.settingsApi.getBoolean("hideBotNames");
        var eliminationEstimate = __fx.settingsApi.getBoolean("showEstimatedEliminationAttack")
            ? __fx.utils.getEstimatedEliminationAttack(
                ___id,
                $<playerData>[${JSON.stringify(playerDataFieldNames.playerBalance)}]?.[___id] -
                  $<playerData>[${JSON.stringify(playerDataFieldNames.playerCommitted)}]?.[___id]
              )
            : "";
        if (showName) {
          if (!__fx.settingsApi.getBoolean("showCountryFlagsOnLand") || !__fx.utils.drawPlayerNameWithCountryFlags(
            $<canvas>, $<playerData>.$<playerNames>[$<i>], $<x>, $<y>
          )) $7;
          $10;
        }
        ${placeBalanceAbove} && __fx.settingsApi.getBoolean("showPlayerDensity") && (
            __fx.settingsApi.getBoolean("coloredDensity") && ($<canvas>.fillStyle = __fx.utils.textStyleBasedOnDensity(___id)),
            $<canvas>.fillText(__fx.utils.getDensity(___id), $<x>, showName ? $<y> + $<fontSize> : $<y>),
            eliminationEstimate && __fx.utils.drawEstimatedEliminationAttack($<canvas>, ___id, eliminationEstimate, $<x>, showName ? $<y> + 2 * $<fontSize> : $<y> + $<fontSize>)
        ); }`,
    )
  })
}
