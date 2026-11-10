// @ts-check
import beautifier from 'js-beautify';
const { js: beautify } = beautifier;
import { minify } from 'terser';
import fs from 'fs';
import webpack from 'webpack';
import path from 'path';
import { fileURLToPath } from 'url';
import ModUtils from './modUtils.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const buildPath = path.join(projectRoot, 'build');
const stagingPath = path.join(projectRoot, `.build-staging-${process.pid}`);
const backupPath = path.join(projectRoot, `.build-backup-${process.pid}`);
const artefactsPath = path.join(stagingPath, 'build_artefacts.js');

{ // color debug output in gray
  const old_debug = console.debug
  console.debug = (...args) => old_debug("\x1b[90m", ...args, "\x1b[0m")
}

function prepareStagingDirectory() {
	fs.rmSync(stagingPath, { recursive: true, force: true });
	if (!fs.existsSync(buildPath) && fs.existsSync(backupPath)) fs.renameSync(backupPath, buildPath);
	else fs.rmSync(backupPath, { recursive: true, force: true });
	fs.mkdirSync(stagingPath, { recursive: true });
	fs.cpSync(path.join(projectRoot, 'static'), stagingPath, { recursive: true });
	fs.cpSync(path.join(projectRoot, 'assets'), path.join(stagingPath, 'assets'), { recursive: true });
	const buildTimestamp = Date.now().toString();
	const indexPath = path.join(stagingPath, 'index.html');
	const serviceWorkerPath = path.join(stagingPath, 'sw2.js');
	fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace(/buildTimestamp/g, buildTimestamp));
	fs.writeFileSync(serviceWorkerPath, fs.readFileSync(serviceWorkerPath, 'utf8').replace('buildTimestamp', buildTimestamp));
	return buildTimestamp;
}

function publishStagingDirectory() {
	let movedExistingBuild = false;
	try {
		if (fs.existsSync(buildPath)) {
			fs.renameSync(buildPath, backupPath);
			movedExistingBuild = true;
		}
		fs.renameSync(stagingPath, buildPath);
	} catch (error) {
		if (movedExistingBuild && !fs.existsSync(buildPath) && fs.existsSync(backupPath))
			fs.renameSync(backupPath, buildPath);
		throw error;
	}
	if (movedExistingBuild) fs.rmSync(backupPath, { recursive: true, force: true });
}

const buildClientCode = () => /** @type {Promise<void>} */(new Promise((resolve, reject) => {
	console.log("Building client code...");
	webpack({
		mode: 'production',
		entry: { fxClient: "./src/modules/main.js" },
		output: {
			path: stagingPath,
			filename: 'fx.bundle.js',
		},
	}, (err, stats) => {
		if (err) {
			if (err.details) console.error(err.details);
			return reject(err);
		}
		const info = stats?.toJson();
		if (stats?.hasWarnings()) console.warn(info?.warnings);
		if (stats?.hasErrors()) {
			console.error(info?.errors);
			return reject("Webpack compilation error");
		}
		fs.writeFileSync(
			path.join(stagingPath, 'fx.bundle.js'),
			Buffer.concat([fs.readFileSync(artefactsPath), fs.readFileSync(path.join(stagingPath, 'fx.bundle.js'))])
		);
		resolve();
	});
}));

