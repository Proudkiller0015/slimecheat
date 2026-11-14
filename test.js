// End-to-end checks against a local Worker (cd worker && npm run dev:test), plus the userscript in headless Chrome
// on a page served at the game's address.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('C:/Users/Sam_0/Documents/Project/bc-plushies/node_modules/puppeteer-core');

// SC_BASE moves the worker when another dev server holds 8788.
const BASE = process.env.SC_BASE || 'http://localhost:8788';
const KEY = 'test-upload-key-0123456789';
const GAME = 'https://www.bondageprojects.elementfx.com';
const MB = 1024 * 1024;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'song-upload-'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/** The test picture's colour: a 64x48 image of it is made as jpg, png and webp. */
const RGB = [200, 40, 120];
/** @type {{ jpg: Buffer, png: Buffer, webp: Buffer }} */
let pics;

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

/** A real 30 s m4a (AAC in MP4), made by ffmpeg; set in main. */
let m4aSong = Buffer.alloc(0);
/** Makes m4aSong with ffmpeg (a sine tone). */
function makeM4a() {
	const out = path.join(tmp, 'tone.m4a');
	require('child_process').execFileSync('ffmpeg', [
		'-v',
		'error',
		'-y',
		'-f',
		'lavfi',
		'-i',
		'sine=frequency=440:duration=30',
		'-c:a',
		'aac',
		'-b:a',
		'96k',
		out,
	]);
	m4aSong = fs.readFileSync(out);
}

/**
 * Real 64x48 jpg, png and webp files of one colour, drawn by Chrome.
 */
async function makePictures() {
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
	try {
		const page = await browser.newPage();
		const urls = await page.evaluate((rgb) => {
			const c = document.createElement('canvas');
			c.width = 64;
			c.height = 48;
			const g = c.getContext('2d');
			g.fillStyle = `rgb(${rgb})`;
			g.fillRect(0, 0, 64, 48);
			return ['jpeg', 'png', 'webp'].map((t) => c.toDataURL(`image/${t}`));
		}, RGB);
		const [jpg, png, webp] = urls.map((u) => Buffer.from(u.split(',')[1], 'base64'));
		return { jpg, png, webp };
	} finally {
		await browser.close();
	}
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
 * @param {object} [extra] - More fields for the start of the upload
 */
async function upload(name, data, extra = {}) {
	const res = await call('POST', '/upload', { key: KEY, body: { name, size: data.length, ...extra } });
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
 * Uploads an image in one request, the way the userscript does; answers the response and the link if it worked.
 * @param {string} name
 * @param {Buffer} data
 * @param {string} [key]
 */
async function putImage(name, data, key = KEY) {
	const res = await call('PUT', `/upload/image?name=${encodeURIComponent(name)}`, { key, body: data });
	return { res, url: res.ok ? (await res.json()).url : '' };
}

/**
 * Starts an upload of `size` bytes; answers the response and its ids.
 * @param {number} size
 */
async function begin(size) {
	const res = await call('POST', '/upload', { key: KEY, body: { name: 'song.mp3', size } });
	return { res, ...(res.ok ? await res.json() : {}) };
}

/**
 * SlimeBeep sign-in: a proof signed with the owner's SlimeBeep key, the first one pinning it.
 */
async function proofChecks() {
	const subtle = globalThis.crypto.subtle;
	const b64u = (/** @type {ArrayBuffer} */ b) => Buffer.from(b).toString('base64url');
	const newKey = async () => {
		const k = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
		const jwk = await subtle.exportKey('jwk', k.publicKey);
		return { priv: k.privateKey, pub: { x: String(jwk.x), y: String(jwk.y) } };
	};
	const sign = async (/** @type {CryptoKey} */ priv, /** @type {string} */ text) =>
		b64u(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(text)));
	/**
	 * @param {{ priv: CryptoKey, pub: { x: string, y: string } }} k
	 * @param {{ member?: number, time?: number, audience?: string, rk?: unknown, all?: boolean }} [o]
	 */
	const files = async (k, o = {}) => {
		const member = o.member ?? 255659;
		const time = o.time ?? Date.now();
		const proof = {
			memberNumber: member,
			time,
			pub: k.pub,
			sig: await sign(k.priv, `slimebeep-proof|${o.audience ?? 'slimecheat'}|${member}|${time}`),
			rk: o.rk ?? null,
		};
		return call('GET', o.all ? '/upload/files?all=1' : '/upload/files', {
			headers: { Authorization: `SlimeBeep ${Buffer.from(JSON.stringify(proof)).toString('base64')}` },
		});
	};
	/**
	 * Starts an upload as another player (member 31337, a fresh key).
	 * @param {{ priv: CryptoKey, pub: { x: string, y: string } }} k
	 * @param {string} name
	 * @param {number} size
	 */
	const startAs = async (k, name, size) => {
		const time = Date.now();
		const proof = { memberNumber: 31337, time, pub: k.pub, sig: await sign(k.priv, `slimebeep-proof|slimecheat|31337|${time}`), rk: null };
		return call('POST', '/upload', {
			body: { name, size },
			headers: { Authorization: `SlimeBeep ${Buffer.from(JSON.stringify(proof)).toString('base64')}` },
		});
	};
	const k31337 = await newKey();
	const songLimit = (await startAs(k31337, 'big.mp3', 500 * 1024 * 1024 + 1)).status;
	const imageLimit = (await startAs(k31337, 'big.png', 100 * 1024 * 1024 + 1)).status;
	check('other players keep the limits: a song over 500 MB and an image over 100 MB are 413', songLimit === 413 && imageLimit === 413, [
		songLimit,
		imageLimit,
	]);
	const first = await newKey();
	const ok = await files(first);
	const list = await ok.json();
	check('a SlimeBeep proof from the owner signs in, no key needed', ok.status === 200, ok.status);
	check("the pinned key isn't listed as a file", !JSON.stringify(list).includes('_auth'), list);
	check('the same key signs in again', (await files(first)).status === 200);
	const own = await (await files(first, { all: true })).json();
	check("the owner can list everyone's files", own.admin === true && own.me === 255659, own);
	const player = await newKey();
	const theirs = await files(player, { member: 12345 });
	const theirList = await theirs.json();
	check(
		'another player signs in as themselves, sees only their own files and gets the 1000 MB quota',
		theirs.status === 200 &&
			theirList.admin === false &&
			theirList.me === 12345 &&
			theirList.files.length === 0 &&
			theirList.cap === 1000 * 1024 * 1024,
		theirList,
	);
	const peek = await (await files(player, { member: 12345, all: true })).json();
	check("...and can't ask for everyone's files", peek.admin === false && peek.files.length === 0, peek);
	check("...and someone else can't take their number with another key", (await files(await newKey(), { member: 12345 })).status === 401);
	check('a proof made for another server is refused', (await files(first, { audience: 'other' })).status === 401);
	check('an old proof is refused', (await files(first, { time: Date.now() - 10 * 60 * 1000 })).status === 401);
	const other = await newKey();
	check("another key claiming the owner's number is refused", (await files(other)).status === 401);
	const rk = { x: first.pub.x, y: first.pub.y, sig: await sign(first.priv, `rekey|255659|${other.pub.x}|${other.pub.y}`) };
	check('a new key the pinned one handed over to signs in', (await files(other, { rk })).status === 200);
	check('then the new key alone works', (await files(other)).status === 200);
	check('and the old key no longer does', (await files(first)).status === 401);
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
	const bigStarted = big.ok ? await big.json() : null;
	check(
		'the owner has no 500 MB limit: a 500 MB + 1 song is only held back by the storage cap (507 here, 400 MB test bucket), not 413',
		big.status === 507,
		big.status,
	);
	if (bigStarted) {
		await call('DELETE', `/upload/${bigStarted.key}?uploadId=${encodeURIComponent(bigStarted.uploadId)}`, { key: KEY });
	}
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

	const listed = await call('GET', '/upload/files', { key: KEY });
	const list = await listed.json();
	check(
		'list: newest first, names ASCII only (accents off, Chinese and control characters dropped), sizes, 5-day expiry, used and cap',
		listed.status === 200 &&
			listed.headers.get('access-control-allow-origin') === GAME &&
			list.files.map((x) => x.name).join('|') === 'Cafe <b>4</b>.mp3|three.mp3|two.mp3' &&
			list.files.every((x) => x.kind === 'song') &&
			list.files[0].url === s4.url &&
			list.files[0].size === 150e6 &&
			list.files.every((x) => x.expires - x.uploaded === 5 * 86400000 && Math.abs(Date.now() - x.uploaded) < 600000) &&
			list.used === 350e6 &&
			list.cap === 400e6,
		list,
	);
	const listNone = await call('GET', '/upload/files');
	const listWrong = await call('GET', '/upload/files', { key: 'nope' });
	check('list with no key or a wrong key: 401', listNone.status === 401 && listWrong.status === 401);
	const s2key = s2.url.split('/').pop();
	const delWrong = await call('DELETE', `/upload/files/${s2key}`, { key: 'nope' });
	check('delete with a wrong key: 401, the song stays', delWrong.status === 401 && (await alive(s2.url)));
	const del = await call('DELETE', `/upload/files/${s2key}`, { key: KEY });
	const afterDel = await (await call('GET', '/upload/files', { key: KEY })).json();
	check(
		'delete with the key: gone from the bucket and the list',
		del.status === 200 && (await fetch(s2.url)).status === 404 && afterDel.files.length === 2 && afterDel.used === 250e6,
	);
	const pre2 = await call('OPTIONS', '/upload/files', { headers: { 'Access-Control-Request-Method': 'GET' } });
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
	await call('DELETE', `/upload/files/${s4.url.split('/').pop()}`, { key: KEY });

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
		for (const x of pair.filter((y) => y.res.ok)) {
			await call('DELETE', `/upload/${x.key}?uploadId=${encodeURIComponent(x.uploadId)}`, { key: KEY });
		}
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
		'lifecycle.json: one rule for the whole bucket that only aborts unfinished uploads after 1 day (the Worker deletes files by age, so kept files stay)',
		life.length === 1 &&
			life[0].enabled &&
			Object.keys(life[0].conditions).length === 0 &&
			!life[0].deleteObjectsTransition &&
			life[0].abortMultipartUploadsTransition.condition.maxAge === 86400,
	);

	// 📌 Keep forever: owners only; a kept file says so, is never deleted to make room, and Undo puts it back.
	const keptSong = await upload('keep me.mp3', mp3(1000000));
	const keptKey = keptSong.url.split('/').pop();
	const listKept = async () => (await (await call('GET', '/upload/files', { key: KEY })).json()).files.find((f) => f.url.endsWith(keptKey));
	const keepRes = await call('POST', `/upload/keep/${keptKey}`, { key: KEY });
	const k1 = await listKept();
	check(
		'the owner can keep a file forever: it lists as kept, with no expiry',
		keepRes.status === 200 && k1.kept === true && k1.expires === null,
		k1,
	);
	const markHidden = !JSON.stringify((await (await call('GET', '/upload/files', { key: KEY })).json()).files).includes('_keep');
	check("the keep mark isn't listed as a file", markHidden);
	// Fill the bucket: the kept song must survive while older, unkept files make room.
	await upload('filler1.mp3', mp3(200 * MB));
	await upload('filler2.mp3', mp3(250 * MB));
	check('a kept file is never deleted to make room', !!(await listKept()) && (await fetch(keptSong.url)).status === 200);
	const undo = await call('DELETE', `/upload/keep/${keptKey}`, { key: KEY });
	const k2 = await listKept();
	check('Undo puts it back on its timer', undo.status === 200 && k2 && k2.kept === false && typeof k2.expires === 'number', k2);
	await emptyBucket();

	// m4a songs: taken by their bytes, served as audio/mp4, listed as songs; mp3 bytes named .m4a are refused.
	const m4a = await upload('drift.m4a', m4aSong);
	const m4aGet = m4a.url ? await fetch(m4a.url) : null;
	const m4aBytes = m4aGet ? Buffer.from(await m4aGet.arrayBuffer()) : Buffer.alloc(0);
	const m4aListed = (await (await call('GET', '/upload/files', { key: KEY })).json()).files.find((f) => f.url === m4a.url);
	check(
		'an m4a uploads, its link ends in .m4a, it is served as audio/mp4 byte for byte and listed as a song',
		m4a.res.ok &&
			m4a.url.endsWith('.m4a') &&
			m4aGet.headers.get('content-type') === 'audio/mp4' &&
			m4aBytes.equals(m4aSong) &&
			m4aListed?.kind === 'song',
		{ status: m4a.res.status, url: m4a.url, type: m4aGet?.headers.get('content-type'), listed: m4aListed },
	);
	const fakeM4a = await upload('fake.m4a', mp3(1000));
	check('mp3 bytes named .m4a: 415 at the first part', fakeM4a.res.status === 415, fakeM4a.res.status);
	const m4aAsMp3 = await upload('wrong.mp3', m4aSong);
	check('m4a bytes sent as .mp3 without the m4a flag: 415', m4aAsMp3.res.status === 415, m4aAsMp3.res.status);
	// What the panel does with every m4a: sent as .mp3 with m4a: true, it keeps a .mp3 link and is served as audio/mp4.
	const mix = await upload('long mix.mp3', m4aSong, { m4a: true });
	const mixGet = mix.url ? await fetch(mix.url) : null;
	const mixBytes = mixGet ? Buffer.from(await mixGet.arrayBuffer()) : Buffer.alloc(0);
	check(
		'an m4a flagged m4a: true uploads under a .mp3 link, served as audio/mp4 byte for byte',
		mix.res.ok && mix.url.endsWith('.mp3') && mixGet.headers.get('content-type') === 'audio/mp4' && mixBytes.equals(m4aSong),
		{ status: mix.res.status, url: mix.url, type: mixGet?.headers.get('content-type') },
	);
	const mixFake = await upload('fake mix.mp3', mp3(1000), { m4a: true });
	check('mp3 bytes flagged m4a: true: 415 at the first part', mixFake.res.status === 415, mixFake.res.status);
	const plain = await upload('plain.mp3', mp3(1000));
	const plainGet = plain.url ? await fetch(plain.url) : null;
	check(
		'a plain mp3 is still served as audio/mpeg',
		plain.res.ok && plainGet?.headers.get('content-type') === 'audio/mpeg',
		plainGet?.headers.get('content-type'),
	);
	await emptyBucket();
}

