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
		'lifecycle.json: one rule for the whole bucket, songs deleted after 5 days, unfinished uploads aborted after 1',
		life.length === 1 &&
			life[0].enabled &&
			Object.keys(life[0].conditions).length === 0 &&
			life[0].deleteObjectsTransition.condition.type === 'Age' &&
			life[0].deleteObjectsTransition.condition.maxAge === 5 * 86400 &&
			life[0].abortMultipartUploadsTransition.condition.maxAge === 86400,
	);
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
	check('an image over 25 MB: 413', tooBig === 413, tooBig);
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
		gif: path.join(tmp, 'anim.gif'),
		fakePng: path.join(tmp, 'fake.png'),
		hugePng: path.join(tmp, 'huge.png'),
		png: path.join(tmp, 'room background.png'),
	};
	fs.writeFileSync(files.gif, Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'));
	fs.writeFileSync(files.fakePng, mp3(2000));
	fs.writeFileSync(files.png, pics.png);
	fs.writeFileSync(files.hugePng, padded(pics.png, 25 * MB + 1));
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
		check('...and shows the Songs tab with Upload song', (await visible('pick')) && (await text('pick')) === 'Upload song');
		const tabs = await inPanel((h) => [...h.shadowRoot.querySelectorAll('.tab')].map((t) => t.textContent).join(' | '));
		check(
			'the tabs are Songs | Images | My files, and the title says Room uploads',
			tabs === 'Songs | Images | My files' && /Room uploads/.test(await inPanel((h) => h.shadowRoot.querySelector('.head b').textContent)),
			tabs,
		);

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

		const tab = (/** @type {string} */ name) =>
			page.evaluate(
				(n) => [...document.getElementById('su-host').shadowRoot.querySelectorAll('.tab')].find((t) => t.textContent === n).click(),
				name,
			);
		await tab('Images');
		const accept = await inPanel((h) => h.shadowRoot.getElementById('file').accept);
		check(
			'the Images tab: Upload image, jpg/png/webp up to 25 MB, the old song link hidden',
			(await text('pick')) === 'Upload image' &&
				/jpg, png or webp, up to 25 MB/.test(await text('limits')) &&
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
		check('an image over 25 MB is refused', /at most 25 MB/.test(await pick(files.hugePng)), await text('err'));
		check('room background.png uploads', !(await pick(files.png)), await text('err'));
		const imgLink = await inPanel((h) => h.shadowRoot.getElementById('link').value);
		check('the image link shows and ends in .png', new RegExp(`^${BASE}/[0-9a-f]{32}\\.png$`).test(imgLink), imgLink);
		check('...and says it lasts 5 days', /lasts 5 days/.test(await inPanel((h) => h.shadowRoot.getElementById('done').textContent)));
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
		check('back on Songs: Upload song again', (await text('pick')) === 'Upload song');

		await tab('My files');
		await page.waitForFunction(() => document.getElementById('su-host').shadowRoot.querySelectorAll('.file').length > 0);
		const rows = () =>
			inPanel((h) =>
				[...h.shadowRoot.querySelectorAll('.file')].map((r) => ({
					name: r.querySelector('b').textContent,
					info: r.querySelector('.hint').textContent,
					thumb: r.querySelector('img') ? r.querySelector('img').src : '',
				})),
			);
		await page.waitForFunction(() => {
			const img = document.getElementById('su-host').shadowRoot.querySelector('.file img');
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
		check('My files shows the storage used', /^Used [\d.]+ MB of 400\.0 MB$/.test(await text('used')), await text('used'));
		await inPanel((h) => h.shadowRoot.querySelectorAll('.file .go')[1].click());
		check("a song row's Copy link copies its link", (await page.evaluate(() => navigator.clipboard.readText())) === link);
		await inPanel((h) => h.shadowRoot.querySelector('.file .go').click());
		check("the image row's Copy link copies its link", (await page.evaluate(() => navigator.clipboard.readText())) === imgLink);
		const delBtn = (/** @type {number} */ i) => inPanel((h, n) => h.shadowRoot.querySelectorAll('.file .pill')[n].textContent, i);
		const delClick = (/** @type {number} */ i) => inPanel((h, n) => h.shadowRoot.querySelectorAll('.file .pill')[n].click(), i);
		await delClick(0);
		check(
			'Delete asks "Sure?" first and keeps the image',
			(await delBtn(0)) === 'Sure?' && (await rows()).length === shown.length && (await fetch(imgLink)).status === 200,
		);
		await delClick(0);
		await page.waitForFunction(
			(n) => document.getElementById('su-host').shadowRoot.querySelectorAll('.file').length === n - 1,
			{},
			shown.length,
		);
		check('a second click deletes the image', (await rows())[0].name === 'my song.mp3' && (await fetch(imgLink)).status === 404);
		await delClick(0);
		await delClick(0);
		await page.waitForFunction(
			(n) => document.getElementById('su-host').shadowRoot.querySelectorAll('.file').length === n - 2,
			{},
			shown.length,
		);
		check('a song deletes the same way', (await rows())[0].name === 'mid.mp3' && (await fetch(link)).status === 404);
		await (await el('refresh')).click();
		await page.waitForFunction(() => /^Used/.test(document.getElementById('su-host').shadowRoot.getElementById('used').textContent));
		check('refresh reloads the list', (await rows()).length === shown.length - 2);
		check('no page errors', errors.length === 0, errors);
	} finally {
		await browser.close();
	}
}

(async () => {
	try {
		pics = await makePictures();
		await workerChecks();
		await imageChecks();
		await browserChecks();
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
	console.log(failed ? `${failed} FAILED` : 'All checks passed');
	process.exitCode = failed ? 1 : 0;
})();