async function patchGameCode(buildTimestamp) {

	let script = fs.readFileSync('./game/latest.js', { encoding: 'utf8' }).trim();
	console.debug("Script start: ", script.slice(0, 250))
	console.debug("Script end: ", script.slice(-250))

	const exposeVarsToGlobalScope = true;
	// need to first remove the iife wrapper so the top-level functions aren't inlined
	if (exposeVarsToGlobalScope && script.startsWith("\"use strict\";    (function () {") && script.endsWith("})();"))
		script = script.slice("\"use strict\";    (function () {".length, -"})();".length);
	if (exposeVarsToGlobalScope && script.startsWith("(function () {") && script.endsWith("})();"))
		script = script.slice("(function () {".length, -"})();".length);

	// uncompress strings
	// this will break if the sequence `"];` appears in one of the strings
	const stringArrayRaw = script.match(/var S=(\[.+?"\]);/)?.[1];
	if (stringArrayRaw === undefined) throw new Error("cannot find the string array");
	const stringArray = JSON.parse(stringArrayRaw);
	script = script.replace(/\bS\[(\d+)\]/g, (_match, index) => `"${stringArray[index]}"`);
	const nativeLogoRenderers = [
		/(function aJ6\(eI,aJ5\)\{[\s\S]*?canvas\[eI\]=bD\.or\.a63\(canvas\[eI\],a64,a65\);)/,
		/(function aKG\(eI,aKF\)\{[\s\S]*?canvas\[eI\]=bD\.or\.a6v\(canvas\[eI\],a6w,a6x\);)/,
	];
	const nativeLogoRenderer = nativeLogoRenderers.find(renderer => renderer.test(script));
	if (nativeLogoRenderer) {
		script = script.replace(nativeLogoRenderer, "$&if(eI===6||eI===22){var blank=document.createElement('canvas');blank.width=canvas[eI].width;blank.height=canvas[eI].height;canvas[eI]=blank;}");
	} else {
		console.warn("Native logo renderer changed; skipping logo canvas suppression.");
	}

	// Keep the complete native game script available to patch matchers. The
	// minifyCode helper intentionally truncates snippets at its /*...*/ marker,
	// which is useful for patch templates but drops most of the game when used
	// on the downloaded source itself.
	const modUtils = new ModUtils(script);

	/** @type {{ code: string, addToDictionary: string[] }[]} */
	const codeSegments = [{
		code: `if (game.gIsReplay) { game.playerId = player; }`,
		addToDictionary: ["gIsReplay"]
	}, {
		code: `this.a = Math.floor(0.066 * b.c);
			d = b.d - 4 * uiSizes.gap - this.a;`,
		addToDictionary: ["uiSizes", "gap"]
	}, {
		code: `var dt=MenuManager.getState();if(dt===6){if(d===4211){/*...*/}}`,
		addToDictionary: ["MenuManager", "getState"]
	}, {
		code: `if (game.a && sidebar.getTime() < 350) {/*...*/}`,
		addToDictionary: ["game", "sidebar", "getTime"]
	}, {
		code: `this.gIsTeamGame = this.gGameType < 7 || this.gGameType === 9;`,
		addToDictionary: ["gIsTeamGame", "gGameType"]
	}, {
		code: `strs[0]=__L();strs[1]=game.gIsSingleplayer?__L():__L();`,
		addToDictionary: ["strs", "gIsSingleplayer"]
	}];
	codeSegments.forEach(({ code, addToDictionary }) => {
		try { modUtils.matchCode(code, { addToDictionary }); }
		catch (error) { console.info(`[ZFX Client] Optional native dictionary signature changed: ${error.message}`); }
	});

	// Current native game 2.17.4 data layout shared by patches and adapters.
	Object.assign(modUtils.dictionary, {
		game: "aE", playerId: "fM", playerData: "ah", rawPlayerNames: "a4O", playerNames: "a2A",
		playerTerritories: "hQ", playerBalances: "he", playerBalance: "he", playerCommitted: "a7G",
		playerStates: "a77", gHumans: "ky", gBots: "lK", gMaxPlayers: "fZ", gameState: "a3c",
		gIsSingleplayer: "lI", gIsReplay: "i1", gIsTeamGame: "gIsTeamGame", gGameType: "gGameType",
		gLobbyMaxJoin: "gLobbyMaxJoin", gSelectableSpawn: "i1",
	});

	const { default: applyPatches } = await import('./patches/main.js');
	console.log("Applying patches...");
	applyPatches(modUtils);

	// for versions ^1.99.5.2
	const minificationResult = await minify(modUtils.script, {
		"compress": { "arrows": false },
		"mangle": false
	});
	if (minificationResult.error) {
		console.log("error while passing through Terser, replaceCode replacements might have caused errors");
		throw minificationResult.error;
	}
	if (minificationResult.warnings) console.log(minificationResult.warnings);
	modUtils.script = minificationResult.code;

	const {
		matchDictionaryExpression,
		generateRegularExpression
	} = modUtils;
	const dictionary = modUtils.dictionary;

	try { matchDictionaryExpression(/\w+\.font=(?<fontGeneratorFunction>\w+\.\w+\.\w+)\(1,\.39\*this\.\w+\),/g); } catch {}

	modUtils.executePostMinifyHandlers({ continueOnError: true });
	script = modUtils.script;

	// the dictionary should maybe get embedded into one of the files in the bundle
	fs.writeFileSync(
		artefactsPath,
		`const buildTimestamp = "${buildTimestamp}"; const dictionary = ${JSON.stringify(dictionary)};\n`
	);

	console.log("Formatting code...");

	script = beautify(script, {
		"indent_size": 1,
		"indent_char": "\t",
		"max_preserve_newlines": 5,
		"preserve_newlines": true,
		"keep_array_indentation": false,
		"break_chained_methods": false,
		"indent_scripts": "normal",
		"brace_style": "collapse",
		//"brace_style": "expand",
		"space_before_conditional": true,
		"unescape_strings": false,
		"jslint_happy": false,
		"end_with_newline": false,
		"wrap_line_length": 250,
		"indent_inner_html": false,
		"comma_first": false,
		"e4x": false,
		"indent_empty_lines": false
	});

	fs.writeFileSync(path.join(stagingPath, 'game.js'), script);
	console.log("Wrote staged game.js");
}

try {
	const buildTimestamp = prepareStagingDirectory();
	if (process.argv.includes('--skip-patching')) {
		const existingArtefacts = path.join(buildPath, 'build_artefacts.js');
		const existingGameScript = path.join(buildPath, 'game.js');
		if (!fs.existsSync(existingArtefacts))
			throw new Error('Cannot build client only: no previous build_artefacts.js found. Run the full build first.');
		if (!fs.existsSync(existingGameScript))
			throw new Error('Cannot build client only: no previous patched game.js found. Run the full build first.');
		fs.copyFileSync(existingArtefacts, artefactsPath);
		fs.copyFileSync(existingGameScript, path.join(stagingPath, 'game.js'));
	}
	if (!process.argv.includes('--skip-patching')) await patchGameCode(buildTimestamp);
	if (!process.argv.includes('--patch-only')) await buildClientCode();
	publishStagingDirectory();
	console.log("Build done");
} catch (error) {
	fs.rmSync(stagingPath, { recursive: true, force: true });
	throw error;
}
