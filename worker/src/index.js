/**
 * SlimeCheat uploads: players upload mp3 songs in parts (R2 multipart) and room background images in one
 * request, and anyone can load them back from this Worker. It never fetches other sites; it only writes to
 * and reads from its bucket.
 *
 * Who is uploading comes from a SlimeBeep proof (any player; the first proof for a member number pins its
 * SlimeBeep key) or the upload key (the owner). Each player sees and deletes only their own files; the
 * owners (OWNERS) keep files 5 days and can list and delete everyone's. Other players' files last
 * OTHER_LIFE, count toward OTHER_CAP each, and are the first to go when the bucket is full.
 *
 * POST   /upload                       { name, size } -> { key, uploadId, partSize }   (key needed)
 * PUT    /upload/<key>/<part>?uploadId  the part's bytes -> { etag }                   (key needed)
 * POST   /upload/<key>/done?uploadId    { parts } -> { url }                            (key needed)
 * DELETE /upload/<key>?uploadId         cancels an upload                               (key needed)
 * PUT    /upload/image?name             the image's bytes -> { url }                    (key needed)
 * GET    /upload/files                  -> { files (newest first), used, cap }           (key needed)
 * DELETE /upload/files/<key>            deletes a song or an image                      (key needed)
 * GET    /<key>                         the file, with Range support, for everyone
 *
 * The bucket stays under CAP_BYTES by deleting the oldest files first, songs and images alike. Files and
 * unfinished uploads are also cleared by the bucket's lifecycle rules (lifecycle.json).
 */

const MB = 1024 * 1024;
/** Size of every part but the last. */
const PART = 50 * MB;
/** Largest song accepted. */
const MAX_SONG = 500 * MB;
/** Largest image accepted. */
const MAX_IMAGE = 25 * MB;
/** How long a started upload counts toward the bucket's size (the lifecycle rule aborts it after a day). */
const UPLOAD_LIFE = 24 * 60 * 60 * 1000;
/** How long a file is kept (the lifecycle rule in lifecycle.json deletes it then). */
const FILE_LIFE = 5 * UPLOAD_LIFE;
/** How long another player's file is kept. */
const OTHER_LIFE = 12 * 60 * 60 * 1000;
/** Most bytes one other player may have stored at once (files and unfinished uploads). */
const OTHER_CAP = 1000 * MB;
/** File keys: random hex and the extension of the file's real type. */
const KEY_RE = /^[0-9a-f]{32}\.(mp3|jpg|png|webp)$/;
/** Image names the game takes as a room background (ChatAdminRoomCustomizationImageFormats). */
const IMAGE_NAME = /\.(jpe?g|png|webp)$/i;
/** The served type of each image extension. */
const IMAGE_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
/** Where unfinished uploads note their size, so they count toward the cap. */
const PENDING = 'pending/';
/** Pages allowed to call the upload endpoints: the game and its mirrors. */
const ORIGINS = [
	/^https?:\/\/([a-z0-9-]+\.)*bondageprojects\.elementfx\.com$/,
	/^https?:\/\/([a-z0-9-]+\.)*bondageprojects\.com$/,
	/^https?:\/\/([a-z0-9-]+\.)*bondage-?europe\.com$/,
	/^https?:\/\/([a-z0-9-]+\.)*bondage-asia\.com$/,
];
/** Headers on every file response: anyone may read files from any page, and draw images on a canvas. */
const FILE_CORS = {
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
 * The real type of an image from its first 12 bytes: 'jpg', 'png', 'webp', or '' for anything else.
 * @param {Uint8Array} b
 * @returns {'' | 'jpg' | 'png' | 'webp'}
 */
function imageType(b) {
	const text = String.fromCharCode(...b);
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
		return 'jpg';
	}
	if (text.startsWith('\x89PNG')) {
		return 'png';
	}
	return text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP' ? 'webp' : '';
}