/** Deletes every file in the bucket, so a check starts from an empty one. */
async function emptyBucket() {
	const { files } = await (await call('GET', '/upload/files', { key: KEY })).json();
	for (const f of files) {
		await call('DELETE', `/upload/files/${f.url.split('/').pop()}`, { key: KEY });
	}
}

/**
 * `size` bytes that start like the given picture (its real header) and are zero after.
 * @param {Buffer} head
 * @param {number} size
 */
function padded(head, size) {
	const out = Buffer.alloc(size);
	head.copy(out, 0, 0, Math.min(head.length, size));
	return out;
}

async function imageChecks() {
	await emptyBucket();
	const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
	for (const [ext, type] of Object.entries(types)) {
		const data = pics[/** @type {'jpg' | 'png' | 'webp'} */ (ext)];
		const up = await putImage(`room.${ext}`, data);
		const got = up.url ? await fetch(up.url, { headers: { Origin: 'https://evil.example' } }) : null;
		const bytes = got ? Buffer.from(await got.arrayBuffer()) : Buffer.alloc(0);
		check(
			`${ext}: uploads in one request, link ends in .${ext}, GET is ${type}, open CORS, nosniff, same bytes`,
			up.res.ok &&
				new RegExp(`^${BASE}/[0-9a-f]{32}\\.${ext}$`).test(up.url) &&
				got.status === 200 &&
				got.headers.get('content-type') === type &&
				got.headers.get('access-control-allow-origin') === '*' &&
				got.headers.get('x-content-type-options') === 'nosniff' &&
				bytes.equals(data),
			[up.res.status, up.url, got && [...got.headers]],
		);
	}
	const jpeg = await putImage('Pièce 歌.jpeg', pics.jpg);
	check('a .jpeg name gives a .jpg link', jpeg.url.endsWith('.jpg'), jpeg.url);
	const swapped = await putImage('really a jpeg.png', pics.jpg);
	const swappedGet = await fetch(swapped.url);
	check(
		'a JPEG named .png: the link ends in .jpg, its real type, and is served as image/jpeg',
		swapped.url.endsWith('.jpg') && swappedGet.headers.get('content-type') === 'image/jpeg',
		swapped.url,
	);

	const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
	const wave = Buffer.alloc(100);
	wave.write('RIFF');
	wave.write('WAVE', 8);
	const refused = await Promise.all([
		putImage('anim.gif', gif),
		putImage('anim.png', gif),
		putImage('noise.webp', crypto.randomBytes(1000)),
		putImage('sound.webp', wave),
		putImage('room.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
		putImage('room.png.exe', pics.png),
		putImage('', pics.png),
	]);
	check(
		'refused with 415: a .gif, a gif named .png, noise named .webp, a RIFF WAVE named .webp, an .svg, .png.exe, no name',
		refused.every((r) => r.res.status === 415),
		refused.map((r) => r.res.status),
	);
	const msg = await (await putImage('anim.png', gif)).res.json();
	check('...with a message the panel can show', /not a real JPEG, PNG or WEBP/.test(msg.error), msg);

	/** @param {Buffer} data */
	const putSafe = async (data) => {
		try {
			return (await putImage('big.png', data)).res.status;
		} catch (e) {
			return String(e);
		}
	};
	const tooBig = await putSafe(padded(pics.png, 25 * MB + 1));
	check('an image over 25 MB in one request: 413 (those go in parts)', tooBig === 413, tooBig);
	const bigImg = await upload('big room.png', padded(pics.png, 60 * MB));
	check('a 60 MB image uploads in parts, its link ends in .png', bigImg.res.ok && /\.png$/.test(bigImg.url), [
		bigImg.res.status,
		bigImg.url,
	]);
	const bigServed = bigImg.url ? await fetch(bigImg.url, { method: 'HEAD' }) : null;
	check(
		'...and is served as image/png',
		!!bigServed && bigServed.headers.get('content-type') === 'image/png',
		bigServed && bigServed.headers.get('content-type'),
	);
	const tooBigParts = await call('POST', '/upload', { key: KEY, body: { name: 'huge.png', size: 100 * MB + 1 } });
	const tbp = tooBigParts.ok ? await tooBigParts.json() : null;
	check('the owner has no 100 MB image limit either', tooBigParts.status === 200, tooBigParts.status);
	if (tbp) {
		await call('DELETE', `/upload/${tbp.key}?uploadId=${encodeURIComponent(tbp.uploadId)}`, { key: KEY });
	}
	const fakeBig = await upload('fake.png', mp3(30 * MB));
	check('a big "png" that is really an mp3: 415 at its first part', fakeBig.res.status === 415, fakeBig.res.status);
	if (bigImg.url) {
		await call('DELETE', `/upload/files/${bigImg.url.split('/').pop()}`, { key: KEY });
	}
	const atLimit = await putImage('limit.png', padded(pics.png, 25 * MB));
	check('an image of exactly 25 MB uploads', atLimit.res.ok, atLimit.res.status);
	const emptyImg = await putSafe(Buffer.alloc(0));
	check('an empty image: 400', emptyImg === 400, emptyImg);
	const noKey = await putImage('room.png', pics.png, '');
	const wrongKey = await putImage('room.png', pics.png, 'nope');
	check('image upload with no key or a wrong key: 401', noKey.res.status === 401 && wrongKey.res.status === 401);
	const pre = await call('OPTIONS', '/upload/image?name=a.png', {
		headers: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' },
	});
	check(
		'image preflight from the game: 204, PUT allowed',
		pre.status === 204 && /PUT/.test(pre.headers.get('access-control-allow-methods') || ''),
	);
	const pngKey = atLimit.url.split('/').pop();
	const asPart = await call('PUT', `/upload/${pngKey}/1?uploadId=x`, { key: KEY, body: pics.png });
	check('an image key cannot be used as a song upload', asPart.status === 404, asPart.status);

	const listed = await (await call('GET', '/upload/files', { key: KEY })).json();
	check(
		'list shows the images, newest first, kind image, names ASCII only',
		listed.files.map((f) => `${f.name}:${f.kind}`).join('|') ===
			'limit.png:image|really a jpeg.png:image|Piece .jpeg:image|room.webp:image|room.png:image|room.jpg:image' &&
			listed.files[0].size === 25 * MB &&
			listed.files.every((f) => f.expires - f.uploaded === 5 * 86400000),
		listed.files.map((f) => f.name),
	);
	const del = await call('DELETE', `/upload/files/${pngKey}`, { key: KEY });
	const afterDel = await (await call('GET', '/upload/files', { key: KEY })).json();
	check(
		'delete an image: gone from the bucket and the list',
		del.status === 200 && (await fetch(atLimit.url)).status === 404 && !afterDel.files.some((f) => f.url === atLimit.url),
	);

	// Songs and images share the 400 MB cap; the oldest file goes first, whatever its kind.
	await emptyBucket();
	const alive = async (/** @type {string} */ url) => (await fetch(url, { method: 'HEAD' })).status === 200;
	const songA = await upload('a.mp3', mp3(300e6));
	const imgB = await putImage('b.png', padded(pics.png, 24e6));
	const songC = await upload('c.mp3', mp3(60e6));
	check('cap: a song, an image and a song fit together (384 MB of 400)', (await alive(songA.url)) && imgB.url && songC.url);
	const imgD = await putImage('d.webp', padded(pics.webp, 24e6));
	check(
		'cap: a new image deletes the oldest file, a song; the rest stay',
		imgD.url && !(await alive(songA.url)) && (await alive(imgB.url)) && (await alive(songC.url)),
	);
	const songE = await upload('e.mp3', mp3(300e6));
	check(
		'cap: a new song deletes the oldest file, now an image; the rest stay',
		songE.url && !(await alive(imgB.url)) && (await alive(songC.url)) && (await alive(imgD.url)) && (await alive(songE.url)),
	);
	const used = (await (await call('GET', '/upload/files', { key: KEY })).json()).used;
	check('cap: used stays under 400 MB', used === 384e6, used);
	await emptyBucket();
}

/**
 * The userscript in headless Chrome on a page at the game's address.
 */
async function browserChecks() {
	const script = fs.readFileSync(path.join(__dirname, 'slimecheat.js'), 'utf8');
	check('the userscript hooks nothing in the game (no bcModSdk, no socket handlers)', !/\b(ServerSocket|bcModSdk)\b/.test(script));
	const files = {
		wav: path.join(tmp, 'song.wav'),
		renamed: path.join(tmp, 'renamed.mp3'),
		fakeMp3: path.join(tmp, 'Initial D.mp3'),
		huge: path.join(tmp, 'huge.mp3'),
		song: path.join(tmp, 'my song.mp3'),
		mid: path.join(tmp, 'mid.mp3'),
		gif: path.join(tmp, 'anim.gif'),
		fakePng: path.join(tmp, 'fake.png'),
		hugePng: path.join(tmp, 'huge.png'),
		png: path.join(tmp, 'room background.png'),
	};
	fs.writeFileSync(files.gif, Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'));
	fs.writeFileSync(files.fakePng, mp3(2000));
	fs.writeFileSync(files.png, pics.png);
	fs.writeFileSync(files.hugePng, padded(pics.png, 100 * MB + 1));
	const riff = Buffer.alloc(2000);
	riff.write('RIFF');
	fs.writeFileSync(files.wav, riff);
	fs.writeFileSync(files.renamed, riff);
	fs.writeFileSync(files.fakeMp3, m4aSong);
	fs.writeFileSync(files.song, mp3(1000000));
	fs.writeFileSync(files.mid, mp3(60 * MB));
	const fd = fs.openSync(files.huge, 'w');
	fs.ftruncateSync(fd, 500 * MB + 1);
	fs.closeSync(fd);

	const browser = await puppeteer.launch({
		executablePath: CHROME,
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
		// A stand-in SlimeBeep: addPanel mounts SlimeCheat's element in a shadow root (like a panel of its own).
		await page.evaluate(() => {
			const host = document.createElement('div');
			host.id = 'su-host';
			const sr = host.attachShadow({ mode: 'open' });
			document.body.append(host);
			const panel = document.createElement('div');
			panel.id = 'panel';
			sr.append(panel);
			/** @type {any} */ (window).SlimeBeep = {
				api: {
					addPanel(/** @type {any} */ p) {
						const el = document.createElement('div');
						p.mount(el);
						panel.append(el);
						/** @type {any} */ (window).added = p;
						return { open() {}, remove() {} };
					},
					openPanel(/** @type {string} */ id) {
						/** @type {any} */ (window).opened = id;
					},
					// Like SlimeBeep's: an ECDSA P-256 proof of "slimebeep-proof|<audience>|<member>|<time>"; null until logged in.
					async proveIdentity(/** @type {string} */ audience) {
						const w = /** @type {any} */ (window);
						if (!w.loggedIn) {
							return null;
						}
						w.sbKey = w.sbKey || (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']));
						const jwk = await crypto.subtle.exportKey('jwk', w.sbKey.publicKey);
						const time = Date.now();
						const raw = await crypto.subtle.sign(
							{ name: 'ECDSA', hash: 'SHA-256' },
							w.sbKey.privateKey,
							new TextEncoder().encode(`slimebeep-proof|${audience}|4242|${time}`),
						);
						const sig = btoa(String.fromCharCode(...new Uint8Array(raw)))
							.replace(/\+/g, '-')
							.replace(/\//g, '_')
							.replace(/=+$/, '');
						w.proofs = (w.proofs || 0) + 1;
						return { memberNumber: 4242, time, pub: { x: jwk.x, y: jwk.y }, sig, rk: null };
					},
				},
			};
			// Old Room Uploads settings (an address ending in /, and a key): SlimeCheat ignores and clears them.
			localStorage.setItem(
				'songUpload.options',
				JSON.stringify({ url: 'https://song-upload.slimebeep-relay.workers.dev/', key: 'old-key' }),
			);
		});
		// Histories from before 2.11.0 sit in localStorage: SlimeCheat moves them to IndexedDB. A player out of sight for
		// longer than a session gap (40404) is cleared; one seen lately (31337) and your own other account (50505) are kept.
		await page.evaluate(async () => {
			await new Promise((done) => {
				const req = indexedDB.deleteDatabase('slimecheat-history');
				req.onsuccess = req.onerror = req.onblocked = () => done(undefined);
			});
			const look = (/** @type {number} */ at) => JSON.stringify([{ at, look: '[]', items: 0, locks: 0, names: [] }]);
			localStorage.setItem('slimecheat.outfits.31337', look(Date.now() - 60000));
			localStorage.setItem(
				'slimecheat.worn.31337',
				JSON.stringify([
					{ at: Date.now() - 60000, group: 'ItemArms', bundle: '{}', name: 'Cuffs', part: 'Arms', locked: false, changed: false },
				]),
			);
			localStorage.setItem('slimecheat.outfits.40404', look(Date.now() - 2 * 3600000));
			localStorage.setItem('slimecheat.outfits.50505', look(Date.now() - 2 * 3600000));
			localStorage.setItem('slimecheat.selves', JSON.stringify([50505]));
		});
		await page.evaluate((base) => {
			/** @type {any} */ (window).SlimeCheatServer = base;
			// Outfit history checks every 3 s in the game; quicker here.
			/** @type {any} */ (window).SlimeCheatOutfitMs = 100;
		}, BASE);
		await page.addScriptTag({ content: script });
		await page.waitForFunction(() => !!document.getElementById('su-host').shadowRoot.getElementById('sc-root'));
		const added = await page.evaluate(() => ({
			id: window.added.id,
			icon: window.added.icon,
			title: window.added.title,
			image: /^data:image\/webp;base64,/.test(window.added.image) && window.added.image.length < 12000,
		}));
		check(
			'SlimeCheat adds its hack panel to SlimeBeep',
			added.id === 'slimecheat' && added.icon === '💻' && added.image && /SlimeCheat/.test(added.title),
			added,
		);

		const host = /** @type {import('puppeteer-core').ElementHandle<HTMLElement>} */ (await page.$('#su-host'));
		/**
		 * Runs `fn` in the page with the userscript's host element.
		 * @param {(h: HTMLElement, arg: any) => any} fn
		 * @param {unknown} [arg]
		 */
		const inPanel = (fn, arg) => host.evaluate(fn, arg);
		const el = async (/** @type {string} */ id) =>
			(await page.evaluateHandle((i) => document.getElementById('su-host').shadowRoot.getElementById(`sc-${i}`), id)).asElement();
		const visible = (/** @type {string} */ id) => inPanel((h, i) => !h.shadowRoot.getElementById(`sc-${i}`).closest('[hidden]'), id);
		const text = (/** @type {string} */ id) => inPanel((h, i) => h.shadowRoot.getElementById(`sc-${i}`).textContent, id);

		const tab = (/** @type {string} */ name) =>
			page.evaluate(
				(n) =>
					[...document.getElementById('su-host').shadowRoot.querySelectorAll('#sc-tabs [data-page]')]
						.find((t) => t.textContent.includes(n))
						.click(),
				name,
			);
		check('the panel opens on Songs with Upload song', (await visible('pick')) && (await text('pick')) === '🎵 Upload song');
		const tabs = await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-tabs [data-page]')].map((t) => t.textContent).join(' | '));
		check(
			'the pages are Songs | Images | My files | Dice | Cheats | ⚙ Settings',
			tabs === '🎵 Songs | 🖼 Images | 📁 My files | 🎲 Dice | 🔓 Cheats | ⚙',
			tabs,
		);
		check(
			"Room Uploads' old address and key are cleared from the browser",
			(await page.evaluate(() => localStorage.getItem('songUpload.options'))) === null,
		);

		const pick = async (/** @type {string} */ file) => {
			await inPanel((h) => {
				h.shadowRoot.getElementById('sc-err').textContent = '';
			});
			await (await el('file')).uploadFile(file);
			await page.waitForFunction(
				() => {
					const r = document.getElementById('su-host').shadowRoot;
					return r.getElementById('sc-prog').hidden && (r.getElementById('sc-err').textContent || !r.getElementById('sc-done').hidden);
				},
				{ timeout: 120000 },
			);
			return text('err');
		};
		check('a .wav is refused before uploading', /not an mp3 or m4a/.test(await pick(files.wav)), await text('err'));
		check('a wav renamed to .mp3 is refused by its bytes', /not a real mp3 or m4a/.test(await pick(files.renamed)), await text('err'));
		check('a file over 500 MB is refused', /at most 500 MB/.test(await pick(files.huge)), await text('err'));
		// (Not signed in yet, so not known as the owner: the usual limits apply.)
		await tab('Images');
		check('an image over 100 MB is refused', /at most 100 MB/.test(await pick(files.hugePng)), await text('err'));
		await tab('Songs');
		check(
			'before logging in, an upload says to log in with SlimeBeep',
			/Log in to Bondage Club with SlimeBeep first/.test(await pick(files.song)),
			await text('err'),
		);
		await page.evaluate(() => {
			/** @type {any} */ (window).loggedIn = true;
		});

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
		const link = await inPanel((h) => h.shadowRoot.getElementById('sc-link').value);
		check('the link shows and ends in .mp3', link.startsWith(`${BASE}/`) && link.endsWith('.mp3'), link);
		const recent = async (/** @type {string} */ head) => {
			await page.waitForFunction(
				(hd) => document.getElementById('su-host').shadowRoot.getElementById('sc-recenthead').textContent === hd,
				{ timeout: 10000 },
				head,
			);
			return inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-recent .sc-file b')].map((b) => b.textContent).join('|'));
		};
		const songsListed = await recent('Your songs (2)');
		check('under the upload button, Songs lists my songs, newest first', songsListed === 'my song.mp3|mid.mp3', songsListed);
		check(
			'the panel says the link lasts as long as the file',
			/lasts as long as the file/.test(await inPanel((h) => h.shadowRoot.getElementById('sc-done').textContent)),
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

		await tab('Images');
		const accept = await inPanel((h) => h.shadowRoot.getElementById('sc-file').accept);
		check(
			'the Images tab: Upload image, jpg/png/webp up to 100 MB, the old song link hidden',
			(await text('pick')) === '🖼 Upload image' &&
				/jpg, png or webp, up to 100 MB/.test(await text('limits')) &&
				accept.includes('.webp') &&
				!accept.includes('.mp3') &&
				!(await visible('done')),
			accept,
		);
		check('a .gif is refused before uploading', /can't be a room image/.test(await pick(files.gif)), await text('err'));
		check(
			'a fake .png (mp3 bytes) is refused by its bytes',
			/not a real JPEG, PNG or WEBP/.test(await pick(files.fakePng)),
			await text('err'),
		);
		check(
			'...and as the owner, Images says there is no size limit',
			/no size limit for you \(owner\)/.test(await text('limits')),
			await text('limits'),
		);
		check('room background.png uploads', !(await pick(files.png)), await text('err'));
		const imgLink = await inPanel((h) => h.shadowRoot.getElementById('sc-link').value);
		check('the image link shows and ends in .png', new RegExp(`^${BASE}/[0-9a-f]{32}\\.png$`).test(imgLink), imgLink);
		const imagesListed = await recent('Your images (1)');
		check('...and Images lists only my images', imagesListed === 'room background.png', imagesListed);
		check(
			'...and says how long it lasts',
			/lasts as long as the file/.test(await inPanel((h) => h.shadowRoot.getElementById('sc-done').textContent)),
		);
		await (await el('copy')).click();
		check('Copy link copies the image link', (await page.evaluate(() => navigator.clipboard.readText())) === imgLink);
		const drawn = await page.evaluate(async (url) => {
			const load = (/** @type {boolean} */ cors) =>
				new Promise((resolve, reject) => {
					const img = new Image();
					if (cors) {
						img.crossOrigin = 'anonymous';
					}
					img.onload = () => resolve(img);
					img.onerror = () => reject(new Error('image did not load'));
					img.src = `${url}${cors ? '' : '?plain'}`;
				});
			const c = document.createElement('canvas');
			c.width = 64;
			c.height = 48;
			const g = c.getContext('2d');
			const plain = /** @type {HTMLImageElement} */ (await load(false));
			const img = /** @type {HTMLImageElement} */ (await load(true));
			g.drawImage(img, 0, 0);
			return { origin: location.origin, w: img.naturalWidth, plain: plain.naturalWidth, px: [...g.getImageData(10, 10, 1, 1).data] };
		}, imgLink);
		check(
			'on the game page the image draws on a canvas untainted (crossOrigin, getImageData gives its colour), and loads plain too',
			drawn.origin === GAME && drawn.w === 64 && drawn.plain === 64 && drawn.px.join() === [...RGB, 255].join(),
			drawn,
		);
		await tab('Songs');
		check('back on Songs: Upload song again', (await text('pick')) === '🎵 Upload song');

		await tab('My files');
		await page.waitForFunction(() => document.getElementById('su-host').shadowRoot.querySelectorAll('#sc-list .sc-file').length > 0);
		const rows = () =>
			inPanel((h) =>
				[...h.shadowRoot.querySelectorAll('#sc-list .sc-file')].map((r) => ({
					name: r.querySelector('b').textContent,
					info: r.querySelector('.sb-sub').textContent,
					thumb: r.querySelector('img') ? r.querySelector('img').src : '',
				})),
			);
		await page.waitForFunction(() => {
			const img = document.getElementById('su-host').shadowRoot.querySelector('#sc-list .sc-file img');
			return img && img.complete && img.naturalWidth > 0;
		});
		const shown = await rows();
		check(
			'My files: songs and images newest first, with name, size, date and time left',
			shown.map((r) => r.name).join('|') === 'room background.png|my song.mp3|mid.mp3' &&
				/^\d+ KB · .+ · deletes in 5 days$/.test(shown[0].info) &&
				/^1\.0 MB · .+ · deletes in 5 days$/.test(shown[1].info),
			shown,
		);
		check(
			'the image row has a thumbnail of it; song rows have none',
			shown[0].thumb === imgLink && !shown[1].thumb && !shown[2].thumb,
			shown,
		);
		check(
			'My files shows the owner view and the storage used, with a heading even when only my files are there',
			/^👑 Owner view: everyone’s files · Used [\d.]+ MB of 400\.0 MB$/.test(await text('used')) &&
				(await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-list .sc-user')].map((x) => x.textContent).join('|'))) ===
					'You #4242 · 3 files',
			await text('used'),
		);
		await inPanel((h) => h.shadowRoot.querySelectorAll('#sc-list .sc-file .sc-copylink')[1].click());
		check("a song row's Copy link copies its link", (await page.evaluate(() => navigator.clipboard.readText())) === link);
		await inPanel((h) => h.shadowRoot.querySelector('#sc-list .sc-file .sc-copylink').click());
		check("the image row's Copy link copies its link", (await page.evaluate(() => navigator.clipboard.readText())) === imgLink);
		const delBtn = (/** @type {number} */ i) =>
			inPanel((h, n) => h.shadowRoot.querySelectorAll('#sc-list .sc-file .sc-del')[n].textContent, i);
		const delClick = (/** @type {number} */ i) =>
			inPanel((h, n) => h.shadowRoot.querySelectorAll('#sc-list .sc-file .sc-del')[n].click(), i);
		await delClick(0);
		check(
			'Delete asks "Sure?" first and keeps the image',
			(await delBtn(0)) === 'Sure?' && (await rows()).length === shown.length && (await fetch(imgLink)).status === 200,
		);
		await delClick(0);
		await page.waitForFunction(
			(n) => document.getElementById('su-host').shadowRoot.querySelectorAll('#sc-list .sc-file').length === n - 1,
			{},
			shown.length,
		);
		check('a second click deletes the image', (await rows())[0].name === 'my song.mp3' && (await fetch(imgLink)).status === 404);
		await delClick(0);
		await delClick(0);
		await page.waitForFunction(
			(n) => document.getElementById('su-host').shadowRoot.querySelectorAll('#sc-list .sc-file').length === n - 2,
			{},
			shown.length,
		);
		check('a song deletes the same way', (await rows())[0].name === 'mid.mp3' && (await fetch(link)).status === 404);
		await (await el('refresh')).click();
		await page.waitForFunction(() => /Used /.test(document.getElementById('su-host').shadowRoot.getElementById('sc-used').textContent));
		check('refresh reloads the list', (await rows()).length === shown.length - 2);
		// Another player (member 777) uploads an image; the owner's My files then groups by player, theirs first.
		const k777 = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
		const j777 = await crypto.subtle.exportKey('jwk', k777.publicKey);
		const t777 = Date.now();
		const s777 = Buffer.from(
			await crypto.subtle.sign(
				{ name: 'ECDSA', hash: 'SHA-256' },
				k777.privateKey,
				new TextEncoder().encode(`slimebeep-proof|slimecheat|777|${t777}`),
			),
		).toString('base64url');
		const proof777 = { memberNumber: 777, time: t777, pub: { x: j777.x, y: j777.y }, sig: s777, rk: null, name: 'Lilly' };
		const put777 = await call('PUT', '/upload/image?name=lilly.png', {
			body: pics.png,
			headers: { Authorization: `SlimeBeep ${Buffer.from(JSON.stringify(proof777)).toString('base64')}` },
		});
		check("another player's upload goes in as theirs", put777.status === 200, put777.status);
		await (await el('refresh')).click();
		await page.waitForFunction(() => document.getElementById('su-host').shadowRoot.querySelectorAll('#sc-list .sc-user').length === 2);
		const heads = await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-list .sc-user')].map((x) => x.textContent));
		check(
			"the owner's My files shows everyone's files grouped by player, theirs first, with no button to press",
			heads[0] === 'You #4242 · 1 file' &&
				heads[1] === 'Lilly #777 · 1 file' &&
				!(await inPanel((h) => !!h.shadowRoot.getElementById('sc-all'))),
			heads,
		);
		await tab('⚙');
		const ownerRow = await visible('ownerrow');
		await (await el('ownerview')).click();
		await tab('My files');
		await page.waitForFunction(
			() =>
				!/Owner view/.test(document.getElementById('su-host').shadowRoot.getElementById('sc-used').textContent) &&
				/^Used/.test(document.getElementById('su-host').shadowRoot.getElementById('sc-used').textContent),
		);
		const mineOnly = await inPanel((h) => ({
			heads: h.shadowRoot.querySelectorAll('#sc-list .sc-user').length,
			names: [...h.shadowRoot.querySelectorAll('#sc-list .sc-file b')].map((b) => b.textContent).join('|'),
		}));
		check(
			'⚙ Settings › 👑 (shown to owners) turns the owner view off: My files shows only mine',
			ownerRow &&
				mineOnly.heads === 0 &&
				!/lilly\.png/.test(mineOnly.names) &&
				(await page.evaluate(() => localStorage.getItem('slimecheat.ownerView'))) === '0',
			[ownerRow, mineOnly],
		);

		// Cheats, on a stand-in game: the lock burner by body part, and unlock every item.
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			const group = (/** @type {string} */ name, /** @type {string} */ desc) => ({
				Name: name,
				Description: desc,
				Category: 'Item',
				Family: 'Female3DCG',
			});
			const cuffs = { Asset: { Name: 'Cuffs', Description: 'Leather Cuffs', Group: group('ItemArms', 'Arms') }, lock: true };
			const gag = { Asset: { Name: 'Gag', Description: 'Ball Gag', Group: group('ItemMouth', 'Mouth') }, lock: false };
			const hair = { Asset: { Name: 'Hair', Group: { Name: 'HairFront', Category: 'Appearance' } } };
			w.calls = [];
			w.Player = {
				MemberNumber: 255659,
				Name: 'Sam',
				IsPlayer: () => true,
				AssetFamily: 'Female3DCG',
				Appearance: [cuffs, gag, hair],
				Inventory: [],
			};
			w.InventoryGet = (/** @type {any} */ C, /** @type {string} */ g) =>
				C.Appearance.find((/** @type {any} */ i) => i.Asset.Group.Name === g) || null;
			w.InventoryGetLock = (/** @type {any} */ i) => (i.lock ? { Asset: { Name: 'MetalPadlock' } } : null);
			w.InventoryUnlock = (/** @type {any} */ C, /** @type {any} */ i) => {
				i.lock = false;
				w.calls.push(`unlock ${i.Asset.Name}`);
			};
			w.InventoryRemove = (/** @type {any} */ C, /** @type {string} */ g) => {
				C.Appearance = C.Appearance.filter((/** @type {any} */ i) => i.Asset.Group.Name !== g);
				w.calls.push(`remove ${g}`);
			};
			w.CharacterRefresh = () => w.calls.push('refresh');
			w.ChatRoomCharacterUpdate = () => w.calls.push('room');
			w.Asset = [
				{ ...cuffs.Asset, InventoryID: 1 },
				{ ...gag.Asset, InventoryID: 2 },
				// A free item the game counts as usable already: it must still be added
				{ Name: 'Rope', Group: group('ItemLegs', 'Legs'), Value: 0, InventoryID: 3 },
				// A mod item without an inventory number
				{ Name: 'ModScythe', Group: group('ItemHandheld', 'Hands') },
				{ Name: 'Other', Group: { ...group('ItemArms', 'Arms'), Family: 'Other' } },
			];
			w.InventoryAvailable = () => true;
			w.InventoryItemCreate = (/** @type {any} */ _C, /** @type {string} */ g, /** @type {string} */ n) => ({ Group: g, Name: n });
			w.ServerPlayerInventorySync = () => w.calls.push('sync');
		});
		await tab('Cheats');
		const parts = await inPanel((h) =>
			[...h.shadowRoot.getElementById('sc-part').options].map((o) => `${o.value}=${o.textContent}`).join('|'),
		);
		check(
			'the lock burner lists my item slots by body part, locked ones marked (no hair or clothes)',
			parts === 'ItemArms=🔒 Arms: Leather Cuffs|ItemMouth=Mouth: Ball Gag',
			parts,
		);
		await (await el('unlock')).click();
		const burnt = await page.evaluate(() => /** @type {any} */ (window).calls.join(','));
		check('Burn the lock unlocks only that slot, then saves my look and tells the room', burnt === 'unlock Cuffs,refresh,room', burnt);
		await page.waitForFunction(
			() => /** @type {any} */ (window).SlimeCheat.historyReady() && (localStorage.getItem('slimecheat.selves') || '').includes('255659'),
		);
		const moved = await page.evaluate(async () => {
			const sc = /** @type {any} */ (window).SlimeCheat;
			const rows = await new Promise((done) => {
				const req = indexedDB.open('slimecheat-history');
				req.onsuccess = () => {
					const get = req.result.transaction('lists').objectStore('lists').getAllKeys();
					get.onsuccess = () => {
						req.result.close();
						done(get.result.map(String).sort());
					};
				};
			});
			return {
				kept: [sc.history('outfits', 31337).length, sc.history('worn', 31337).length, sc.history('outfits', 50505).length],
				cleared: sc.history('outfits', 40404).length,
				leftInLocalStorage: Object.keys(localStorage).filter((k) => /^slimecheat\.(outfits|worn)\./.test(k)),
				rows,
				selves: JSON.parse(localStorage.getItem('slimecheat.selves') || '[]'),
			};
		});
		check(
			'Histories move from localStorage to IndexedDB; a player gone longer than a session is cleared, a recent one and your own accounts are kept',
			moved.kept.join() === '1,1,1' &&
				moved.cleared === 0 &&
				moved.leftInLocalStorage.length === 0 &&
				moved.rows.includes('outfits.31337') &&
				moved.rows.includes('worn.31337') &&
				!moved.rows.includes('outfits.40404') &&
				moved.selves.includes(255659),
			moved,
		);

		await inPanel((h) => {
			const sel = h.shadowRoot.getElementById('sc-part');
			sel.value = 'ItemMouth';
		});
		await (await el('remove')).click();
		const removed = await page.evaluate(() => ({
			calls: /** @type {any} */ (window).calls.join(','),
			left: window.Player.Appearance.length,
		}));
		check('Take it off removes that item', removed.calls.endsWith('remove ItemMouth,refresh,room') && removed.left === 2, removed);
		await (await el('allitems')).click();
		const first = await page.evaluate(() => ({ calls: /** @type {any} */ (window).calls.length, inv: window.Player.Inventory.length }));
		await (await el('allitems')).click();
		const items = await page.evaluate(() => ({
			inv: window.Player.Inventory.map((/** @type {any} */ i) => i.Name).join(','),
			syncs: /** @type {any} */ (window).calls.filter((/** @type {string} */ c) => c === 'sync').length,
		}));
		const itemsMsg = await text('itemsdone');
		check(
			'Unlock all items asks first, then adds every item of my body type, free ones too, and saves once',
			first.inv === 0 &&
				items.inv === 'Cuffs,Gag,Rope,ModScythe' &&
				items.syncs === 1 &&
				/4 new items/.test(itemsMsg) &&
				/1 mod item can/.test(itemsMsg),
			[first, items, itemsMsg],
		);
		await (await el('allitems')).click();
		await (await el('allitems')).click();
		const again = await page.evaluate(() => window.Player.Inventory.length);
		check('Unlocking again adds nothing twice', again === 4 && /0 new items/.test(await text('itemsdone')), again);
		// 🛡 Protected locks: off by default; on, Owner/Mistress-style locks stay (burn, take off and burn all).
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			const g = (/** @type {string} */ n, /** @type {string} */ d) => ({ Name: n, Description: d, Category: 'Item', Family: 'Female3DCG' });
			w.Player.Appearance = [
				{
					Asset: { Name: 'Collar', Description: 'Collar', Group: g('ItemNeck', 'Neck') },
					lockAsset: { Name: 'OwnerPadlock', Description: 'Owner Padlock' },
				},
				{
					Asset: { Name: 'Cuffs', Description: 'Leather Cuffs', Group: g('ItemArms', 'Arms') },
					lockAsset: { Name: 'MetalPadlock', Description: 'Metal Padlock' },
				},
				{
					Asset: { Name: 'Belt', Description: 'Chastity Belt', Group: g('ItemPelvis', 'Pelvis') },
					lockAsset: { Name: 'MistressTimerPadlock', Description: 'Mistress Timer Padlock' },
				},
			];
			w.InventoryGetLock = (/** @type {any} */ i) => (i.lockAsset ? { Asset: i.lockAsset } : null);
			w.InventoryUnlock = (/** @type {any} */ C, /** @type {any} */ i) => {
				i.lockAsset = null;
				w.calls.push(`unlock ${i.Asset.Name}`);
			};
			w.calls = [];
		});
		await tab('⚙');
		const protectOff = await inPanel((h) => h.shadowRoot.getElementById('sc-protect').checked);
		await (await el('protect')).click();
		await tab('Cheats');
		const marks = await inPanel((h) => [...h.shadowRoot.getElementById('sc-part').options].map((o) => o.textContent).join('|'));
		await inPanel((h) => {
			h.shadowRoot.getElementById('sc-part').value = 'ItemNeck';
		});
		await (await el('unlock')).click();
		const keptOne = await text('burnt');
		await (await el('remove')).click();
		const keptOn = await text('burnt');
		await (await el('burnall')).click();
		const burnAll = { text: await text('burnt'), calls: await page.evaluate(() => /** @type {any} */ (window).calls.join(',')) };
		const saved = await page.evaluate(() => localStorage.getItem('slimecheat.protectLocks'));
		check(
			'⚙ Settings › 🛡 is off by default; on, it marks and leaves Owner and Mistress locks alone (burn, take off, burn every lock) and is remembered',
			!protectOff &&
				marks === '🛡 Neck: Collar|🔒 Arms: Leather Cuffs|🛡 Pelvis: Chastity Belt' &&
				/Left alone: it has a Owner Padlock/.test(keptOne) &&
				/Left on/.test(keptOn) &&
				burnAll.calls === 'unlock Cuffs,refresh,room' &&
				/1 lock burnt off \(🛡 2 left alone\)/.test(burnAll.text) &&
				saved === '1',
			[protectOff, marks, keptOne, keptOn, burnAll, saved],
		);
		await tab('⚙');
		await (await el('protect')).click();
		await tab('Cheats');
		await page.evaluate(() => {
			/** @type {any} */ (window).calls = [];
		});
		await (await el('burnall')).click();
		const offAgain = await page.evaluate(() => /** @type {any} */ (window).calls.join(','));
		check('with 🛡 off again, every lock burns', offAgain === 'unlock Collar,unlock Belt,refresh,room', offAgain);
		// Invisible: asks for the Scripts setting first, then wears the Script item hiding every body group.
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			w.AssetGroup = [
				{ Name: 'BodyUpper', Family: 'Female3DCG' },
				{ Name: 'ItemArms', Family: 'Female3DCG' },
				{ Name: 'ItemScript', Family: 'Female3DCG' },
				{ Name: 'Other', Family: 'Other' },
			];
			w.Player.OnlineSharedSettings = { ScriptPermissions: { Hide: { permission: 0 } } };
			w.InventoryWear = (/** @type {any} */ C, /** @type {string} */ name, /** @type {string} */ group) => {
				C.Appearance = C.Appearance.filter((/** @type {any} */ i) => i.Asset.Group.Name !== group);
				C.Appearance.push({ Asset: { Name: name, Group: { Name: group, Category: 'Script' } } });
				w.calls.push(`wear ${name}`);
			};
			w.calls = [];
		});
		await (await el('invis')).click();
		const asked = { text: await text('invisdone'), calls: await page.evaluate(() => /** @type {any} */ (window).calls.length) };
		await page.evaluate(() => {
			/** @type {any} */ (window).Player.OnlineSharedSettings.ScriptPermissions.Hide.permission = 1;
		});
		await (await el('invis')).click();
		const hidden = await page.evaluate(() => {
			const it = window.Player.Appearance.find((/** @type {any} */ i) => i.Asset.Group.Name === 'ItemScript');
			return { hide: it && it.Property ? it.Property.Hide.join(',') : '', calls: /** @type {any} */ (window).calls.join(',') };
		});
		check(
			'Invisible asks for the Scripts › Hide › Self setting first, then wears the Script item hiding every body group (not itself)',
			/Settings › Scripts › Hide › Self/.test(asked.text) &&
				asked.calls === 0 &&
				hidden.hide === 'BodyUpper,ItemArms' &&
				hidden.calls === 'wear Script,refresh,room',
			[asked, hidden],
		);
		await (await el('vis')).click();
		const shown2 = await page.evaluate(() => ({
			on: window.Player.Appearance.some((/** @type {any} */ i) => i.Asset.Group.Name === 'ItemScript'),
			calls: /** @type {any} */ (window).calls.join(','),
		}));
		check('Visible again takes the Script item off', !shown2.on && /remove ItemScript,refresh,room$/.test(shown2.calls), shown2);
		// Money: sets it and saves it with the game's own sync; refuses nonsense.
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			w.Player.Money = 120;
			w.ServerPlayerSync = () => w.calls.push(`sync ${w.Player.Money}`);
			w.calls = [];
		});
		await tab('Songs');
		await tab('Cheats');
		const before = await text('moneynow');
		await (await el('money')).type('-5');
		await (await el('setmoney')).click();
		const refused = { text: await text('moneydone'), money: await page.evaluate(() => window.Player.Money) };
		await inPanel((h) => {
			h.shadowRoot.getElementById('sc-money').value = '';
		});
		await (await el('money')).type('5,000');
		await (await el('setmoney')).click();
		const set = {
			money: await page.evaluate(() => window.Player.Money),
			calls: await page.evaluate(() => /** @type {any} */ (window).calls.join(',')),
			now: await text('moneynow'),
		};
		check(
			'Money shows what I have, refuses a bad amount, and sets and saves a good one',
			before === '(you have $120)' &&
				/A number, 0 or more/.test(refused.text) &&
				refused.money === 120 &&
				set.money === 5000 &&
				set.calls === 'sync 5000' &&
				set.now === '(you have $5000)',
			[before, refused, set],
		);
		// No upper limit: 1e99 is taken as is.
		await inPanel((h) => {
			h.shadowRoot.getElementById('sc-money').value = '1e99';
		});
		await (await el('setmoney')).click();
		check(
			'Money has no upper limit (1e99 is set as is)',
			(await page.evaluate(() => window.Player.Money)) === 1e99,
			await text('moneydone'),
		);
		// !burn in SlimeBeep's chat box, with a slot selected: burns that item, emotes, and is never sent (Enter or Send).
		const fired = await page.evaluate(async () => {
			const w = /** @type {any} */ (window);
			const sent = [];
			let gameSaw = 0;
			const gag = { Asset: { Name: 'BallGag', Description: 'Ball Gag', Group: { Name: 'ItemMouth', AllowNone: true } } };
			const me = { IsPlayer: () => true, FocusGroup: { Name: 'ItemMouth' }, Appearance: [gag] };
			Object.assign(w, {
				CurrentScreen: 'ChatRoom',
				ServerPlayerIsInChatRoom: () => true,
				CharacterGetCurrent: () => me,
				InventoryGet: (/** @type {any} */ C, /** @type {string} */ g) =>
					C.Appearance.find((/** @type {any} */ i) => i.Asset.Group.Name === g) || null,
				InventoryRemove: (/** @type {any} */ C, /** @type {string} */ g) => {
					C.Appearance = C.Appearance.filter((/** @type {any} */ i) => i.Asset.Group.Name !== g);
				},
				ChatRoomCharacterUpdate: () => sent.push('update'),
				ServerPlayerAppearanceSync: () => sent.push('sync'),
				ServerSend: (/** @type {string} */ m, /** @type {any} */ d) => sent.push(`${m}:${d.Type}:${d.Content}`),
				CharacterNickname: () => 'Sam',
			});
			const box = document.createElement('textarea');
			box.id = 'sb-text';
			const send = document.createElement('button');
			send.id = 'sb-send';
			document.body.append(box, send);
			// SlimeBeep's own handlers would send the line.
			send.addEventListener('click', () => gameSaw++);
			box.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					gameSaw++;
				}
			});
			box.value = '!burn';
			box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			const r = { left: me.Appearance.length, sent: sent.join('|'), box: box.value, gameSaw };
			// The Send button with !burn: burns too (another item), still never sent.
			me.Appearance = [{ Asset: { Name: 'Cuffs', Description: 'Cuffs', Group: { Name: 'ItemMouth', AllowNone: true } } }];
			box.value = '!burn';
			send.click();
			r.byButton = me.Appearance.length === 0 && gameSaw === 0 && box.value === '';
			// Anything else goes through, and the game's own chat box is left alone.
			box.value = 'hello';
			box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			send.click();
			r.normal = gameSaw;
			const game = document.createElement('input');
			game.id = 'InputChat';
			document.body.append(game);
			game.value = '!burn';
			me.Appearance = [gag];
			game.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			r.gameChatIgnored = me.Appearance.length === 1 && game.value === '!burn';
			box.remove();
			send.remove();
			game.remove();
			return r;
		});
		check(
			'!burn in a SlimeBeep chat (Enter or Send) burns the selected item, saves, emotes, and is never sent; other lines go through; the game chat ignores it',
			fired.left === 0 &&
				fired.sent === 'update|sync|ChatRoomChat:Emote:sets the Ball Gag on fire and lets it burn away.' &&
				fired.box === '' &&
				fired.gameSaw === 0 &&
				fired.byButton &&
				fired.normal === 2 &&
				fired.gameChatIgnored,
			fired,
		);
		// !burnbutton: a floating 🔥 button that burns like !burn. A drag moves it (and doesn't burn), a click burns the
		// selected item, its × removes it and forgets where it was.
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			localStorage.removeItem('slimecheat.burnButton');
			const box = document.createElement('textarea');
			box.id = 'sb-text';
			document.body.append(box);
			box.value = '!burnbutton';
			box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			box.remove();
			w.CharacterGetCurrent().Appearance = [{ Asset: { Name: 'Gag', Description: 'Gag', Group: { Name: 'ItemMouth', AllowNone: true } } }];
		});
		const btnCentre = () =>
			page.$eval('#sc-burnbutton', (e) => {
				const r = e.getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top };
			});
		const btnStart = await btnCentre();
		await page.mouse.move(btnStart.x, btnStart.y);
		await page.mouse.down();
		await page.mouse.move(btnStart.x - 60, btnStart.y + 20, { steps: 5 });
		await page.mouse.move(btnStart.x - 100, btnStart.y + 40, { steps: 5 });
		await page.mouse.up();
		const btnDragged = await btnCentre();
		const btnAfterDrag = await page.evaluate(() => ({
			left: /** @type {any} */ (window).CharacterGetCurrent().Appearance.length,
			saved: JSON.parse(localStorage.getItem('slimecheat.burnButton') || 'null'),
		}));
		await page.mouse.click(btnDragged.x, btnDragged.y);
		await new Promise((done) => setTimeout(done, 200));
		const buttonBurnt = await page.evaluate(() => /** @type {any} */ (window).CharacterGetCurrent().Appearance.length);
		await page.click('#sc-burnbutton button');
		const btnRemoved = await page.evaluate(() => ({
			gone: !document.getElementById('sc-burnbutton'),
			saved: localStorage.getItem('slimecheat.burnButton'),
		}));
		check(
			'!burnbutton adds a floating 🔥 button: dragging moves it (no burn) and remembers where, a click burns the selected item, × removes it',
			btnAfterDrag.left === 1 &&
				Math.round(btnDragged.left) === Math.round(btnStart.left - 100) &&
				btnAfterDrag.saved &&
				Math.round(btnAfterDrag.saved.x) === Math.round(btnDragged.left) &&
				buttonBurnt === 0 &&
				btnRemoved.gone &&
				btnRemoved.saved === null,
			{ btnStart, btnDragged, btnAfterDrag, buttonBurnt, btnRemoved },
		);
		// !burnlock: only the lock burns, the item stays; no lock = a note; never sent.
		const lockBurnt = await page.evaluate(async () => {
			const w = /** @type {any} */ (window);
			const sent = [];
			const cuffs = {
				Asset: { Name: 'Cuffs', Description: 'Leather Cuffs', Group: { Name: 'ItemArms', AllowNone: true } },
				lockAsset: { Name: 'MetalPadlock' },
			};
			const me = { IsPlayer: () => false, FocusGroup: { Name: 'ItemArms' }, Appearance: [cuffs] };
			const keep = { InventoryGetLock: w.InventoryGetLock, InventoryUnlock: w.InventoryUnlock };
			Object.assign(w, {
				CurrentScreen: 'ChatRoom',
				ServerPlayerIsInChatRoom: () => true,
				CharacterGetCurrent: () => me,
				InventoryGet: (/** @type {any} */ C, /** @type {string} */ g) =>
					C.Appearance.find((/** @type {any} */ i) => i.Asset.Group.Name === g) || null,
				InventoryGetLock: (/** @type {any} */ i) => (i.lockAsset ? { Asset: i.lockAsset } : null),
				InventoryUnlock: (/** @type {any} */ C, /** @type {any} */ i) => {
					i.lockAsset = null;
					sent.push('unlock');
				},
				ServerChatRoomGetAllowItem: () => true,
				ChatRoomCharacterItemUpdate: (/** @type {any} */ C, /** @type {string} */ g) => sent.push(`item ${g}`),
				ServerSend: (/** @type {string} */ m, /** @type {any} */ d) => sent.push(`${m}:${d.Type}:${d.Content}`),
				CharacterNickname: () => 'Drone',
			});
			const box = document.createElement('textarea');
			box.id = 'sb-text';
			document.body.append(box);
			box.value = '!burnlock';
			box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			const r = { stillOn: me.Appearance.length === 1, locked: !!cuffs.lockAsset, sent: sent.join('|'), box: box.value };
			box.value = '!burnlock';
			box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			r.noLock = document.getElementById('bc-fire-toast')?.textContent;
			box.remove();
			Object.assign(w, keep);
			return r;
		});
		check(
			'!burnlock burns only the lock (the item stays), updates the room, emotes, is never sent; with no lock it says so',
			lockBurnt.stillOn &&
				!lockBurnt.locked &&
				lockBurnt.sent === 'unlock|item ItemArms|ChatRoomChat:Emote:burns the lock off the Leather Cuffs on Drone.' &&
				lockBurnt.box === '' &&
				/no lock/.test(lockBurnt.noLock || ''),
			lockBurnt,
		);
		// !burnlocks / !burnall on the open player (no slot needed); 🧯 fireproof spares only your own items; !owner
		// answers only to the owner's member number.
		const every = await page.evaluate(async () => {
			const w = /** @type {any} */ (window);
			/** @type {string[]} */
			const sent = [];
			const item = (/** @type {string} */ name, /** @type {string} */ g, /** @type {any} */ extra = {}) => ({
				Asset: { Name: name, Description: name, Group: { Name: g, AllowNone: true, Category: 'Item' } },
				...extra,
			});
			const keep = {
				InventoryGetLock: w.InventoryGetLock,
				InventoryUnlock: w.InventoryUnlock,
				InventoryRemove: w.InventoryRemove,
				InventoryGet: w.InventoryGet,
				CharacterRefresh: w.CharacterRefresh,
				ChatRoomCharacterUpdate: w.ChatRoomCharacterUpdate,
			};
			/** @type {any} */
			let C = {};
			Object.assign(w, {
				CurrentScreen: 'ChatRoom',
				ServerPlayerIsInChatRoom: () => true,
				CharacterGetCurrent: () => C,
				InventoryGet: (/** @type {any} */ who, /** @type {string} */ g) =>
					who.Appearance.find((/** @type {any} */ i) => i.Asset.Group.Name === g) || null,
				InventoryGetLock: (/** @type {any} */ i) => (i.locked ? { Asset: { Name: 'MetalPadlock' } } : null),
				InventoryUnlock: (/** @type {any} */ _, /** @type {any} */ i) => {
					i.locked = false;
					sent.push(`unlock ${i.Asset.Name}`);
				},
				InventoryRemove: (/** @type {any} */ who, /** @type {string} */ g) => {
					who.Appearance = who.Appearance.filter((/** @type {any} */ i) => i.Asset.Group.Name !== g);
					sent.push(`remove ${g}`);
				},
				CharacterRefresh: () => sent.push('refresh'),
				ServerChatRoomGetAllowItem: () => true,
				ChatRoomCharacterItemUpdate: (/** @type {any} */ _, /** @type {string} */ g) => sent.push(`item ${g}`),
				ChatRoomCharacterUpdate: () => sent.push('update'),
				ServerPlayerAppearanceSync: () => sent.push('sync'),
				ServerSend: (/** @type {string} */ m, /** @type {any} */ d) => sent.push(`${m}:${d.Type}:${d.Content}`),
				CharacterNickname: () => 'Drone',
			});
			const box = document.createElement('textarea');
			box.id = 'sb-text';
			let gameSaw = 0;
			box.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					gameSaw++;
				}
			});
			document.body.append(box);
			const type = (/** @type {string} */ line) => {
				box.value = line;
				box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			};
			const toast = () => document.getElementById('bc-fire-toast')?.textContent || '';
			localStorage.setItem('slimecheat.fireproof', '1');
			/** @type {any} */
			const r = {};
			// Someone else: every lock burns, fireproof or not, and the room hears each slot.
			const fp = { Craft: { Name: 'Asbestos Gag', Description: 'Fireproof, of course' } };
			C = {
				IsPlayer: () => false,
				Appearance: [
					item('Cuffs', 'ItemArms', { locked: true }),
					item('Gag', 'ItemMouth', { locked: true, ...fp }),
					item('Rope', 'ItemLegs'),
				],
			};
			type('!burnlocks');
			r.otherLocks = sent.splice(0).join('|');
			r.otherLocked = C.Appearance.filter((/** @type {any} */ i) => i.locked).length;
			// Yourself: everything you're tied up in burns but the fireproof item; clothes and body stay.
			C = {
				IsPlayer: () => true,
				Appearance: [
					item('Cuffs', 'ItemArms', { locked: true }),
					item('Gag', 'ItemMouth', fp),
					{ Asset: { Name: 'Shirt', Group: { Name: 'Cloth', AllowNone: true, Category: 'Appearance' } } },
					{ Asset: { Name: 'Body', Group: { Name: 'BodyUpper', AllowNone: false, Category: 'Appearance' } } },
				],
			};
			type('!burnall');
			r.selfAll = sent.splice(0).join('|');
			r.selfLeft = C.Appearance.map((/** @type {any} */ i) => i.Asset.Name).join(',');
			r.selfToast = toast();
			// !burn on your own fireproof item: left alone.
			C.FocusGroup = { Name: 'ItemMouth' };
			type('!burn');
			r.burnFp = toast();
			r.burnFpLeft = C.Appearance.length;
			// Fireproof off: it burns like anything else.
			localStorage.setItem('slimecheat.fireproof', '0');
			type('!burnall');
			r.offLeft = C.Appearance.map((/** @type {any} */ i) => i.Asset.Name).join(',');
			sent.splice(0);
			// !owner: the owner gets the list; anyone else's !owner is an ordinary line.
			type('!owner');
			r.ownerCard = toast();
			r.ownerSaw = gameSaw;
			w.Player.MemberNumber = 1234;
			document.getElementById('bc-fire-toast')?.remove();
			type('!owner');
			r.otherSaw = gameSaw;
			r.otherBox = box.value;
			r.otherToast = toast();
			w.Player.MemberNumber = 255659;
			box.remove();
			Object.assign(w, keep);
			return r;
		});
		check(
			'!burnlocks burns every lock off someone else (fireproof only spares your own), updates each slot, emotes',
			every.otherLocks === 'unlock Cuffs|unlock Gag|item ItemArms|item ItemMouth|ChatRoomChat:Emote:burns 2 locks off Drone.' &&
				every.otherLocked === 0,
			every,
		);
		check(
			'!burnall on yourself burns every item but the fireproof one (clothes and body stay), saves, emotes, says what it spared',
			every.selfAll ===
				'remove ItemArms|refresh|update|sync|ChatRoomChat:Emote:sets everything they are tied up in on fire and lets it all burn away.' &&
				every.selfLeft === 'Gag,Shirt,Body' &&
				/🧯 1 fireproof left alone/.test(every.selfToast),
			every,
		);
		check(
			'!burn leaves your own fireproof item on; with 🧯 off, !burnall burns it too',
			/fireproof/.test(every.burnFp) && every.burnFpLeft === 3 && every.offLeft === 'Shirt,Body',
			every,
		);
		check(
			'!owner shows the hidden commands to the owner (never sent); for anyone else it is an ordinary line',
			/hidden commands/.test(every.ownerCard) &&
				/!burnlocks/.test(every.ownerCard) &&
				/!burnall/.test(every.ownerCard) &&
				every.ownerSaw === 0 &&
				every.otherSaw === 1 &&
				every.otherBox === '!owner' &&
				every.otherToast === '',
			every,
		);
		// 🕘 Outfit history: a look that holds is saved, newest first; Restore puts it back, unlocked unless 🔒 is on.
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			/** @type {any} */ (window).SlimeCheat.forget('outfits', 255659);
			w.ServerAppearanceBundle = (/** @type {any[]} */ app) =>
				app.map((i) => ({ Group: i.Asset.Group.Name, Name: i.Asset.Name, Property: i.lock ? { LockedBy: 'MetalPadlock' } : {} }));
			w.ServerBundledItemToAppearanceItem = (/** @type {string} */ _, /** @type {any} */ b) => ({
				Asset: { Name: b.Name, Description: b.Name, Group: { Name: b.Group, Description: b.Group, Category: 'Item', AllowNone: true } },
				Property: { ...b.Property },
			});
			w.ValidationDeleteLock = (/** @type {any} */ p) => delete p.LockedBy;
			w.ServerPlayerAppearanceSync = () => w.calls.push('sync');
			// Earlier checks leave their own stand-ins behind.
			w.InventoryGetLock = (/** @type {any} */ i) => (i.lock ? { Asset: { Name: 'MetalPadlock' } } : null);
			w.CharacterRefresh = () => w.calls.push('refresh');
			w.ChatRoomCharacterUpdate = () => w.calls.push('room');
			w.Player.Appearance = [
				{
					Asset: {
						Name: 'Chains',
						Description: 'Chains',
						Group: { Name: 'ItemArms', Description: 'Arms', Category: 'Item', AllowNone: true },
					},
					lock: true,
				},
			];
		});
		await page.waitForFunction(() => /** @type {any} */ (window).SlimeCheat.history('outfits', 255659).length === 1);
		await page.evaluate(() => {
			/** @type {any} */ (window).Player.Appearance = [
				{
					Asset: { Name: 'Rope', Description: 'Rope', Group: { Name: 'ItemLegs', Description: 'Legs', Category: 'Item', AllowNone: true } },
				},
			];
		});
		await page.waitForFunction(() => /** @type {any} */ (window).SlimeCheat.history('outfits', 255659).length === 2);
		await new Promise((done) => setTimeout(done, 300));
		const history = await inPanel((h) => [...h.shadowRoot.getElementById('sc-outfit').options].map((o) => o.textContent));
		const pickOutfit = (/** @type {string} */ name) =>
			inPanel((h, n) => {
				const s = h.shadowRoot.getElementById('sc-outfit');
				s.selectedIndex = [...s.options].findIndex((o) => o.textContent.includes(n));
			}, name);
		await pickOutfit('Chains');
		await page.evaluate(() => {
			/** @type {any} */ (window).calls = [];
		});
		await (await el('restore')).click();
		const lookOf = () =>
			page.evaluate(() =>
				/** @type {any} */ (window).Player.Appearance.map(
					(/** @type {any} */ i) => `${i.Asset.Name}${i.Property?.LockedBy ? '🔒' : ''}`,
				).join(','),
			);
		const unlocked = { look: await lookOf(), calls: await page.evaluate(() => /** @type {any} */ (window).calls.join(',')) };
		const said = await text('restored');
		await (await el('outfitlocks')).click();
		await pickOutfit('Chains');
		await (await el('restore')).click();
		const locked = { look: await lookOf(), kept: await page.evaluate(() => localStorage.getItem('slimecheat.outfitLocks')) };
		await (await el('outfitlocks')).click();
		check(
			'🕘 Outfit history saves each look newest first; Restore puts an older one back unlocked, or with its locks when 🔒 is on (remembered)',
			history.length === 2 &&
				/1 item: Rope/.test(history[0]) &&
				/1 item, 1 🔒: Chains/.test(history[1]) &&
				unlocked.look === 'Chains' &&
				unlocked.calls === 'refresh,room,sync' &&
				/restored, unlocked/.test(said) &&
				locked.look === 'Chains🔒' &&
				locked.kept === '1',
			{ history, unlocked, said, locked },
		);
		// 🕘 Parts of a look: 👗 Clothes ticks only the clothes, so the shirt comes back and the rope you wear now stays.
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			/** @type {Record<string, any>} */
			const groups = {
				Cloth: { Category: 'Appearance', AllowNone: true },
				ItemArms: { Category: 'Item', AllowNone: true },
				ItemLegs: { Category: 'Item', AllowNone: true },
				ItemMouth: { Category: 'Item', AllowNone: true },
				HairFront: { Category: 'Appearance', AllowNone: false },
			};
			w.scItem = (/** @type {string} */ name, /** @type {string} */ g, /** @type {any} */ extra = {}) => ({
				Asset: { Name: name, Description: name, Group: { Name: g, Description: g, ...groups[g] } },
				...extra,
			});
			w.ServerAppearanceBundle = (/** @type {any[]} */ app) =>
				app.map((i) => ({
					Group: i.Asset.Group.Name,
					Name: i.Asset.Name,
					Property: { ...(i.lock && { LockedBy: 'MetalPadlock' }), ...i.Property },
				}));
			w.ServerBundledItemToAppearanceItem = (/** @type {string} */ _, /** @type {any} */ b) => ({
				...w.scItem(b.Name, b.Group),
				Property: { ...b.Property },
			});
			w.Player.Appearance = [w.scItem('Shirt', 'Cloth'), w.scItem('Chains', 'ItemArms'), w.scItem('Short', 'HairFront')];
		});
		await page.waitForFunction(() => /** @type {any} */ (window.SlimeCheat.history('outfits', 255659)[0]?.look || '').includes('Shirt'));
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			w.Player.Appearance = [w.scItem('Dress', 'Cloth'), w.scItem('Rope', 'ItemLegs'), w.scItem('Long', 'HairFront')];
		});
		await page.waitForFunction(() => /** @type {any} */ (window.SlimeCheat.history('outfits', 255659)[0]?.look || '').includes('Dress'));
		await new Promise((done) => setTimeout(done, 300));
		await inPanel((h) => {
			const sel = h.shadowRoot.getElementById('sc-outfit');
			sel.selectedIndex = [...sel.options].findIndex((o) => o.textContent.includes('Chains'));
			sel.dispatchEvent(new Event('change'));
		});
		const partsAll = await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-outfitparts label')].map((l) => l.textContent.trim()));
		const strip = {
			clothes: await text('stripclothestext'),
			items: await text('stripitemstext'),
			on: await inPanel(
				(h) => h.shadowRoot.getElementById('sc-stripclothes').checked && h.shadowRoot.getElementById('sc-stripitems').checked,
			),
		};
		// ✂ restraints off: the rope worn now stays.
		await (await el('stripitems')).click();
		strip.saved = await page.evaluate(() => localStorage.getItem('slimecheat.outfitStrip'));
		await (await el('pickclothes')).click();
		const ticked = await inPanel((h) =>
			[...h.shadowRoot.querySelectorAll('#sc-outfitparts input')].filter((i) => i.checked).map((i) => i.parentElement.textContent.trim()),
		);
		await (await el('restore')).click();
		const partial = {
			look: await page.evaluate(() => /** @type {any} */ (window).Player.Appearance.map((/** @type {any} */ i) => i.Asset.Name).join(',')),
			said: await text('restored'),
		};
		check(
			'🕘 A look lists its items and the body; ✂ switches (on, remembered) say what they would take off; 👗 Clothes with ✂ restraints off keeps the rope on',
			partsAll.length === 3 &&
				/👗 Shirt/.test(partsAll[0]) &&
				/⛓ Chains/.test(partsAll[1]) &&
				/Body as it was/.test(partsAll[2]) &&
				strip.on &&
				/clothes the look didn't have \(nothing now\)/.test(strip.clothes) &&
				/restraints the look didn't have: Rope/.test(strip.items) &&
				strip.saved === '{"clothes":true,"items":false}' &&
				ticked.length === 1 &&
				/Shirt/.test(ticked[0]) &&
				partial.look === 'Rope,Long,Shirt' &&
				/1 part of the look/.test(partial.said),
			{ partsAll, strip, ticked, partial },
		);
		// ✂ restraints on again: restoring the clothes now also takes the rope off.
		await (await el('stripitems')).click();
		await (await el('pickclothes')).click();
		await (await el('restore')).click();
		const stripped = {
			look: await page.evaluate(() => /** @type {any} */ (window).Player.Appearance.map((/** @type {any} */ i) => i.Asset.Name).join(',')),
			said: await text('restored'),
		};
		check(
			'✂ With the restraints switch on, the rope worn now but not in the look comes off, and the notice says so',
			stripped.look === 'Long,Shirt' && /1 thing taken off/.test(stripped.said),
			stripped,
		);
		// 🧾 Wear history: what comes off someone else is noted with its lock; !restore puts the last thing from the
		// selected slot back on them (lock included); !restorelist opens the hidden page on them, where each thing goes
		// back with its lock or without.
		const worn = await page.evaluate(async () => {
			const w = /** @type {any} */ (window);
			const wait = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms));
			const until = async (/** @type {() => boolean} */ ok) => {
				for (let i = 0; i < 60 && !ok(); i++) {
					await wait(50);
				}
			};
			/** @type {any} */ (window).SlimeCheat.forget('worn', 777);
			w.calls = [];
			w.Drone = {
				MemberNumber: 777,
				Name: 'Drone',
				AssetFamily: 'Female3DCG',
				IsPlayer: () => false,
				Appearance: [
					w.scItem('Cuffs', 'ItemArms', { Property: { LockedBy: 'MetalPadlock', LockMemberNumber: 255659 } }),
					w.scItem('Gag', 'ItemMouth'),
				],
			};
			Object.assign(w, {
				ChatRoomCharacter: [w.Player, w.Drone],
				CurrentScreen: 'ChatRoom',
				ServerPlayerIsInChatRoom: () => true,
				ServerChatRoomGetAllowItem: () => true,
				CharacterGetCurrent: () => w.Drone,
				CharacterNickname: (/** @type {any} */ C) => C.Name || 'Me',
				CharacterRefresh: () => w.calls.push('refresh'),
				ChatRoomCharacterItemUpdate: (/** @type {any} */ _, /** @type {string} */ g) => w.calls.push(`item ${g}`),
				ServerSend: (/** @type {string} */ _, /** @type {any} */ d) => w.calls.push(`${d.Type}:${d.Content}`),
			});
			const list = () => /** @type {any} */ (window).SlimeCheat.history('worn', 777);
			await wait(400);
			w.Drone.Appearance = [w.scItem('Gag', 'ItemMouth')];
			await until(() => list().length === 1);
			/** @type {any} */
			const r = {
				noted: list()
					.map((/** @type {any} */ e) => `${e.name}${e.locked ? '🔒' : ''}`)
					.join(','),
			};
			const box = document.createElement('textarea');
			box.id = 'sb-text';
			document.body.append(box);
			const type = (/** @type {string} */ line) => {
				box.value = line;
				box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			};
			w.Drone.FocusGroup = { Name: 'ItemArms' };
			type('!restore');
			r.back = w.Drone.Appearance.map((/** @type {any} */ i) => `${i.Asset.Name}${i.Property?.LockedBy ? '🔒' : ''}`).join(',');
			r.calls = w.calls.splice(0).join('|');
			r.toast = document.getElementById('bc-fire-toast')?.textContent || '';
			r.box = box.value;
			await wait(400);
			w.Drone.Appearance = w.Drone.Appearance.filter((/** @type {any} */ i) => i.Asset.Group.Name !== 'ItemMouth');
			await until(() => list().length === 2);
			w.Drone.FocusGroup = null;
			type('!restorelist');
			await wait(200);
			r.opened = w.opened;
			box.remove();
			return r;
		});
		const wearPage = {
			shown: await visible('wear'),
			head: await text('wearhead'),
			rows: await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-wearlist .sc-worn b')].map((b) => b.textContent)),
			unlockedButtons: await inPanel((h) => h.shadowRoot.querySelectorAll('#sc-wearlist .sc-worn .sb-pill').length),
		};
		await inPanel((h) => /** @type {HTMLElement} */ (h.shadowRoot.querySelector('#sc-wearlist .sc-worn .sb-go')).click());
		const gagBack = {
			look: await page.evaluate(() => /** @type {any} */ (window).Drone.Appearance.map((/** @type {any} */ i) => i.Asset.Name).join(',')),
			said: await text('weardone'),
		};
		check(
			'🧾 What comes off someone is noted with its lock; !restore puts it back on them locked and updates that slot, silently',
			worn.noted === 'Cuffs🔒' &&
				worn.back === 'Gag,Cuffs🔒' &&
				worn.calls === 'refresh|item ItemArms' &&
				/Cuffs is back on Drone, locked/.test(worn.toast) &&
				worn.box === '',
			worn,
		);
		check(
			'🧾 !restorelist opens the hidden wear page on the open player, newest first; Restore puts an item back on them',
			worn.opened === 'slimecheat' &&
				wearPage.shown &&
				/came off Drone/.test(wearPage.head) &&
				wearPage.rows.join(',') === 'Gag,🔒 Cuffs' &&
				wearPage.unlockedButtons === 1 &&
				gagBack.look === 'Cuffs,Gag' &&
				/Gag is back on Drone/.test(gagBack.said),
			{ worn, wearPage, gagBack },
		);
		// 🧾 Body parts: a new hairstyle is noted (an expression change is not); Restore ticked puts several back at once,
		// with one emote, and the hair goes back to how it was.
		const multi = await page.evaluate(async () => {
			const w = /** @type {any} */ (window);
			const wait = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms));
			const until = async (/** @type {() => boolean} */ ok) => {
				for (let i = 0; i < 60 && !ok(); i++) {
					await wait(50);
				}
			};
			const list = () => /** @type {any} */ (window).SlimeCheat.history('worn', 777);
			const before = list().length;
			w.Drone.Appearance = [...w.Drone.Appearance, w.scItem('Short', 'HairFront')];
			await wait(400);
			// A new expression: not a change of hairstyle, so nothing is noted.
			w.Drone.Appearance.find((/** @type {any} */ i) => i.Asset.Group.Name === 'HairFront').Property = { Expression: 'Angry' };
			await wait(400);
			const afterExpression = list().length;
			w.Drone.Appearance = [
				...w.Drone.Appearance.filter((/** @type {any} */ i) => !['HairFront', 'ItemArms'].includes(i.Asset.Group.Name)),
				w.scItem('Long', 'HairFront'),
			];
			await until(() => list().length === afterExpression + 1);
			return {
				before,
				afterExpression,
				outfit: list()[0].name,
				noted: (list()[0].items || []).map((/** @type {any} */ e) => `${e.name}${e.body ? '💇' : ''}${e.changed ? '~' : ''}`).sort(),
			};
		});
		await tab('Cheats');
		await page.evaluate(() => /** @type {any} */ (window).SlimeBeep.api.openPanel('slimecheat'));
		await inPanel((h) => /** @type {HTMLElement} */ (h.shadowRoot.getElementById('sc-mywear')).click());
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			w.CharacterGetCurrent = () => w.Drone;
			const box = document.createElement('textarea');
			box.id = 'sb-text';
			document.body.append(box);
			box.value = '!restorelist';
			box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			box.remove();
		});
		await new Promise((done) => setTimeout(done, 200));
		const multiRows = await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-wearlist .sc-worn b')].map((b) => b.textContent));
		// ▸ opens the outfit change into its pieces, each with its own Restore.
		await inPanel((h) => /** @type {HTMLElement} */ (h.shadowRoot.querySelector('#sc-wearlist .sc-worn .sb-pill')).click());
		const opened = await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-wearlist .sc-worn b')].map((b) => b.textContent));
		await page.evaluate(() => {
			/** @type {any} */ (window).calls = [];
		});
		await inPanel((h) => {
			for (const t of [...h.shadowRoot.querySelectorAll('#sc-wearlist .sc-weartick')].slice(0, 1)) {
				/** @type {HTMLInputElement} */ (t).checked = true;
			}
			/** @type {HTMLElement} */ (h.shadowRoot.getElementById('sc-wearticked')).click();
		});
		const multiBack = {
			look: await page.evaluate(() =>
				/** @type {any} */ (window).Drone.Appearance.map((/** @type {any} */ i) => i.Asset.Name)
					.sort()
					.join(','),
			),
			emotes: await page.evaluate(() => /** @type {any} */ (window).calls.filter((/** @type {string} */ c) => c.startsWith('Emote:'))),
			said: await text('weardone'),
		};
		check(
			'🧾 Body parts are noted when their style changes (never for an expression); a change of several is one outfit change line, ▸ shows its pieces, Restore ticked puts it all back silently',
			multi.afterExpression === multi.before &&
				multi.outfit === 'Outfit change' &&
				multi.noted.join(',') === 'Cuffs,Short💇~' &&
				/Outfit change: 2 pieces 🔒/.test(multiRows[0]) &&
				multiRows.length === 3 &&
				/💇 Short/.test(opened.join('|')) &&
				opened.length === 5 &&
				multiBack.look === 'Cuffs,Gag,Short' &&
				multiBack.emotes.length === 0 &&
				/are back on Drone/.test(multiBack.said),
			{ multi, multiRows, opened, multiBack },
		);
		// 🔒 !restorelock: the owner's lock from cuffs that were burnt goes on the new cuffs as it was (whose it is,
		// password), silently. !locklist shows it; !addlock puts a new lock from the game's list on another slot.
		const lockTools = await page.evaluate(async () => {
			const w = /** @type {any} */ (window);
			const wait = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms));
			const until = async (/** @type {() => boolean} */ ok) => {
				for (let i = 0; i < 60 && !ok(); i++) {
					await wait(50);
				}
			};
			const list = () => /** @type {any} */ (window).SlimeCheat.history('worn', 777);
			w.InventoryDoesItemAllowLock = () => true;
			w.AssetLocks = {
				MetalPadlock: { Name: 'MetalPadlock', Description: 'Metal Padlock' },
				OwnerPadlock: { Name: 'OwnerPadlock', Description: 'Owner Padlock', OwnerOnly: true },
			};
			w.InventoryLock = (/** @type {any} */ C, /** @type {any} */ item, /** @type {string} */ lock, /** @type {number} */ by) => {
				item.Property = { ...item.Property, LockedBy: lock, LockMemberNumber: by, Effect: [...(item.Property?.Effect || []), 'Lock'] };
			};
			const owner = { LockedBy: 'OwnerPadlock', LockMemberNumber: 4321, LockMemberName: 'Mistress', Password: 'PET' };
			w.Drone.Appearance = [w.scItem('Cuffs', 'ItemArms', { Property: { ...owner } }), w.scItem('Gag', 'ItemMouth')];
			await wait(400);
			const n0 = list().length;
			w.Drone.Appearance = [w.scItem('Gag', 'ItemMouth')];
			await until(() => list().length === n0 + 1);
			w.Drone.Appearance = [w.scItem('Gag', 'ItemMouth'), w.scItem('Chains', 'ItemArms')];
			const box = document.createElement('textarea');
			box.id = 'sb-text';
			document.body.append(box);
			const type = (/** @type {string} */ line) => {
				box.value = line;
				box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			};
			w.calls = [];
			w.Drone.FocusGroup = { Name: 'ItemArms' };
			type('!restorelock');
			const chains = w.Drone.Appearance.find((/** @type {any} */ i) => i.Asset.Name === 'Chains');
			/** @type {any} */
			const r = {
				lock: { ...chains.Property },
				calls: w.calls.splice(0).join('|'),
				toast: document.getElementById('bc-fire-toast')?.textContent || '',
			};
			type('!locklist');
			await wait(200);
			box.remove();
			return r;
		});
		const lockList = {
			shown: await visible('locks'),
			head: await text('lockshead'),
			rows: await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-lockslist .sc-worn b')].map((b) => b.textContent)),
		};
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			w.Drone.FocusGroup = { Name: 'ItemMouth' };
			const box = document.createElement('textarea');
			box.id = 'sb-text';
			document.body.append(box);
			box.value = '!addlock';
			box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			box.remove();
			w.calls = [];
		});
		await new Promise((done) => setTimeout(done, 200));
		const addList = await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-lockslist .sc-worn b')].map((b) => b.textContent));
		await inPanel((h) => {
			const rows = [...h.shadowRoot.querySelectorAll('#sc-lockslist .sc-worn')];
			const metal = rows.find((row) => /Metal Padlock/.test(row.textContent || ''));
			/** @type {HTMLElement} */ (metal && metal.querySelector('.sb-go'))?.click();
		});
		const lockAdded = await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			const gag = w.Drone.Appearance.find((/** @type {any} */ i) => i.Asset.Name === 'Gag');
			return {
				lock: gag.Property?.LockedBy,
				by: gag.Property?.LockMemberNumber,
				emotes: w.calls.filter((/** @type {string} */ c) => c.startsWith('Emote:')),
			};
		});
		const addSaid = await text('locksdone');
		check(
			'🔒 !restorelock puts the burnt cuffs’ owner lock (owner, password) on the new cuffs, silently, with a notice; !locklist lists it',
			lockTools.lock.LockedBy === 'OwnerPadlock' &&
				lockTools.lock.LockMemberNumber === 4321 &&
				lockTools.lock.LockMemberName === 'Mistress' &&
				lockTools.lock.Password === 'PET' &&
				lockTools.lock.Effect.includes('Lock') &&
				lockTools.calls === 'refresh|item ItemArms' &&
				/Owner Padlock \(Mistress\) is on Drone's Chains/.test(lockTools.toast) &&
				lockList.shown &&
				/past locks: Drone's Chains/.test(lockList.head) &&
				lockList.rows[0] === 'Owner Padlock (Mistress)',
			{ lockTools, lockList },
		);
		check(
			'🔒 !addlock lists every lock the game knows (mods too) and puts the picked one on the selected slot, set by you',
			addList.join(',') === 'Metal Padlock,Owner Padlock' &&
				lockAdded.lock === 'MetalPadlock' &&
				lockAdded.by === 255659 &&
				lockAdded.emotes.join('|') === "Emote:locks Drone's Gag with a Metal Padlock." &&
				/Metal Padlock is on Drone's Gag/.test(addSaid),
			{ addList, lockAdded, addSaid },
		);
		// 🔁 !keepon: the locked cuffs go back on by themselves, lock included, with a notice and nothing said in the
		// room; !keepon again lets go. 👗 !restoreoutfit brings their previous look back, silently.
		const keep = await page.evaluate(async () => {
			const w = /** @type {any} */ (window);
			const wait = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms));
			const until = async (/** @type {() => boolean} */ ok) => {
				for (let i = 0; i < 60 && !ok(); i++) {
					await wait(50);
				}
			};
			const box = document.createElement('textarea');
			box.id = 'sb-text';
			document.body.append(box);
			const type = (/** @type {string} */ line) => {
				box.value = line;
				box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			};
			const arms = () => w.Drone.Appearance.find((/** @type {any} */ i) => i.Asset.Group.Name === 'ItemArms');
			w.Drone.FocusGroup = { Name: 'ItemArms' };
			type('!keepon');
			/** @type {any} */
			const r = { kept: Object.keys(JSON.parse(localStorage.getItem('slimecheat.keepon') || '{}')[777] || {}).join(',') };
			w.calls = [];
			w.Drone.Appearance = w.Drone.Appearance.filter((/** @type {any} */ i) => i.Asset.Group.Name !== 'ItemArms');
			await until(() => !!arms());
			r.back = arms() ? `${arms().Asset.Name}:${arms().Property?.LockedBy}:${arms().Property?.LockMemberNumber}` : '';
			r.emotes = w.calls.filter((/** @type {string} */ c) => c.startsWith('Emote:')).length;
			r.toast = document.getElementById('bc-fire-toast')?.textContent || '';
			type('!keepon');
			r.freed = document.getElementById('bc-fire-toast')?.textContent || '';
			r.left = Object.keys(JSON.parse(localStorage.getItem('slimecheat.keepon') || '{}')[777] || {}).length;
			// 👗 A look that holds, then a rope added: !restoreoutfit takes it back to the look before.
			w.Drone.Appearance = [w.scItem('Gag', 'ItemMouth')];
			await wait(400);
			w.Drone.Appearance = [w.scItem('Gag', 'ItemMouth'), w.scItem('Rope', 'ItemLegs')];
			await wait(400);
			w.calls = [];
			w.Drone.FocusGroup = null;
			type('!restoreoutfit');
			r.outfit = w.Drone.Appearance.map((/** @type {any} */ i) => i.Asset.Name).join(',');
			r.outfitEmotes = w.calls.filter((/** @type {string} */ c) => c.startsWith('Emote:')).length;
			r.outfitToast = document.getElementById('bc-fire-toast')?.textContent || '';
			// Your own crafted item keeps its whole craft in the wear history (the game shares only part of it).
			w.Player.Appearance = [
				...w.Player.Appearance,
				w.scItem('Rope', 'ItemLegs', { Craft: { Name: 'Pet rope', MemberName: 'Sam', Property: 'Secure', Lock: 'MetalPadlock' } }),
			];
			await wait(400);
			w.Player.Appearance = w.Player.Appearance.filter((/** @type {any} */ i) => i.Asset.Group.Name !== 'ItemLegs');
			const mine = () => /** @type {any} */ (window).SlimeCheat.history('worn', 255659);
			await until(() => mine().some((/** @type {any} */ e) => e.name === 'Pet rope'));
			const rope = mine().find((/** @type {any} */ e) => e.name === 'Pet rope');
			r.craft = rope ? JSON.parse(rope.bundle).Craft : null;
			// 💻 !hackpanel: every hidden command as a button.
			w.Drone.FocusGroup = { Name: 'ItemArms' };
			type('!hackpanel');
			await wait(200);
			box.remove();
			return r;
		});
		const hack = {
			shown: await visible('hack'),
			on: await text('hackon'),
			buttons: await inPanel((h) => [...h.shadowRoot.querySelectorAll('#sc-hacklist button')].map((b) => b.title)),
		};
		check(
			'🔁 !keepon puts the locked item back by itself (lock and owner kept), silently with a notice; !keepon again lets go',
			keep.kept === 'ItemArms' &&
				keep.back === 'Chains:OwnerPadlock:4321' &&
				keep.emotes === 0 &&
				/^🔁/.test(keep.toast) &&
				/free again/.test(keep.freed) &&
				keep.left === 0,
			keep,
		);
		check(
			'👗 !restoreoutfit brings back the open player’s previous look, silently; your own crafts keep their whole craft',
			keep.outfit === 'Gag' &&
				keep.outfitEmotes === 0 &&
				/look from .* is back, locks included/.test(keep.outfitToast) &&
				keep.craft?.Property === 'Secure',
			keep,
		);
		check(
			'💻 !hackpanel opens a page with every hidden command as a button, on the player open in the game',
			hack.shown &&
				/On Drone · ItemArms/.test(hack.on) &&
				hack.buttons.length === 15 &&
				['!burn', '!restorelock', '!addlock', '!keepon', '!listoutfit'].every((c) => hack.buttons.includes(c)),
			hack,
		);
		await page.evaluate(() => {
			delete (/** @type {any} */ (window).ChatRoomCharacter);
		});
		await tab('Cheats');
		// 🧯 in ⚙ Settings: off by default, remembered, and the lock burner leaves your fireproof item's lock alone.
		await page.evaluate(() => localStorage.removeItem('slimecheat.fireproof'));
		await tab('⚙');
		const fpOff = await inPanel((h) => h.shadowRoot.getElementById('sc-fireproof').checked);
		await (await el('fireproof')).click();
		await page.evaluate(() => {
			/** @type {any} */ (window).Player.Appearance = [
				{
					Asset: { Name: 'Gag', Description: 'Gag', Group: { Name: 'ItemMouth', Description: 'Mouth', Category: 'Item' } },
					lock: true,
					Craft: { Description: 'FIREPROOF' },
				},
			];
		});
		await tab('Cheats');
		await (await el('parts')).click();
		const fpMark = await inPanel((h) => h.shadowRoot.getElementById('sc-part').options[0].textContent);
		await (await el('unlock')).click();
		const fp = {
			off: fpOff,
			saved: await page.evaluate(() => localStorage.getItem('slimecheat.fireproof')),
			mark: fpMark,
			said: await text('burnt'),
			stillLocked: await page.evaluate(() => /** @type {any} */ (window).Player.Appearance[0].lock),
		};
		check(
			'⚙ Settings › 🧯 is off by default; on, it is remembered and the lock burner marks and spares your fireproof item',
			!fp.off && fp.saved === '1' && /^🧯 Mouth/.test(fp.mark) && /fireproof/.test(fp.said) && fp.stillLocked === true,
			fp,
		);
		await page.evaluate(() => localStorage.removeItem('slimecheat.fireproof'));
		// A game function that throws: the error shows in SlimeCheat and nothing breaks.
		await page.evaluate(() => {
			/** @type {any} */ (window).InventoryUnlock = () => {
				throw new Error('boom');
			};
			/** @type {any} */ (window).Player.Appearance[0].lockAsset = { Name: 'MetalPadlock', Description: 'Metal Padlock' };
		});
		await (await el('parts')).click();
		await (await el('burnall')).click();
		check(
			'a cheat that fails shows its error in the panel instead of breaking the game',
			/⚠ boom/.test(await text('err')),
			await text('err'),
		);
		// The game without the functions a cheat needs: it says so.
		await page.evaluate(() => {
			delete (/** @type {any} */ (window).InventoryRemove);
		});
		await (await el('remove')).click();
		check(
			'a missing game function turns that cheat off with a note',
			/The game changed \(InventoryRemove/.test(await text('err')),
			await text('err'),
		);
		await tab('Songs');

		// Without SlimeBeep: a note says SlimeCheat needs it, with links to SlimeBeep and FUSAM.
		const lone = await browser.newPage();
		const cdp2 = await lone.createCDPSession();
		await cdp2.send('Fetch.enable', { patterns: [{ urlPattern: `${GAME}/*` }] });
		cdp2.on('Fetch.requestPaused', ({ requestId }) =>
			cdp2.send('Fetch.fulfillRequest', {
				requestId,
				responseCode: 200,
				responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
				body: Buffer.from('<!DOCTYPE html><title>BC</title><body></body>').toString('base64'),
			}),
		);
		await lone.goto(`${GAME}/R133/BondageClub/`);
		await lone.evaluate(() => {
			/** @type {any} */ (window).SlimeCheatWait = 300;
		});
		await lone.addScriptTag({ content: script });
		await lone.waitForSelector('#sc-need', { timeout: 5000 });
		const need = await lone.$eval('#sc-need', (n) => ({ text: n.textContent, links: [...n.querySelectorAll('a')].map((a) => a.href) }));
		check(
			'without SlimeBeep, a note says SlimeCheat needs it, with SlimeBeep and FUSAM links',
			/needs SlimeBeep/.test(need.text) &&
				need.links.includes('https://proudkiller0015.github.io/slimebeep/install.html') &&
				need.links.includes('https://sidiousious.gitlab.io/bc-addon-loader/'),
			need,
		);
		// SlimeBeep turning up late (after the note): SlimeCheat still plugs in, and the note goes.
		const late = await lone.evaluate(async () => {
			let got = null;
			/** @type {any} */ (window).SlimeBeep = {
				api: {
					addPanel(/** @type {any} */ p) {
						got = p.id;
						return { open() {}, remove() {} };
					},
					proveIdentity: async () => null,
				},
			};
			await new Promise((r) => setTimeout(r, 1500));
			return { got, note: !!document.getElementById('sc-need') };
		});
		check('SlimeBeep loading late still gets the panel, and the note goes away', late.got === 'slimecheat' && !late.note, late);
		await lone.close();
		// An m4a named .mp3 (what downloaders often make): uploaded as the m4a it is under a .mp3 link (the game only saves .mp3/.mp4), and it plays.
		await tab('Songs');
		check('an m4a named .mp3 uploads', !(await pick(files.fakeMp3)), await text('err'));
		const m4aLink = await inPanel((h) => h.shadowRoot.getElementById('sc-link').value);
		const m4aPlay = await page
			.evaluate(async (url) => {
				const a = new Audio(url);
				await a.play();
				await new Promise((resolve, reject) => {
					a.ontimeupdate = () => a.currentTime > 0.3 && resolve(null);
					a.onerror = () => reject(new Error(`audio error ${a.error && a.error.code}`));
					setTimeout(() => reject(new Error('no playback')), 10000);
				});
				a.pause();
				return { t: a.currentTime, d: a.duration };
			}, m4aLink)
			.catch((e) => ({ err: String(e) }));
		check('...its link ends in .mp3 and plays on the game page', m4aLink.endsWith('.mp3') && m4aPlay.t > 0.3 && m4aPlay.d > 20, {
			m4aLink,
			m4aPlay,
		});
		// Void dice: the line Oculus Nihili posts after a roll, to a chosen total or with chosen faces.
		await tab('Dice');
		await page.evaluate(() => {
			const w = /** @type {any} */ (window);
			w.voidSent = [];
			w.CurrentScreen = 'ChatRoom';
			w.ServerSend = (/** @type {string} */ m, /** @type {any} */ d) => w.voidSent.push({ m, ...d });
		});
		const vset = (/** @type {string} */ id, /** @type {string} */ v) =>
			inPanel(
				(h, [i, x]) => {
					const e = /** @type {HTMLInputElement} */ (h.shadowRoot.getElementById(`sc-${i}`));
					e.value = x;
					e.dispatchEvent(new Event('input'));
				},
				[id, v],
			);
		const vdie = (/** @type {number} */ n) =>
			inPanel((h, x) => /** @type {HTMLElement} */ (h.shadowRoot.querySelector(`#sc-vdice [data-vdie="${x}"]`)).click(), n);
		const vpost = async () => {
			await inPanel((h) => {
				h.shadowRoot.getElementById('sc-err').textContent = '';
				/** @type {HTMLElement} */ (h.shadowRoot.getElementById('sc-vroll')).click();
			});
			return page.evaluate(() => /** @type {any} */ (window).voidSent.pop() || null);
		};
		const vreset = async () => {
			await (await el('vclear')).click();
			await vset('vmod', '0');
			await vset('vtotal', '');
			await vset('vfaces', '');
		};
		/** @type {string[]} */
		const voidLines = [];
		await vdie(20);
		await vdie(6);
		await vdie(6);
		await vset('vmod', '3');
		check('Void dice: the dice picked show as Oculus Nihili names them', (await text('vpool')) === 'd20+2d6+3', await text('vpool'));
		await vset('vtotal', '27');
		let rigged = true;
		for (let i = 0; i < 12; i++) {
			const sent = await vpost();
			const m = sent && /^rolls the Void dice: d20\+2d6\+3: (\d+) \+ (\d+) \+ (\d+) \+ 3 = 27$/.exec(sent.Content);
			const [a, b, c] = m ? m.slice(1).map(Number) : [0, 0, 0];
			if (!m || sent.Type !== 'Emote' || sent.m !== 'ChatRoomChat' || a > 20 || b > 6 || c > 6 || a + b + c !== 24) {
				rigged = false;
			}
			if (sent) {
				voidLines.push(sent.Content);
			}
		}
		check('a chosen total posts faces that fit each die and add up to it, as an emote', rigged, voidLines.slice(-3));
		await vset('vtotal', '');
		await vset('vfaces', '14,4,6');
		const exact = await vpost();
		check(
			'chosen faces post exactly',
			!!exact && exact.Content === 'rolls the Void dice: d20+2d6+3: 14 + 4 + 6 + 3 = 27',
			exact && exact.Content,
		);
		if (exact) {
			voidLines.push(exact.Content);
		}
		await vset('vfaces', '21,4,6');
		check('a face that doesn’t fit its die is refused', !(await vpost()) && /Face 1 is a d20/.test(await text('err')), await text('err'));
		await vset('vfaces', '');
		await vset('vtotal', '36');
		check('a total out of reach is refused', !(await vpost()) && /from 6 to 35/.test(await text('err')), await text('err'));
		await vreset();
		for (const d of [6, 4, 6]) {
			await vdie(d);
		}
		await vset('vmod', '-2');
		await vset('vtotal', '3');
		const mixed = await vpost();
		const mm = mixed && /^rolls the Void dice: 2d6\+d4-2: (\d) \+ (\d) \+ (\d) - 2 = 3$/.exec(mixed.Content);
		check(
			'dice picked in any order are grouped as Oculus Nihili writes them, faces in that order',
			!!mm && Number(mm[1]) + Number(mm[2]) + Number(mm[3]) === 5 && Number(mm[3]) <= 4,
			mixed && mixed.Content,
		);
		if (mixed) {
			voidLines.push(mixed.Content);
		}
		await vreset();
		await vdie(6);
		await vset('vtotal', '6');
		const one = await vpost();
		check('one die without a modifier reads "d6: 6"', !!one && one.Content === 'rolls the Void dice: d6: 6', one && one.Content);
		if (one) {
			voidLines.push(one.Content);
		}
		await vreset();
		await vdie(100);
		await vset('vmod', '-99');
		const fair = await vpost();
		check(
			'left open it rolls fairly; d% is a d100',
			!!fair && /^rolls the Void dice: d100-99: \d+ - 99 = -?\d+$/.test(fair.Content),
			fair && fair.Content,
		);
		if (fair) {
			voidLines.push(fair.Content);
		}
		await vreset();
		for (let i = 0; i < 11; i++) {
			await vdie(4);
		}
		check(
			'Oculus Nihili’s limit of 10 dice holds',
			(await text('vpool')) === '10d4' && /10 dice at most/.test(await text('err')),
			await text('vpool'),
		);
		await vset('vmod', '100');
		check('and its modifier limit', !(await vpost()) && /-99 to \+99/.test(await text('err')), await text('err'));
		await vreset();
		await vdie(8);
		await page.evaluate(() => /** @type {any} */ (window.CurrentScreen = 'MainHall'));
		check('outside a chat room nothing is posted', !(await vpost()) && /Join a chat room/.test(await text('err')));
		await vreset();
		if (process.env.VOID_LINES_OUT) {
			fs.writeFileSync(process.env.VOID_LINES_OUT, JSON.stringify(voidLines));
		}
		check('every upload signed in with a SlimeBeep proof', (await page.evaluate(() => /** @type {any} */ (window).proofs)) > 5);
		check('no page errors', errors.length === 0, errors);
	} finally {
		await browser.close();
	}
}

(async () => {
	try {
		pics = await makePictures();
		makeM4a();
		await workerChecks();
		await proofChecks();
		await imageChecks();
		await browserChecks();
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
	console.log(failed ? `${failed} FAILED` : 'All checks passed');
	process.exitCode = failed ? 1 : 0;
})();
