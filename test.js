// End-to-end checks against a local Worker (cd worker && npm run dev:test), plus the userscript in headless Chrome
// on a page served at the game's address.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('C:/Users/Sam_0/Documents/Project/bc-plushies/node_modules/puppeteer-core');

const BASE = 'http://localhost:8788';
const KEY = 'test-upload-key-0123456789';
const GAME = 'https://www.bondageprojects.elementfx.com';
const MB = 1024 * 1024;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'song-upload-'));

let failed = 0;
/**
 * @param {string} name
 * @param {unknown} ok
 * @param {unknown} [got]
 */
function check(name, ok, got) {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || got === undefined ? '' : ` (got ${JSON.stringify(got)})`}`);
	if (!ok) {
		failed++;
	}
}

/**
 * `size` bytes of silent MPEG-1 Layer III frames (128 kbit/s, 44.1 kHz), a real playable mp3.
 * @param {number} size
 */
function mp3(size) {
	const frame = Buffer.alloc(417);
	frame.set([0xff, 0xfb, 0x90, 0x00]);
	const out = Buffer.alloc(size);
	for (let i = 0; i < size; i += frame.length) {
		frame.copy(out, i);
	}
	return out;
}

/**
 * A call to the Worker.
 * @param {string} method
 * @param {string} url path on BASE
 * @param {{ key?: string, origin?: string, body?: unknown, headers?: Record<string, string> }} [o]
 */
function call(method, url, o = {}) {
	/** @type {Record<string, string>} */
	const headers = { Origin: o.origin ?? GAME, ...o.headers };
	if (o.key !== undefined) {
		headers.Authorization = `Bearer ${o.key}`;
	}
	const body = o.body === undefined || Buffer.isBuffer(o.body) ? o.body : JSON.stringify(o.body);
	return fetch(BASE + url, { method, headers, body: /** @type {BodyInit | undefined} */ (body) });
}

/**
 * Uploads `data` the way the userscript does; answers the last response and the song link if it worked.
 * @param {string} name
 * @param {Buffer} data
 */
async function upload(name, data) {
	const res = await call('POST', '/upload', { key: KEY, body: { name, size: data.length } });
	if (!res.ok) {
		return { res, url: '' };
	}
	const { key, uploadId, partSize } = await res.json();
	const parts = [];
	for (let n = 1, from = 0; from < data.length; n++, from += partSize) {
		const put = await call('PUT', `/upload/${key}/${n}?uploadId=${encodeURIComponent(uploadId)}`, {
			key: KEY,
			body: data.subarray(from, from + partSize),
		});
		if (!put.ok) {
			return { res: put, url: '' };
		}
		parts.push({ partNumber: n, etag: (await put.json()).etag });
	}
	const done = await call('POST', `/upload/${key}/done?uploadId=${encodeURIComponent(uploadId)}`, { key: KEY, body: { parts } });
	return { res: done, url: done.ok ? (await done.json()).url : '' };
}

/**
 * Starts an upload of `size` bytes; answers the response and its ids.
 * @param {number} size
 */
async function begin(size) {
	const res = await call('POST', '/upload', { key: KEY, body: { name: 'song.mp3', size } });
	return { res, ...(res.ok ? await res.json() : {}) };
}

async function workerChecks() {
	const pre = await call('OPTIONS', '/upload', {
		headers: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' },
	});
	check(
		'preflight from the game: 204, its origin allowed, PUT and Authorization allowed',
		pre.status === 204 &&
			pre.headers.get('access-control-allow-origin') === GAME &&
			/PUT/.test(pre.headers.get('access-control-allow-methods') || '') &&
			/Authorization/i.test(pre.headers.get('access-control-allow-headers') || ''),
		[pre.status, [...pre.headers]],
	);
	const eu = await call('OPTIONS', '/upload/x', { origin: 'https://www.bondage-europe.com' });
	check(
		'preflight from the European mirror works',
		eu.status === 204 && eu.headers.get('access-control-allow-origin') === 'https://www.bondage-europe.com',
	);
	const evil = await call('OPTIONS', '/upload', { origin: 'https://evil.example' });
	check(
		'preflight from another site: 403, no allow-origin',
		evil.status === 403 && !evil.headers.get('access-control-allow-origin'),
		evil.status,
	);

	const none = await call('POST', '/upload', { body: { name: 'a.mp3', size: 10 } });
	check('no key: 401, readable by the game', none.status === 401 && none.headers.get('access-control-allow-origin') === GAME, none.status);
	const wrong = await call('POST', '/upload', { key: 'nope', body: { name: 'a.mp3', size: 10 } });
	check('wrong key: 401', wrong.status === 401 && /key/.test((await wrong.json()).error), wrong.status);
	const okStart = await begin(10);
	const id = `/upload/${okStart.key}`;
	const q = `?uploadId=${encodeURIComponent(okStart.uploadId)}`;
	const wrongPart = await call('PUT', `${id}/1${q}`, { key: 'nope', body: mp3(10) });
	const wrongDone = await call('POST', `${id}/done${q}`, { key: 'nope', body: { parts: [] } });
	const wrongDel = await call('DELETE', `${id}${q}`, { key: '' });
	check(
		'wrong key on part, finish and cancel: 401',
		[wrongPart, wrongDone, wrongDel].every((r) => r.status === 401),
	);
	await call('DELETE', `${id}${q}`, { key: KEY });

	const wav = await call('POST', '/upload', { key: KEY, body: { name: 'song.wav', size: 100 } });
	check('a .wav name: 415 with a message', wav.status === 415 && /mp3/.test((await wav.json()).error), wav.status);
	const big = await call('POST', '/upload', { key: KEY, body: { name: 'song.mp3', size: 500 * MB + 1 } });
	check('over 500 MB declared: 413', big.status === 413, big.status);
	const empty = await call('POST', '/upload', { key: KEY, body: { name: 'song.mp3', size: 0 } });
	check('empty file: 400', empty.status === 400, empty.status);

	const riff = Buffer.alloc(1000);
	riff.write('RIFF');
	const fake = await begin(1000);
	const fq = `/upload/${fake.key}/1?uploadId=${encodeURIComponent(fake.uploadId)}`;
	const fakePut = await call('PUT', fq, { key: KEY, body: riff });
	check('renamed wav (.mp3 name, RIFF bytes): 415', fakePut.status === 415, fakePut.status);
	const after = await call('PUT', fq, { key: KEY, body: mp3(1000) });
	check('...and that upload is cancelled (404 after)', after.status === 404, after.status);

	const over = await begin(1000);
	const overPut = await call('PUT', `/upload/${over.key}/1?uploadId=${encodeURIComponent(over.uploadId)}`, { key: KEY, body: mp3(1500) });
	check('a part bigger than the declared size: refused', overPut.status === 400, overPut.status);
	const extra = await begin(1000);
	const extraPut = await call('PUT', `/upload/${extra.key}/2?uploadId=${encodeURIComponent(extra.uploadId)}`, {
		key: KEY,
		body: mp3(1000),
	});
	check('a part past the declared size: refused', extraPut.status === 400, extraPut.status);

	const data = mp3(130 * MB);
	const t0 = Date.now();
	const song = await upload('big song.mp3', data);
	check(
		`130 MB in 3 parts of 50 MB uploads (${((Date.now() - t0) / 1000).toFixed(1)} s), link ends in .mp3`,
		song.res.ok && song.url.startsWith(`${BASE}/`) && song.url.endsWith('.mp3'),
		song.res.status,
	);
	const songPath = song.url.slice(BASE.length);
	const whole = await fetch(song.url);
	const got = Buffer.from(await whole.arrayBuffer());
	check(
		'GET the whole song: 200, audio/mpeg, same bytes, open to any page',
		whole.status === 200 &&
			whole.headers.get('content-type') === 'audio/mpeg' &&
			whole.headers.get('access-control-allow-origin') === '*' &&
			crypto.createHash('sha256').update(got).digest('hex') === crypto.createHash('sha256').update(data).digest('hex'),
		[whole.status, got.length],
	);
	const part = await fetch(song.url, { headers: { Range: 'bytes=0-99', Origin: GAME } });
	check(
		'GET Range bytes=0-99: 206, Content-Range, 100 bytes, CORS headers',
		part.status === 206 &&
			part.headers.get('content-range') === `bytes 0-99/${data.length}` &&
			(await part.arrayBuffer()).byteLength === 100 &&
			part.headers.get('access-control-allow-origin') === '*' &&
			/Content-Range/.test(part.headers.get('access-control-expose-headers') || '') &&
			part.headers.get('accept-ranges') === 'bytes',
		[part.status, [...part.headers]],
	);
	const tail = await fetch(song.url, { headers: { Range: `bytes=${100 * MB}-` } });
	const tailBytes = Buffer.from(await tail.arrayBuffer());
	check(
		'GET an open-ended Range late in the song (third part): 206 with the right bytes',
		tail.status === 206 && tailBytes.equals(data.subarray(100 * MB)),
		[tail.status, tailBytes.length],
	);
	const head = await fetch(song.url, { method: 'HEAD' });
	check('HEAD: 200 with the length', head.status === 200 && head.headers.get('content-length') === String(data.length), [
		head.status,
		[...head.headers],
	]);
	const songPre = await call('OPTIONS', songPath, {
		headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range' },
	});
	check(
		'song preflight: 204, any origin, Range allowed',
		songPre.status === 204 && songPre.headers.get('access-control-allow-origin') === '*',
	);

	// The local server's cap is 400 MB; the 130 MB song (136.3 MB) is in the bucket.
	const alive = async (/** @type {string} */ url) => (await fetch(url, { method: 'HEAD' })).status === 200;
	const s1 = await upload('one.mp3', mp3(100e6));
	const s2 = await upload('two.mp3', mp3(100e6));
	check(
		'new uploads keep the earlier songs while they fit (336 MB of 400)',
		s1.url && s2.url && (await alive(song.url)) && (await alive(s1.url)),
	);
	const s3 = await upload('three.mp3', mp3(100e6));
	check(
		'cap: a third 100 MB song deletes the oldest song (the 130 MB one) and keeps the rest',
		s3.url && !(await alive(song.url)) && (await alive(s1.url)) && (await alive(s2.url)) && (await alive(s3.url)),
	);
	const s4 = await upload('Café 歌 <b>4</b>\u0007.mp3', mp3(150e6));
	check(
		'cap: a 150 MB song deletes only the next oldest (one.mp3); the newest survive',
		s4.url && !(await alive(s1.url)) && (await alive(s2.url)) && (await alive(s3.url)) && (await alive(s4.url)),
	);

	const listed = await call('GET', '/upload/songs', { key: KEY });
	const list = await listed.json();
	check(
		'list: newest first, names ASCII only (accents off, Chinese and control characters dropped), sizes, 5-day expiry, used and cap',
		listed.status === 200 &&
			listed.headers.get('access-control-allow-origin') === GAME &&
			list.songs.map((x) => x.name).join('|') === 'Cafe <b>4</b>.mp3|three.mp3|two.mp3' &&
			list.songs[0].url === s4.url &&
			list.songs[0].size === 150e6 &&
			list.songs.every((x) => x.expires - x.uploaded === 5 * 86400000 && Math.abs(Date.now() - x.uploaded) < 600000) &&
			list.used === 350e6 &&
			list.cap === 400e6,
		list,
	);
	const listNone = await call('GET', '/upload/songs');
	const listWrong = await call('GET', '/upload/songs', { key: 'nope' });
	check('list with no key or a wrong key: 401', listNone.status === 401 && listWrong.status === 401);
	const s2key = s2.url.split('/').pop();
	const delWrong = await call('DELETE', `/upload/songs/${s2key}`, { key: 'nope' });
	check('delete with a wrong key: 401, the song stays', delWrong.status === 401 && (await alive(s2.url)));
	const del = await call('DELETE', `/upload/songs/${s2key}`, { key: KEY });
	const afterDel = await (await call('GET', '/upload/songs', { key: KEY })).json();
	check(
		'delete with the key: gone from the bucket and the list',
		del.status === 200 && (await fetch(s2.url)).status === 404 && afterDel.songs.length === 2 && afterDel.used === 250e6,
	);
	const pre2 = await call('OPTIONS', '/upload/songs', { headers: { 'Access-Control-Request-Method': 'GET' } });
	check(
		'list preflight allows GET from the game',
		pre2.status === 204 && /GET/.test(pre2.headers.get('access-control-allow-methods') || ''),
	);

	const held = await begin(250e6);
	check(
		'cap: starting a 250 MB upload deletes the oldest song (three.mp3) right away',
		held.res.ok && !(await alive(s3.url)) && (await alive(s4.url)),
	);
	const blocked = await begin(200e6);
	check(
		'cap: when unfinished uploads leave no room, the upload is refused (507) and no song is deleted',
		blocked.res.status === 507 && (await alive(s4.url)),
		blocked.res.status,
	);
	await call('DELETE', `/upload/${held.key}?uploadId=${encodeURIComponent(held.uploadId)}`, { key: KEY });
	await call('DELETE', `/upload/songs/${s4.url.split('/').pop()}`, { key: KEY });

	// Two uploads started at the same moment can both pass the start check; finishing them must still fit the cap.
	const twin = mp3(250e6);
	const pair = await Promise.all([begin(250e6), begin(250e6)]);
	if (pair.every((x) => x.res.ok)) {
		/** @type {string[]} */
		const urls = [];
		for (const x of pair) {
			const q2 = `?uploadId=${encodeURIComponent(x.uploadId)}`;
			const parts = [];
			for (let n = 1, from = 0; from < twin.length; n++, from += x.partSize) {
				const put = await call('PUT', `/upload/${x.key}/${n}${q2}`, { key: KEY, body: twin.subarray(from, from + x.partSize) });
				parts.push({ partNumber: n, etag: (await put.json()).etag });
			}
			urls.push((await (await call('POST', `/upload/${x.key}/done${q2}`, { key: KEY, body: { parts } })).json()).url);
		}
		check('cap: of two overlapping uploads, finishing the second deletes the first', !(await alive(urls[0])) && (await alive(urls[1])));
	} else {
		check(
			'cap: two uploads at once: the second was refused at its start (the overlap did not happen)',
			pair.some((x) => x.res.status === 507),
		);
	}

	const proxies = await Promise.all([
		fetch(`${BASE}/?url=https://example.com/a.mp3`),
		fetch(`${BASE}/https://example.com/a.mp3`),
		fetch(`${BASE}/upload?url=https://example.com/a.mp3`),
		call('POST', '/fetch', { key: KEY, body: { url: 'https://example.com/a.mp3' } }),
		call('POST', '/upload', { key: KEY, body: { name: 'https://example.com/a.mp3', size: 10, url: 'https://example.com/a.mp3' } }),
	]);
	const src = fs.readFileSync(path.join(__dirname, 'worker/src/index.js'), 'utf8');
	check(
		'no open proxy: URL-shaped requests get 404 (an upload names only a size), and the Worker makes no fetch calls',
		proxies.slice(0, 4).every((r) => r.status === 404 || r.status === 401) &&
			proxies[4].ok &&
			(src.match(/\bfetch\s*\(/g) || []).length === 1 &&
			/async fetch\(request, env\)/.test(src),
		proxies.map((r) => r.status),
	);
	const started = await proxies[4].json();
	await call('DELETE', `/upload/${started.key}?uploadId=${encodeURIComponent(started.uploadId)}`, { key: KEY });

	const life = JSON.parse(fs.readFileSync(path.join(__dirname, 'worker/lifecycle.json'), 'utf8')).rules;
	check(
		'lifecycle.json: one rule for the whole bucket, songs deleted after 5 days, unfinished uploads aborted after 1',
		life.length === 1 &&
			life[0].enabled &&
			Object.keys(life[0].conditions).length === 0 &&
			life[0].deleteObjectsTransition.condition.type === 'Age' &&
			life[0].deleteObjectsTransition.condition.maxAge === 5 * 86400 &&
			life[0].abortMultipartUploadsTransition.condition.maxAge === 86400,
	);
}