/** Random hex for a new file's key. */
function randomName() {
	return [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
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

/** Who SlimeBeep proofs must be made for (SlimeBeep.api.proveIdentity). */
const AUDIENCE = 'slimecheat';
/** How old a SlimeBeep proof may be. */
const PROOF_LIFE = 5 * 60 * 1000;
/** Where the SlimeBeep key each owner signed in with first is kept (never listed as a file, never served). */
const AUTH = '_auth/';
/** base64url */
const B64URL = /^[A-Za-z0-9_-]{1,200}$/;

/**
 * Verifies an ECDSA P-256 / SHA-256 signature (base64url, raw r|s) of `text` by public key `pub` (JWK x, y).
 * @param {{ x: string, y: string }} pub
 * @param {string} sig
 * @param {string} text
 */
async function verify(pub, sig, text) {
	try {
		const key = await crypto.subtle.importKey(
			'jwk',
			{ kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y },
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify'],
		);
		const raw = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
		return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, new TextEncoder().encode(text));
	} catch (e) {
		return false;
	}
}

/**
 * The player a fresh SlimeBeep proof (`Authorization: SlimeBeep <base64 JSON>`) is from, or null. The first
 * proof for a member number pins that SlimeBeep key; later ones must use it, or a new key the pinned one
 * handed over to (the proof's `rk`), which then becomes the pinned key.
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<{ n: number, name: string } | null>}
 */
async function slimeBeepProof(request, env) {
	const head = request.headers.get('Authorization') || '';
	if (!head.startsWith('SlimeBeep ')) {
		return null;
	}
	/** @type {any} */
	let p;
	try {
		p = JSON.parse(atob(head.slice(10)));
	} catch (e) {
		return null;
	}
	const n = p && p.memberNumber;
	if (!Number.isInteger(n) || n < 1 || typeof p.time !== 'number' || Math.abs(Date.now() - p.time) > PROOF_LIFE) {
		return null;
	}
	const pub = p.pub || {};
	if (!B64URL.test(pub.x || '') || !B64URL.test(pub.y || '') || !B64URL.test(p.sig || '')) {
		return null;
	}
	if (!(await verify(pub, p.sig, `slimebeep-proof|${AUDIENCE}|${n}|${p.time}`))) {
		return null;
	}
	const who = { n, name: typeof p.name === 'string' ? cleanName(p.name).slice(0, 40) : '' };
	const pinFile = `${AUTH}${n}.json`;
	const pinned = await env.SONGS.get(pinFile);
	/** @type {{ x: string, y: string } | null} */
	const known = pinned ? await pinned.json().catch(() => null) : null;
	// The pin is rewritten once a day, so the bucket's 5-day lifecycle rule never takes it.
	if (known && known.x === pub.x && known.y === pub.y) {
		if (pinned && Date.now() - pinned.uploaded.getTime() > 864e5) {
			await env.SONGS.put(pinFile, JSON.stringify(known));
		}
		return who;
	}
	const rk = p.rk || {};
	const handedOver =
		!!known &&
		rk.x === known.x &&
		rk.y === known.y &&
		B64URL.test(rk.sig || '') &&
		(await verify(known, rk.sig, `rekey|${n}|${pub.x}|${pub.y}`));
	if (known && !handedOver) {
		return null;
	}
	await env.SONGS.put(pinFile, JSON.stringify({ x: pub.x, y: pub.y }));
	return who;
}

/**
 * The member numbers in OWNERS.
 * @param {Env} env
 */
function owners(env) {
	return String(env.OWNERS || '')
		.split(',')
		.map((x) => Number(x.trim()))
		.filter((x) => Number.isInteger(x) && x > 0);
}

/**
 * Who is calling: a SlimeBeep proof's player, or the first owner for the upload key (compared in constant
 * time); null for nobody.
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Who | null>}
 */
async function authorised(request, env) {
	const proof = await slimeBeepProof(request, env);
	if (proof) {
		return { ...proof, admin: owners(env).includes(proof.n) };
	}
	const first = owners(env)[0];
	if (!env.UPLOAD_KEY || !first) {
		return null;
	}
	const given = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
	const enc = new TextEncoder();
	const [a, b] = await Promise.all([given, env.UPLOAD_KEY].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
	return crypto.subtle.timingSafeEqual(a, b) ? { n: first, name: '', admin: true } : null;
}

/**
 * Who uploaded a file or an unfinished upload (files from before players had their own belong to the first owner).
 * @param {Env} env
 * @param {R2Object} o
 */
function ownerOf(env, o) {
	return Number(o.customMetadata?.by) || owners(env)[0] || 0;
}

/**
 * When a file stops being served: 5 days for the owners' files, OTHER_LIFE for everyone else's.
 * @param {Env} env
 * @param {R2Object} o
 */
function expiry(env, o) {
	return o.uploaded.getTime() + (owners(env).includes(ownerOf(env, o)) ? FILE_LIFE : OTHER_LIFE);
}

/**
 * What the bucket holds: its files (songs and images), oldest first, and the bytes promised to
 * unfinished uploads (by their declared size). Uploads older than a day are aborted on the way.
 * @param {Env} env
 * @returns {Promise<{ files: R2Object[], pending: number, pendingBy: Record<number, number> }>}
 */
async function scan(env) {
	/** @type {R2Object[]} */
	const files = [];
	let pending = 0;
	/** @type {Record<number, number>} */
	const pendingBy = {};
	/** @type {string | undefined} */
	let cursor;
	do {
		const page = await env.SONGS.list({ cursor, include: ['customMetadata'] });
		for (const o of page.objects) {
			if (o.key.startsWith(AUTH)) {
				continue;
			}
			if (!o.key.startsWith(PENDING)) {
				if (expiry(env, o) > Date.now()) {
					files.push(o);
				} else {
					await env.SONGS.delete(o.key);
				}
			} else if (Date.now() - o.uploaded.getTime() < UPLOAD_LIFE) {
				const size = Number(o.customMetadata?.size) || 0;
				pending += size;
				pendingBy[ownerOf(env, o)] = (pendingBy[ownerOf(env, o)] || 0) + size;
			} else {
				await cancel(env, o.key.slice(PENDING.length), o.customMetadata?.uploadId || '');
			}
		}
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	files.sort((x, y) => x.uploaded.getTime() - y.uploaded.getTime());
	return { files, pending, pendingBy };
}

/**
 * Makes room for `need` more bytes under the cap by deleting files: other players' first, then the owners',
 * oldest first within each, songs and images alike.
 * @param {Env} env
 * @param {number} need
 * @param {string} [keep] a file that must stay (the one just uploaded)
 * @returns {Promise<boolean>} whether it fits (it doesn't when unfinished uploads alone fill the cap)
 */
async function makeRoom(env, need, keep) {
	const { files, pending } = await scan(env);
	const cap = Number(env.CAP_BYTES);
	const mine = (/** @type {R2Object} */ o) => (owners(env).includes(ownerOf(env, o)) ? 1 : 0);
	const others = files.filter((o) => o.key !== keep).sort((x, y) => mine(x) - mine(y));
	let total = need + pending + files.reduce((sum, o) => sum + o.size, 0);
	if (total - others.reduce((sum, o) => sum + o.size, 0) > cap) {
		return false;
	}
	for (const file of others) {
		if (total <= cap) {
			break;
		}
		await env.SONGS.delete(file.key);
		total -= file.size;
	}
	return true;
}

/**
 * Whether another player still has room for `need` more bytes under OTHER_CAP (the owners always do).
 * @param {Env} env
 * @param {Who} who
 * @param {number} need
 */
async function hasQuota(env, who, need) {
	if (who.admin) {
		return true;
	}
	const { files, pendingBy } = await scan(env);
	const used = (pendingBy[who.n] || 0) + files.filter((o) => ownerOf(env, o) === who.n).reduce((sum, o) => sum + o.size, 0);
	return used + need <= OTHER_CAP;
}

/** The answer when another player's quota is full. */
const QUOTA_FULL = `You can keep at most ${OTHER_CAP / MB} MB of uploads at a time. Delete some in My files, or wait: they go after ${OTHER_LIFE / 3600000} hours.`;

/**
 * Your songs and images, newest first, with the storage used. The owners can ask for everyone's (?all=1):
 * each file then says whose it is.
 * @param {Request} request
 * @param {Env} env
 * @param {Record<string, string>} cors
 * @param {Who} who
 */
async function listFiles(request, env, cors, who) {
	const { files, pending, pendingBy } = await scan(env);
	const url = new URL(request.url);
	const all = who.admin && url.searchParams.get('all') === '1';
	const shown = all ? files : files.filter((o) => ownerOf(env, o) === who.n);
	const used = who.admin
		? pending + files.reduce((sum, o) => sum + o.size, 0)
		: (pendingBy[who.n] || 0) + shown.reduce((sum, o) => sum + o.size, 0);
	return json(
		{
			files: shown.reverse().map((o) => ({
				url: `${url.origin}/${o.key}`,
				name: o.customMetadata?.name || o.key,
				kind: o.key.endsWith('.mp3') ? 'song' : 'image',
				size: o.size,
				uploaded: o.uploaded.getTime(),
				expires: expiry(env, o),
				...(all ? { by: ownerOf(env, o), byName: o.customMetadata?.byName || '' } : {}),
			})),
			used,
			cap: who.admin ? Number(env.CAP_BYTES) : OTHER_CAP,
			admin: who.admin,
			me: who.n,
		},
		200,
		cors,
	);
}

/**
 * Who a file or upload belongs to, as stored metadata.
 * @param {Who} who
 */
function byMeta(who) {
	return { by: String(who.n), byName: who.name };
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
			.slice(0, 120) || 'file'
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
async function start(request, env, cors, who) {
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
	if (!(await hasQuota(env, who, size))) {
		return json({ error: QUOTA_FULL }, 413, cors);
	}
	if (!(await makeRoom(env, size))) {
		return json({ error: 'Other uploads in progress fill the storage. Try again once they finish.' }, 507, cors);
	}
	const key = `${randomName()}.mp3`;
	const multipart = await env.SONGS.createMultipartUpload(key, {
		httpMetadata: { contentType: 'audio/mpeg' },
		customMetadata: { name: cleanName(body.name), ...byMeta(who) },
	});
	await env.SONGS.put(PENDING + key, null, { customMetadata: { size: String(size), uploadId: multipart.uploadId, ...byMeta(who) } });
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
 * Takes an image in one request: a name the game accepts, at most 25 MB, and bytes that really are a
 * JPEG, PNG or WEBP. The link ends in the extension of the real type, whatever the name said.
 * @param {Request} request
 * @param {Env} env
 * @param {Record<string, string>} cors
 * @param {string} name
 */
async function putImage(request, env, cors, name, who) {
	const size = Number(request.headers.get('Content-Length'));
	if (!IMAGE_NAME.test(name)) {
		return json({ error: 'Only .jpg, .jpeg, .png and .webp images can be uploaded.' }, 415, cors);
	}
	if (!Number.isInteger(size) || size < 1 || !request.body) {
		return json({ error: 'The file is empty.' }, 400, cors);
	}
	if (size > MAX_IMAGE) {
		return json({ error: 'Images can be at most 25 MB.' }, 413, cors);
	}
	const bytes = await request.arrayBuffer();
	const type = imageType(new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength)));
	if (!type) {
		return json({ error: 'This file is not a real JPEG, PNG or WEBP image.' }, 415, cors);
	}
	if (bytes.byteLength !== size) {
		return json({ error: 'The upload did not arrive whole. Try again.' }, 400, cors);
	}
	if (!(await hasQuota(env, who, size))) {
		return json({ error: QUOTA_FULL }, 413, cors);
	}
	if (!(await makeRoom(env, size))) {
		return json({ error: 'Other uploads in progress fill the storage. Try again once they finish.' }, 507, cors);
	}
	const key = `${randomName()}.${type}`;
	await env.SONGS.put(key, bytes, {
		httpMetadata: { contentType: IMAGE_TYPES[type] },
		customMetadata: { name: cleanName(name), ...byMeta(who) },
	});
	// Uploads that ran side by side may together pass the cap.
	await makeRoom(env, 0, key);
	return json({ url: `${new URL(request.url).origin}/${key}` }, 200, cors);
}

/**
 * Serves a song or an image: whole, or the byte range asked for.
 * @param {Request} request
 * @param {Env} env
 * @param {string} key
 */
async function serve(request, env, key) {
	const head = request.method === 'HEAD';
	let file;
	try {
		file = head ? await env.SONGS.head(key) : await env.SONGS.get(key, { range: request.headers, onlyIf: request.headers });
	} catch (e) {
		return new Response('Range Not Satisfiable', { status: 416, headers: FILE_CORS });
	}
	if (!file || expiry(env, file) <= Date.now()) {
		return new Response('Not found', { status: 404, headers: FILE_CORS });
	}
	const headers = new Headers(FILE_CORS);
	file.writeHttpMetadata(headers);
	headers.set('ETag', file.httpEtag);
	headers.set('Accept-Ranges', 'bytes');
	headers.set('Cache-Control', 'public, max-age=86400');
	headers.set('X-Content-Type-Options', 'nosniff');
	if (!('body' in file)) {
		headers.set('Content-Length', String(file.size));
		return new Response(null, { status: head ? 200 : 304, headers });
	}
	const range = /** @type {{ offset: number, length: number } | undefined} */ (file.range);
	if (range && request.headers.has('Range')) {
		headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${file.size}`);
		return new Response(file.body, { status: 206, headers });
	}
	return new Response(file.body, { headers });
}

/**
 * Routes an authorised upload request.
 * @param {Request} request
 * @param {Env} env
 * @param {Record<string, string>} cors
 * @param {string[]} path
 * @param {URLSearchParams} query
 * @param {Who} who
 */
async function upload(request, env, cors, path, query, who) {
	const [, key = '', part = ''] = path;
	const uploadId = query.get('uploadId') || '';
	if (path.length === 1 && request.method === 'POST') {
		return start(request, env, cors, who);
	}
	if (key === 'image' && path.length === 2 && request.method === 'PUT') {
		return putImage(request, env, cors, query.get('name') || '', who);
	}
	if (key === 'files' && path.length === 2 && request.method === 'GET') {
		return listFiles(request, env, cors, who);
	}
	if (key === 'files' && path.length === 3 && KEY_RE.test(part) && request.method === 'DELETE') {
		const file = await env.SONGS.head(part);
		if (file && !who.admin && ownerOf(env, file) !== who.n) {
			return json({ error: 'That file is not yours.' }, 403, cors);
		}
		await env.SONGS.delete(part);
		return json({ ok: true }, 200, cors);
	}
	if (!KEY_RE.test(key) || !key.endsWith('.mp3') || !uploadId) {
		return json({ error: 'Not found' }, 404, cors);
	}
	// An upload in progress is only touched by whoever started it.
	const started = await env.SONGS.head(PENDING + key);
	if (started && ownerOf(env, started) !== who.n) {
		return json({ error: 'This upload is not yours.' }, 403, cors);
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
 * @property {string} [OWNERS] the owners' member numbers, comma separated: files kept 5 days, see everyone's
 * @property {string} CAP_BYTES most bytes the bucket may hold; the oldest files make way for new ones
 */

/**
 * Who is calling.
 * @typedef {object} Who
 * @property {number} n member number
 * @property {string} name their name, as their SlimeCheat said (may be empty)
 * @property {boolean} admin one of the OWNERS
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
				return new Response(null, { status: 204, headers: { ...FILE_CORS, 'Access-Control-Max-Age': '86400' } });
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
		const who = await authorised(request, env);
		if (!who) {
			return json({ error: 'Not signed in: open Bondage Club with SlimeBeep, or set the upload key.' }, 401, cors);
		}
		try {
			return await upload(request, env, cors, path, url.searchParams, who);
		} catch (e) {
			return json({ error: 'The upload failed on the server. Try again.' }, 500, cors);
		}
	},
};
