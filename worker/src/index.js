/**
 * Song upload: the owner uploads mp3 files in parts (R2 multipart) with the upload key, and anyone can
 * play them back from this Worker. It never fetches other sites; it only writes to and reads from its bucket.
 *
 * POST   /upload                       { name, size } -> { key, uploadId, partSize }   (key needed)
 * PUT    /upload/<key>/<part>?uploadId  the part's bytes -> { etag }                   (key needed)
 * POST   /upload/<key>/done?uploadId    { parts } -> { url }                            (key needed)
 * DELETE /upload/<key>?uploadId         cancels an upload                               (key needed)
 * GET    /upload/songs                  -> { songs (newest first), used, cap }           (key needed)
 * DELETE /upload/songs/<key>            deletes a song                                  (key needed)
 * GET    /<key>                         the song, with Range support, for everyone
 *
 * The bucket stays under CAP_BYTES by deleting the oldest songs first. Songs and unfinished uploads are
 * also cleared by the bucket's lifecycle rules (lifecycle.json).
 */

const MB = 1024 * 1024;
/** Size of every part but the last. */
const PART = 50 * MB;
/** Largest song accepted. */
const MAX_SONG = 500 * MB;
/** How long a started upload counts toward the bucket's size (the lifecycle rule aborts it after a day). */
const UPLOAD_LIFE = 24 * 60 * 60 * 1000;
/** How long a song is kept (the lifecycle rule in lifecycle.json deletes it then). */
const SONG_LIFE = 5 * UPLOAD_LIFE;
/** Song keys: random hex, always ending in .mp3. */
const KEY_RE = /^[0-9a-f]{32}\.mp3$/;
/** Where unfinished uploads note their size, so they count toward the cap. */
const PENDING = 'pending/';
/** Pages allowed to call the upload endpoints: the game and its mirrors. */
const ORIGINS = [
	/^https?:\/\/([a-z0-9-]+\.)*bondageprojects\.elementfx\.com$/,
	/^https?:\/\/([a-z0-9-]+\.)*bondageprojects\.com$/,
	/^https?:\/\/([a-z0-9-]+\.)*bondage-?europe\.com$/,
	/^https?:\/\/([a-z0-9-]+\.)*bondage-asia\.com$/,
];
/** Headers on every song response: anyone may read songs, from any page. */
const SONG_CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
	'Access-Control-Allow-Headers': 'Range',
	'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
};

/**
 * Whether bytes start like an mp3: an ID3 tag or an MPEG audio Layer III frame header.
 * @param {Uint8Array} b
 */
function isMp3(b) {
	if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
		return true;
	}
	return b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 3) & 3) !== 1 && ((b[1] >> 1) & 3) === 1;
}

/**
 * A JSON answer.
 * @param {unknown} body
 * @param {number} status
 * @param {Record<string, string>} cors
 */
