import { definePatch } from "../modUtils.js";

export default definePatch((modUtils) => {
  const { replaceOne } = modUtils;
  // Install while the native territory-map renderer is active. In 2.17.9,
  // bV holds map dimensions/base pixels, ad resolves territory owners/colors,
  // and aT owns camera position and zoom.
  const install = `var fxMinimap=window.__fx.gameMinimapAdapter||(window.__fx.gameMinimapAdapter={});if(!fxMinimap.getSnapshot)fxMinimap.getSnapshot=function(columns,rows){columns=Math.max(24,Math.min(128,Math.floor(Number(columns)||96)));rows=Math.max(24,Math.min(128,Math.floor(Number(rows)||72)));var width=bV.fv,height=bV.fw;if(!width||!height||!a8e?.data)return null;var pixels=new Array(columns*rows),colorCache=Object.create(null),base=a8e.data;for(var py=0;py<rows;py++){var wy=Math.min(height-1,Math.floor((py+.5)*height/rows));for(var px=0;px<columns;px++){var wx=Math.min(width-1,Math.floor((px+.5)*width/columns)),cell=ad.a1P(wx,wy),owner=ad.hG(cell)?ad.fY(cell):-1,color;if(owner>=0&&owner<aE.fd){if(colorCache[owner]===undefined){var rgb=ad?.aMT&&ad?.aMU&&ad?.aMV?[ad.aMT[owner],ad.aMU[owner],ad.aMV[owner]]:null;colorCache[owner]=rgb&&rgb[0]!=null?'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')':'#667789';}color=colorCache[owner];}else{var offset=cell;color=base[offset+3]>0?'#'+((base[offset]<<16)|(base[offset+1]<<8)|base[offset+2]).toString(16).padStart(6,'0'):'#172333';}pixels[py*columns+px]=color;}}return{width:columns,height:rows,worldWidth:width,worldHeight:height,pixels:pixels,updatedAt:Date.now()};};if(!fxMinimap.getViewport)fxMinimap.getViewport=function(){var mapWidth=bV.fv,mapHeight=bV.fw;if(!mapWidth||!mapHeight)return null;var left=Math.max(0,Math.min(mapWidth,bP.hx(0))),top=Math.max(0,Math.min(mapHeight,bP.hz(0))),right=Math.max(left,Math.min(mapWidth,bP.hx(i.j))),bottom=Math.max(top,Math.min(mapHeight,bP.hz(i.k)));return{left:left,top:top,width:right-left,height:bottom-top,mapWidth:mapWidth,mapHeight:mapHeight};};if(!fxMinimap.getOwnerForCell)fxMinimap.getOwnerForCell=function(cell){return ad.hG(cell)?ad.fY(cell):-1;};fxMinimap.getOwnerAtScreen=function(x,y){var mapX=bP.hx(Number(x)),mapY=bP.hz(Number(y));if(!bP.i0(mapX,mapY))return-1;var cell=ad.a1P(Math.floor(mapX),Math.floor(mapY));return ad.hG(cell)?ad.fY(cell):-1;};if(!fxMinimap.focus)fxMinimap.focus=function(xRatio,yRatio){if(!bV.fv||!bV.fw)return false;var x=Math.max(0,Math.min(bV.fv-1,Number(xRatio)*bV.fv)),y=Math.max(0,Math.min(bV.fw-1,Number(yRatio)*bV.fw));aT.oK(x,Math.floor(i.j/2));aT.oL(y,Math.floor(i.k/2));aT.aDZ();bi.dy=true;return true;};fxMinimap.zoom=function(deltaY,xRatio,yRatio){deltaY=Number(deltaY);if(!Number.isFinite(deltaY)||deltaY===0)return false;if(Number.isFinite(Number(xRatio))&&Number.isFinite(Number(yRatio)))fxMinimap.focus(Number(xRatio),Number(yRatio));aT.a5p(Math.floor(i.j/2),Math.floor(i.k/2),deltaY);return true};`;
  const playerColorInstall = `var fxPlayerColors=window.__fx.gameMinimapAdapter||(window.__fx.gameMinimapAdapter={});fxPlayerColors.getPlayerColor=function(player){player=Number(player);if(!Number.isInteger(player)||player<0||player>=aE.fh)return null;var colors=ad?.aMT&&ad?.aMU&&ad?.aMV;if(!colors)return null;var red=ad.aMT[player],green=ad.aMU[player],blue=ad.aMV[player];return Number.isFinite(red)&&Number.isFinite(green)&&Number.isFinite(blue)?'rgb('+red+','+green+','+blue+')':null};`;
  const renderer = /this\.render=function\(\)\{this\.(?:a8i=this\.a8i\|\|this\.oV|a8J=this\.a8J\|\|this\.oZ);/g;
  replaceOne(renderer,
    `${playerColorInstall}${install}this.render=function(){this.a8J=this.a8J||this.oZ;`);
  const matchSetup = /this\.a8U=function\(\)\{/g;
  const winResult = /this\.a3h=function\(\)\{/g;
  const lossResult = /this\.a3l=function\(\)\{/g;
  if (matchSetup.test(modUtils.script) && winResult.test(modUtils.script) && lossResult.test(modUtils.script)) {
    matchSetup.lastIndex = winResult.lastIndex = lossResult.lastIndex = 0;
    replaceOne(matchSetup, '$&window.__fx.nativeGameFinished=false;');
    replaceOne(winResult, '$&window.__fx.nativeGameFinished=true;');
    replaceOne(lossResult, '$&window.__fx.nativeGameFinished=true;');
    console.info("[ZFX Client] Connected match HUD lifecycle to native setup and result paths.");
  } else {
    console.info("[ZFX Client] Native match HUD lifecycle signatures are absent in this game version.");
  }
});
