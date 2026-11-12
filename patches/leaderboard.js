import { definePatch, insert } from "../modUtils.js";

export default definePatch((modUtils) => {
	const { safeDictionary: dict, modifyCode, waitForMinification, matchCode, matchRawCode, replaceOne, replace, replaceRawCode } = modUtils;
	let currentNativeLeaderboardAdapterInstalled = false;

	// 2.17.9 uses vY menu commands and formats the response in aX5. Publish
	// those native rows to the Vue leaderboards/logs views from the formatter,
	// where the category and interactive player cells are already decoded.
	if (/function aX5\(\)\{/.test(modUtils.script)) {
		replaceOne(/function aX5\(\)\{/g,
			'window.__fx.leaderboardsAdapter=window.__fx.leaderboardsAdapter||{};window.__fx.logsAdapter=window.__fx.logsAdapter||{};var fxRequestNativeBoard=function(type,start,end){u.v(8,u.vX,new vY(21,{vo:Number(type)||0,vp:Math.max(0,Math.floor(Number(start)||0)),vq:Math.max(1,Math.floor(Number(end)||10))}));};var fxSearchNativeBoardName=function(type,name,quantity){u.v(8,u.a9Q(10).a5U,new vY(22,{vo:Number(type)||0,aWH:String(name||\"\").slice(0,20),aWI:Math.max(1,Math.floor(Number(quantity)||10))}));};var fxSearchNativeBoardId=function(type,id,quantity){u.v(8,u.a9Q(10).a5U,new vY(28,{vo:Number(type)||0,aWH:String(id||\"\").slice(0,5),aWI:Math.max(1,Math.floor(Number(quantity)||5))}));};var fxCloseNativeBoard=function(count){for(var fxStep=0;fxStep<Math.max(1,Number(count)||1);fxStep++)u.a5O();};for(var fxAdapter of [window.__fx.leaderboardsAdapter,window.__fx.logsAdapter]){fxAdapter.requestCategory=fxRequestNativeBoard;fxAdapter.requestRange=fxRequestNativeBoard;fxAdapter.searchName=fxSearchNativeBoardName;fxAdapter.searchId=fxSearchNativeBoardId;fxAdapter.closeNative=fxCloseNativeBoard;}function aX5(){');
		replaceOne(/aX1=new vG\(aTV\.yi,fj\);\}function aXA\(fg\)/g,
			'var fxAdapter=window.__fx.logsViewActive?window.__fx.logsAdapter:window.__fx.leaderboardsViewActive?window.__fx.leaderboardsAdapter:null;if(fxAdapter?.receiveTable)fxAdapter.receiveTable({category:data.vo,headers:fj.vM,widths:fj.vT,rows:fj.vH.map(function(row){return row.map(function(cell){return{text:String(cell.g8??\"\"),interactive:cell.eh===1,id:cell.pk,secondaryId:cell.vW};});}),nativeOpen:false});aX1=new vG(aTV.yi,fj);}function aXA(fg)');
		currentNativeLeaderboardAdapterInstalled = true;
		console.info("[ZFX Client] Installed native leaderboard and logs adapters for the current game version.");
	}

	// The leaderboard selector is now constructed by dJ/aRE and its protocol
	// methods live on b1.aUA. Install the Vue adapter from the stable overlay
	// manager constructor instead of the removed aTl button array.
	const commandAdapterHook = /function dJ\(\)\{this\.z=new \w+(?:\(\))?;this\.\w+=0;var \w+=new Array\(32\);/g;
	const beforeCommandAdapter = modUtils.script;
	replace(commandAdapterHook, `$&window.__fx.leaderboardsAdapter=window.__fx.leaderboardsAdapter||{};window.__fx.leaderboardsAdapter.requestCategory=function(type,start,end){b1.aVI.aVJ(type,Number(start)||0,end===undefined?10:Number(end)||0)};window.__fx.leaderboardsAdapter.requestRange=function(type,start,end){b1.aVI.aVJ(type,Number(start)||0,Number(end)||0)};window.__fx.leaderboardsAdapter.searchName=function(type,name,quantity){b1.aVI.aVK(type,String(name||"").slice(0,20),Math.max(1,Math.floor(Number(quantity)||10)))};window.__fx.leaderboardsAdapter.searchId=function(type,id,quantity){b1.aVI.aVP(type,String(id||"").slice(0,5),Math.max(1,Math.floor(Number(quantity)||5)))};window.__fx.leaderboardsAdapter.closeNative=function(count){for(var fxStep=0;fxStep<(count||1);fxStep++)u.a4a()};window.__fx.logsAdapter=window.__fx.logsAdapter||{};window.__fx.logsAdapter.requestCategory=window.__fx.leaderboardsAdapter.requestCategory;window.__fx.logsAdapter.requestRange=window.__fx.leaderboardsAdapter.requestRange;window.__fx.logsAdapter.searchName=window.__fx.leaderboardsAdapter.searchName;window.__fx.logsAdapter.searchId=window.__fx.leaderboardsAdapter.searchId;window.__fx.logsAdapter.closeNative=window.__fx.leaderboardsAdapter.closeNative;window.__fx.formatNativeTable=function(ux,data){var heads=[[L(394),L(25)+" ↗",L(395)],[L(394),L(396),L(397),L(398)+" ↗"],[L(394),L(25)+" ↗",L(397)],[L(394),L(25)+" ↗",L(397)],[L(391),L(399),L(400)+" ↗",L(401)+" ↗",L(127)],[L(391),L(399),L(402)+" ↗",L(403)+" ↗",L(404)],[L(391),L(399),L(405)+" ↗",L(406)+" ↗",L(407)],[L(391),L(399),L(402)+" ↗",L(403)+" ↗",L(408)],[L(391),L(399),L(400)+" ↗",L(401)+" ↗",L(127)],[L(394),L(25)+" ↗",L(397)],[L(394),L(25)+" ↗",L(409)],[L(394),L(25)+" ↗",L(397)],[L(391),L(399),L(400)+" ↗",L(401)+" ↗",L(410)],[L(394),L(25)+" ↗",L(397)]][ux]||[],rows=[],scale=[.1,.001,.01,1,100,1,1,.1,100,.01,.01,.01,1,.01][ux]||1,decimals=[1,3,2,0,0,0,0,1,0,2,2,2,0,2][ux]||0;for(var i=0;i<data.length;i++){var r=data[i];if([0,2,3,9,10,11,13].includes(ux))rows.push([r[0],r[1],(scale*r[2]).toFixed(decimals)]);else if(ux===1)rows.push([r[0],r[1],(scale*r[2]).toFixed(decimals),r[3]]);else if(ux===12){var s=r[4]<60?r[4]+(r[4]===1?" Second":" Seconds"):r[4]<3600?Math.floor(r[4]/60)+(Math.floor(r[4]/60)===1?" Minute":" Minutes"):r[4]<172800?Math.floor(r[4]/3600)+(Math.floor(r[4]/3600)===1?" Hour":" Hours"):Math.floor(r[4]/172800)+" Days";rows.push([r[0],s,r[5],r[6],br.eP(r[3],bI.f1.a2h(r[1],5))])}else if(ux>=4&&ux<=8){var v=r[5];v=ux===4||ux===8?(v%64*100/(v>>6)).toFixed(0)+"%":ux===5?(32768<=v?-(v-32768):v):(scale*v).toFixed(decimals);if((ux===4||ux===8)&&v==="100%")v+=" ("+L(ux===4?411:412)+")";rows.push([r[0],r[6]<60?r[6]+(r[6]===1?" Second":" Seconds"):r[6]<3600?Math.floor(r[6]/60)+(Math.floor(r[6]/60)===1?" Minute":" Minutes"):r[6]<172800?Math.floor(r[6]/3600)+(Math.floor(r[6]/3600)===1?" Hour":" Hours"):Math.floor(r[6]/172800)+" Days",r[7],r[8],String(v)])}}return{category:ux,headers:heads,widths:heads.map(function(_,i){return ([ [25,40,35],[15,25,25,35],[25,40,35],[25,40,35],[10,18,30,30,12],[10,18,30,30,12],[10,18,30,30,12],[10,18,30,30,12],[10,18,30,30,12],[25,40,35],[25,40,35],[25,40,35],[10,15,25,25,25],[25,40,35]][ux]||[])[i]||100/Math.max(1,heads.length)}),rows:rows.map(function(row){return row.map(function(value){return{text:String(value??"")}})}),nativeOpen:false}};`);
	modUtils.script = modUtils.script.replace("window.__fx.leaderboardsAdapter.closeNative=function(count){for(var fxStep=0;fxStep<(count||1);fxStep++)u.a4a()};", "$&window.__fx.getNativePlayerTeamId=id=>bj?.aEM?.[id];");
	if (modUtils.script === beforeCommandAdapter && !/function aEp\(data\)/.test(modUtils.script) && !currentNativeLeaderboardAdapterInstalled) console.info("[ZFX Client] Native leaderboard command adapter hook is absent in this game version.");

	// The current native leaderboard is driven through ux(21), with the
	// native search dialogs using ux(22) and ux(28). Install these adapters
	// inside the game's closure so requests continue through its own protocol.
	if (/function aEp\(data\)/.test(modUtils.script) && /function aWS\(a7c\)/.test(modUtils.script)) {
		replaceOne(
			/window\.onload=function\(\)\{by\(\);\};/g,
			'window.onload=function(){by();};window.__fx.leaderboardsAdapter=window.__fx.leaderboardsAdapter||{};window.__fx.leaderboardsAdapter.requestCategory=function(type,start,end){u.v(8,u.uw,new ux(21,{vD:Number(type),vE:Number(start)||0,vF:Number(end)||10}));};window.__fx.leaderboardsAdapter.requestRange=window.__fx.leaderboardsAdapter.requestCategory;window.__fx.leaderboardsAdapter.searchName=function(type,name,quantity){u.v(8,u.uw,new ux(22,{vD:Number(type),aVg:String(name||"").slice(0,20),aVh:Math.max(1,Math.floor(Number(quantity)||10))}));};window.__fx.leaderboardsAdapter.searchId=function(type,id,quantity){u.v(8,u.uw,new ux(28,{vD:Number(type),aVg:String(id||"").slice(0,5),aVh:Math.max(1,Math.floor(Number(quantity)||5))}));};window.__fx.leaderboardsAdapter.closeNative=function(count){for(var fxStep=0;fxStep<(count||1);fxStep++)u.a4q();};window.__fx.logsAdapter=window.__fx.logsAdapter||{};window.__fx.logsAdapter.requestCategory=window.__fx.leaderboardsAdapter.requestCategory;window.__fx.logsAdapter.requestRange=window.__fx.leaderboardsAdapter.requestRange;window.__fx.logsAdapter.searchName=window.__fx.leaderboardsAdapter.searchName;window.__fx.logsAdapter.searchId=window.__fx.leaderboardsAdapter.searchId;window.__fx.logsAdapter.closeNative=window.__fx.leaderboardsAdapter.closeNative;'
		);
		// aWT builds the native header and already-formatted row cells. Forward
		// those exact values to Vue before constructing the hidden native table.
		modUtils.replace(/(function aWT\(\)[\s\S]*?)(function aWY\()/g, (match, tableBuilder, nextFunction) =>
			tableBuilder.replace(
				"aWP=new ud(aSu.y9,ff);",
				'var fxBoardAdapter=window.__fx.logsViewActive?window.__fx.logsAdapter:window.__fx.leaderboardsViewActive?window.__fx.leaderboardsAdapter:null;if(fxBoardAdapter&&fxBoardAdapter.receiveTable)fxBoardAdapter.receiveTable({category:data.vD,headers:ff.uk,widths:ff.ur,rows:ff.ue.map(function(row){return row.map(function(cell){return{text:String(cell.g4==null?"":cell.g4),interactive:cell.ed===1,id:cell.uu,secondaryId:cell.uv};});}),nativeOpen:true});aWP=new ud(aSu.y9,ff);'
			) + nextFunction
		);
	}
	// The current game parses leaderboard/log rows in aXm.aYR(). Forward the
	// decoded response before the native menu visibility check, because the Vue
	// views keep the native table hidden while their request is in flight.
	const parsedTableResponse = /if\(u\.ug===8\)\{u\.a4f\(\)\.aG4\(21,true,\{ux:ux,data:data\}\)\}/g;
	const parsedTableCount = [...modUtils.script.matchAll(parsedTableResponse)].length;
	if (parsedTableCount > 0) {
		modUtils.script = modUtils.script.replace(parsedTableResponse, match => `if(window.__fx?.logsViewActive||window.__fx?.leaderboardsViewActive){var fxAdapter=window.__fx.logsViewActive?window.__fx.logsAdapter:window.__fx.leaderboardsAdapter;fxAdapter?.receiveTable?.(window.__fx.formatNativeTable?.(ux,data))}${match}`);
	} else {
		// Keep compatibility fallbacks for older native response formats.
		const tableBuilder = /aUw=new uG\(aRX\.xc,fc(?:,\{uQ:1\})?\)/g;
		const tableBuilderCount = [...modUtils.script.matchAll(tableBuilder)].length;
		if (tableBuilderCount === 0) {
			const nativeTableResponse = /u\.a4Z\(\)\.aFq\(21,true,\{ut:ut,data:data\}\)/g;
			const nativeTableCount = [...modUtils.script.matchAll(nativeTableResponse)].length;
			if (nativeTableCount === 0 && !/function aEp\(data\)/.test(modUtils.script) && !currentNativeLeaderboardAdapterInstalled) console.warn("[ZFX Client] Native leaderboard response hook was not found.");
			else modUtils.script = modUtils.script.replace(nativeTableResponse, match => `(window.__fx.logsViewActive?window.__fx.logsAdapter:window.__fx.leaderboardsViewActive?window.__fx.leaderboardsAdapter:null)?.receiveTable?.({category:ut,headers:(data[0]||[]).map((_,index)=>"Column "+(index+1)),widths:(data[0]||[]).map(()=>100/Math.max(1,(data[0]||[]).length)),rows:data.map(row=>row.map(value=>({text:String(value??"")})))}),${match}`);
		} else {
			modUtils.script = modUtils.script.replace(tableBuilder, match => `Number.isInteger(data?.uq)&&Array.isArray(fc.uN)&&Array.isArray(fc.uH)&&(window.__fx.logsViewActive?window.__fx.logsAdapter:window.__fx.leaderboardsViewActive?window.__fx.leaderboardsAdapter:null)?.receiveTable?.({category:data.uq,headers:fc.uN,widths:fc.uU,rows:fc.uH.map(row=>row.map(cell=>({text:String(cell?.g1??""),interactive:cell?.ea===1,id:cell?.uX??null,secondaryId:cell?.uY??null})))}),${match}`);
		}
		try { replaceOne(/\}\}aVE=new uJ\(aRp\.xp,fd\)\}function aVN/g,
			`}}(window.__fx.logsViewActive?window.__fx.logsAdapter:window.__fx.leaderboardsViewActive?window.__fx.leaderboardsAdapter:null)?.receiveTable?.({category:data.ut,headers:fd.uQ,widths:fd.uX,rows:fd.uK.map(row=>row.map(cell=>({text:String(cell?.g2??""),interactive:cell?.eb===1,id:cell?.ua??null,secondaryId:cell?.ub??null})))});aVE=new uJ(aRp.xp,fd)}function aVN`); } catch { if (!currentNativeLeaderboardAdapterInstalled) console.info("[ZFX Client] Native formatted leaderboard table hook is absent in this game version."); }
	}

	// Player names are identified by build.js after patch application. Seed the
	// current native field names early so this patch can install its hooks.
	if (!modUtils.dictionary.playerData) modUtils.dictionary.playerData = "ah";
	if (!modUtils.dictionary.rawPlayerNames) modUtils.dictionary.rawPlayerNames = "a4x";
	if (!modUtils.dictionary.playerNames) modUtils.dictionary.playerNames = "a2j";
	if (!modUtils.dictionary.playerTerritories) modUtils.dictionary.playerTerritories = "hU";
	if (!modUtils.dictionary.playerBalances) modUtils.dictionary.playerBalances = "hi";
	if (!modUtils.dictionary.playerBalance) modUtils.dictionary.playerBalance = "hi";
	if (!modUtils.dictionary.playerCommitted) modUtils.dictionary.playerCommitted = "a7o";
	if (!modUtils.dictionary.playerStates) modUtils.dictionary.playerStates = "a7f";
	// The current HUD leaderboard uses aE5/aEV and no longer matches the
	// previous topBarHeight/drawFunction template. Add its tabs to that canvas.
	if (/function aEV\(\)\{/.test(modUtils.script)
		&& /aE5\.height=aBv;/.test(modUtils.script)
		&& /if\(position===0\)\{aEb\(\);\}\}function aEY/.test(modUtils.script)
		&& /function a2e\(fj,fl\)\{return fj>=bf\.gap&&fj<bf\.gap\+aE0&&fl>=bf\.gap&&fl<bf\.gap\+aBv;\}/.test(modUtils.script)
		&& /this\.yI=function\(\)\{yJ\.drawImage\(aE5,bf\.gap,bf\.gap\);\}/.test(modUtils.script)
		&& /this\.hq=function\(fj,fl\)\{if\(a2e\(fj,fl\)\)/.test(modUtils.script)) {
		try {
			const tabOffset = '(__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs")&&aE0>0&&aBv>0&&aE4>0?Math.max(1,Math.floor(aBv/aE4*1.3)):0)';
			modUtils.replaceOne(/aE5\.height=aBv;/g, `aE5.height=aBv+${tabOffset};__fx.leaderboardFilter.tabBarOffset=${tabOffset};__fx.leaderboardFilter.windowWidth=aE0;__fx.leaderboardFilter.verticalClickThreshold=aBv;`);
			modUtils.replaceOne(/function aEV\(\)\{/g, 'function aEV(){var fxLb=window.__fx.leaderboardFilter;fxLb.repaintLeaderboard=function(){aEV();bi.du=true;};fxLb.scrollToTop=function(){position=0;};if(fxLb.enabled||fxLb.showingRivals){var fxRows=[];if(fxLb.showingRivals){fxRows=fxLb.rivalsData.map(function(entry,index){return{id:entry.representativeId,position:index,clan:entry.clan,territory:entry.territory};});}else{fxRows=fxLb.playersToInclude.map(function(id){return{id:id,position:kj[id]};}).filter(function(entry){return Number.isInteger(entry.position)&&entry.position>=0;}).sort(function(a,b){return a.position-b.position;});fxLb.filteredLeaderboard=fxRows.map(function(entry){return entry.position;});}aE6.clearRect(0,0,aE0,aE5.height);aE6.fillStyle=aEQ?bE.qQ:bE.qM;aE6.fillRect(0,0,aE0,aEB);aE6.fillStyle=bE.pQ;aE6.fillRect(0,aEB,aE0,aBv-aEB);aE6.fillStyle=bE.pU;aE6.fillRect(0,aEB,aE0,1);aE6.font=aE1;bD.sF.textBaseline(aE6,1);bD.sF.textAlign(aE6,1);aE6.fillText(aET,Math.floor(aE0/2),Math.floor(aE9+aE2/2));var fxOwnRow=fxRows.findIndex(function(entry){return entry.id===aE.fM;});if(fxOwnRow>=position&&fxOwnRow<position+aE4)aEX(fxOwnRow-position,bE.pt);aE6.font=aE3;bD.sF.textAlign(aE6,0);var fxVisible=Math.min(aE4,Math.max(0,fxRows.length-position));for(var fxIndex=0;fxIndex<fxVisible;fxIndex++){var fxEntry=fxRows[fxIndex+position],fxId=fxEntry.id,fxOldName=ah.a2A[fxId],fxOldTerritory=ah.hQ[fxId];if(fxEntry.clan){ah.a2A[fxId]="["+fxEntry.clan+"]";ah.hQ[fxId]=fxEntry.territory;}aEY(fxId);aEZ(fxIndex,fxLb.showingRivals?fxIndex:fxEntry.position,fxId);bD.sF.textAlign(aE6,2);aEa(fxIndex,fxId);bD.sF.textAlign(aE6,0);if(fxEntry.clan){ah.a2A[fxId]=fxOldName;ah.hQ[fxId]=fxOldTerritory;}}if(window.__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs")){aE6.fillStyle=bE.pQ;aE6.fillRect(0,aBv,aE0,fxLb.tabBarOffset);aE6.fillStyle=bE.pU;aE6.fillRect(0,aBv,aE0,1);fxLb.drawTabs(aE6,aE0,aBv,bE.pt);}return;}');
			modUtils.replaceOne(/if\(position===0\)\{aEb\(\);\}\}function aEY/g, `if(position===0&&!window.__fx.leaderboardFilter.enabled&&!window.__fx.leaderboardFilter.showingRivals){aEb();}if(window.__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs")){aE6.fillStyle=bE.pQ;aE6.fillRect(0,aBv,aE0,window.__fx.leaderboardFilter.tabBarOffset);aE6.fillStyle=bE.pU;aE6.fillRect(0,aBv,aE0,1);window.__fx.leaderboardFilter.drawTabs(aE6,aE0,aBv,bE.pt);}}function aEY`);
			modUtils.replaceOne(/function a2e\(fj,fl\)\{return fj>=bf\.gap&&fj<bf\.gap\+aE0&&fl>=bf\.gap&&fl<bf\.gap\+aBv;\}/g,
				`function a2e(fj,fl){return fj>=bf.gap&&fj<bf.gap+aE0&&fl>=bf.gap&&fl<bf.gap+aBv+window.__fx.leaderboardFilter.tabBarOffset;}`);
			modUtils.replaceOne(/this\.hq=function\(fj,fl\)\{if\(a2e\(fj,fl\)\)\{/g, `this.hq=function(fj,fl){if(a2e(fj,fl)){if(window.__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs")&&fl>=bf.gap+aBv&&fl<bf.gap+aBv+window.__fx.leaderboardFilter.tabBarOffset){window.__fx.leaderboardFilter.handleMouseDown(fj-bf.gap);position=0;aEV();bi.du=true;return true;}`);
			modUtils.replaceOne(/this\.yI=function\(\)\{yJ\.drawImage\(aE5,bf\.gap,bf\.gap\);\}/g,
				"this.yI=function(){if(!window.__fx?.gameLeaderboardHudReady&&aE5.width&&aE5.height)yJ.drawImage(aE5,bf.gap,bf.gap);}");
			// Publish native rank order on each game update, independently of rendering.
			modUtils.replaceOne(
				/this\.eh=function\(\)\{aEg\(\);aEh\(\);aEi\(\);aEj\(\);\};/g,
                'this.eh=function(){aEg();aEh();if(window.__fx?.gameLeaderboardAdapter?.receiveNativeSnapshot){var fxNow=Date.now();if(fxNow-(window.__fx.gameLeaderboardLastSent||0)>180){window.__fx.gameLeaderboardLastSent=fxNow;var fxOwn=aE.fM;window.__fx.gameLeaderboardAdapter.getPlayerColor=function(id){return Number.isInteger(id)&&ad?.aLi?.[id]!==undefined&&ad?.aLj?.[id]!==undefined&&ad?.aLk?.[id]!==undefined?"rgb("+ad.aLi[id]+","+ad.aLj[id]+","+ad.aLk[id]+")":null};window.__fx.gameLeaderboardAdapter.focusPlayer=function(playerId){var id=Number(playerId);if(Number.isInteger(id)&&id>=0&&id<aE.fZ&&ah.na[id]!==0){aI.nw(id,800,false,0);bi.du=true;return true}return false};window.__fx.gameLeaderboardAdapter.receiveNativeSnapshot({updatedAt:fxNow,total:aE8,humanCount:aE.ky,botCount:aE.lK,spectatorCount:aE.a3h,ownPlayerId:fxOwn,ownRank:(kj[fxOwn]??-1)+1,players:mZ.slice(0,8).map(function(id,index){return{id:id,rank:index+1,name:ah.a2A[id]||ah.a4O[id]||("Player "+(id+1)),territories:ah.hQ[id]||0,isAlive:ah.na[id]!==0,color:window.__fx.gameLeaderboardAdapter.getPlayerColor(id)};}),ownPlayer:{id:fxOwn,rank:(kj[fxOwn]??-1)+1,name:ah.a2A[fxOwn]||ah.a4O[fxOwn]||("Player "+(fxOwn+1)),territories:ah.hQ[fxOwn]||0,isAlive:ah.na[fxOwn]!==0,color:window.__fx.gameLeaderboardAdapter.getPlayerColor(fxOwn)}})}}aEi();aEj();};'
			);
			// The native canvas is hidden, so let map gestures pass through its old hit area.
			modUtils.replaceOne(/this\.hq=function\(fj,fl\)\{if\(a2e\(fj,fl\)\)\{/g,
				'this.hq=function(fj,fl){if(window.__fx?.gameLeaderboardHudReady)return false;if(a2e(fj,fl)){');
			modUtils.replaceOne(/this\.a5E=function\(fj,fl\)\{var ed;var aEn=aEo\(fl\);/g,
				'this.a5E=function(fj,fl){if(window.__fx?.gameLeaderboardHudReady)return false;var ed;var aEn=aEo(fl);');
			modUtils.replaceOne(/this\.a5d=function\(fj,fl\)\{if\(!aEN\)\{return false;\}/g,
				'this.a5d=function(fj,fl){if(window.__fx?.gameLeaderboardHudReady)return false;if(!aEN){return false;}');
			modUtils.replaceOne(/this\.a5H=function\(fj,fl,deltaY\)\{var aEn;if\(aEN\|\|aE\.o4\)\{return false;\}/g,
				'this.a5H=function(fj,fl,deltaY){if(window.__fx?.gameLeaderboardHudReady)return false;var aEn;if(aEN||aE.o4){return false;}');
			// The team percentage chart is rendered by dR.yI below the native
			// leaderboard. Forward its native totals and colors to the Vue
			// replacement, retaining the native canvas until Vue has data.
			modUtils.replaceOne(/var a6C=null;/g,
				'var a6C=null;window.__fx.getNativePlayerTeamId=id=>Number.isInteger(id)&&id>=0&&bj?.fa?.[id]!==undefined?bj?.lL?.[bj.fa[id]]:null;window.__fx.getNativePlayerTeamColor=id=>Number.isInteger(id)&&id>=0&&bj?.fa?.[id]!==undefined?bj?.aa2?.[bj?.lL?.[bj.fa[id]]]||null:null;function fxPublishTeamChart(force){var fxAdapter=window.__fx?.gameTeamChartAdapter?.receiveNativeSnapshot;if(!aE.iX||!a6C||!fxAdapter)return;var fxNow=Date.now();if(!force&&fxNow-(window.__fx.gameTeamChartLastSent||0)<180)return;window.__fx.gameTeamChartLastSent=fxNow;var fxTeams=[];for(var fxTeam=0;fxTeam<=aE.a0t;fxTeam++)fxTeams.push({id:fxTeam,pixels:Number(a6C[fxTeam])||0,color:String(bj.aa2[bj.lL[fxTeam]]||"#78869a")});fxAdapter({updatedAt:fxNow,teams:fxTeams});}');
			modUtils.replaceOne(/aZp=true;/g, 'aZp=true;fxPublishTeamChart();');
			modUtils.replaceOne(/aZr\(\);\};this\.lV=/g, 'aZr();fxPublishTeamChart(true);};this.lV=');
			modUtils.replaceOne(
				/this\.yI=function\(\)\{if\(aE\.iX\)\{if\(aE\.o4\)\{yJ\.drawImage\(canvas,bf\.gap,bf\.gap\);\}else\{yJ\.drawImage\(canvas,bf\.gap,aBv\+2\*bf\.gap\);\}\}\}/g,
				'this.yI=function(){if(aE.iX&&!window.__fx?.gameTeamChartReady){if(aE.o4){yJ.drawImage(canvas,bf.gap,bf.gap);}else{yJ.drawImage(canvas,bf.gap,aBv+(__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs")?(window.__fx.leaderboardFilter.tabBarOffset||0):0)+2*bf.gap);}}}'
			);
			// Keep the small team icon in the leaderboard aligned with its added tab row.
			modUtils.replaceOne(/Math\.floor\(aE9\+aE2\+0\.4\*aEC\)/g,
				'Math.floor(aE9+aE2+0.4*aEC+(__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs")?__fx.leaderboardFilter.tabBarOffset:0))');
			console.info("[ZFX Client] Current native leaderboard tab canvas hook installed.");
			return;
		} catch (error) {
			console.warn("[ZFX Client] Current native leaderboard tab hook could not be installed:", error);
		}
	}
	// Player list and leaderboard filter tabs
	if (!dict.playerData || !dict.rawPlayerNames || !dict.playerTerritories) {
		console.info("[ZFX Client] Native player-data fields could not be identified; leaderboard filters are unavailable.");
		return;
	}

	if (!modUtils.dictionary.uiSizes || !modUtils.dictionary.gap) {
		console.info("[ZFX Client] Native leaderboard layout hook is absent; data adapters remain enabled.");
		return;
	}
	const uiOffset = dict.uiSizes + "." + dict.gap
    const rawPlayerNames = dict.playerData + "." + dict.rawPlayerNames
    // This game version no longer exposes territories through a stable
    // dictionary field; use the runtime adapter and keep the rivals patch safe.
	const playerTerritories = dict.playerData + "." + dict.playerTerritories

	const { topBarHeight } = matchCode(`aAn = 0.000 * aAd; topBarHeight = Math.floor(0.45 * aAm + aAf);`)
	const buttonBoundsCheck = `__fx.utils.isPointInRectangle(x, y, ${uiOffset} + 12, ${uiOffset} + 12, ${topBarHeight} - 22, ${topBarHeight} - 22)`

	// Handle player list button and leaderboard tabs mouseDown
	// and create a function for scrolling the leaderboard to the top
	modifyCode(`/*insert line:*/__fx.leaderboardFilter.scrollToTop = function(){position = 0;}
			this.mouseDown = function(x, y) {
	if (a4L(x, y)) {
		/*insert line:*/ if (${buttonBoundsCheck}) return (__fx.playerList.display(${rawPlayerNames}), true)
		/*insert line:*/ if (__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs") && y - ${uiOffset} > __fx.leaderboardFilter.verticalClickThreshold)
		/*insert line:*/    return __fx.leaderboardFilter.handleMouseDown(x - ${uiOffset})
		var aZA = aZB(y);
		if (aZA >= 0) {
			aYm = aF.time;
			aYn = true;
			aYo = aYp = aZA;
			if (qr.rA()) {
				aZA = iA(-1, aYp, windowHeight);
				aZA = (aZA === windowHeight) ? -1 : aZA;
				if (aYl !== aZA) {
					aYl = aZA;
					drawFunction();
					aF.requestRepaint = true;
				}
			}
			return true;
		}
		if (aYq) {
			aYq = false;
			drawFunction();
			aF.requestRepaint = true;
		}
		fZ.ff(10, 0, new zU({ zW: 1 }));
		return true;
	}
	return false;
	};`)

	// Handle player list button and leaderboard tabs hover
	// and create a function for repainting the leaderboard
	modifyCode(`/*insert line:*/ var repaintLb = __fx.leaderboardFilter.repaintLeaderboard = function() { drawFunction(), aF.requestRepaint = true; };
	this.mouseMove = function(x, y) {
		${insert(`if (${buttonBoundsCheck}) {
						__fx.playerList.hoveringOverButton === false && (__fx.playerList.hoveringOverButton = true, repaintLb());
				} else {
						__fx.playerList.hoveringOverButton === true && (__fx.playerList.hoveringOverButton = false, repaintLb());
				}
				if (__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs") && __fx.leaderboardFilter.setHovering(
						__fx.utils.isPointInRectangle(
								x, y, ${uiOffset}, ${uiOffset} + __fx.leaderboardFilter.verticalClickThreshold,
								__fx.leaderboardFilter.windowWidth, __fx.leaderboardFilter.tabBarOffset
						), x - ${uiOffset}
				)) return;`)}
		var aJ;
		var aZA = aZB(y);
		var aZC = a4L(x, y);
		var aZD = !!(aZA < 0 && aZC && !qr.rA());
		if (aYn) {
			aJ = position;
			position += aYo - aZA;
			position = iA(0, position, game.gMaxPlayers - windowHeight);
			if (position !== aJ) {
				aYq = aZD;
				aYo = aZA;
				aZA = iA(-1, aZA, windowHeight);
				aZA = (aZA === windowHeight || !aZC) ? -1 : aZA;
				aYl = aZA;
				drawFunction();
				aF.requestRepaint = true;
			} /*...*/
		}
	};`)

	// Display donations for a player when clicking on them in the leaderboard
	// and skip handling clicks when clicking on an empty space (see the isEmptySpace
	// variable in the modified leaderboard click handler from the leaderboard filter)
	{
		try {
		const { game, gIsTeamGame, gIsSingleplayer, rawPlayerNames, playerData } = dict
		const { playerId } = matchCode(
			`this.someMethod = function(player) { return player === game.playerId && playerData.someArr[player] !== 2; };`,
			{ dictionary: { game, playerData }, addToDictionary: ["playerId"] }
		)
		modifyCode(`
			${insert(`if (!isEmptySpace && game.gIsTeamGame && __fx.settingsApi.getBoolean("openDonationHistoryFromLb"))
				__fx.donationsTracker.displayHistory(player, playerData.rawPlayerNames, game.gIsSingleplayer);`)}
			if (playerData.b[player] !== 0 ${insert(`&& !isEmptySpace`)} && !(game.d && !game.e && !game.f ${insert(`&& player !== ${game}.${playerId}`)})) {
				c.animateCamera(player, 800, false, 0);
			}`, { dictionary: { game, gIsTeamGame, gIsSingleplayer, rawPlayerNames }})
		} catch { console.info("[ZFX Client] Native leaderboard click patch is unavailable."); }
	}

    waitForMinification(() => {
        const { cachedDisplayNameProp } = matchCode(
            `PD.cachedDisplayNameProp[i] = someObj1.someObj2.someFn(RPN[i], someFont, someWidth)`,
            { dictionary: { PD: dict.playerData, RPN: rawPlayerNames } }
        )
        const cachedDisplayName = dict.playerData + "." + cachedDisplayNameProp

        // capture the property controlling player state (for fixing underscore on clans in rivals tab)
        const { playerStateProp } = matchCode(
            `someCanvas.fillText(CDN[i], someX, someY), 0 !== PD.playerStateProp[i] && (someCanvas.font = someFont)`,
            { dictionary: { PD: dict.playerData, CDN: cachedDisplayName } }
        )
        const playerState = dict.playerData + "." + playerStateProp

        // Draw player list button
        replaceOne(/(="";function (?<drawFunction>\w+)\(\){[^}]+?(?<canvas>\w+)\.fillRect\(0,(?<topBarHeight>\w+),\w+,1\),(?:\3\.fillRect\([^()]+\),)+\3\.font=\w+,(\w+\.\w+)\.textBaseline\(\3,1\),\5\.textAlign\(\3,1\),\3\.fillText\(\w+,Math\.floor\()(\w+)\/2\),(Math\.floor\(\w+\+\w+\/2\)\));/g,
            "$1($6 + $<topBarHeight> - 22) / 2), $7; __fx.playerList.drawButton($<canvas>, 12, 12, $<topBarHeight> - 22);")

        { // Leaderboard filter
            const { windowHeight } = matchRawCode("var hZ,eh=leaderboardPositionsById[game.playerId]<position+windowHeight-1?1:2;");
            // for the leaderboard draw function:
            replaceRawCode("function drawFunction(){a0A.clearRect(0,0,a04,y9),a0A.fillStyle=aYq?aZ.a4s:aZ.a4o,a0A.fillRect(0,0,a04,a0F),a0A.fillStyle=aZ.kZ,a0A.fillRect(0,a0F,a04,y9-a0F),leaderboardPositionsById[game.playerId]>=position&&a0Z(leaderboardPositionsById[game.playerId]-position,aZ.kw),0!==leaderboardPositionsById[game.playerId]&&0===position&&a0Z(0,aZ.lJ),-1!==a0P&&a0Z(a0P,aZ.kd),a0A.fillStyle=aZ.gF,a0A.fillRect(0,a0F,a04,1),a0A.fillRect(0,0,a04,b0.ur),a0A.fillRect(0,0,b0.ur,y9),a0A.fillRect(a04-b0.ur,0,b0.ur,y9),a0A.fillRect(0,y9-b0.ur,a04,b0.ur),",

                `var leaderboardHasChanged = true;
		this.playerPos = game.playerId;
		__fx.leaderboardFilter.setUpdateFlag = () => leaderboardHasChanged = true;
		function updateFilteredLb() {
			if (!leaderboardHasChanged) return;
			__fx.leaderboardFilter.filteredLeaderboard = __fx.leaderboardFilter.playersToInclude
				.map(id => leaderboardPositionsById[id]).sort((a, b) => a - b);
			leaderboardHasChanged = false;
			this.playerPos = __fx.leaderboardFilter.filteredLeaderboard.indexOf(leaderboardPositionsById[game.playerId]);
		}
		function drawFunction() {
		a0A.clearRect(0, 0, a04, y9),
		a0A.fillStyle = aYq ? aZ.a4s : aZ.a4o,
		a0A.fillRect(0, 0, a04, a0F),
		a0A.fillStyle = aZ.kZ,
		a0A.fillRect(0, a0F, a04, y9 - a0F);
		if (__fx.leaderboardFilter.enabled) updateFilteredLb();
		if (__fx.leaderboardFilter.showingRivals && leaderboardHasChanged) {
			__fx.leaderboardFilter.computeRivals();
			leaderboardHasChanged = false;
		}
		if (__fx.leaderboardFilter.showingRivals) {
			let rivalsCount = __fx.leaderboardFilter.rivalsData.length;
			if (position !== 0 && position >= rivalsCount - windowHeight)
				position = (rivalsCount > windowHeight ? rivalsCount : windowHeight) - windowHeight;
		}
		var playerPos = (__fx.leaderboardFilter.enabled
			? this.playerPos
			: leaderboardPositionsById[game.playerId]
		);
		if (__fx.leaderboardFilter.hoveringOverTabs) a0P = -1;
		if (__fx.leaderboardFilter.enabled && a0P >= __fx.leaderboardFilter.filteredLeaderboard.length) a0P = -1;
		if (__fx.leaderboardFilter.showingRivals && a0P + position >= __fx.leaderboardFilter.rivalsData.length) a0P = -1;
		(__fx.leaderboardFilter.showingRivals
			? (function() {
				var ownClanIndex = __fx.leaderboardFilter.getOwnClanIndex();
				if (ownClanIndex >= position && ownClanIndex < position + windowHeight) a0Z(ownClanIndex - position, aZ.kw);
			})()
			: (playerPos >= position && a0Z(playerPos - position, aZ.kw),
				0 !== leaderboardPositionsById[game.playerId] && 0 === position && a0Z(0, aZ.lJ))
		),
		-1 !== a0P && a0Z(a0P, aZ.kd),
		a0A.fillStyle = aZ.kZ;
		if (__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs")) {
			a0A.clearRect(0, y9 - __fx.leaderboardFilter.tabBarOffset, a04, __fx.leaderboardFilter.tabBarOffset);
			a0A.fillRect(0, y9 - __fx.leaderboardFilter.tabBarOffset, a04, __fx.leaderboardFilter.tabBarOffset);
			a0A.fillStyle = aZ.gF;
			a0A.fillRect(0, a0F, a04, 1);
			a0A.fillRect(0, y9 - __fx.leaderboardFilter.tabBarOffset, a04, 1);
			__fx.leaderboardFilter.drawTabs(a0A, a04, y9 - __fx.leaderboardFilter.tabBarOffset, aZ.kw);
		}
		a0A.fillStyle = aZ.gF,
		a0A.fillRect(0, 0, a04, b0.ur),
		a0A.fillRect(0, 0, b0.ur, y9),
		a0A.fillRect(a04 - b0.ur, 0, b0.ur, y9),
		a0A.fillRect(0, y9 - b0.ur, a04, b0.ur),`, { windowHeight })
            replaceRawCode("var hZ,eh=leaderboardPositionsById[game.playerId]<position+windowHeight-1?1:2;for(a0A.font=a07,aY.g0.textAlign(a0A,0),hZ=windowHeight-eh;0<=hZ;hZ--)a0a(leaderboardArray[hZ+position]),a0b(hZ,hZ+position,leaderboardArray[hZ+position]);for(aY.g0.textAlign(a0A,2),hZ=windowHeight-eh;0<=hZ;hZ--)a0a(leaderboardArray[hZ+position]),a0c(hZ,leaderboardArray[hZ+position]);",
                `var hZ, eh = playerPos < position + windowHeight - 1 ? 1 : 2;
		if (__fx.leaderboardFilter.showingRivals) eh = 1;

		if (__fx.leaderboardFilter.showingRivals) {
			var rivalsRestore = [];
			try {
				for (var rivalsRow = 0; rivalsRow < windowHeight; rivalsRow++) {
					var rivalsEntry = __fx.leaderboardFilter.rivalsData[rivalsRow + position];
					if (rivalsEntry === undefined) break;
					var repId = rivalsEntry.representativeId;
					rivalsRestore.push([repId, rivalsTerritories[repId], rivalsNames[repId], rivalsStates[repId]]);
					rivalsTerritories[repId] = rivalsEntry.territory;
					rivalsNames[repId] = "[" + rivalsEntry.clan + "]";
					rivalsStates[repId] = 0;
				}
				for (a0A.font = a07, aY.g0.textAlign(a0A, 0), hZ = windowHeight - eh; 0 <= hZ; hZ--) {
					const rivalsEntryLeft = __fx.leaderboardFilter.rivalsData[hZ + position];
					if (rivalsEntryLeft !== undefined)
						a0a(rivalsEntryLeft.representativeId), a0b(hZ, hZ + position, rivalsEntryLeft.representativeId);
				}
				for (aY.g0.textAlign(a0A, 2), hZ = windowHeight - eh; 0 <= hZ; hZ--) {
					const rivalsEntryRight = __fx.leaderboardFilter.rivalsData[hZ + position];
					if (rivalsEntryRight !== undefined)
						a0a(rivalsEntryRight.representativeId), a0c(hZ, rivalsEntryRight.representativeId);
				}
			} finally {
				rivalsRestore.forEach(function(entry) {
					rivalsTerritories[entry[0]] = entry[1];
					rivalsNames[entry[0]] = entry[2];
					rivalsStates[entry[0]] = entry[3];
				});
			}
		} else if (__fx.leaderboardFilter.enabled) {
			let result = __fx.leaderboardFilter.filteredLeaderboard;
			if (position !== 0 && position >= result.length - windowHeight)
				position = (result.length > windowHeight ? result.length : windowHeight) - windowHeight;
			//if (position >= result.length) position = result.length - 1;
			for (a0A.font = a07, aY.g0.textAlign(a0A, 0), hZ = windowHeight - eh; 0 <= hZ; hZ--) {
				const pos = result[hZ + position];
				if (pos !== undefined)
					a0a(leaderboardArray[pos]), a0b(hZ, pos, leaderboardArray[pos]);
			}
			for (aY.g0.textAlign(a0A, 2), hZ = windowHeight - eh; 0 <= hZ; hZ--) {
				const pos = result[hZ + position];
				if (pos !== undefined)
					a0a(leaderboardArray[pos]), a0c(hZ, leaderboardArray[pos]);
			}
		} else {
			for (a0A.font = a07, aY.g0.textAlign(a0A, 0), hZ = windowHeight - eh; 0 <= hZ; hZ--)
				a0a(leaderboardArray[hZ + position]), a0b(hZ, hZ + position, leaderboardArray[hZ + position]);
			for (aY.g0.textAlign(a0A, 2), hZ = windowHeight - eh; 0 <= hZ; hZ--)
				a0a(leaderboardArray[hZ + position]), a0c(hZ, leaderboardArray[hZ + position]);
		}`,
                { rivalsTerritories: playerTerritories, rivalsNames: cachedDisplayName, rivalsStates: playerState })
            // in the leaderboard resize handler: make space for the tab buttons at the bottom of the leaderboard
            replaceRawCode(",a09.height=y9,a09_ctx=a09.getContext(\"2d\",{alpha:!0}),a0D=.025*a04,a06=.16*a04,a0E=0*a04,a0F=Math.floor(.45*a0D+a06),a0G=(y9-a06-2*a0D-a0E)/a08,a05=aY.g0.g1(1,Math.floor(.55*a06)),",
                `,a09.height=y9,a09_ctx=a09.getContext("2d",{alpha:!0}),a0D=.025*a04,a06=.16*a04,a0E=0*a04,a0F=Math.floor(.45*a0D+a06),a0G=(y9-a06-2*a0D-a0E)/a08,
		a09.height = y9 += (__fx.settingsApi.getBoolean("zfx.leaderboard.showTabs") ? a0G : 0), __fx.leaderboardFilter.tabBarOffset = __fx.settingsApi.getBoolean("zfx.leaderboard.showTabs") ? Math.floor(a0G * 1.3) : 0, __fx.leaderboardFilter.verticalClickThreshold = y9 - __fx.leaderboardFilter.tabBarOffset, __fx.leaderboardFilter.windowWidth = a04,
		a05=aY.g0.g1(1,Math.floor(.55*a06)),`)
            // Set the leaderboardHasChanged flag on leaderboard updates
            replaceRawCode("for(var eM=a0q-1;0<=eM;eM--)a14[eM]=jR[eM],a15[eM]=a8.f8[jR[eM]];a14[a0q]=a0l[b.ed],a15[a0q]=a8.f8[b.ed]",
                `for(var eM=a0q-1;0<=eM;eM--)a14[eM]=jR[eM],a15[eM]=a8.f8[jR[eM]];a14[a0q]=a0l[b.ed],a15[a0q]=a8.f8[b.ed]; leaderboardHasChanged = true;`);
            // handle clicking on a player in the leaderboard
            replaceRawCode("var a0p=a0q(fJ);return ag.tQ()&&-1!==a0P&&(a0P=-1,a0Y(),b3.d1=!0),b3.dY-a0Q<350&&a0T===a0p&&-1!==(a0p=(a0p=yr(-1,a0p,windowHeight))!==windowHeight&&vU(x,y)?a0p:-1)&&(x=leaderboardArray[a0p+position],a0p===windowHeight-1&&leaderboardPositionsById[game.playerId]>=position+windowHeight-1&&(x=game.playerId),",
                `var a0p = a0q(fJ);
		var isEmptySpace = false;
		return ag.tQ() && -1 !== a0P && (a0P = -1, a0Y(), b3.d1 = !0), b3.dY - a0Q < 350 && a0T === a0p && -1 !== (a0p = (a0p = yr(-1, a0p, windowHeight)) !== windowHeight && vU(x, y) ? a0p : -1) && (x = (__fx.leaderboardFilter.showingRivals
			? (isEmptySpace = __fx.leaderboardFilter.rivalsData[a0p + position] === undefined, __fx.leaderboardFilter.rivalsData[a0p + position]?.representativeId ?? game.playerId)
			: __fx.leaderboardFilter.enabled ? (updateFilteredLb(), leaderboardArray[__fx.leaderboardFilter.filteredLeaderboard[a0p + position] ?? (isEmptySpace = true, leaderboardPositionsById[game.playerId])]) : leaderboardArray[a0p + position]),
			a0p === windowHeight - 1 && !__fx.leaderboardFilter.showingRivals && (__fx.leaderboardFilter.enabled ? this.playerPos : leaderboardPositionsById[game.playerId]) >=
			position + windowHeight - 1 && (x = game.playerId),`);
			// no pinning player on leaderboard in rivals tab
            replaceRawCode(
                `2==gi&&(aBj(aE.et),bD.r2.textAlign(aBH,0),aBk(aBF-1,kF[aE.et],aE.et),bD.r2.textAlign(aBH,2),aBl(aBF-1,aE.et)),`,
                `!__fx.leaderboardFilter.showingRivals&&2==gi&&(aBj(aE.et),bD.r2.textAlign(aBH,0),aBk(aBF-1,kF[aE.et],aE.et),bD.r2.textAlign(aBH,2),aBl(aBF-1,aE.et)),`
            );
        }
    })
})