function json(body, status, cors) {
	return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/**
 * Whether the request carries the upload key (compared in constant time).
 * @param {Request} request
 * @param {{ UPLOAD_KEY?: string }} env
 */
async function authorised(request, env) {
	if (!env.UPLOAD_KEY) {
		return false;
	}
	const given = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
	const enc = new TextEncoder();
	const [a, b] = await Promise.all([given, env.UPLOAD_KEY].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
	return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * What the bucket holds: its songs, and the bytes promised to unfinished uploads (by their declared
 * size). Uploads older than a day are aborted on the way.
 * @param {Env} env
 * @returns {Promise<{ songs: R2Object[], pending: number }>}
 */
async function scan(env) {
	/** @type {R2Object[]} */
	const songs = [];
	let pending = 0;
	/** @type {string | undefined} */
	let cursor;
	do {
		const page = await env.SONGS.list({ cursor, include: ['customMetadata'] });
		for (const o of page.objects) {
			if (!o.key.startsWith(PENDING)) {
				songs.push(o);
			} else if (Date.now() - o.uploaded.getTime() < UPLOAD_LIFE) {
				pending += Number(o.customMetadata?.size) || 0;
			} else {
				await cancel(env, o.key.slice(PENDING.length), o.customMetadata?.uploadId || '');
			}
		}
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	songs.sort((x, y) => x.uploaded.getTime() - y.uploaded.getTime());
	return { songs, pending };
}

/**
 * Makes room for `need` more bytes under the cap by deleting the oldest songs first.
 * @param {Env} env
 * @param {number} need
 * @param {string} [keep] a song that must stay (the one just uploaded)
 * @returns {Promise<boolean>} whether it fits (it doesn't when unfinished uploads alone fill the cap)
 */
async function makeRoom(env, need, keep) {
	const { songs, pending } = await scan(env);
	const cap = Number(env.CAP_BYTES);
	const others = songs.filter((o) => o.key !== keep);
	let total = need + pending + songs.reduce((sum, o) => sum + o.size, 0);
	if (total - others.reduce((sum, o) => sum + o.size, 0) > cap) {
		return false;
	}
	for (const song of others) {
		if (total <= cap) {
			break;
		}
		await env.SONGS.delete(song.key);
		total -= song.size;
	}
	return true;
}

/**
 * The owner's songs, newest first, with the storage used.
 * @param {Request} request
 * @param {Env} env
 * @param {Record<string, string>} cors
 */
async function listSongs(request, env, cors) {
	const { songs, pending } = await scan(env);
	const origin = new URL(request.url).origin;
	return json(
		{
			songs: songs.reverse().map((o) => ({
				url: `${origin}/${o.key}`,
				name: o.customMetadata?.name || o.key,
				size: o.size,
				uploaded: o.uploaded.getTime(),
				expires: o.uploaded.getTime() + SONG_LIFE,
			})),
			used: pending + songs.reduce((sum, o) => sum + o.size, 0),
			cap: Number(env.CAP_BYTES),
		},
		200,
		cors,
	);
}

/**
 * A file name fit to keep as metadata: plain printable ASCII only, at most 120 characters.
 * Accents come off their letters (é becomes e); anything else outside ASCII (Chinese,
 * emoji, control characters) is dropped, and the spaces left behind are squeezed.
 * @param {string} name
 */
function cleanName(name) {
	return (
		name
			.normalize('NFKD')
			.replace(/[^\x20-\x7e]/g, '')
			.replace(/ {2,}/g, ' ')
			.trim()
			.slice(0, 120) || 'song.mp3'
	);
}

/**
 * The size of part `n` of a song of `size` bytes, or 0 if there is no such part.
 * @param {number} size
 * @param {number} n
 */
function partLength(size, n) {
	const parts = Math.ceil(size / PART);
	if (!Number.isInteger(n) || n < 1 || n > parts) {
		return 0;
	}
	return n < parts ? PART : size - (parts - 1) * PART;
}

/**
 * Starts an upload after checking the name, the size and the room left in the bucket.
 * @param {Request} request
 * @param {Env} env
 * @param {Record<string, string>} cors
 */
async function start(request, env, cors) {
	/** @type {{ name?: unknown, size?: unknown }} */
	const body = await request.json().catch(() => ({}));
	const size = Number(body.size);
	if (typeof body.name !== 'string' || !/\.mp3$/i.test(body.name)) {
		return json({ error: 'Only .mp3 files can be uploaded.' }, 415, cors);
	}
	if (!Number.isInteger(size) || size < 1) {
		return json({ error: 'The file is empty.' }, 400, cors);
	}
	if (size > MAX_SONG) {
		return json({ error: 'Songs can be at most 500 MB.' }, 413, cors);
	}
	if (!(await makeRoom(env, size))) {
		return json({ error: 'Other uploads in progress fill the song storage. Try again once they finish.' }, 507, cors);
	}
	const key = `${[...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('')}.mp3`;
	const multipart = await env.SONGS.createMultipartUpload(key, {
		httpMetadata: { contentType: 'audio/mpeg' },
		customMetadata: { name: cleanName(body.name) },
	});
	await env.SONGS.put(PENDING + key, null, { customMetadata: { size: String(size), uploadId: multipart.uploadId } });
	return json({ key, uploadId: multipart.uploadId, partSize: PART }, 200, cors);
}

/**
 * Cancels an upload and forgets its size.
 * @param {Env} env
 * @param {string} key
 * @param {string} uploadId
 */
async function cancel(env, key, uploadId) {
	try {
		await env.SONGS.resumeMultipartUpload(key, uploadId).abort();
	} catch (e) {
		// Already finished, aborted or expired.
	}
	await env.SONGS.delete(PENDING + key);
}

/**
 * Takes one part. Every part must be exactly as long as the declared size allows, so the parts can
 * never add up to more than it; the first must start like an mp3. A wrong part cancels the upload.
 * @param {Request} request
 * @param {Env} env
 * @param {Record<string, string>} cors
 * @param {string} key
 * @param {string} uploadId
 * @param {number} n
 */
async function putPart(request, env, cors, key, uploadId, n) {
	const pending = await env.SONGS.head(PENDING + key);
	if (!pending) {
		return json({ error: 'This upload has ended. Start it again.' }, 404, cors);
	}
	const want = partLength(Number(pending.customMetadata?.size), n);
	if (!want || Number(request.headers.get('Content-Length')) !== want || !request.body) {
		await cancel(env, key, uploadId);
		return json({ error: 'The upload sent more or less than the file size it declared.' }, 400, cors);
	}
	/** @type {ReadableStream | ArrayBuffer} */
	let bytes = request.body;
	if (n === 1) {
		bytes = await request.arrayBuffer();
		if (!isMp3(new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength)))) {
			await cancel(env, key, uploadId);
			return json({ error: 'This file is not an mp3. Only mp3 files can be uploaded.' }, 415, cors);
		}
	}
	const part = await env.SONGS.resumeMultipartUpload(key, uploadId).uploadPart(n, bytes);
	return json({ etag: part.etag }, 200, cors);
}

/**
 * Finishes an upload and answers with the song's link.
 * @param {Request} request
 * @param {Env} env
 * @param {Record<string, string>} cors
 * @param {string} key
 * @param {string} uploadId
 */
async function finish(request, env, cors, key, uploadId) {
	const pending = await env.SONGS.head(PENDING + key);
	/** @type {{ parts?: R2UploadedPart[] }} */
	const body = await request.json().catch(() => ({}));
	if (!pending || !Array.isArray(body.parts)) {
		return json({ error: 'This upload has ended. Start it again.' }, 404, cors);
	}
	const song = await env.SONGS.resumeMultipartUpload(key, uploadId).complete(body.parts);
	await env.SONGS.delete(PENDING + key);
	if (song.size !== Number(pending.customMetadata?.size)) {
		await env.SONGS.delete(key);
		return json({ error: 'The upload did not arrive whole. Try again.' }, 400, cors);
	}
	// Uploads that started side by side may together pass the cap.
	await makeRoom(env, 0, key);
	return json({ url: `${new URL(request.url).origin}/${key}` }, 200, cors);
}

/**
 * Plays a song back: whole, or the byte range asked for.
 * @param {Request} request
 * @param {Env} env
 * @param {string} key
 */
async function serve(request, env, key) {
	const head = request.method === 'HEAD';
	let song;
	try {
		song = head ? await env.SONGS.head(key) : await env.SONGS.get(key, { range: request.headers, onlyIf: request.headers });
	} catch (e) {
		return new Response('Range Not Satisfiable', { status: 416, headers: SONG_CORS });
	}
	if (!song) {
		return new Response('Not found', { status: 404, headers: SONG_CORS });
	}
	const headers = new Headers(SONG_CORS);
	song.writeHttpMetadata(headers);
	headers.set('ETag', song.httpEtag);
	headers.set('Accept-Ranges', 'bytes');
	headers.set('Cache-Control', 'public, max-age=86400');
	if (!('body' in song)) {
		headers.set('Content-Length', String(song.size));
		return new Response(null, { status: head ? 200 : 304, headers });
	}
	const range = /** @type {{ offset: number, length: number } | undefined} */ (song.range);
	if (range && request.headers.has('Range')) {
		headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${song.size}`);
		return new Response(song.body, { status: 206, headers });
	}
	return new Response(song.body, { headers });
}

/**
 * Routes an authorised upload request.
 * @param {Request} request
 * @param {Env} env
 * @param {Record<string, string>} cors
 * @param {string[]} path
 * @param {string} uploadId
 */
async function upload(request, env, cors, path, uploadId) {
	const [, key = '', part = ''] = path;
	if (path.length === 1 && request.method === 'POST') {
		return start(request, env, cors);
	}
	if (key === 'songs' && path.length === 2 && request.method === 'GET') {
		return listSongs(request, env, cors);
	}
	if (key === 'songs' && path.length === 3 && KEY_RE.test(part) && request.method === 'DELETE') {
		await env.SONGS.delete(part);
		return json({ ok: true }, 200, cors);
	}
	if (!KEY_RE.test(key) || !uploadId) {
		return json({ error: 'Not found' }, 404, cors);
	}
	if (path.length === 2 && request.method === 'DELETE') {
		await cancel(env, key, uploadId);
		return json({ ok: true }, 200, cors);
	}
	if (path.length === 3 && part === 'done' && request.method === 'POST') {
		return finish(request, env, cors, key, uploadId);
	}
	if (path.length === 3 && /^\d+$/.test(part) && request.method === 'PUT') {
		return putPart(request, env, cors, key, uploadId, Number(part));
	}
	return json({ error: 'Not found' }, 404, cors);
}

/**
 * @typedef {object} Env
 * @property {R2Bucket} SONGS
 * @property {string} [UPLOAD_KEY] the upload key (a Worker secret)
 * @property {string} CAP_BYTES most bytes the bucket may hold; the oldest songs make way for new ones
 */

export default {
	/**
	 * @param {Request} request
	 * @param {Env} env
	 */
	async fetch(request, env) {
		const url = new URL(request.url);
		const path = url.pathname.slice(1).split('/');
		if (path.length === 1 && KEY_RE.test(path[0])) {
			if (request.method === 'OPTIONS') {
				return new Response(null, { status: 204, headers: { ...SONG_CORS, 'Access-Control-Max-Age': '86400' } });
			}
			if (request.method === 'GET' || request.method === 'HEAD') {
				return serve(request, env, path[0]);
			}
		}
		if (path[0] !== 'upload') {
			return new Response('Not found', { status: 404 });
		}
		const origin = request.headers.get('Origin') || '';
		/** @type {Record<string, string>} */
		const cors = ORIGINS.some((re) => re.test(origin)) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: cors['Access-Control-Allow-Origin'] ? 204 : 403,
				headers: {
					...cors,
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
					'Access-Control-Allow-Headers': 'Authorization, Content-Type',
					'Access-Control-Max-Age': '86400',
				},
			});
		}
		if (!(await authorised(request, env))) {
			return json({ error: 'Wrong or missing upload key.' }, 401, cors);
		}
		try {
			return await upload(request, env, cors, path, url.searchParams.get('uploadId') || '');
		} catch (e) {
			return json({ error: 'The upload failed on the server. Try again.' }, 500, cors);
		}
	},
};