/**
 * The userscript in headless Chrome on a page at the game's address.
 */
async function browserChecks() {
	const script = fs.readFileSync(path.join(__dirname, 'song-upload.user.js'), 'utf8');
	check(
		'the userscript never touches the game (no game globals, no bcModSdk)',
		!/\b(ServerSend|ServerSocket|ChatRoom\w*|Player|bcModSdk)\b/.test(script),
	);
	const files = {
		wav: path.join(tmp, 'song.wav'),
		renamed: path.join(tmp, 'renamed.mp3'),
		huge: path.join(tmp, 'huge.mp3'),
		song: path.join(tmp, 'my song.mp3'),
		mid: path.join(tmp, 'mid.mp3'),
	};
	const riff = Buffer.alloc(2000);
	riff.write('RIFF');
	fs.writeFileSync(files.wav, riff);
	fs.writeFileSync(files.renamed, riff);
	fs.writeFileSync(files.song, mp3(1000000));
	fs.writeFileSync(files.mid, mp3(60 * MB));
	const fd = fs.openSync(files.huge, 'w');
	fs.ftruncateSync(fd, 500 * MB + 1);
	fs.closeSync(fd);

	const browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: [
			'--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults',
			'--autoplay-policy=no-user-gesture-required',
		],
	});
	try {
		await browser.defaultBrowserContext().overridePermissions(GAME, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
		const page = await browser.newPage();
		await page.setViewport({ width: 1200, height: 800 });
		// Only the game's address is answered locally; uploads to the Worker go out untouched.
		const cdp = await page.createCDPSession();
		await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `${GAME}/*` }] });
		cdp.on('Fetch.requestPaused', ({ requestId }) =>
			cdp.send('Fetch.fulfillRequest', {
				requestId,
				responseCode: 200,
				responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
				body: Buffer.from('<!DOCTYPE html><title>BC</title><body></body>').toString('base64'),
			}),
		);
		/** @type {string[]} */
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		await page.goto(`${GAME}/R133/BondageClub/`);
		await page.addScriptTag({ content: script });

		const host = /** @type {import('puppeteer-core').ElementHandle<HTMLElement>} */ (await page.$('#su-host'));
		/**
		 * Runs `fn` in the page with the userscript's host element.
		 * @param {(h: HTMLElement, arg: any) => any} fn
		 * @param {unknown} [arg]
		 */
		const inPanel = (fn, arg) => host.evaluate(fn, arg);
		const el = async (/** @type {string} */ id) =>
			(await page.evaluateHandle((i) => document.getElementById('su-host').shadowRoot.getElementById(i), id)).asElement();
		const visible = (/** @type {string} */ id) =>
			inPanel(
				(h, i) => !h.shadowRoot.getElementById(i).closest('[hidden]') && h.shadowRoot.getElementById('panel').classList.contains('on'),
				id,
			);
		const text = (/** @type {string} */ id) => inPanel((h, i) => h.shadowRoot.getElementById(i).textContent, id);

		const btn = await el('btn');
		const box = await btn.boundingBox();
		await page.mouse.click(box.x + 20, box.y + 20);
		check('the button opens the panel, on the settings while nothing is set', await visible('setup'));
		const keyType = await inPanel((h) => h.shadowRoot.getElementById('key').type);
		check('the key field is masked', keyType === 'password', keyType);
		await (await el('url')).type(`${BASE}/`);
		await (await el('key')).type('wrong-key');
		await (await el('savebtn')).click();
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('songUpload.options')));
		check(
			'Save keeps the address (without the trailing /) and key in localStorage',
			saved.url === BASE && saved.key === 'wrong-key',
			saved,
		);
		check('...and shows Upload file', (await visible('pick')) && (await text('pick')) === 'Upload file');

		const pick = async (/** @type {string} */ file) => {
			await inPanel((h) => {
				h.shadowRoot.getElementById('err').textContent = '';
			});
			await (await el('file')).uploadFile(file);
			await page.waitForFunction(
				() => {
					const r = document.getElementById('su-host').shadowRoot;
					return r.getElementById('prog').hidden && (r.getElementById('err').textContent || !r.getElementById('done').hidden);
				},
				{ timeout: 120000 },
			);
			return text('err');
		};
		check('a .wav is refused before uploading', /not an mp3/.test(await pick(files.wav)), await text('err'));
		check('a wav renamed to .mp3 is refused by its bytes', /not a real mp3/.test(await pick(files.renamed)), await text('err'));
		check('a file over 500 MB is refused', /at most 500 MB/.test(await pick(files.huge)), await text('err'));
		check('a wrong key is reported', /Wrong or missing upload key/.test(await pick(files.song)), await text('err'));

		await (await el('gear')).click();
		await inPanel((h) => {
			h.shadowRoot.getElementById('key').value = '';
		});
		await (await el('key')).type(KEY);
		await (await el('savebtn')).click();

		/** @type {string[]} */
		const seen = [];
		const watch = setInterval(
			() =>
				text('pct')
					.then((t) => seen.push(t))
					.catch(() => {}),
			30,
		);
		const midErr = await pick(files.mid);
		clearInterval(watch);
		const pcts = [...new Set(seen.filter(Boolean))];
		check('a 60 MB song uploads in 2 parts with progress shown', !midErr && pcts.some((t) => /: [1-9]\d?%$/.test(t)), [
			midErr,
			pcts.slice(0, 6),
		]);

		check('my song.mp3 uploads', !(await pick(files.song)), await text('err'));
		const link = await inPanel((h) => h.shadowRoot.getElementById('link').value);
		check('the link shows and ends in .mp3', link.startsWith(`${BASE}/`) && link.endsWith('.mp3'), link);
		check(
			'the panel says the link lasts 5 days',
			/lasts 5 days/.test(await inPanel((h) => h.shadowRoot.getElementById('done').textContent)),
		);
		await (await el('copy')).click();
		const clip = await page.evaluate(() => navigator.clipboard.readText());
		check('Copy link puts the link on the clipboard', clip === link && (await text('copied')) === 'Copied!', clip);

		const play = await page.evaluate(async (url) => {
			const a = new Audio(url);
			await a.play();
			await new Promise((resolve, reject) => {
				a.ontimeupdate = () => a.currentTime > 0.3 && resolve(null);
				a.onerror = () => reject(new Error(`audio error ${a.error && a.error.code}`));
				setTimeout(() => reject(new Error('no playback')), 10000);
			});
			a.pause();
			return { t: a.currentTime, d: a.duration };
		}, link);
		check('new Audio(link) plays on the game page', play.t > 0.3 && play.d > 20, play);
		const ranged = await page.evaluate(async (url) => {
			const r = await fetch(url, { headers: { Range: 'bytes=0-3' } });
			return { s: r.status, n: (await r.arrayBuffer()).byteLength, cr: r.headers.get('content-range') };
		}, link);
		check('the game page can read a Range of a song (CORS)', ranged.s === 206 && ranged.n === 4 && /^bytes 0-3\//.test(ranged.cr), ranged);

		await page.evaluate(() =>
			[...document.getElementById('su-host').shadowRoot.querySelectorAll('.tab')].find((t) => t.textContent === 'My songs').click(),
		);
		await page.waitForFunction(() => document.getElementById('su-host').shadowRoot.querySelectorAll('.song').length > 0);
		const rows = () =>
			inPanel((h) =>
				[...h.shadowRoot.querySelectorAll('.song')].map((r) => ({
					name: r.querySelector('b').textContent,
					info: r.querySelector('.hint').textContent,
				})),
			);
		const shown = await rows();
		check(
			'My songs: newest first, with name, size, date and time left',
			shown[0].name === 'my song.mp3' && shown[1].name === 'mid.mp3' && /^1\.0 MB · .+ · deletes in 5 days$/.test(shown[0].info),
			shown,
		);
		check('My songs shows the storage used', /^Used [\d.]+ MB of 400\.0 MB$/.test(await text('used')), await text('used'));
		await inPanel((h) => h.shadowRoot.querySelector('.song .go').click());
		check("a row's Copy link copies its link", (await page.evaluate(() => navigator.clipboard.readText())) === link);
		const delBtn = () => inPanel((h) => h.shadowRoot.querySelector('.song .pill').textContent);
		await inPanel((h) => h.shadowRoot.querySelector('.song .pill').click());
		check(
			'Delete asks "Sure?" first and keeps the song',
			(await delBtn()) === 'Sure?' && (await rows()).length === shown.length && (await fetch(link)).status === 200,
		);
		await inPanel((h) => h.shadowRoot.querySelector('.song .pill').click());
		await page.waitForFunction(
			(n) => document.getElementById('su-host').shadowRoot.querySelectorAll('.song').length === n - 1,
			{},
			shown.length,
		);
		check('a second click deletes it', (await rows())[0].name === 'mid.mp3' && (await fetch(link)).status === 404);
		await (await el('refresh')).click();
		await page.waitForFunction(() => /^Used/.test(document.getElementById('su-host').shadowRoot.getElementById('used').textContent));
		check('refresh reloads the list', (await rows()).length === shown.length - 1);
		check('no page errors', errors.length === 0, errors);
	} finally {
		await browser.close();
	}
}

(async () => {
	try {
		await workerChecks();
		await browserChecks();
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
	console.log(failed ? `${failed} FAILED` : 'All checks passed');
	process.exitCode = failed ? 1 : 0;
})();
