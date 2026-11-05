// SlimeCheat lives in SlimeBeep's window (SlimeBeep.api.addPanel) and signs uploads in with SlimeBeep
// (SlimeBeep.api.proveIdentity). Rule: SlimeCheat may break, the game may not. Everything it does to the game
// runs inside `guard`, so a failure shows as an error in the panel and the game carries on.
(() => {
	'use strict';
	const w = /** @type {any} */ (window);
	if (w.SlimeCheat) {
		return;
	}
	const VERSION = '2.0.0';
	w.SlimeCheat = Object.freeze({ version: VERSION });

	/** Where uploads go (tests point it at a local copy). */
	const BASE = typeof w.SlimeCheatServer === 'string' ? w.SlimeCheatServer : 'https://song-upload.slimebeep-relay.workers.dev';
	/** Who SlimeBeep proofs are made for (the Worker checks the same name). */
	const AUDIENCE = 'slimecheat';
	/** The slime hacker, 64 px, for SlimeBeep's tab button (a data: URL: SlimeBeep takes no web addresses). */
	const ICON =
		'data:image/webp;base64,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';
	/** Where to get SlimeBeep. */
	const SLIMEBEEP_URL = 'https://proudkiller0015.github.io/slimebeep/install.html';
	/** FUSAM, the game's add-on manager (SlimeBeep is in it). */
	const FUSAM_URL = 'https://sidiousious.gitlab.io/bc-addon-loader/';
	/** How long to wait for SlimeBeep before saying it's needed. */
	const WAIT_SLIMEBEEP = Number(w.SlimeCheatWait) || 45000;
	/** Largest song the storage takes. */
	const MAX_SONG = 500 * 1024 * 1024;
	/** Largest image the storage takes. */
	const MAX_IMAGE = 100 * 1024 * 1024;
	/** Images up to this go in one request; bigger ones in parts, like songs. */
	const ONE_SHOT = 25 * 1024 * 1024;
	/** Tries per part before the upload gives up. */
	const TRIES = 3;
	/** What each upload page takes. */
	const KINDS = {
		songs: { pick: '🎵 Upload song', hint: 'mp3 only, up to 500 MB', accept: '.mp3,audio/mpeg' },
		images: {
			pick: '🖼 Upload image',
			hint: 'jpg, png or webp, up to 100 MB',
			accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
		},
	};

	// Room Uploads kept an address and an upload key here; SlimeCheat signs in through SlimeBeep instead.
	try {
		localStorage.removeItem('songUpload.options');
	} catch (e) {
		/* no storage: nothing to clear */
	}

	/** SlimeBeep's API, when it is there. */
	const slimeBeep = () => {
		const api = w.SlimeBeep?.api;
		return api && typeof api.addPanel === 'function' && typeof api.proveIdentity === 'function' ? api : null;
	};
	/** The game's player, or null before login. */
	const player = () => (typeof w.Player === 'object' && w.Player && w.Player.MemberNumber ? w.Player : null);

	/** The Authorization header: a fresh SlimeBeep proof. */
	const authHeader = async () => {
		const api = slimeBeep();
		const proof = api ? await api.proveIdentity(AUDIENCE) : null;
		if (!proof) {
			throw new Error('Log in to Bondage Club with SlimeBeep first.');
		}
		const me = player();
		const json = new TextEncoder().encode(JSON.stringify({ ...proof, name: me ? me.Nickname || me.Name || '' : '' }));
		return `SlimeBeep ${btoa(String.fromCharCode(...json))}`;
	};

	/**
	 * A new element with a class and its text.
	 * @param {string} tag
	 * @param {string} [cls]
	 * @param {string} [text]
	 */
	const make = (tag, cls = '', text = '') => {
		const el = document.createElement(tag);
		if (cls) {
			el.className = cls;
		}
		el.textContent = text;
		return el;
	};

	/** Whether the needs-SlimeBeep note was shown (once; it's closed by hand or when SlimeBeep turns up). */
	let needShown = false;
	/** Without SlimeBeep: a small note saying SlimeCheat needs it, with where to get it. */
	const needSlimeBeep = () => {
		if (document.getElementById('sc-need')) {
			return;
		}
		const note = make('div');
		note.id = 'sc-need';
		note.style.cssText =
			'position:fixed;z-index:2147483000;right:16px;bottom:16px;max-width:300px;padding:12px 14px;border-radius:14px;background:#fff7fb;color:#3a1630;box-shadow:0 4px 18px #0007;font:14px/1.4 system-ui,sans-serif';
		const title = make('b', '', '💻 SlimeCheat needs SlimeBeep');
		title.style.display = 'block';
		const text = make(
			'div',
			'',
			'Install SlimeBeep (or turn it on in FUSAM, the game’s add-on manager), then reload. SlimeCheat opens inside its window.',
		);
		const links = make('div');
		links.style.cssText = 'display:flex;gap:10px;margin-top:8px;align-items:center';
		const a1 = /** @type {HTMLAnchorElement} */ (make('a', '', 'Get SlimeBeep'));
		a1.href = SLIMEBEEP_URL;
		const a2 = /** @type {HTMLAnchorElement} */ (make('a', '', 'FUSAM'));
		a2.href = FUSAM_URL;
		for (const a of [a1, a2]) {
			a.target = '_blank';
			a.rel = 'noopener';
			a.style.color = '#c53a8a';
			a.style.fontWeight = '700';
		}
		const x = make('button', '', '✕');
		x.title = 'Close';
		x.style.cssText = 'margin-left:auto;border:0;background:none;cursor:pointer;color:#7a4a68;font-size:14px';
		x.addEventListener('click', () => note.remove());
		links.append(a1, a2, x);
		note.append(title, text, links);
		document.body.appendChild(note);
	};

	/**
	 * Fills SlimeBeep's panel element once; SlimeBeep keeps it between redraws.
	 * @param {HTMLDivElement} root
	 */
	const mount = (root) => {
		root.innerHTML = `<style>
			.sc-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0 8px; }
			.sc-tabs .sb-pill.on { font-weight: 700; outline: 2px solid currentColor; }
			.sc-page { display: flex; flex-direction: column; gap: 8px; }
			.sc-line { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
			.sc-bar { height: 10px; border-radius: 5px; background: #8884; overflow: hidden; }
			.sc-bar > div { height: 100%; width: 0; background: currentColor; transition: width .2s; }
			.sc-err { color: #e5303f; font-weight: 700; font-size: 13px; }
			.sc-file img { width: 56px; height: 42px; flex: none; object-fit: cover; border-radius: 6px; }
			.sc-file .sb-main b { overflow-wrap: anywhere; }
			.sc-sure { background: #e5303f !important; color: #fff !important; border-color: #e5303f !important; }
			.sc-user { margin: 8px 2px 0; font-weight: 700; }
			#sc-root select, #sc-root input.sb-search { margin: 0; }
			#sc-root label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; flex: 1; }
			#sc-root [hidden] { display: none !important; }
		</style>
		<div id="sc-root">
			<div class="sc-tabs" id="sc-tabs">
				<button class="sb-pill" data-page="songs">🎵 Songs</button><button class="sb-pill" data-page="images">🖼 Images</button>
				<button class="sb-pill" data-page="files">📁 My files</button><button class="sb-pill" data-page="dice">🎲 Dice</button>
				<button class="sb-pill" data-page="cheats">🔓 Cheats</button>
			</div>
			<div class="sc-page" id="sc-upload">
				<div class="sc-line"><button class="sb-go" id="sc-pick">🎵 Upload song</button><span class="sb-hint" id="sc-limits">mp3 only, up to 500 MB</span></div>
				<input type="file" id="sc-file" accept=".mp3,audio/mpeg" hidden>
				<div id="sc-prog" hidden><div class="sc-bar"><div></div></div><div class="sc-line"><span class="sb-hint" id="sc-pct"></span><button class="sb-pill" id="sc-stop">Cancel</button></div></div>
				<div id="sc-done" hidden><input class="sb-search" id="sc-link" readonly aria-label="Link"><div class="sc-line"><button class="sb-go" id="sc-copy">Copy link</button><span class="sb-hint" id="sc-copied"></span></div><span class="sb-hint" id="sc-lasts"></span></div>
				<div class="sc-user" id="sc-recenthead"></div>
				<div id="sc-recent"></div>
			</div>
			<div class="sc-page" id="sc-files" hidden>
				<div class="sc-line"><span class="sb-hint" id="sc-used" style="flex:1"></span><button class="sb-pill" id="sc-refresh" title="Refresh">↻</button></div>
				<div id="sc-list"></div>
			</div>
			<div class="sc-page" id="sc-dice" hidden>
				<div class="sc-line"><label>Dice<input class="sb-search" id="sc-dcount" value="1" inputmode="numeric"></label><label>Sides<input class="sb-search" id="sc-dsides" value="6" inputmode="numeric"></label></div>
				<label>Result<input class="sb-search" id="sc-dresult" placeholder="e.g. 6, or 6,6,5 for three dice" spellcheck="false"></label>
				<div class="sc-line"><button class="sb-go" id="sc-droll">Roll</button><span class="sb-hint" id="sc-dsent"></span></div>
				<span class="sb-hint">Shows in the room exactly like /dice. Leave Result empty for a fair roll.</span>
			</div>
			<div class="sc-page" id="sc-cheats" hidden>
				<div class="sb-row" style="display:block;cursor:default">
					<div class="sb-name">🔥 Lock burner <span class="sb-hint">(yourself only)</span></div>
					<div class="sc-line" style="margin-top:6px"><select class="sb-search" id="sc-part" style="flex:1"></select><button class="sb-pill" id="sc-parts" title="Reload the list">↻</button></div>
					<div class="sc-line" style="margin-top:6px"><button class="sb-go" id="sc-unlock">🔓 Burn the lock</button><button class="sb-pill" id="sc-remove">✂ Take it off</button><button class="sb-pill" id="sc-burnall">🔥 Burn every lock</button></div>
					<span class="sb-hint" id="sc-burnt"></span>
				</div>
				<div class="sb-row" style="display:block;cursor:default">
					<div class="sb-name">👻 Invisible</div>
					<div class="sb-hint">Hides all of you from everyone in the room with the game's own Script item (like ULTRAbc's /invisible). Needs Settings › Scripts › Hide › Self.</div>
					<div class="sc-line" style="margin-top:6px"><button class="sb-go" id="sc-invis">Go invisible</button><button class="sb-pill" id="sc-vis">Visible again</button><span class="sb-hint" id="sc-invisdone"></span></div>
				</div>
				<div class="sb-row" style="display:block;cursor:default">
					<div class="sb-name">🎁 Unlock every item</div>
					<div class="sb-hint">Adds every item in the game to your own inventory (saved to your account).</div>
					<div class="sc-line" style="margin-top:6px"><button class="sb-go" id="sc-allitems">Unlock all items</button><span class="sb-hint" id="sc-itemsdone"></span></div>
				</div>
			</div>
			<div class="sc-err" id="sc-err" hidden></div>
			<div class="sb-hint" style="text-align:right;margin-top:6px">SlimeCheat ${VERSION}</div>
		</div>`;

		/**
		 * An element of the panel.
		 * @param {string} id without the sc- prefix
		 * @returns {HTMLElement}
		 */
		const $ = (id) => /** @type {HTMLElement} */ (root.querySelector(`#sc-${id}`));
		/** @param {string} id */
		const value = (id) => /** @type {HTMLInputElement} */ ($(id)).value.trim();
		const fileInput = /** @type {HTMLInputElement} */ ($('file'));
		const link = /** @type {HTMLInputElement} */ ($('link'));
		/** @type {AbortController | null} The upload in progress. */
		let running = null;
		/** @type {keyof typeof KINDS} What the upload page takes now. */
		let kind = 'songs';

		/**
		 * Shows a problem, or clears it.
		 * @param {string} text
		 */
		const fail = (text) => {
			$('err').textContent = text;
			$('err').hidden = !text;
		};
		/**
		 * Runs fn; if it throws (or its promise fails), the error shows in the panel and nothing else happens.
		 * @param {() => unknown} fn
		 */
		const guard = (fn) => {
			try {
				const r = fn();
				if (r instanceof Promise) {
					r.catch((e) => fail(`⚠ ${/** @type {Error} */ (e)?.message || e}`));
				}
			} catch (e) {
				fail(`⚠ ${/** @type {Error} */ (e)?.message || e}`);
			}
		};
		/**
		 * A click handler that can't hurt the game.
		 * @param {string} id
		 * @param {() => unknown} fn
		 */
		const onClick = (id, fn) => $(id).addEventListener('click', () => guard(fn));

		/**
		 * Shows a page: 'songs', 'images', 'files', 'dice' or 'cheats'.
		 * @param {string} name
		 */
		const page = (name) => {
			fail('');
			const upload = name === 'songs' || name === 'images';
			if (upload && name !== kind) {
				kind = name;
				$('pick').textContent = KINDS[kind].pick;
				$('limits').textContent = KINDS[kind].hint;
				fileInput.accept = KINDS[kind].accept;
				$('done').hidden = true;
			}
			$('upload').hidden = !upload;
			for (const p of ['files', 'dice', 'cheats']) {
				$(p).hidden = name !== p;
			}
			for (const tab of root.querySelectorAll('#sc-tabs [data-page]')) {
				tab.classList.toggle('on', /** @type {HTMLElement} */ (tab).dataset.page === name);
			}
			if (name === 'files') {
				guard(listFiles);
			} else if (upload) {
				guard(listKind);
			} else if (name === 'cheats') {
				guard(fillParts);
			}
		};
		$('tabs').addEventListener('click', (e) => {
			const tab = /** @type {HTMLElement} */ (e.target).closest('[data-page]');
			if (tab instanceof HTMLElement) {
				page(tab.dataset.page || 'songs');
			}
		});

		// ---- Uploads
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
		onClick('copy', async () => {
			await copy(link.value);
			$('copied').textContent = 'Copied!';
		});
		onClick('pick', () => {
			fileInput.value = '';
			fileInput.click();
		});
		fileInput.addEventListener('change', () => {
			const file = fileInput.files?.[0];
			if (file) {
				guard(() => upload(file));
			}
		});
		onClick('stop', () => running?.abort());

		/**
		 * A size in KB under 1 MB, in MB, or in GB from 1 GB up.
		 * @param {number} bytes
		 */
		const size = (bytes) => {
			if (bytes >= 1e9) {
				return `${(bytes / 1e9).toFixed(2)} GB`;
			}
			return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(Math.round(bytes / 1e3), 1)} KB`;
		};
		/**
		 * How long until a file is deleted, like "deletes in 4 days" or "deletes in 3 hours".
		 * @param {number} expires
		 */
		const timeLeft = (expires) => {
			const hours = Math.max(Math.ceil((expires - Date.now()) / 3600000), 1);
			const days = Math.floor(hours / 24);
			return days >= 1 ? `deletes in ${days} day${days > 1 ? 's' : ''}` : `deletes in ${hours} hour${hours > 1 ? 's' : ''}`;
		};

		/**
		 * A call to the upload address; answers its JSON or throws its error message.
		 * @param {string} method
		 * @param {string} path
		 * @param {AbortSignal} signal
		 * @param {unknown} [body]
		 */
		const call = async (method, path, signal, body) => {
			const auth = await authHeader();
			const res = await fetch(BASE + path, {
				method,
				signal,
				headers: { Authorization: auth, 'Content-Type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
			});
			const answer = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(answer.error || `The upload address answered ${res.status}.`);
			}
			return answer;
		};

		/**
		 * Sends bytes (a song's part, or a whole image) with upload progress; answers the JSON reply.
		 * @param {string} path
		 * @param {Blob} blob
		 * @param {AbortSignal} signal
		 * @param {(sent: number) => void} onSent bytes of this part sent so far
		 * @returns {Promise<{ etag?: string, url?: string }>}
		 */
		const sendPart = async (path, blob, signal, onSent) => {
			const auth = await authHeader();
			return new Promise((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.open('PUT', BASE + path);
				xhr.setRequestHeader('Authorization', auth);
				xhr.upload.onprogress = (e) => onSent(e.loaded);
				xhr.onload = () => {
					/** @type {{ etag?: string, url?: string, error?: string }} */
					let answer = {};
					try {
						answer = JSON.parse(xhr.responseText);
					} catch (e) {
						/* not JSON: the status says enough */
					}
					if (xhr.status === 200) {
						resolve(answer);
					} else {
						reject(Object.assign(new Error(answer.error || `The upload address answered ${xhr.status}.`), { final: true }));
					}
				};
				xhr.onerror = () => reject(new Error("Couldn't reach the upload address."));
				signal.addEventListener('abort', () => xhr.abort());
				xhr.onabort = () => reject(new Error('Upload cancelled.'));
				xhr.send(blob);
			});
		};

		/**
		 * Whether bytes start like an mp3: an ID3 tag or an MPEG audio Layer III frame header.
		 * @param {Uint8Array} b
		 */
		const isMp3 = (b) =>
			(b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
			(b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 3) & 3) !== 1 && ((b[1] >> 1) & 3) === 1);
		/**
		 * The real type of an image from its first 12 bytes: 'jpg', 'png', 'webp', or '' for anything else.
		 * @param {Uint8Array} b
		 */
		const imageType = (b) => {
			const text = String.fromCharCode(...b);
			if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
				return 'jpg';
			}
			if (text.startsWith('\x89PNG')) {
				return 'png';
			}
			return text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP' ? 'webp' : '';
		};
		/**
		 * Why an image can't be uploaded, or '' if it can. The game takes only .jpg, .jpeg, .png and .webp links.
		 * @param {File} file
		 */
		const imageRefusal = async (file) => {
			if (!/\.(jpe?g|png|webp)$/i.test(file.name) || (file.type && !/^image\/(jpeg|png|webp)$/.test(file.type))) {
				return `"${file.name}" can't be a room image. Only .jpg, .jpeg, .png and .webp images can be uploaded.`;
			}
			if (!file.size) {
				return 'That file is empty.';
			}
			if (file.size > MAX_IMAGE) {
				return `"${file.name}" is ${Math.round(file.size / 1048576)} MB; images can be at most 100 MB.`;
			}
			if (!imageType(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) {
				return `"${file.name}" is not a real JPEG, PNG or WEBP inside (only its name says so).`;
			}
			return '';
		};
		/**
		 * Why a song can't be uploaded, or '' if it can.
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
		 * Uploads a song in parts or an image in one go, showing progress, then shows its link.
		 * @param {File} file
		 */
		const upload = async (file) => {
			$('done').hidden = true;
			$('copied').textContent = '';
			fail('');
			const image = kind === 'images';
			const why = await (image ? imageRefusal : refusal)(file);
			if (why) {
				fail(why);
				return;
			}
			running = new AbortController();
			const { signal } = running;
			const bar = /** @type {HTMLElement} */ ($('prog').querySelector('.sc-bar > div'));
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
			const done = (/** @type {string} */ url) => {
				link.value = url || '';
				$('lasts').textContent = 'The link lasts as long as the file: see the list below.';
				$('done').hidden = false;
				guard(listKind);
			};
			try {
				if (image && file.size <= ONE_SHOT) {
					const { url } = await sendPart(`/upload/image?name=${encodeURIComponent(file.name)}`, file, signal, show);
					done(url || '');
					return;
				}
				started = await call('POST', '/upload', signal, { name: file.name, size: file.size });
				const { key, uploadId, partSize } = /** @type {{ key: string, uploadId: string, partSize: number }} */ (started);
				const parts = [];
				for (let n = 1, from = 0; from < file.size; n++, from += partSize) {
					const blob = file.slice(from, from + partSize);
					for (let tries = 1; ; tries++) {
						try {
							const { etag } = await sendPart(`/upload/${key}/${n}?uploadId=${encodeURIComponent(uploadId)}`, blob, signal, (sent) =>
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
				done(url);
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
			}
		};

		/**
		 * One file's row in My files.
		 * @param {{ url: string, name: string, kind: string, size: number, uploaded: number, expires: number }} file
		 */
		const fileRow = (file) => {
			const row = make('div', 'sb-row sc-file');
			row.style.cursor = 'default';
			const copyBtn = make('button', 'sb-pill sc-copylink', 'Copy link');
			const del = /** @type {HTMLButtonElement} */ (make('button', 'sb-pill sc-del', 'Delete'));
			copyBtn.addEventListener('click', () =>
				guard(async () => {
					await copy(file.url);
					copyBtn.textContent = 'Copied!';
				}),
			);
			let sure = 0;
			del.addEventListener('click', () =>
				guard(async () => {
					if (!sure) {
						del.textContent = 'Sure?';
						del.classList.add('sc-sure');
						sure = setTimeout(() => {
							sure = 0;
							del.textContent = 'Delete';
							del.classList.remove('sc-sure');
						}, 4000);
						return;
					}
					clearTimeout(sure);
					del.disabled = true;
					await call('DELETE', `/upload/files/${file.url.split('/').pop()}`, new AbortController().signal);
					await ($('files').hidden ? listKind() : listFiles());
				}),
			);
			const buttons = make('div', 'sc-line');
			buttons.append(copyBtn, del);
			const info = make('div', 'sb-main');
			info.append(
				make('b', 'sb-name', file.name),
				make('div', 'sb-sub', `${size(file.size)} · ${new Date(file.uploaded).toLocaleString()} · ${timeLeft(file.expires)}`),
				buttons,
			);
			if (file.kind === 'image') {
				const thumb = /** @type {HTMLImageElement} */ (make('img'));
				thumb.alt = '';
				thumb.loading = 'lazy';
				thumb.src = file.url;
				row.append(thumb);
			}
			row.append(info);
			return row;
		};

		/**
		 * Fills My files: your own; for the owners, everyone's, grouped by player with yours first (the server only
		 * answers ?all=1 for the owners, so everyone else just gets their own).
		 */
		const listFiles = async () => {
			const list = $('list');
			$('used').textContent = 'Loading…';
			try {
				/** @type {{ files: { url: string, name: string, kind: string, size: number, uploaded: number, expires: number, by?: number, byName?: string }[], used: number, cap: number, admin?: boolean, me?: number }} */
				const answer = await call('GET', '/upload/files?all=1', new AbortController().signal);
				$('used').textContent = `Used ${size(answer.used)} of ${size(answer.cap)}`;
				/** @type {Map<number, typeof answer.files>} */
				const by = new Map();
				for (const f of answer.files) {
					by.set(f.by || 0, [...(by.get(f.by || 0) || []), f]);
				}
				if (!answer.admin || [...by.keys()].every((n) => n === answer.me)) {
					list.replaceChildren(...answer.files.map(fileRow));
				} else {
					const groups = [...by].sort(([a], [b]) => Number(b === answer.me) - Number(a === answer.me));
					list.replaceChildren(
						...groups.flatMap(([n, files]) => [
							make(
								'div',
								'sc-user',
								`${n === answer.me ? 'You' : files[0].byName || 'Player'} #${n} · ${files.length} file${files.length > 1 ? 's' : ''}`,
							),
							...files.map(fileRow),
						]),
					);
				}
				if (!answer.files.length) {
					list.append(make('div', 'sb-empty', 'No files yet.'));
				}
			} catch (e) {
				$('used').textContent = '';
				fail(/** @type {Error} */ (e).message || "Couldn't load your files.");
			}
		};
		onClick('refresh', listFiles);

		/** Under the upload button: your own songs (on Songs) or images (on Images), newest first. */
		const listKind = async () => {
			const want = kind === 'images' ? 'image' : 'song';
			const what = kind === 'images' ? 'images' : 'songs';
			/** @type {{ files: { url: string, name: string, kind: string, size: number, uploaded: number, expires: number }[] }} */
			let answer;
			try {
				answer = await call('GET', '/upload/files', new AbortController().signal);
			} catch (e) {
				// Before login (or offline) the list just waits; the upload button says what's wrong when used.
				$('recenthead').textContent = '';
				$('recent').replaceChildren();
				return;
			}
			if ((kind === 'images' ? 'image' : 'song') !== want) {
				return;
			}
			const mine = answer.files.filter((f) => f.kind === want);
			$('recenthead').textContent = mine.length ? `Your ${what} (${mine.length})` : `No ${what} uploaded yet.`;
			$('recent').replaceChildren(...mine.map(fileRow));
		};

		// ---- Dice
		onClick('droll', () => {
			$('dsent').textContent = '';
			const count = Number(value('dcount'));
			const sides = Number(value('dsides'));
			if (!Number.isInteger(count) || count < 1 || count > 100) {
				fail('Dice must be a whole number from 1 to 100.');
				return;
			}
			// No top limit: the game's /dice stops at 100, but other extensions roll bigger dice and the room shows them fine.
			if (!Number.isSafeInteger(sides) || sides < 2) {
				fail('Sides must be a whole number, 2 or more.');
				return;
			}
			/** @type {number[]} */
			let result;
			if (value('dresult')) {
				result = value('dresult')
					.split(/[\s,+]+/)
					.filter(Boolean)
					.map(Number);
				if (result.length !== count) {
					fail(`Result needs ${count} number${count > 1 ? 's' : ''}, one per die.`);
					return;
				}
				if (result.some((n) => !Number.isInteger(n) || n < 1 || n > sides)) {
					fail(`Every number in Result must be from 1 to ${sides}.`);
					return;
				}
			} else {
				result = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
			}
			// The game's own globals, by name: DictionaryBuilder is a class, so it isn't on window.
			/* global CurrentScreen, ServerSend, DictionaryBuilder, Player */
			if (
				typeof CurrentScreen === 'undefined' ||
				CurrentScreen !== 'ChatRoom' ||
				typeof ServerSend !== 'function' ||
				typeof DictionaryBuilder !== 'function'
			) {
				fail('Join a chat room first.');
				return;
			}
			if (count > 1) {
				result.sort((a, b) => a - b);
			}
			const total = result.reduce((a, b) => a + b, 0);
			// The same message the game's /dice sends (CommandsDefault.js), so it reads the same to everyone.
			const dictionary = new DictionaryBuilder()
				.sourceCharacter(Player)
				.text('DiceType', `${count}D${sides}`)
				.text('DiceResult', count > 1 ? `${result} = ${total}` : String(total))
				.build();
			ServerSend('ChatRoomChat', { Content: 'ActionDice', Type: 'Action', Dictionary: dictionary });
			$('dsent').textContent = `Rolled ${count}D${sides}: ${count > 1 ? `${result} = ${total}` : total}`;
		});

		// ---- Cheats (on yourself only)
		/** The game functions the cheats need, or null (with the reason shown) when one is missing. */
		const game = () => {
			const names = ['InventoryGet', 'InventoryGetLock', 'InventoryUnlock', 'InventoryRemove', 'CharacterRefresh', 'InventoryAddMany'];
			const missing = names.filter((n) => typeof w[n] !== 'function');
			if (!player() || !Array.isArray(player().Appearance)) {
				fail('Log in first.');
				return null;
			}
			if (missing.length) {
				fail(`⚠ The game changed (${missing.join(', ')} is gone): this cheat is off until SlimeCheat is updated.`);
				return null;
			}
			return w;
		};
		/** Your restraints (item slots in use), by body part. */
		const worn = () => {
			const me = player();
			return (me ? me.Appearance : []).filter(
				(/** @type {any} */ it) => it && it.Asset && it.Asset.Group && it.Asset.Group.Category === 'Item',
			);
		};
		/** Tells the room your new look and saves it (the game's own refresh). */
		const pushLook = (/** @type {any} */ g) => {
			g.CharacterRefresh(player(), true, false);
			if (typeof g.ChatRoomCharacterUpdate === 'function') {
				g.ChatRoomCharacterUpdate(player());
			}
		};
		/** Fills the body part list: every item slot you have something in, locked ones marked. */
		const fillParts = () => {
			const g = game();
			const select = /** @type {HTMLSelectElement} */ ($('part'));
			select.replaceChildren();
			if (!g) {
				return;
			}
			const items = worn();
			for (const it of items) {
				const lock = g.InventoryGetLock(it);
				const part = it.Asset.Group.Description || it.Asset.Group.Name;
				const opt = /** @type {HTMLOptionElement} */ (
					make('option', '', `${lock ? '🔒 ' : ''}${part}: ${it.Asset.Description || it.Asset.Name}`)
				);
				opt.value = it.Asset.Group.Name;
				select.append(opt);
			}
			if (!items.length) {
				select.append(make('option', '', 'Nothing on you'));
			}
		};
		onClick('parts', fillParts);
		onClick('unlock', () => {
			const g = game();
			const group = /** @type {HTMLSelectElement} */ ($('part')).value;
			const item = g && group ? g.InventoryGet(player(), group) : null;
			if (!g || !item) {
				return;
			}
			if (!g.InventoryGetLock(item)) {
				$('burnt').textContent = 'That one has no lock.';
				return;
			}
			g.InventoryUnlock(player(), item, false);
			pushLook(g);
			$('burnt').textContent = `🔥 Lock burnt off: ${item.Asset.Description || item.Asset.Name}`;
			fillParts();
		});
		onClick('remove', () => {
			const g = game();
			const group = /** @type {HTMLSelectElement} */ ($('part')).value;
			const item = g && group ? g.InventoryGet(player(), group) : null;
			if (!g || !item) {
				return;
			}
			g.InventoryRemove(player(), group, false);
			pushLook(g);
			$('burnt').textContent = `✂ Taken off: ${item.Asset.Description || item.Asset.Name}`;
			fillParts();
		});
		onClick('burnall', () => {
			const g = game();
			if (!g) {
				return;
			}
			const locked = worn().filter((it) => g.InventoryGetLock(it));
			for (const it of locked) {
				g.InventoryUnlock(player(), it, false);
			}
			if (locked.length) {
				pushLook(g);
			}
			$('burnt').textContent = locked.length
				? `🔥 ${locked.length} lock${locked.length > 1 ? 's' : ''} burnt off`
				: 'Nothing on you is locked.';
			fillParts();
		});
		// ---- Invisible: the game's Script item (group ItemScript) with every body group in its Hide list.
		onClick('invis', () => {
			const g = game();
			if (!g || typeof w.InventoryWear !== 'function' || !Array.isArray(w.AssetGroup)) {
				if (g) {
					fail('⚠ The game changed (InventoryWear or AssetGroup is gone): this cheat is off until SlimeCheat is updated.');
				}
				return;
			}
			const me = player();
			const hide = me.OnlineSharedSettings && me.OnlineSharedSettings.ScriptPermissions && me.OnlineSharedSettings.ScriptPermissions.Hide;
			// Bit 1 = yourself may change Hide on your own Script item (Settings › Scripts).
			if (!hide || !(hide.permission & 1)) {
				$('invisdone').textContent = 'First allow it: Settings › Scripts › Hide › Self. Then press again.';
				return;
			}
			const groups = w.AssetGroup.filter((/** @type {any} */ gr) => gr && gr.Family === me.AssetFamily && gr.Name !== 'ItemScript').map(
				(/** @type {any} */ gr) => gr.Name,
			);
			w.InventoryWear(me, 'Script', 'ItemScript', null, null, null, null, false);
			const item = g.InventoryGet(me, 'ItemScript');
			if (!item) {
				fail("⚠ The game wouldn't put the Script item on you.");
				return;
			}
			item.Property = { ...(item.Property || {}), Hide: groups };
			pushLook(g);
			$('invisdone').textContent = '👻 You are invisible.';
		});
		onClick('vis', () => {
			const g = game();
			if (!g) {
				return;
			}
			if (!g.InventoryGet(player(), 'ItemScript')) {
				$('invisdone').textContent = "You aren't invisible.";
				return;
			}
			g.InventoryRemove(player(), 'ItemScript', false);
			pushLook(g);
			$('invisdone').textContent = '🙂 Visible again.';
		});

		let sureItems = 0;
		onClick('allitems', () => {
			const g = game();
			if (!g || !Array.isArray(w.Asset)) {
				return;
			}
			const btn = $('allitems');
			if (!sureItems) {
				btn.textContent = 'Sure? Click again';
				btn.classList.add('sc-sure');
				sureItems = setTimeout(() => {
					sureItems = 0;
					btn.textContent = 'Unlock all items';
					btn.classList.remove('sc-sure');
				}, 4000);
				return;
			}
			clearTimeout(sureItems);
			sureItems = 0;
			btn.textContent = 'Unlock all items';
			btn.classList.remove('sc-sure');
			const me = player();
			const before = me.Inventory.length;
			const all = w.Asset.filter((/** @type {any} */ a) => a && a.Group && a.Group.Family === me.AssetFamily).map(
				(/** @type {any} */ a) => ({ Name: a.Name, Group: a.Group.Name }),
			);
			g.InventoryAddMany(me, all, true);
			$('itemsdone').textContent = `🎁 ${me.Inventory.length - before} new items in your inventory.`;
		});

		// Keys typed in the panel stay out of the game.
		for (const type of ['keydown', 'keyup', 'keypress']) {
			root.addEventListener(type, (e) => e.stopPropagation());
		}
		page('songs');
	};

	// Waits for SlimeBeep, then adds the panel; without it, says SlimeCheat needs it.
	// It keeps waiting however late SlimeBeep loads (FUSAM may load it after login): the note only shows while
	// it's missing, and goes away once SlimeBeep is there.
	const startedAt = Date.now();
	const timer = setInterval(() => {
		try {
			const api = slimeBeep();
			if (api) {
				clearInterval(timer);
				document.getElementById('sc-need')?.remove();
				api.addPanel({ id: 'slimecheat', icon: '💻', image: ICON, title: 'SlimeCheat: hack panel', mount });
			} else if (Date.now() - startedAt > WAIT_SLIMEBEEP && document.body && !needShown) {
				needShown = true;
				needSlimeBeep();
			}
		} catch (e) {
			clearInterval(timer);
			console.warn('SlimeCheat:', e);
		}
	}, 1000);
})();
