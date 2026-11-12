import ModUtils, { insert } from "../modUtils.js"

// Name rendering patches - Display density of other players & Hide bot names features

export default (/** @type {ModUtils} */ modUtils) => {
  const { modifyCode, waitForMinification, matchCode, replaceOne } = modUtils;

  // Territorial.io 2.17.9 renamed the map-label data model and split the
  // native name/balance drawing into aPk/aPj.
  if (/function aPk\(aC,fontSize,fn,fp,il\)\{il\.fillText\(ah\.a2j\[aC\],fn,fp\);/.test(modUtils.script)) {
    replaceOne(/function aPk\(aC,fontSize,fn,fp,il\)\{il\.fillText\(ah\.a2j\[aC\],fn,fp\);/g,
      'function aPk(aC,fontSize,fn,fp,il){if(aC>=aE.l2&&window.__fx?.settingsApi?.getBoolean("hideBotNames"))return;var fxName=ah.a2j[aC]||"",fxDetails=window.__fx?.followedAccounts?.getLobbyDetails?.(fxName)||{},fxDisplayName=window.__fx?.nameFilter?.filter?.(fxDetails.nickname||fxName)||fxName,fxOldColor=il.fillStyle;if(fxDetails.color)il.fillStyle=fxDetails.color;if(!window.__fx?.settingsApi?.getBoolean("showCountryFlagsOnLand")||!window.__fx?.utils?.drawPlayerNameWithCountryFlags?.(il,fxDisplayName,fn,fp))il.fillText(fxDisplayName,fn,fp);il.fillStyle=fxOldColor;');

    // The native order switch (aPQ) decides which side of the name the
    // balance occupies. Draw density below the balance only in the normal
    // order, matching the old client behavior.
    replaceOne(/il\.fillText\(aPp,aPd,aPe\);\}function aPm\(/g,
      'il.fillText(aPp,aPd,aPe);if(!aPQ&&window.__fx?.settingsApi?.getBoolean("showPlayerDensity")){var fxOldDensityColor=il.fillStyle;if(window.__fx.settingsApi.getBoolean("coloredDensity"))il.fillStyle=window.__fx.utils.textStyleBasedOnDensity(aC);il.fillText(window.__fx.utils.getDensity(aC),aPd,aPe+fontSize);var fxAttack=window.__fx.settingsApi.getBoolean("showEstimatedEliminationAttack")?window.__fx.utils.getEstimatedEliminationAttack(aC,ah.hi[aC]-ah.a7o[aC]):"";fxAttack&&window.__fx.utils.drawEstimatedEliminationAttack(il,aC,fxAttack,aPd,aPe+2*fontSize);il.fillStyle=fxOldDensityColor;}}function aPm(');

    return;
  }

  // Current name renderer is aP8. Preserve native balance text while adding
  // ZFX name filtering, optional bot hiding, density, and elimination estimate.
  if (/function aP8\(aC,fontSize,fj,fl,ih\)\{ih\.fillText\(ah\.a2A\[aC\],fj,fl\);/.test(modUtils.script)) {
    const nativeFields = {
      game: "aE", playerId: "fM", playerData: "ah", playerNames: "a2A", rawPlayerNames: "a4O",
      playerTerritories: "hQ", playerBalances: "hi", playerBalance: "hi", playerCommitted: "a7o",
      playerStates: "a77", gHumans: "ky", gameState: "a3c",
    };
    for (const [key, value] of Object.entries(nativeFields)) {
      if (modUtils.dictionary[key] === undefined) modUtils.dictionary[key] = value;
    }
    replaceOne(/function aP8\(aC,fontSize,fj,fl,ih\)\{ih\.fillText\(ah\.a2A\[aC\],fj,fl\);/g,
      'function aP8(aC,fontSize,fj,fl,ih){var fxDiag=__fx.mapFeatureRenderDiagnostics||(__fx.mapFeatureRenderDiagnostics={});fxDiag.attackNamed=(fxDiag.attackNamed||0)+1;if(aC>=aE.ky&&__fx.settingsApi.getBoolean("hideBotNames"))return;var fxAccountLabel=__fx.followedAccounts.getLobbyDetails(ah.a2A[aC]);var fxDisplayName=__fx.nameFilter.filter(fxAccountLabel.nickname||ah.a2A[aC]),fxOldNameColor=ih.fillStyle;if(fxAccountLabel.color)ih.fillStyle=fxAccountLabel.color;if(!__fx.settingsApi.getBoolean("showCountryFlagsOnLand")||!__fx.utils.drawPlayerNameWithCountryFlags(ih,fxDisplayName,fj,fl))ih.fillText(fxDisplayName,fj,fl);ih.fillStyle=fxOldNameColor;if(__fx.settingsApi.getBoolean("showPlayerDensity")||__fx.settingsApi.getBoolean("showEstimatedEliminationAttack")){var fxOldFill=ih.fillStyle;if(__fx.settingsApi.getBoolean("showPlayerDensity")){__fx.settingsApi.getBoolean("coloredDensity")&&(ih.fillStyle=__fx.utils.textStyleBasedOnDensity(aC));ih.fillText(__fx.utils.getDensity(aC),fj,fl+fontSize);}var fxAttack=__fx.settingsApi.getBoolean("showEstimatedEliminationAttack")?__fx.utils.getEstimatedEliminationAttack(aC,ah.he[aC]-ah.a7G[aC]):"";fxAttack&&__fx.utils.drawEstimatedEliminationAttack(ih,aC,fxAttack,fj,fl+2*fontSize);ih.fillStyle=fxOldFill;}if(aC<aE.ky&&ah.a77[aC]!==2)return;');
    // At lower map zoom the native renderer switches to aP7 and suppresses
    // names. Keep the estimate visible in that compact-label path too.
    replaceOne(/function aP7\((?<ctx>\w+),(?<id>\w+),(?<font>\w+),(?<x>\w+),(?<y>\w+),(?<mode>\w+)\)\{/g,
      '$&var fxDiag=__fx.mapFeatureRenderDiagnostics||(__fx.mapFeatureRenderDiagnostics={});fxDiag.attackCompact=(fxDiag.attackCompact||0)+1;if(__fx.settingsApi.getBoolean("showEstimatedEliminationAttack")){var fxCompactAttack=__fx.utils.getEstimatedEliminationAttack($<id>,ah.he[$<id>]-ah.a7G[$<id>]);fxCompactAttack&&__fx.utils.drawEstimatedEliminationAttack($<ctx>,$<id>,fxCompactAttack,$<x>,$<y>+$<font>);}');
    return;
  }

  // Current native code renders names in aP5 and balances in aP4.
  if (/function aP5\(aC,fontSize,fj,fl,ih\)\{ih\.fillText\(ah\.a2A\[aC\],fj,fl\);/.test(modUtils.script)) {
    const nativeFields = {
      game: "aE", playerId: "fM", playerData: "ah", playerNames: "a2A", rawPlayerNames: "a4O",
      playerTerritories: "hQ", playerBalances: "hi", playerBalance: "hi", playerCommitted: "a7o",
      playerStates: "a77", gHumans: "ky", gameState: "a3c",
    };
    for (const [key, value] of Object.entries(nativeFields)) {
      if (modUtils.dictionary[key] === undefined) modUtils.dictionary[key] = value;
    }
    replaceOne(/function aP5\(aC,fontSize,fj,fl,ih\)\{ih\.fillText\(ah\.a2A\[aC\],fj,fl\);/g,
      'function aP5(aC,fontSize,fj,fl,ih){if(aC>=aE.ky&&__fx.settingsApi.getBoolean("hideBotNames"))return;var fxAccountLabel=__fx.followedAccounts.getLobbyDetails(ah.a2A[aC]);var fxDisplayName=__fx.nameFilter.filter(fxAccountLabel.nickname||ah.a2A[aC]),fxOldNameColor=ih.fillStyle;if(fxAccountLabel.color)ih.fillStyle=fxAccountLabel.color;if(!__fx.settingsApi.getBoolean("showCountryFlagsOnLand")||!__fx.utils.drawPlayerNameWithCountryFlags(ih,fxDisplayName,fj,fl))ih.fillText(fxDisplayName,fj,fl);ih.fillStyle=fxOldNameColor;');
    waitForMinification(() => replaceOne(
      /if\(aOl\)\{aP5\(aC,aP1,aOy,aOz,ih\);\}else\{aP4\(ih,aC,aP1,aOy,aOz,aP0\);\}/g,
      '$&;if(__fx.settingsApi.getBoolean("showPlayerDensity")||__fx.settingsApi.getBoolean("showEstimatedEliminationAttack")){var fxOldFill=ih.fillStyle;if(__fx.settingsApi.getBoolean("showPlayerDensity")){__fx.settingsApi.getBoolean("coloredDensity")&&(ih.fillStyle=__fx.utils.textStyleBasedOnDensity(aC));ih.fillText(__fx.utils.getDensity(aC),aOy,aOz+aP1);}var fxAttack=__fx.settingsApi.getBoolean("showEstimatedEliminationAttack")?__fx.utils.getEstimatedEliminationAttack(aC,ah.he[aC]-ah.a7G[aC]):"";fxAttack&&__fx.utils.drawEstimatedEliminationAttack(ih,aC,fxAttack,aOy,aOz+(__fx.settingsApi.getBoolean("showPlayerDensity")?2:1)*aP1);ih.fillStyle=fxOldFill;}'
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
