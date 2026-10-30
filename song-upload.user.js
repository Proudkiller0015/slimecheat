// ==UserScript==
// @name         Song Upload
// @namespace    https://github.com/Proudkiller0015/bc-song-upload
// @version      1.0.0
// @description  Upload an mp3 to your own song storage and copy its link, for Bondage Club room music.
// @match        https://www.bondageprojects.elementfx.com/*
// @match        https://bondageprojects.elementfx.com/*
// @match        https://bondageprojects.com/*
// @match        https://www.bondageprojects.com/*
// @match        https://www.bondage-europe.com/*
// @match        http://localhost:8130/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
	'use strict';
	if (document.getElementById('su-host')) {
		return;
	}
	/** localStorage key of the settings and the button's position. */
	const KEY = 'songUpload.options';
	/** Largest song the storage takes. */
	const MAX_SONG = 500 * 1024 * 1024;
	/** Tries per part before the upload gives up. */
	const TRIES = 3;

	/** @type {{ url: string, key: string, x: number | null, y: number | null }} */
	const opts = { url: '', key: '', x: null, y: null };
	try {
		Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || '{}'));
	} catch (e) {
		/* broken settings: start fresh */
	}
	const save = () => localStorage.setItem(KEY, JSON.stringify(opts));

	const host = document.createElement('div');
	host.id = 'su-host';
	const root = host.attachShadow({ mode: 'open' });
	root.innerHTML = `<style>
		:host { all: initial; }
		* { box-sizing: border-box; font: 14px/1.35 system-ui, sans-serif; }
		#btn { position: fixed; z-index: 2147483000; width: 44px; height: 44px; border-radius: 50%; border: 2px solid #fff;
			background: linear-gradient(145deg, #ff7cc0, #c53a8a); color: #fff; font-size: 22px; cursor: grab;
			box-shadow: 0 2px 8px #0006; touch-action: none; }
		#btn:active { cursor: grabbing; }
		#panel { position: fixed; z-index: 2147483001; width: 300px; padding: 12px; border-radius: 14px; background: #fff7fb;
			color: #3a1630; box-shadow: 0 4px 18px #0007; display: none; flex-direction: column; gap: 8px; }
		#panel.on { display: flex; }
		.head { display: flex; align-items: center; gap: 6px; }
		.head b { flex: 1; font-weight: 700; }
		.round { width: 28px; height: 28px; border-radius: 50%; border: 0; background: #ffd9ec; color: #3a1630; cursor: pointer; }
		.go { padding: 7px 12px; border-radius: 999px; border: 0; background: #e2448f; color: #fff; font-weight: 700; cursor: pointer; }
		.go:disabled { opacity: .5; cursor: default; }
		.pill { padding: 7px 12px; border-radius: 999px; border: 1px solid #e2448f; background: #fff; color: #c53a8a; cursor: pointer; }
		input[type=text], input[type=password] { width: 100%; padding: 6px 8px; border-radius: 8px; border: 1px solid #e9a8c9; background: #fff; color: #3a1630; }
		label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
		.bar { height: 10px; border-radius: 5px; background: #ffd9ec; overflow: hidden; }
		.bar > div { height: 100%; width: 0; background: #e2448f; transition: width .2s; }
		.hint { font-size: 12px; color: #7a4a68; }
		.err { font-size: 13px; color: #b3002d; }
		.row { display: flex; gap: 6px; align-items: center; }
		.tabs { display: flex; gap: 4px; }
		.tab { flex: 1; padding: 5px; border-radius: 999px; border: 0; background: #ffd9ec; color: #3a1630; cursor: pointer; }
		.tab.on { background: #e2448f; color: #fff; font-weight: 700; }
		#list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
		.song { display: flex; flex-direction: column; gap: 3px; padding: 6px 8px; border-radius: 10px; background: #fff; }
		.song b { overflow-wrap: anywhere; font-weight: 600; }
		.small { padding: 3px 9px; font-size: 12px; }
		.sure { background: #b3002d; color: #fff; border-color: #b3002d; }
		[hidden] { display: none !important; }
	</style>
	<button id="btn" title="Song upload (drag to move)">♪</button>
	<div id="panel" role="dialog" aria-label="Song upload">
		<div class="head"><b>Song upload</b><button class="round" id="gear" title="Settings">⚙</button><button class="round" id="close" title="Close">✕</button></div>
		<div class="tabs" id="tabs"><button class="tab" data-view="main">Upload</button><button class="tab" data-view="songs">My songs</button></div>
		<div id="main">
			<div class="row"><button class="go" id="pick">Upload file</button><span class="hint">mp3 only, up to 500 MB</span></div>
			<input type="file" id="file" accept=".mp3,audio/mpeg" hidden>
			<div id="prog" hidden><div class="bar"><div></div></div><div class="row"><span class="hint" id="pct"></span><button class="pill" id="stop">Cancel</button></div></div>
			<div id="done" hidden><input type="text" id="link" readonly aria-label="Song link"><div class="row"><button class="go" id="copy">Copy link</button><span class="hint" id="copied"></span></div><span class="hint">The link lasts 5 days.</span></div>
		</div>
		<div id="songs" hidden>
			<div class="row"><span class="hint" id="used" style="flex:1"></span><button class="round" id="refresh" title="Refresh">↻</button></div>
			<div id="list"></div>
		</div>
		<div id="setup" hidden>
			<label>Upload address<input type="text" id="url" placeholder="https://song-upload.example.workers.dev" spellcheck="false"></label>
			<label>Upload key<input type="password" id="key" autocomplete="off"></label>
			<div class="row"><button class="go" id="savebtn">Save</button><span class="hint">Kept in this browser only.</span></div>
		</div>
		<div class="err" id="err" hidden></div>
	</div>`;
	document.body.appendChild(host);

	/**
	 * An element of the panel.
	 * @param {string} id
	 * @returns {HTMLElement}
	 */
	const $ = (id) => /** @type {HTMLElement} */ (root.getElementById(id));
	const btn = $('btn');
	const panel = $('panel');
	const fileInput = /** @type {HTMLInputElement} */ ($('file'));
	const link = /** @type {HTMLInputElement} */ ($('link'));
	/** @type {AbortController | null} The upload in progress. */
	let running = null;

	// Keys typed in the panel stay out of the game.
	for (const type of ['keydown', 'keyup', 'keypress']) {
		panel.addEventListener(type, (e) => e.stopPropagation());
	}

	/** Puts the button where it was left (bottom right at first) and the panel beside it. */
	const place = () => {
		const x = Math.min(Math.max(opts.x ?? innerWidth - 60, 0), innerWidth - 44);
		const y = Math.min(Math.max(opts.y ?? innerHeight - 120, 0), innerHeight - 44);
		btn.style.left = `${x}px`;
		btn.style.top = `${y}px`;
		panel.style.left = `${Math.max(Math.min(x - 256, innerWidth - 308), 8)}px`;
		panel.style.top = `${y > innerHeight / 2 ? Math.max(y - panel.offsetHeight - 8, 8) : y + 52}px`;
	};

	/**
	 * Shows a view of the panel: 'main' (upload), 'songs' or 'setup'.
	 * @param {'main' | 'songs' | 'setup'} name
	 */
	const view = (name) => {
		fail('');
		for (const id of ['main', 'songs', 'setup']) {
			$(id).hidden = id !== name;
		}
		$('tabs').hidden = name === 'setup';
		for (const tab of root.querySelectorAll('.tab')) {
			tab.classList.toggle('on', /** @type {HTMLElement} */ (tab).dataset.view === name);
		}
		if (name === 'setup') {
			/** @type {HTMLInputElement} */ ($('url')).value = opts.url;
			/** @type {HTMLInputElement} */ ($('key')).value = opts.key;
		} else if (name === 'songs') {
			listSongs();
		}
		place();
	};

	/**
	 * Shows a problem, or clears it.
	 * @param {string} text
	 */
	const fail = (text) => {
		$('err').textContent = text;
		$('err').hidden = !text;
		place();
	};

	/** @type {{ x: number, y: number, moved: boolean } | null} */
	let drag = null;
	btn.addEventListener('pointerdown', (e) => {
		if (e.button === 0) {
			drag = { x: e.clientX - btn.offsetLeft, y: e.clientY - btn.offsetTop, moved: false };
			btn.setPointerCapture(e.pointerId);
		}
	});
	btn.addEventListener('pointermove', (e) => {
		if (!drag) {
			return;
		}
		const x = e.clientX - drag.x;
		const y = e.clientY - drag.y;
		if (drag.moved || Math.abs(x - btn.offsetLeft) + Math.abs(y - btn.offsetTop) > 4) {
			drag.moved = true;
			opts.x = x;
			opts.y = y;
			place();
		}
	});
	btn.addEventListener('pointerup', () => {
		if (!drag) {
			return;
		}
		if (drag.moved) {
			save();
		} else {
			panel.classList.toggle('on');
			view(opts.url && opts.key ? 'main' : 'setup');
		}
		drag = null;
	});
	btn.addEventListener('lostpointercapture', () => {
		drag = null;
	});
	addEventListener('resize', place);
	$('close').addEventListener('click', () => panel.classList.remove('on'));
	$('gear').addEventListener('click', () => view($('setup').hidden ? 'setup' : 'main'));
	$('tabs').addEventListener('click', (e) => {
		const tab = /** @type {HTMLElement} */ (e.target).closest('.tab');
		if (tab instanceof HTMLElement) {
			view(tab.dataset.view === 'songs' ? 'songs' : 'main');
		}
	});
	$('refresh').addEventListener('click', () => listSongs());
	$('savebtn').addEventListener('click', () => {
		opts.url = /** @type {HTMLInputElement} */ ($('url')).value.trim().replace(/\/+$/, '');
		opts.key = /** @type {HTMLInputElement} */ ($('key')).value.trim();
		if (!/^https?:\/\/[^/]+/.test(opts.url) || !opts.key) {
			fail('Enter both the upload address (starting with https://) and the upload key.');
			return;
		}
		save();
		view('main');
	});
	$('pick').addEventListener('click', () => {
		if (!opts.url || !opts.key) {
			view('setup');
			return;
		}
		fileInput.value = '';
		fileInput.click();
	});
	fileInput.addEventListener('change', () => {
		const file = fileInput.files?.[0];
		if (file) {
			upload(file);
		}
	});
	$('stop').addEventListener('click', () => running?.abort());
	/**
	 * Puts a link on the clipboard.
	 * @param {string} text
	 */
	const copy = async (text) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch (e) {
			link.value = text;
			link.select();
			document.execCommand('copy');
		}
	};
	$('copy').addEventListener('click', async () => {
		await copy(link.value);
		$('copied').textContent = 'Copied!';
	});

	/**
	 * A size in MB, or GB from 1 GB up.
	 * @param {number} bytes
	 */
	const size = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`);

	/**
	 * How long until a song is deleted, like "deletes in 4 days" or "deletes in 3 hours".
	 * @param {number} expires
	 */
	const timeLeft = (expires) => {
		const hours = Math.max(Math.ceil((expires - Date.now()) / 3600000), 1);
		const days = Math.floor(hours / 24);
		return days >= 1 ? `deletes in ${days} day${days > 1 ? 's' : ''}` : `deletes in ${hours} hour${hours > 1 ? 's' : ''}`;
	};

	/**
	 * A new element with a class and its text.
	 * @param {string} tag
	 * @param {string} cls
	 * @param {string} [text]
	 */
	const make = (tag, cls, text = '') => {
		const el = document.createElement(tag);
		el.className = cls;
		el.textContent = text;
		return el;
	};

	/** Fills My songs from the upload address. */
	const listSongs = async () => {
		const list = $('list');
		$('used').textContent = 'Loading…';
		try {
			/** @type {{ songs: { url: string, name: string, size: number, uploaded: number, expires: number }[], used: number, cap: number }} */
			const answer = await call('GET', '/upload/songs', new AbortController().signal);
			$('used').textContent = `Used ${size(answer.used)} of ${size(answer.cap)}`;
			list.replaceChildren(
				...answer.songs.map((song) => {
					const row = make('div', 'song');
					const copyBtn = make('button', 'go small', 'Copy link');
					const del = /** @type {HTMLButtonElement} */ (make('button', 'pill small', 'Delete'));
					copyBtn.addEventListener('click', async () => {
						await copy(song.url);
						copyBtn.textContent = 'Copied!';
					});
					let sure = 0;
					del.addEventListener('click', async () => {
						if (!sure) {
							del.textContent = 'Sure?';
							del.classList.add('sure');
							sure = setTimeout(() => {
								sure = 0;
								del.textContent = 'Delete';
								del.classList.remove('sure');
							}, 4000);
							return;
						}
						clearTimeout(sure);
						del.disabled = true;
						try {
							await call('DELETE', `/upload/songs/${song.url.split('/').pop()}`, new AbortController().signal);
							listSongs();
						} catch (e) {
							fail(/** @type {Error} */ (e).message);
						}
					});
					const buttons = make('div', 'row');
					buttons.append(copyBtn, del);
					row.append(
						make('b', '', song.name),
						make('span', 'hint', `${size(song.size)} · ${new Date(song.uploaded).toLocaleString()} · ${timeLeft(song.expires)}`),
						buttons,
					);
					return row;
				}),
			);
			if (!answer.songs.length) {
				list.append(make('span', 'hint', 'No songs yet.'));
			}
		} catch (e) {
			$('used').textContent = '';
			fail(/** @type {Error} */ (e).message || "Couldn't load your songs.");
		}
		place();
	};

	/**
	 * Whether bytes start like an mp3: an ID3 tag or an MPEG audio Layer III frame header.
	 * @param {Uint8Array} b
	 */
	const isMp3 = (b) =>
		(b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
		(b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 3) & 3) !== 1 && ((b[1] >> 1) & 3) === 1);

	/**
	 * Why a file can't be uploaded, or '' if it can.
	 * @param {File} file
	 */
	const refusal = async (file) => {
		if (!/\.mp3$/i.test(file.name) || (file.type && !/^audio\/(mpeg|mp3)$/.test(file.type))) {
			return `"${file.name}" is not an mp3. Only mp3 files can be uploaded.`;
		}
		if (!file.size) {
			return 'That file is empty.';
		}
		if (file.size > MAX_SONG) {
			return `"${file.name}" is ${Math.round(file.size / 1048576)} MB; songs can be at most 500 MB.`;
		}
		if (!isMp3(new Uint8Array(await file.slice(0, 4).arrayBuffer()))) {
			return `"${file.name}" is not a real mp3 inside (only its name ends in .mp3). Only mp3 files can be uploaded.`;
		}
		return '';
	};

	/**
	 * A call to the upload address; answers its JSON or throws its error message.
	 * @param {string} method
	 * @param {string} path
	 * @param {AbortSignal} signal
	 * @param {unknown} [body]
	 */
	const call = async (method, path, signal, body) => {
		const res = await fetch(opts.url + path, {
			method,
			signal,
			headers: { Authorization: `Bearer ${opts.key}`, 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const answer = await res.json().catch(() => ({}));
		if (!res.ok) {
			throw new Error(answer.error || `The upload address answered ${res.status}.`);
		}
		return answer;
	};

	/**
	 * Sends one part with upload progress; answers its etag.
	 * @param {string} path
	 * @param {Blob} blob
	 * @param {AbortSignal} signal
	 * @param {(sent: number) => void} onSent bytes of this part sent so far
	 * @returns {Promise<string>}
	 */
	const sendPart = (path, blob, signal, onSent) =>
		new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('PUT', opts.url + path);
			xhr.setRequestHeader('Authorization', `Bearer ${opts.key}`);
			xhr.upload.onprogress = (e) => onSent(e.loaded);
			xhr.onload = () => {
				let answer = {};
				try {
					answer = JSON.parse(xhr.responseText);
				} catch (e) {
					/* not JSON: the status says enough */
				}
				if (xhr.status === 200) {
					resolve(answer.etag);
				} else {
					reject(Object.assign(new Error(answer.error || `The upload address answered ${xhr.status}.`), { final: true }));
				}
			};
			xhr.onerror = () => reject(new Error("Couldn't reach the upload address."));
			signal.addEventListener('abort', () => xhr.abort());
			xhr.onabort = () => reject(new Error('Upload cancelled.'));
			xhr.send(blob);
		});

	/**
	 * Uploads a song in parts, showing progress, then shows its link.
	 * @param {File} file
	 */
	const upload = async (file) => {
		$('done').hidden = true;
		$('copied').textContent = '';
		fail('');
		const why = await refusal(file);
		if (why) {
			fail(why);
			return;
		}
		running = new AbortController();
		const { signal } = running;
		const bar = /** @type {HTMLElement} */ ($('prog').querySelector('.bar > div'));
		const show = (/** @type {number} */ sent) => {
			const pct = Math.floor((sent / file.size) * 100);
			bar.style.width = `${pct}%`;
			$('pct').textContent = `Uploading ${file.name}: ${pct}%`;
		};
		/** @type {{ key: string, uploadId: string, partSize: number } | null} */
		let started = null;
		$('pick').toggleAttribute('disabled', true);
		$('prog').hidden = false;
		show(0);
		place();
		try {
			started = await call('POST', '/upload', signal, { name: file.name, size: file.size });
			const { key, uploadId, partSize } = /** @type {{ key: string, uploadId: string, partSize: number }} */ (started);
			const parts = [];
			for (let n = 1, from = 0; from < file.size; n++, from += partSize) {
				const blob = file.slice(from, from + partSize);
				for (let tries = 1; ; tries++) {
					try {
						const etag = await sendPart(`/upload/${key}/${n}?uploadId=${encodeURIComponent(uploadId)}`, blob, signal, (sent) =>
							show(from + sent),
						);
						parts.push({ partNumber: n, etag });
						break;
					} catch (e) {
						if (signal.aborted || /** @type {{ final?: boolean }} */ (e).final || tries >= TRIES) {
							throw e;
						}
					}
				}
			}
			const { url } = await call('POST', `/upload/${key}/done?uploadId=${encodeURIComponent(uploadId)}`, signal, { parts });
			link.value = url;
			$('done').hidden = false;
			started = null;
		} catch (e) {
			fail(signal.aborted ? 'Upload cancelled.' : /** @type {Error} */ (e).message || 'The upload failed.');
		} finally {
			if (started) {
				const { key, uploadId } = started;
				call('DELETE', `/upload/${key}?uploadId=${encodeURIComponent(uploadId)}`, new AbortController().signal).catch(() => {});
			}
			running = null;
			$('prog').hidden = true;
			$('pick').toggleAttribute('disabled', false);
			place();
		}
	};

	place();
})();
