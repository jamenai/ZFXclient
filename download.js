import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const GAME_URL = 'https://territorial.io';

function fetchPage(url, redirects = 0) {
	return new Promise((resolve, reject) => {
		const request = https.get(url, { headers: { 'user-agent': 'ZFX Client build' } }, response => {
			if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
				response.resume();
				if (redirects >= 5) return reject(new Error('Too many redirects downloading the game.'));
				return resolve(fetchPage(new URL(response.headers.location, url).href, redirects + 1));
			}
			if (response.statusCode !== 200) {
				response.resume();
				return reject(new Error(`Game download failed with HTTP ${response.statusCode}.`));
			}
			let html = '';
			response.setEncoding('utf8');
			response.on('data', chunk => { html += chunk; });
			response.on('end', () => resolve(html));
			response.on('error', reject);
		});
		request.setTimeout(30000, () => request.destroy(new Error('Game download timed out.')));
		request.on('error', reject);
	});
}

export default async function downloadGame() {
	const html = await fetchPage(GAME_URL);
	const script = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i)?.[1];
	if (!script) throw new Error('Could not find the native game script in the downloaded page.');
	const gameDirectory = path.resolve('game');
	fs.mkdirSync(gameDirectory, { recursive: true });
	fs.writeFileSync(path.join(gameDirectory, 'latest.html'), html);
	fs.writeFileSync(path.join(gameDirectory, 'latest.js'), script.replace(/\r?\n|\r/g, ''));
	console.log('Downloaded native game to game/latest.js');
}
