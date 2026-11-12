// SlimeCheat lives in SlimeBeep's window (SlimeBeep.api.addPanel) and signs uploads in with SlimeBeep
// (SlimeBeep.api.proveIdentity). Rule: SlimeCheat may break, the game may not. Everything it does to the game
// runs inside `guard`, so a failure shows as an error in the panel and the game carries on.
(() => {
	'use strict';
	const w = /** @type {any} */ (window);
	if (w.SlimeCheat) {
		return;
	}
	const VERSION = '2.11.0';
	w.SlimeCheat = Object.freeze({
		version: VERSION,
		/** A member's outfit ('outfits') or wear ('worn') history, newest first. */
		history: (/** @type {'outfits' | 'worn'} */ kind, /** @type {number} */ n) => histGet(kind, n),
		/** Whether the histories have finished loading (and moving out of localStorage). */
		historyReady: () => historyReady,
		/** Forgets a member's outfit or wear history. */
		forget: (/** @type {'outfits' | 'worn'} */ kind, /** @type {number} */ n) => histForget(kind, n),
	});

	/** Where uploads go (tests point it at a local copy). */
	const BASE = typeof w.SlimeCheatServer === 'string' ? w.SlimeCheatServer : 'https://song-upload.slimebeep-relay.workers.dev';
	/** Who SlimeBeep proofs are made for (the Worker checks the same name). */
	const AUDIENCE = 'slimecheat';
	/** The slime hacker, 64 px, for SlimeBeep's tab button (a data: URL: SlimeBeep takes no web addresses). */
	const ICON =
		'data:image/webp;base64,UklGRsYNAABXRUJQVlA4WAoAAAAQAAAAPwAAPwAAQUxQSAsDAAABoHZtmyFJHtDzxhuztm3b5ifbtm3btm3btm3b9m51ZcT7PossZUxETACGr6KqQboTkQYFRW2UDiEqAIkqzVBgnIWWXnJGAAGARAEgo44EADE0QDHHZd+TTC/vNBJUFMDMO9/49tefPXPaMiMDKoNS7DhEuhnJ1xYCMOZWjyV2/ODwKQEdjGI7enKSbomtVcfc73OSKZtbTkb+euIkQBhAwHSVGTtmtj8nc3Z2tER+t0tA7F/EIUzs0sns7N4T+eQcUOnfhbkizeroxt498c+tIaFvG9PdOeBMnhsR+iNhxEta5NdvDYae+MAYCH1BwIgHnL8MtnIbCFnxyTFE+hGw8qdp6LZd6D4gVnxomEpvAXMmNrXipYi9Ka5gm7TcBFbcHtpTwNM5s6meh2ZB6CVibzaHmY/2hjDsYPPGMHNF0V4idvTcIH8KsQfFcjRvDo27IXYVZNIf3NhgN66J2E3EPcxstFtrPmgnxdZMbLjx03GD1AWZ/FfzpjHxesQ6xTXMbH7iOtD/KRZhZoFm344XAoCAh8tg4llQQLEkjUW6tWdCgOIWpjKYeD4UmOhPeiHuv4wLwdrMLDVzbUQc6amY5Kci4mSWk3kjFEd7OYkXI2J95oJ2RcQEv7sX4lZNj6A4jamQxGuhkDD2J8xFmP82tQQgYJGKXoCTq0EBQLFyi944t982R0RtxPy/uTct8yoMQ71i5bax6W6thaE1QSb4ic1j5gsx1EScyMQCMzcQ/R/0HbcSkp+IYQBE8CGLMH9iDBEg4BjLLNL4+AhBFMvQvAxWPBYa8LRnFur218TA5G16KcxcB5iPzmKT7wVMm1gQt4DoW5aLMc6MiM3ZLqXi7QgIuJGVleAVv51MAiSMdAOZszXLcyI/WwABgABbfECSOaWUzWwQbmY5peQk/zpnQgT8XwSjrH/9Z+wy95+df3liv2mBgI4KYJQ51tjzuKueeuONtznAH19768XbTj9wk0UnAKCCLkUVnWW+lVdYsc8rTITOEgN6lRBjVMHARWOMKhikBO2/QDDcBQBWUDgglAoAALArAJ0BKkAAQAA+KRCFQqGhDn+sDAFCWwAnTKEgifKeYJWn6X+EeELIp2G/zekB+dPYA/S//DfzHrP+YX+Xf2b9bPda9CX+q9QD+v/6jrAPQA8r/9uPgj/af9qfgE/Yf/tdYBwAHZh/Xfxc8ye+j409m+LHzn4ovsx+S/L31F/vPgv79dQL8U/lX9x/Jf8uPkS9e7FerP+l/ID4AvVz6D/f/ys/t3OB9aP9d7gH8k/qf+Q/Mz1kPAi8h9gD+df1b/p/238SfpP/jf+X/i/zC9mX5r/df9//jPx2+wL+Q/z//Pf3T/H/9n/G///wv/s77IP64OJ5L7E07OjJlx/pJeTr3+IkVD8vWsbCzwK/XpfvSkW2Ejpt1x5MTNrwDnCxDRd4+e23K1fC/qSYzFjNdar+4mSulGaHugnkIGisNahf7DxHnAsbSl8vJ5SoY7BnU/Uq9rQ9A+EE+fCZxLO2HhWXNXGmTAAA/v/uRi6QbvY3MMoTafPFBQcqHReXD4Gm1vDgw//16oO5S8NjYwk/ihcBO1FunXx0zXMwAFmLCuMIDNb+bFbwPJwPP5zDVUmieAPg6OO+SuVnn004/YmHl8NN7lT6ojuqJ+5jodMxuVNRnXJj/RLhxHxBtFAvgMarPxr+lxxa0pyR0Fru2gh30diAgDwcXTQbjuXEv7C60MAhvlPRMPmNFRfjrG+d7e3+h+F8OzLkzYiIl/B0ybx23cjkP5VcuRGV4EHdtAVOjT8RrKuyISCB/feNXWpeozJTthwwFhdvcej1mjWSuIS4q/K1BhoOmJVxoXR/PTe5C/h2BElsPhdj2rhs+zlWC2M9MC2DBYfyQDV83WnAGPS1ripceYnIHXYyMFlA3ayMuJ1Qkbg/Riv33c2KU0zoQAS77LpPUfXgJmKwabmbDTLIrXbK7jgmi+OKRSWESPohFjo0f4Zb2OsWWsLf99h5QUVbp2zCy+aC3fKCj/ZuTRXQVeGfhiMAKalInmH2f1gBm6LL4jo+huoM2O7cZUIzF9fU1vKaxOp7Kopr2aZtYoLmNjpe+MSdc+EaB6jyEM06V3hR7/4pQmWYwF5BtGc7QBRrXz3wGePnFs3Q/al+5NOaY8kR0HooA9DyTFxuceYLSynScoFXaPMjM6VW9tpY22vV40rx09aOyZViG/3Uiy+jFvfQBX6d1pZ8QICa/HQHN4K+jbwnuo+owOV3iY/ue2yTGF8dc9ju0eKwPMaSD0mBi/zMAssTqr38kvfrVvz57ftWBYaeBEdSVgVlko9c9UPlp9mJuuyrnHtDQ+Ut63lUM2BXBNJ3WJwWgVdSA/Gxhw2NXZr5jxJKoXfJG7sTIt8+q3mRPN0x4/tvQ2EEddhqOWGnS1v9JuTLAKrc6jv50a32XOTSey7M1Lua0pee5fsdb4rOcTCjHGGInF76mV9W1oG1jKWsMsWRak51gQf46rdYi4A8D3Lj408uc2M2jyT2SYaUx279F/rikR0M5yrvgFTUhWTspfHv4t79f1aNGgcZl0K0atfuYdHEgso/YK/pi4vCoWDt2gM16yCLdoKJy/C0ZAczTnvbJLNfxeXrzi0bMQgIIzyV/NwOITNO5fiLI/tZS5TrWIqhw4Pk0n+jcLk/V3EZsl1llpPllQhjVzpPt9bzcTLcTO9JtJb38e0wra62Uc3LrT3KSzoq6DO588/T6L4akm5A6ksqi5kuQht7bNdEhGPy5HRB3sskB48NVj1NeUsYMH9vG4BP98Ex4at0k56xqIWKPZqdh++ven0Sq7gSHjnzye6tkK2hFqX3c2stF/HsKdQhKHkPkAeCITCt+xVw9P6u2tqwFCLLiABA8s1+Y7MVK1xUyRwRzOS955+ERCRi0cSjlDfTMNli+qGkbY6qr90IbZlkY0EVr8e6+WXHx4hXts1E3Skb8Rc02HAgaF31X7c3WgjabxMoG4vJpPRhbA+iWRQ6kA7H68dlqrsG2/DNp3srTxsa0+1pTn8H8OFCXVwzjsQlsiRYuqAONd53MnWsc0NEVe8pa09w8YJt5pKjO/oxshDMyqqXF6f3s+hLuwErwm1XbquOf/pc6jcwKku2naZTGve12R7ln59jIIvb1Fs9EcSF5Lys2xlPi5VzwqBVymnZCcVY8HXkaCF1ppd0PABqxYynk2AK0TtU0VuqRBe7gz5Isk8LfcGuN54D/8Yvw1KTW0+wcv4fcroRkvisPD7B+PIq6HO2+fVCarDB6JXrDH/ZI9YNMsJCg7TvAE+uwMwqP5UC1prly5PQi/gtmHmzM0BVb0JHuyopSfP1/IWBrQcA44uZCThg+wDksAALMZCxDzxFAz/hfhBEWmPt4pV3GutHtgtyB7ru+Rj9Z/Gqo/TzZqz9gYDqgPQvrqOnVzM6tvKYOK1dcPHPiAPFZVLMq9+aq7RQhlBhqiuZ/evfs0bz0uAheJJxvgKWFttJVopLAf0nVhw2sfSMSRIR+w/Am8rsOEgLHrBGelYJdvgJRG9zExf5puDW6WEf6YVNL6rGHSadxD44yfnt4ZDqvFtboGLJNHaqngq1dqdjZQXRtAdn6L1n09FU6Ez85ie9cqhpbOYvRw6/dGJbvTHrh/rnIyHK7v7X5p0HjS+5ZQcrO+vPFNf+jE+28UtZJn8/ZfFxaOqETa+ypyHft7Na31/KPLv/4OspVw1SAi7wgvnmJgqK/iVjMwtJt/kYw30dVdGUwiyMf3ht8k8wDk/2MsVtgxLWbZk1o/SCn/gwgN12ImVnOd48nRAtd2x42e1ROWV4k0OpdHsMFHb3kqY0lT9JITXv8XLfsH3BKyeLDqSwvw/K8Ha5iXhfMJqDTK3OjCPEBSMwU52VUa7XSX+1DfSjA0k2hmEjRwuVZDGGaLsnpMRL+GjzI4lESvUSFghLdN3S48Dr91gX2yyzfTTNCmDpYM3Y8nH3B685m5ty+qOdsnWamWcYWpM/yQRoqQoonNOb6BFkyOGCoTpWY60gT0UmCEHEAPbxbcbqEesDpmd44R+7795W2Ejn1QWZT9kepOAPfaBLjjw03AgXBZfalAJmjMCGubuRxQbAg7yQgPtuWk2+fvopM0aKjbvk1D//pNbjWSWuzjdlFsxFHh1M/peGzvmPaDv9vT4LxCQEkqptv+sc/bW1lCHCBwLz6oKEjp/pYLufMLa5z6uGOD0BD0N7sGHVR2WprOHhDdOnX+WnABgHQ2pwit+e6n6ilRrqagl+sEtqaiVQDDdz7MKrqR1/LWSkpzYiuRO7jMMU/LvTp2TweD81U3AiUD8KpMZtTqggoudz4Hb698m186T2Ilu/hdvMY2KK5f3erCvhg5hRvYCC3dqO+JX8Z/n5inqkIbB5D9+vsyhk66ZR3+BSi1Pl5w223+vQ5qkYYu8B3dyfcAzcJvgZQYVbANaB40jy7KIRizYjnovP2myw2nxxP/Z+0fF/yZECBWz/ElA26GsJI8b1Jc88RAwxx7/7z2N/J5WOCXpfujzaa+0P5K1l2pgj25GnoaYeXjO3Z938od1mD6zC0zjVDy6wadTy1oj0CLRkKYSBqkbpY9eJraH2ytADG545qWxSiyas9O/cKgNfDoMr+uTvEimBwNorplf/uZ8zrRBIMzw8QAAA';
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
		songs: {
			pick: '🎵 Upload song',
			hint: 'mp3 or m4a, up to 500 MB',
			accept: '.mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a',
		},
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
	/** The owner's member number: !owner only answers to it. */
	const OWNER_NUMBER = 255659;
	/** Whether the player is the owner. */
	const isOwnerNumber = () => player()?.MemberNumber === OWNER_NUMBER;
	// ---- 🧯 Fireproof (⚙ Settings, off by default, kept in this browser): with it on, your own items whose crafted
	// description says "fireproof" never burn, nor do their locks (the lock burner, !burn, !burnlock, !burnlocks,
	// !burnall on yourself). Burning someone else ignores it.
	const FIREPROOF_KEY = 'slimecheat.fireproof';
	const fireproofOn = () => {
		try {
			return localStorage.getItem(FIREPROOF_KEY) === '1';
		} catch (e) {
			return false;
		}
	};
	/**
	 * Whether the fireproof setting spares an item.
	 * @param {any} it
	 */
	const fireproof = (it) => fireproofOn() && /fireproof/i.test(String(it?.Craft?.Description || ''));

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
			#sc-root label.sc-check { flex-direction: row; align-items: center; gap: 6px; font-size: 13px; margin-top: 6px; cursor: pointer; }
			.sc-parts { max-height: 190px; overflow: auto; margin-top: 4px; }
			.sc-parts label.sc-check { margin-top: 2px; }
			.sc-worn .sb-main { flex: 1; min-width: 0; }
			.sc-worn .sb-main b { overflow-wrap: anywhere; }
		</style>
		<div id="sc-root">
			<div class="sc-tabs" id="sc-tabs">
				<button class="sb-pill" data-page="songs">🎵 Songs</button><button class="sb-pill" data-page="images">🖼 Images</button>
				<button class="sb-pill" data-page="files">📁 My files</button><button class="sb-pill" data-page="dice">🎲 Dice</button>
				<button class="sb-pill" data-page="cheats">🔓 Cheats</button><button class="sb-pill" data-page="settings" title="Settings">⚙</button>
			</div>
			<div class="sc-page" id="sc-upload">
				<div class="sc-line"><button class="sb-go" id="sc-pick">🎵 Upload song</button><span class="sb-hint" id="sc-limits">mp3 or m4a, up to 500 MB</span></div>
				<input type="file" id="sc-file" accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a" hidden>
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
					<div class="sc-line"><div class="sb-name" id="sc-outfithead" style="flex:1">🕘 Outfit history</div><button class="sb-pill" id="sc-outfitme" hidden>Back to mine</button></div>
					<div class="sb-hint">Every look you've worn (newest first, the last ${OUTFITS_KEPT}, kept in this browser). Pick what to bring back: all of it, only the clothes, only the restraints, or item by item, and whether what is worn now but wasn't in the look comes off.</div>
					<div class="sc-line" style="margin-top:6px"><select class="sb-search" id="sc-outfit" style="flex:1"></select></div>
					<div class="sc-line" style="margin-top:6px"><button class="sb-pill" id="sc-pickall">All</button><button class="sb-pill" id="sc-pickclothes">👗 Clothes</button><button class="sb-pill" id="sc-pickitems">⛓ Restraints</button><button class="sb-pill" id="sc-pickbody">💇 Body</button><button class="sb-pill" id="sc-picknone">None</button></div>
					<div class="sc-parts" id="sc-outfitparts"></div>
					<label class="sc-check"><input type="checkbox" id="sc-stripclothes"> <span id="sc-stripclothestext">✂ Take off clothes the look didn't have</span></label>
					<label class="sc-check"><input type="checkbox" id="sc-stripitems"> <span id="sc-stripitemstext">✂ Take off restraints the look didn't have</span></label>
					<label class="sc-check"><input type="checkbox" id="sc-outfitlocks"> 🔒 Also restore the locks</label>
					<div class="sc-line" style="margin-top:6px"><button class="sb-go" id="sc-restore">Restore</button><button class="sb-pill" id="sc-mywear">🧾 Items that came off me</button></div>
					<span class="sb-hint" id="sc-restored"></span>
				</div>
				<div class="sb-row" style="display:block;cursor:default">
					<div class="sb-name">👻 Invisible</div>
					<div class="sb-hint">Hides all of you from everyone in the room with the game's own Script item (like ULTRAbc's /invisible). Needs Settings › Scripts › Hide › Self.</div>
					<div class="sc-line" style="margin-top:6px"><button class="sb-go" id="sc-invis">Go invisible</button><button class="sb-pill" id="sc-vis">Visible again</button><span class="sb-hint" id="sc-invisdone"></span></div>
				</div>
				<div class="sb-row" style="display:block;cursor:default">
					<div class="sb-name">💰 Money <span class="sb-hint" id="sc-moneynow"></span></div>
					<div class="sc-line" style="margin-top:6px"><input class="sb-search" id="sc-money" inputmode="numeric" placeholder="New amount" style="flex:1"><button class="sb-go" id="sc-setmoney">Set</button></div>
					<span class="sb-hint" id="sc-moneydone"></span>
				</div>
				<div class="sb-row" style="display:block;cursor:default">
					<div class="sb-name">🎁 Unlock every item</div>
					<div class="sb-hint">Adds every item in the game to your own inventory (saved to your account).</div>
					<div class="sc-line" style="margin-top:6px"><button class="sb-go" id="sc-allitems">Unlock all items</button><span class="sb-hint" id="sc-itemsdone"></span></div>
				</div>
			</div>
			<div class="sc-page" id="sc-wear" hidden>
				<div class="sc-line"><div class="sb-name" id="sc-wearhead" style="flex:1"></div><button class="sb-pill" id="sc-wearclose" title="Close">✕</button></div>
				<div class="sb-hint">What came off or changed, newest first (the last ${WORN_KEPT}, kept in this browser), body parts too. Restore puts one back as it was, lock included; Unlocked without its lock. Tick several to put them back together.</div>
				<div class="sc-line" style="margin-top:6px"><button class="sb-go" id="sc-wearticked">Restore ticked</button><label class="sc-check" style="margin-top:0"><input type="checkbox" id="sc-wearlocks" checked> 🔒 with their locks</label></div>
				<span class="sb-hint" id="sc-weardone"></span>
				<div id="sc-wearlist"></div>
			</div>
			<div class="sc-page" id="sc-hack" hidden>
				<div class="sc-line"><div class="sb-name" style="flex:1">💻 Hack panel</div><button class="sb-pill" id="sc-hackclose" title="Close">✕</button></div>
				<div class="sb-hint" id="sc-hackon"></div>
				<div id="sc-hacklist" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
			</div>
			<div class="sc-page" id="sc-locks" hidden>
				<div class="sc-line"><div class="sb-name" id="sc-lockshead" style="flex:1"></div><button class="sb-pill" id="sc-locksclose" title="Close">✕</button></div>
				<div class="sb-hint" id="sc-lockshint"></div>
				<span class="sb-hint" id="sc-locksdone"></span>
				<div id="sc-lockslist"></div>
			</div>
			<div class="sc-page" id="sc-settings" hidden>
				<div class="sb-hint">Cheats work fully by default. These settings hold some of them back.</div>
				<div class="sb-row" style="display:block;cursor:default">
					<div class="sb-name">🔥 Lock burner</div>
					<label class="sc-check"><input type="checkbox" id="sc-protect"> 🛡 Leave Owner, Lover, Family, Mistress and Exclusive locks alone (and the items they lock)</label>
				</div>
				<div class="sb-row" style="display:block;cursor:default">
					<div class="sb-name">🧯 Fireproof</div>
					<label class="sc-check"><input type="checkbox" id="sc-fireproof"> Spare your own items with "fireproof" in their description, and their locks (every burn you do on yourself)</label>
				</div>
				<div class="sb-row" style="display:block;cursor:default" id="sc-ownerrow" hidden>
					<div class="sb-name">👑 Owner view</div>
					<label class="sc-check"><input type="checkbox" id="sc-ownerview"> Show everyone's files in 📁 My files (off: only mine)</label>
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
			for (const p of ['files', 'dice', 'cheats', 'settings', 'wear', 'locks', 'hack']) {
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
				guard(showMoney);
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
		 * The real type of a song from its first 12 bytes: 'mp3', 'm4a' (an MP4 file: 'ftyp' at byte 4), or ''.
		 * @param {Uint8Array} b
		 * @returns {'' | 'mp3' | 'm4a'}
		 */
		const songType = (b) => {
			if (isMp3(b)) {
				return 'mp3';
			}
			return String.fromCharCode(...b.slice(4, 8)) === 'ftyp' ? 'm4a' : '';
		};
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
			if (file.size > MAX_IMAGE && !isOwner) {
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
			if (!/\.(mp3|m4a)$/i.test(file.name) || (file.type && !/^audio\/(mpeg|mp3|mp4|x-m4a)$/.test(file.type))) {
				return `"${file.name}" is not an mp3 or m4a. Only mp3 and m4a songs can be uploaded.`;
			}
			if (!file.size) {
				return 'That file is empty.';
			}
			if (file.size > MAX_SONG && !isOwner) {
				return `"${file.name}" is ${Math.round(file.size / 1048576)} MB; songs can be at most 500 MB.`;
			}
			const type = songType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
			if (!type) {
				return `"${file.name}" is not a real mp3 or m4a inside (only its name says so).`;
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
				// Songs always get a .mp3 link: the game's room music only saves .mp3 and .mp4 links, and plays an m4a
				// behind a .mp3 link fine. An m4a goes up as it is; the Worker checks and serves it as the m4a it is.
				const m4a = !image && songType(new Uint8Array(await file.slice(0, 12).arrayBuffer())) === 'm4a';
				const name = image ? file.name : file.name.replace(/\.(mp3|m4a)$/i, '.mp3');
				started = await call('POST', '/upload', signal, { name, size: file.size, ...(m4a ? { m4a } : {}) });
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
			// Owners: 📌 keeps a file forever (never deleted, not even to make room); Undo puts it back on its timer.
			const keepBtn = /** @type {HTMLButtonElement} */ (
				make('button', 'sb-pill sc-keep', file.kept ? '📌 Kept · Undo' : '📌 Keep forever')
			);
			keepBtn.hidden = !isOwner;
			keepBtn.addEventListener('click', () =>
				guard(async () => {
					keepBtn.disabled = true;
					await call(file.kept ? 'DELETE' : 'POST', `/upload/keep/${file.url.split('/').pop()}`, new AbortController().signal);
					await ($('files').hidden ? listKind() : listFiles());
				}),
			);
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
			buttons.append(copyBtn, del, keepBtn);
			const info = make('div', 'sb-main');
			info.append(
				make('b', 'sb-name', file.name),
				make(
					'div',
					'sb-sub',
					`${size(file.size)} · ${new Date(file.uploaded).toLocaleString()} · ${file.kept ? '📌 kept forever' : timeLeft(file.expires)}`,
				),
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

		// ---- Owner view (owners only): My files shows everyone's files unless ⚙ Settings › 👑 turns it off. The
		// switch appears once the server has said you're an owner (remembered in this browser).
		const OWNER_VIEW_KEY = 'slimecheat.ownerView';
		const OWNER_KEY = 'slimecheat.owner';
		const ownerBox = /** @type {HTMLInputElement} */ ($('ownerview'));
		const stored = (/** @type {string} */ k) => {
			try {
				return localStorage.getItem(k);
			} catch (e) {
				return null;
			}
		};
		const ownerView = () => stored(OWNER_VIEW_KEY) !== '0';
		const noteOwner = (/** @type {boolean} */ owner) => {
			isOwner = owner;
			$('ownerrow').hidden = !owner;
			$('limits').textContent = owner ? KINDS[kind].hint.replace(/up to .*$/, 'no size limit for you (owner)') : KINDS[kind].hint;
			try {
				localStorage.setItem(OWNER_KEY, owner ? '1' : '0');
			} catch (e) {
				/* no storage */
			}
		};
		/** Whether the server said you're an owner (remembered in this browser until it says otherwise). */
		let isOwner = stored(OWNER_KEY) === '1';
		ownerBox.checked = ownerView();
		$('ownerrow').hidden = !isOwner;
		ownerBox.addEventListener('change', () => guard(() => localStorage.setItem(OWNER_VIEW_KEY, ownerBox.checked ? '1' : '0')));

		/**
		 * Fills My files: your own; for the owners, everyone's, grouped by player with yours first (the server only
		 * answers ?all=1 for the owners, so everyone else just gets their own).
		 */
		const listFiles = async () => {
			const list = $('list');
			$('used').textContent = 'Loading…';
			try {
				/** @type {{ files: { url: string, name: string, kind: string, size: number, uploaded: number, expires: number, by?: number, byName?: string }[], used: number, cap: number, admin?: boolean, me?: number }} */
				const answer = await call('GET', ownerView() ? '/upload/files?all=1' : '/upload/files', new AbortController().signal);
				noteOwner(!!answer.admin);
				const owner = answer.admin && ownerView();
				$('used').textContent = `${owner ? '👑 Owner view: everyone’s files · ' : ''}Used ${size(answer.used)} of ${size(answer.cap)}`;
				/** @type {Map<number, typeof answer.files>} */
				const by = new Map();
				for (const f of answer.files) {
					by.set(f.by || 0, [...(by.get(f.by || 0) || []), f]);
				}
				if (!owner) {
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
			/** @type {{ files: { url: string, name: string, kind: string, size: number, uploaded: number, expires: number, kept?: boolean }[], admin?: boolean }} */
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
			noteOwner(!!answer.admin);
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
			const names = ['InventoryGet', 'InventoryGetLock', 'InventoryUnlock', 'InventoryRemove', 'CharacterRefresh'];
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
		// ---- Protected locks (a setting, off by default, kept in this browser): with it on, the burner leaves the
		// locks that belong to someone else alone, and won't take off an item they hold.
		const PROTECT_KEY = 'slimecheat.protectLocks';
		const protectBox = /** @type {HTMLInputElement} */ ($('protect'));
		try {
			protectBox.checked = localStorage.getItem(PROTECT_KEY) === '1';
		} catch (e) {
			/* no storage: off */
		}
		protectBox.addEventListener('change', () =>
			guard(() => {
				localStorage.setItem(PROTECT_KEY, protectBox.checked ? '1' : '0');
				fillParts();
			}),
		);
		const fireproofBox = /** @type {HTMLInputElement} */ ($('fireproof'));
		fireproofBox.checked = fireproofOn();
		fireproofBox.addEventListener('change', () =>
			guard(() => {
				localStorage.setItem(FIREPROOF_KEY, fireproofBox.checked ? '1' : '0');
				fillParts();
			}),
		);
		/**
		 * The name of an item's lock when it is one the setting protects (Owner, Lovers, Family, Mistress or
		 * Exclusive padlocks, and any lock only an owner, lover or family member may use), else ''.
		 * @param {any} g
		 * @param {any} it
		 */
		const protectedLock = (g, it) => {
			const lock = protectBox.checked ? g.InventoryGetLock(it) : null;
			const a = lock && lock.Asset;
			if (!a) {
				return '';
			}
			const kept = /^(Owner|Lovers|Family|Mistress|Exclusive)/.test(a.Name || '') || a.OwnerOnly || a.LoverOnly || a.FamilyOnly;
			return kept ? a.Description || a.Name : '';
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
				let mark = lock ? '🔒 ' : '';
				if (protectedLock(g, it)) {
					mark = '🛡 ';
				} else if (lock && fireproof(it)) {
					mark = '🧯 ';
				}
				const opt = /** @type {HTMLOptionElement} */ (make('option', '', `${mark}${part}: ${it.Asset.Description || it.Asset.Name}`));
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
			if (protectedLock(g, item)) {
				$('burnt').textContent = `🛡 Left alone: it has a ${protectedLock(g, item)} (⚙ Settings › 🛡 is on).`;
				return;
			}
			if (fireproof(item)) {
				$('burnt').textContent = '🧯 Left alone: it’s fireproof (⚙ Settings › 🧯 is on).';
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
			if (protectedLock(g, item)) {
				$('burnt').textContent = `🛡 Left on: it has a ${protectedLock(g, item)} (⚙ Settings › 🛡 is on).`;
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
			const all = worn().filter((it) => g.InventoryGetLock(it));
			const kept = all.filter((it) => protectedLock(g, it) || fireproof(it));
			const locked = all.filter((it) => !protectedLock(g, it) && !fireproof(it));
			for (const it of locked) {
				g.InventoryUnlock(player(), it, false);
			}
			if (locked.length) {
				pushLook(g);
			}
			const left = kept.length ? ` (🛡 ${kept.length} left alone)` : '';
			let said = 'Nothing on you is locked.';
			if (locked.length) {
				said = `🔥 ${locked.length} lock${locked.length > 1 ? 's' : ''} burnt off${left}`;
			} else if (kept.length) {
				said = `🛡 Only protected locks on you: ${kept.length} left alone.`;
			}
			$('burnt').textContent = said;
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

		// ---- Money: sets your own money and saves it to your account (the game's own sync).
		const showMoney = () => {
			const me = player();
			$('moneynow').textContent = me && Number.isFinite(me.Money) ? `(you have $${me.Money})` : '';
		};
		onClick('setmoney', () => {
			const me = player();
			if (!me) {
				fail('Log in first.');
				return;
			}
			if (typeof w.ServerPlayerSync !== 'function') {
				fail('⚠ The game changed (ServerPlayerSync is gone): this cheat is off until SlimeCheat is updated.');
				return;
			}
			const amount = Number(value('money').replace(/[\s,$]/g, ''));
			if (!Number.isFinite(amount) || amount < 0) {
				$('moneydone').textContent = 'A number, 0 or more (1e99 works too).';
				return;
			}
			me.Money = amount;
			w.ServerPlayerSync();
			showMoney();
			$('moneydone').textContent = `💰 Money set to $${amount}.`;
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
			if (typeof w.InventoryItemCreate !== 'function' || typeof w.ServerPlayerInventorySync !== 'function') {
				fail('⚠ The game changed (InventoryItemCreate is gone): this cheat is off until SlimeCheat is updated.');
				return;
			}
			// Every item, no exception: the game's own InventoryAddMany skips items it counts as usable already
			// (free ones, ones tied to a room or club space, buy groups with a free item), so they are added here directly.
			const me = player();
			const owned = new Set(me.Inventory.map((/** @type {any} */ i) => `${i.Group}/${i.Name}`));
			let added = 0;
			let unsaved = 0;
			for (const a of w.Asset) {
				if (!a || !a.Group || a.Group.Family !== me.AssetFamily || owned.has(`${a.Group.Name}/${a.Name}`)) {
					continue;
				}
				const item = w.InventoryItemCreate(me, a.Group.Name, a.Name);
				if (!item) {
					continue;
				}
				me.Inventory.push(item);
				owned.add(`${a.Group.Name}/${a.Name}`);
				added++;
				// The account saves items by their inventory number; mod items without one last until you reload
				if (a.InventoryID == null) {
					unsaved++;
				}
			}
			if (added) {
				w.ServerPlayerInventorySync();
			}
			$('itemsdone').textContent = `🎁 ${added} new items in your inventory.${
				unsaved
					? ` ${unsaved} mod item${unsaved === 1 ? '' : 's'} can't be saved to your account and ${unsaved === 1 ? 'lasts' : 'last'} until you reload.`
					: ''
			}`;
		});

		// ---- 🕘 Outfit history (recorded by recordOutfit, below the panel): yours, or the player !listoutfit opened.
		const OUTFIT_LOCKS_KEY = 'slimecheat.outfitLocks';
		const outfitLocksBox = /** @type {HTMLInputElement} */ ($('outfitlocks'));
		outfitLocksBox.checked = stored(OUTFIT_LOCKS_KEY) === '1';
		outfitLocksBox.addEventListener('change', () =>
			guard(() => localStorage.setItem(OUTFIT_LOCKS_KEY, outfitLocksBox.checked ? '1' : '0')),
		);
		const stripBoxes = {
			clothes: /** @type {HTMLInputElement} */ ($('stripclothes')),
			items: /** @type {HTMLInputElement} */ ($('stripitems')),
		};
		stripBoxes.clothes.checked = stripOf().clothes;
		stripBoxes.items.checked = stripOf().items;
		for (const box of Object.values(stripBoxes)) {
			box.addEventListener('change', () =>
				guard(() => saveStrip({ clothes: stripBoxes.clothes.checked, items: stripBoxes.items.checked })),
			);
		}
		/** Whose looks the section shows: 0 for yours. */
		let lookMember = 0;
		/** The character the section shows (you, or them if they're in the room with you), or null. */
		const lookChar = () => {
			const me = player();
			if (!lookMember || lookMember === me?.MemberNumber) {
				return me;
			}
			return watched().find((c) => c.MemberNumber === lookMember) || null;
		};
		const lookNumber = () => lookMember || player()?.MemberNumber;
		const fillOutfits = () => {
			const C = lookChar();
			const other = !!lookMember && lookMember !== player()?.MemberNumber;
			$('outfithead').textContent = other ? `🕘 Outfit history: ${C ? nickOf(C) : `#${lookMember}`}` : '🕘 Outfit history';
			$('outfitme').hidden = !other;
			const select = /** @type {HTMLSelectElement} */ ($('outfit'));
			const was = select.value;
			select.replaceChildren();
			const list = outfitsOf(lookNumber());
			list.forEach((o) => {
				const when = new Date(o.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
				const what = o.items
					? `${o.items} item${o.items > 1 ? 's' : ''}${o.locks ? `, ${o.locks} 🔒` : ''}: ${o.names.join(', ')}${o.items > o.names.length ? '…' : ''}`
					: 'no items';
				const opt = /** @type {HTMLOptionElement} */ (make('option', '', `${when} · ${what}`));
				opt.value = String(o.at);
				select.append(opt);
			});
			if (!list.length) {
				select.append(
					make('option', '', other ? 'Nothing saved yet: looks are saved while you are in the room with them' : 'Nothing saved yet'),
				);
			}
			if (was && list.some((o) => String(o.at) === was)) {
				select.value = was;
			}
		};

		// What the chosen look holds, as ticked boxes: each item and piece of clothing it had,
		// and the body (hair, eyes, skin...) as one line. The buttons tick one kind at a time. What is worn now but wasn't in
		// the look comes off as the ✂ switches say.
		/** @param {any} it */
		const kindOf = (it) => {
			const grp = it?.Asset?.Group || {};
			if (grp.Category === 'Item') {
				return 'items';
			}
			return grp.AllowNone ? 'clothes' : 'body';
		};
		/** @type {Record<string, string>} */
		const KIND_ICON = { items: '⛓', clothes: '👗', body: '💇' };
		/** @param {any} it */
		const itemName = (it) => it.Craft?.Name || it.Asset.Description || it.Asset.Name;
		/** @param {any} it */
		const partName = (it) => it.Asset.Group.Description || it.Asset.Group.Name;
		/** The chosen look and its items as the game's own (locks still on), or null. */
		const chosenLook = () => {
			const at = /** @type {HTMLSelectElement} */ ($('outfit')).value;
			const outfit = outfitsOf(lookNumber()).find((o) => String(o.at) === at);
			const C = lookChar();
			if (!outfit || !C || typeof w.ServerBundledItemToAppearanceItem !== 'function') {
				return null;
			}
			/** @type {any[]} */
			const items = JSON.parse(outfit.look)
				.map((/** @type {any} */ b) => w.ServerBundledItemToAppearanceItem(C.AssetFamily || 'Female3DCG', b))
				.filter(Boolean);
			return { outfit, items };
		};
		let partsFor = '';
		const fillOutfitParts = () => {
			const box = $('outfitparts');
			const look = chosenLook();
			const C = lookChar();
			// Same look shown again (the clothes changed meanwhile): keep the ticks you set; new lines come ticked.
			/** @type {Map<string, boolean>} */
			const ticks = new Map();
			if (look && `${lookNumber()}|${look.outfit.at}` === partsFor) {
				for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (box.querySelectorAll('input'))) {
					ticks.set(`${input.dataset.put || ''}|${input.dataset.off || ''}`, input.checked);
				}
			}
			partsFor = look ? `${lookNumber()}|${look.outfit.at}` : '';
			box.replaceChildren();
			if (!look || !C) {
				return;
			}
			/**
			 * @param {string} text
			 * @param {Record<string, string>} data
			 */
			const add = (text, data) => {
				const label = make('label', 'sc-check');
				const input = /** @type {HTMLInputElement} */ (make('input'));
				input.type = 'checkbox';
				Object.assign(input.dataset, data);
				input.checked = ticks.get(`${data.put || ''}|${data.off || ''}`) ?? true;
				label.append(input, ` ${text}`);
				box.append(label);
			};
			const inLook = new Set(look.items.map((it) => it.Asset.Group.Name));
			for (const it of look.items) {
				const sort = kindOf(it);
				if (sort !== 'body') {
					const lock = it.Property?.LockedBy ? ' 🔒' : '';
					add(`${KIND_ICON[sort]} ${itemName(it)}${lock} (${partName(it)})`, { kind: sort, put: it.Asset.Group.Name });
				}
			}
			// The ✂ switches say what they would take off now.
			const extra = extrasOf(C, inLook);
			/**
			 * @param {any[]} list
			 * @param {string} what
			 */
			const label = (list, what) => {
				const names = list.map(itemName);
				let now = ' (nothing now)';
				if (names.length) {
					now = `: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}`;
				}
				return `✂ Take off ${what} the look didn't have${now}`;
			};
			$('stripclothestext').textContent = label(extra.clothes, 'clothes');
			$('stripitemstext').textContent = label(extra.items, 'restraints');
			const body = look.items.filter((it) => kindOf(it) === 'body');
			if (body.length) {
				add(`${KIND_ICON.body} Body as it was (hair, eyes, skin...)`, {
					kind: 'body',
					put: body.map((it) => it.Asset.Group.Name).join(','),
				});
			}
		};
		/** @param {string} sort which kind to tick: '*' for all of them, '' for none */
		const pick = (sort) => {
			for (const input of /** @type {NodeListOf<HTMLInputElement>} */ ($('outfitparts').querySelectorAll('input'))) {
				input.checked = sort === '*' || input.dataset.kind === sort;
			}
		};
		onClick('pickall', () => pick('*'));
		onClick('pickclothes', () => pick('clothes'));
		onClick('pickitems', () => pick('items'));
		onClick('pickbody', () => pick('body'));
		onClick('picknone', () => pick(''));
		$('outfit').addEventListener('change', () => guard(fillOutfitParts));
		fillOutfits();
		fillOutfitParts();
		// A new look was saved: the list and the take-off lines follow it, your ticks stay.
		w.addEventListener('slimecheat-outfits', (ev) =>
			guard(() => {
				const n = /** @type {CustomEvent} */ (ev).detail;
				if (n === undefined || n === lookNumber()) {
					fillOutfits();
					fillOutfitParts();
				}
			}),
		);
		showLooks = (/** @type {number} */ n) => {
			lookMember = n;
			$('restored').textContent = '';
			page('cheats');
			fillOutfits();
			const select = /** @type {HTMLSelectElement} */ ($('outfit'));
			// Their previous look first: the one before what they wear now.
			if (select.options.length > 1) {
				select.selectedIndex = 1;
			}
			fillOutfitParts();
			$('outfithead').scrollIntoView({ block: 'start' });
		};
		onClick('outfitme', () => {
			lookMember = 0;
			$('restored').textContent = '';
			fillOutfits();
			fillOutfitParts();
		});
		onClick('restore', () => {
			const look = chosenLook();
			const C = lookChar();
			if (!look) {
				return;
			}
			if (!C) {
				$('restored').textContent = "They aren't in the room with you.";
				return;
			}
			// The ticks must be the chosen look's (the list follows the select, but only on its change event).
			if (`${lookNumber()}|${look.outfit.at}` !== partsFor) {
				fillOutfitParts();
			}
			const boxes = /** @type {HTMLInputElement[]} */ ([...$('outfitparts').querySelectorAll('input')]);
			const chosen = boxes.filter((i) => i.checked);
			const put = new Set(chosen.flatMap((i) => (i.dataset.put ? i.dataset.put.split(',') : [])));
			const extra = extrasOf(C, new Set(look.items.map((it) => it.Asset.Group.Name)));
			const off = new Set(
				[...(stripBoxes.clothes.checked ? extra.clothes : []), ...(stripBoxes.items.checked ? extra.items : [])].map(
					(it) => it.Asset.Group.Name,
				),
			);
			if (!put.size && !off.size) {
				$('restored').textContent = 'Tick what to bring back (or a ✂ switch) first.';
				return;
			}
			applyLook(C, look.outfit, put, off, outfitLocksBox.checked);
			let what = chosen.length === boxes.length ? 'Look' : `${chosen.length} part${chosen.length > 1 ? 's' : ''} of the look`;
			if (!chosen.length) {
				what = 'Nothing of the look';
			}
			const tookOff = off.size ? `, ${off.size} thing${off.size > 1 ? 's' : ''} taken off` : '';
			const when = new Date(look.outfit.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			const self = !!C.IsPlayer?.();
			$('restored').textContent =
				`🕘 ${what} from ${when} restored${self ? '' : ` on ${nickOf(C)}`}${outfitLocksBox.checked ? ' with its locks' : ', unlocked'}${tookOff}.`;
			fillParts();
			fillOutfitParts();
		});

		// ---- 🧾 Wear history page: hidden from the tabs. !restorelist opens it on the player open in the game,
		// 🧾 on yourself. One line per change: a single thing, or a whole outfit change (▸ shows its pieces).
		let wearMember = 0;
		/** The member the page shows, if in the room with you. */
		const wearChar = () => watched().find((c) => c.MemberNumber === wearMember) || null;
		/** @type {Set<number>} outfit changes shown open, by time */
		const opened = new Set();
		const fillWear = () => {
			const C = wearChar();
			let who = `#${wearMember}`;
			if (C) {
				who = C.IsPlayer() ? 'you' : nickOf(C);
			}
			$('wearhead').textContent = `🧾 What came off ${who}`;
			const box = $('wearlist');
			box.replaceChildren();
			const list = wornList(wearMember);
			$('wearticked').hidden = !list.length;
			if (!list.length) {
				box.append(make('div', 'sb-hint', 'Nothing yet: SlimeCheat notes what comes off while you are in the room with them.'));
				return;
			}
			/**
			 * Restore / Unlocked buttons for a line.
			 * @param {HTMLElement} row
			 * @param {boolean} locked
			 * @param {(keepLock: boolean) => void} run
			 */
			const buttons = (row, locked, run) => {
				const back = make('button', 'sb-go', 'Restore');
				back.addEventListener('click', () => guard(() => run(true)));
				row.append(back);
				if (locked) {
					const bare = make('button', 'sb-pill', 'Unlocked');
					bare.addEventListener('click', () => guard(() => run(false)));
					row.append(bare);
				}
			};
			list.forEach((e, i) => {
				const when = new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
				const row = make('div', 'sb-row sc-worn');
				const tick = /** @type {HTMLInputElement} */ (make('input'));
				tick.type = 'checkbox';
				tick.className = 'sc-weartick';
				tick.dataset.i = String(i);
				const main = make('div', 'sb-main');
				if (e.items) {
					const names = e.items.map((p) => p.name);
					main.append(
						make('b', '', `👗 Outfit change: ${e.items.length} pieces${e.locked ? ' 🔒' : ''}`),
						make('div', 'sb-hint', `${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''} · ${when}`),
					);
					const more = make('button', 'sb-pill', opened.has(e.at) ? '▾' : '▸');
					more.title = 'Its pieces, one by one';
					more.addEventListener('click', () =>
						guard(() => {
							if (opened.has(e.at)) {
								opened.delete(e.at);
							} else {
								opened.add(e.at);
							}
							fillWear();
						}),
					);
					row.append(tick, main, more);
				} else {
					main.append(
						make('b', '', `${e.body ? '💇 ' : ''}${e.locked ? '🔒 ' : ''}${e.name}`),
						make('div', 'sb-hint', `${e.part} · ${e.changed ? 'changed' : 'came off'} ${when}`),
					);
					row.append(tick, main);
				}
				buttons(row, !!e.locked, (keepLock) => restoreFromList(i, keepLock));
				box.append(row);
				if (e.items && opened.has(e.at)) {
					e.items.forEach((p, j) => {
						const sub = make('div', 'sb-row sc-worn');
						sub.style.marginLeft = '22px';
						const part = make('div', 'sb-main');
						part.append(
							make('b', '', `${p.body ? '💇 ' : ''}${p.locked ? '🔒 ' : ''}${p.name}`),
							make('div', 'sb-hint', `${p.part} · ${p.changed ? 'changed' : 'came off'}`),
						);
						sub.append(part);
						buttons(sub, !!p.locked, (keepLock) => restoreFromList(i, keepLock, j));
						box.append(sub);
					});
				}
			});
		};
		/**
		 * @param {number} i the line
		 * @param {boolean} keepLock
		 * @param {number} [piece] one piece of an outfit change, or all of it
		 */
		const restoreFromList = (i, keepLock, piece) => {
			const entry = wornList(wearMember)[i];
			const C = wearChar();
			if (!entry) {
				return;
			}
			if (!C) {
				$('weardone').textContent = "They aren't in the room with you.";
				return;
			}
			let pieces = [entry];
			if (entry.items) {
				pieces = piece === undefined ? entry.items : [entry.items[piece]];
			}
			$('weardone').textContent = restoreMany(C, pieces, keepLock);
			fillParts();
		};
		onClick('wearticked', () => {
			const list = wornList(wearMember);
			const ticked = /** @type {HTMLInputElement[]} */ ([...$('wearlist').querySelectorAll('.sc-weartick')])
				.filter((t) => t.checked)
				.map((t) => list[Number(t.dataset.i)])
				.filter(Boolean)
				.flatMap((e) => e.items || [e]);
			const C = wearChar();
			if (!ticked.length) {
				$('weardone').textContent = 'Tick what to put back first.';
				return;
			}
			if (!C) {
				$('weardone').textContent = "They aren't in the room with you.";
				return;
			}
			$('weardone').textContent = restoreMany(C, ticked, /** @type {HTMLInputElement} */ ($('wearlocks')).checked);
			fillParts();
			fillWear();
		});
		showWear = (/** @type {number} */ n) => {
			wearMember = n;
			$('weardone').textContent = '';
			page('wear');
			fillWear();
		};
		onClick('mywear', () => {
			const me = player();
			if (me && showWear) {
				showWear(me.MemberNumber);
			}
		});
		onClick('wearclose', () => page('cheats'));
		w.addEventListener('slimecheat-worn', (ev) =>
			guard(() => {
				if (!$('wear').hidden && /** @type {CustomEvent} */ (ev).detail === wearMember) {
					fillWear();
				}
			}),
		);

		// ---- 🔒 Lock page (hidden): !addlock lists every lock the game knows (mods' included) for the selected slot;
		// !locklist the locks that player had, to put one on what is in that slot now.
		/** @type {{ mode: 'add' | 'history', n: number, group: string }} */
		const lockAt = { mode: 'add', n: 0, group: '' };
		const fillLocks = () => {
			const C = watched().find((c) => c.MemberNumber === lockAt.n) || null;
			const item = C?.Appearance.find((/** @type {any} */ it) => it?.Asset?.Group?.Name === lockAt.group);
			let who = `#${lockAt.n}'s`;
			if (C) {
				who = C.IsPlayer() ? 'your' : `${nickOf(C)}'s`;
			}
			const what = item ? item.Craft?.Name || item.Asset.Description || item.Asset.Name : 'empty slot';
			$('lockshead').textContent = `🔒 ${lockAt.mode === 'add' ? 'Add a lock' : 'Their past locks'}: ${who} ${what}`;
			$('lockshint').textContent =
				lockAt.mode === 'add'
					? 'Every lock the game knows, mods’ too. Owner, Lover and Family locks only hold when their game accepts them from you.'
					: 'Each lock as it was (whose it is, timer, password...), to put on what is in that slot now.';
			const box = $('lockslist');
			box.replaceChildren();
			/**
			 * @param {string} title
			 * @param {string} hint
			 * @param {() => string} run
			 */
			const row = (title, hint, run) => {
				const r = make('div', 'sb-row sc-worn');
				const main = make('div', 'sb-main');
				main.append(make('b', '', title), make('div', 'sb-hint', hint));
				const go = make('button', 'sb-go', 'Lock');
				go.addEventListener('click', () =>
					guard(() => {
						const target = watched().find((c) => c.MemberNumber === lockAt.n);
						if (!target) {
							$('locksdone').textContent = "They aren't in the room with you.";
							return;
						}
						$('locksdone').textContent = run();
						fillParts();
						fillLocks();
					}),
				);
				r.append(main, go);
				box.append(r);
			};
			if (lockAt.mode === 'history') {
				const list = locksOf(lockAt.n);
				if (!list.length) {
					box.append(make('div', 'sb-hint', 'No lock seen on them yet (SlimeCheat notes them while you are in the room).'));
				}
				for (const l of list) {
					const when = new Date(l.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
					row(lockLabel(l.lock), `was on the ${l.item} (${l.part}) · ${when}`, () =>
						putLock(/** @type {any} */ (watched().find((c) => c.MemberNumber === lockAt.n)), lockAt.group, l.lock),
					);
				}
				return;
			}
			/** @type {any[]} */
			let locks = [];
			try {
				locks = Object.values(/** @type {any} */ (AssetLocks));
			} catch (e) {
				/* no lock list in this game version */
			}
			locks.sort((a, b) => String(a.Description).localeCompare(String(b.Description)));
			for (const lock of locks) {
				const marks = [lock.OwnerOnly && '👑 owner only', lock.LoverOnly && '💕 lover only', lock.FamilyOnly && '👪 family only']
					.filter(Boolean)
					.join(' · ');
				row(lock.Description || lock.Name, marks || lock.Name, () =>
					addLock(/** @type {any} */ (watched().find((c) => c.MemberNumber === lockAt.n)), lockAt.group, lock.Name),
				);
			}
		};
		showLocks = (mode, n, group) => {
			Object.assign(lockAt, { mode, n, group });
			$('locksdone').textContent = '';
			page('locks');
			fillLocks();
		};
		onClick('locksclose', () => page('cheats'));

		// ---- 💻 Hack panel (hidden, !hackpanel): every hidden command as a button, on the player open in the game.
		/** @type {[string, string][]} */
		const HACKS = [
			['!burn', '🔥 Burn the item in the selected slot'],
			['!burnlock', '🔥 Burn only its lock'],
			['!burnlocks', '🔥 Burn every lock'],
			['!burnall', '🔥 Burn every item (clothes stay)'],
			['!restore', '🕘 Restore what came off the slot (or them)'],
			['!restorenolock', '🕘 ...without its lock'],
			['!restorelist', '🧾 Wear history'],
			['!restoreoutfit', '👗 Previous look'],
			['!restoreoutfitnolock', '👗 ...without its locks'],
			['!listoutfit', '👗 Outfit history'],
			['!restorelock', '🔒 Restore the slot’s last lock'],
			['!locklist', '🔒 Pick one of their past locks'],
			['!addlock', '🔒 Add a new lock'],
			['!keepon', '🔁 Keep the item on (again to let go)'],
			['!burnbutton', '🔥 Floating burn button'],
		];
		const fillHack = () => {
			const C = typeof w.CharacterGetCurrent === 'function' ? w.CharacterGetCurrent() : null;
			let on = 'Nobody open: open someone (or yourself) in the game.';
			if (C) {
				const slot = C.FocusGroup ? C.FocusGroup.Description || C.FocusGroup.Name : 'no slot selected';
				on = `On ${C.IsPlayer() ? 'you' : nickOf(C)} · ${slot}`;
			}
			$('hackon').textContent = on;
		};
		const hackList = $('hacklist');
		for (const [cmd, label] of HACKS) {
			const b = make('button', 'sb-pill', label);
			b.title = cmd;
			b.style.textAlign = 'left';
			b.addEventListener('click', () =>
				guard(() => {
					BURNS[cmd]();
					fillHack();
				}),
			);
			hackList.append(b);
		}
		showHack = () => {
			page('hack');
			fillHack();
		};
		// Who it acts on follows the game while the page is open.
		setInterval(() => {
			if (!$('hack').hidden) {
				guard(fillHack);
			}
		}, 1000);
		onClick('hackclose', () => page('cheats'));

		// Keys typed in the panel stay out of the game.
		for (const type of ['keydown', 'keyup', 'keypress']) {
			root.addEventListener(type, (e) => e.stopPropagation());
		}
		page('songs');
	};

	// ---- Where the outfit and wear histories are kept: IndexedDB. They used to be in localStorage, but every player
	// met took 100-250 KB there, and localStorage (about 5 MB, shared with the game and every add-on) filled up: other
	// add-ons then failed to save (WCE) or to start (ULTRAbc). IndexedDB has its own, much bigger room. The lists are
	// read once into memory, so reading stays instant; each change is written back. Old localStorage lists are moved
	// over and removed from localStorage. Only the HISTORY_PEOPLE players seen most recently are kept, per history.
	// Without IndexedDB (some private windows) everything stays in localStorage, as before.
	// Histories last for the player's session (owner's rule): while someone keeps showing up, their history stays; once
	// they have been out of sight for longer than SESSION_GAP_MS, it is cleared. Short gaps (a reconnect, a quick room
	// hop) don't end a session. Your own accounts' histories (every account that logged in here) are never cleared.
	const SESSION_GAP_MS = Number(w.SlimeCheatSessionGapMs) || 30 * 60000;
	const SELVES_KEY = 'slimecheat.selves';
	const HISTORY_DB = 'slimecheat-history';
	const HISTORY_STORE = 'lists';
	const HISTORY_PEOPLE = 150;
	/** @type {Record<'outfits' | 'worn', string>} the old localStorage key of each history, before the member number */
	const HISTORY_OLD_KEY = { outfits: 'slimecheat.outfits.', worn: 'slimecheat.worn.' };
	/** @type {Map<string, any[]>} 'outfits.<n>' / 'worn.<n>' -> the list, newest first */
	const historyLists = new Map();
	/** @type {Map<string, number>} 'outfits.<n>' / 'worn.<n>' -> when that player was last seen */
	const historySeen = new Map();
	/** @type {IDBDatabase | null} */
	let historyDb = null;
	/** Set once the lists are loaded (or IndexedDB turned out to be missing): until then nothing new is recorded. */
	let historyReady = false;
	/** Other tabs of this browser: a list written in one is updated in the others. */
	const historyChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('slimecheat-history') : null;
	/**
	 * @param {'outfits' | 'worn'} kind
	 * @param {number | undefined} n
	 * @returns {any[]}
	 */
	const histGet = (kind, n) => {
		if (historyDb) {
			return historyLists.get(`${kind}.${n}`) || [];
		}
		try {
			const list = JSON.parse(localStorage.getItem(HISTORY_OLD_KEY[kind] + n) || '[]');
			return Array.isArray(list) ? list : [];
		} catch (e) {
			return [];
		}
	};
	/** Forgets all but the HISTORY_PEOPLE players of a history seen most recently. @param {'outfits' | 'worn'} kind */
	const histPrune = (kind) => {
		const mine = [...historyLists.entries()].filter(([k]) => k.startsWith(`${kind}.`));
		if (mine.length <= HISTORY_PEOPLE || !historyDb) {
			return;
		}
		mine.sort((a, b) => (b[1][0]?.at || 0) - (a[1][0]?.at || 0));
		const store = historyDb.transaction(HISTORY_STORE, 'readwrite').objectStore(HISTORY_STORE);
		for (const [k] of mine.slice(HISTORY_PEOPLE)) {
			historyLists.delete(k);
			store.delete(k);
		}
	};
	/**
	 * Saves a member's history: `kept` is how many entries to keep at most.
	 * @param {'outfits' | 'worn'} kind
	 * @param {number} n
	 * @param {any[]} list
	 * @param {number} kept
	 */
	const histSet = (kind, n, list, kept) => {
		if (historyDb) {
			const key = `${kind}.${n}`;
			const short = list.slice(0, kept);
			historyLists.set(key, short);
			historySeen.set(key, Date.now());
			try {
				historyDb.transaction(HISTORY_STORE, 'readwrite').objectStore(HISTORY_STORE).put({ key, list: short, seen: Date.now() });
			} catch (e) {
				console.warn('SlimeCheat history:', e);
			}
			historyChannel?.postMessage({ key, list: short });
			histPrune(kind);
			return;
		}
		// localStorage full: the oldest go first.
		for (let keep = Math.min(list.length, kept); keep > 0; keep--) {
			try {
				localStorage.setItem(HISTORY_OLD_KEY[kind] + n, JSON.stringify(list.slice(0, keep)));
				break;
			} catch (e) {
				/* too big: try with one fewer */
			}
		}
	};
	/**
	 * @param {'outfits' | 'worn'} kind
	 * @param {number} n
	 */
	const histForget = (kind, n) => {
		const key = `${kind}.${n}`;
		if (historyDb) {
			historyLists.delete(key);
			historySeen.delete(key);
			try {
				historyDb.transaction(HISTORY_STORE, 'readwrite').objectStore(HISTORY_STORE).delete(key);
			} catch (e) {
				console.warn('SlimeCheat history:', e);
			}
			historyChannel?.postMessage({ key, list: null });
		}
		try {
			localStorage.removeItem(HISTORY_OLD_KEY[kind] + n);
		} catch (e) {
			/* nothing there */
		}
	};
	if (historyChannel) {
		historyChannel.onmessage = (ev) => {
			const { key, list } = ev.data || {};
			if (historyDb && typeof key === 'string' && list === null) {
				historyLists.delete(key);
				historySeen.delete(key);
			} else if (historyDb && typeof key === 'string' && Array.isArray(list)) {
				historyLists.set(key, list);
				historySeen.set(key, Date.now());
				const [kind, n] = key.split('.');
				w.dispatchEvent(new CustomEvent(kind === 'worn' ? 'slimecheat-worn' : 'slimecheat-outfits', { detail: Number(n) }));
			}
		};
	}
	/** Member numbers of every account that logged in in this browser: their histories are kept. */
	const selves = () => {
		try {
			const list = JSON.parse(localStorage.getItem(SELVES_KEY) || '[]');
			return new Set(Array.isArray(list) ? list.map(Number) : []);
		} catch (e) {
			return new Set();
		}
	};
	/**
	 * Ends the sessions that are over: every player in sight now is marked as seen (and that is saved), and the
	 * histories of players out of sight for longer than SESSION_GAP_MS are cleared. Your own accounts are kept.
	 */
	const histSweep = () => {
		try {
			const now = Date.now();
			const me = player();
			// Not logged in yet: who "you" are isn't known, so nothing is cleared.
			if (!me) {
				return;
			}
			const mine = selves();
			if (!mine.has(me.MemberNumber)) {
				mine.add(me.MemberNumber);
				try {
					localStorage.setItem(SELVES_KEY, JSON.stringify([...mine]));
				} catch (e) {
					/* storage full: kept for this session only */
				}
			}
			const room = Array.isArray(w.ChatRoomCharacter) && w.ChatRoomCharacter.length ? w.ChatRoomCharacter : [me];
			const here = new Set(room.map((/** @type {any} */ C) => C?.MemberNumber).filter(Boolean));
			if (historyDb) {
				const store = historyDb.transaction(HISTORY_STORE, 'readwrite').objectStore(HISTORY_STORE);
				for (const [key, list] of [...historyLists.entries()]) {
					const n = Number(key.split('.')[1]);
					if (here.has(n)) {
						historySeen.set(key, now);
						store.put({ key, list, seen: now });
					} else if (!mine.has(n) && now - (historySeen.get(key) || 0) > SESSION_GAP_MS) {
						historyLists.delete(key);
						historySeen.delete(key);
						store.delete(key);
						historyChannel?.postMessage({ key, list: null });
					}
				}
				return;
			}
			// Without IndexedDB: the same rule on the localStorage lists, by their newest entry.
			const keys = [];
			for (let i = 0; i < localStorage.length; i++) {
				keys.push(localStorage.key(i) || '');
			}
			for (const k of keys) {
				const kind = /** @type {('outfits' | 'worn')[]} */ (['outfits', 'worn']).find((x) => k.startsWith(HISTORY_OLD_KEY[x]));
				if (!kind) {
					continue;
				}
				const n = Number(k.slice(HISTORY_OLD_KEY[kind].length));
				if (here.has(n) || mine.has(n)) {
					continue;
				}
				if (now - (histGet(kind, n)[0]?.at || 0) > SESSION_GAP_MS) {
					localStorage.removeItem(k);
				}
			}
		} catch (e) {
			console.warn('SlimeCheat history sweep:', e);
		}
	};
	/** Opens IndexedDB, reads every list, then moves any left in localStorage over. */
	const histStart = async () => {
		/** @type {IDBDatabase} */
		const db = await new Promise((resolve, reject) => {
			const req = indexedDB.open(HISTORY_DB, 1);
			req.onupgradeneeded = () => req.result.createObjectStore(HISTORY_STORE, { keyPath: 'key' });
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
			req.onblocked = () => reject(new Error('IndexedDB blocked'));
		});
		/** @type {{ key: string, list: any[] }[]} */
		const rows = await new Promise((resolve, reject) => {
			const req = db.transaction(HISTORY_STORE).objectStore(HISTORY_STORE).getAll();
			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () => reject(req.error);
		});
		for (const row of rows) {
			if (row && typeof row.key === 'string' && Array.isArray(row.list)) {
				historyLists.set(row.key, row.list);
				historySeen.set(row.key, Number(row.seen) || row.list[0]?.at || 0);
			}
		}
		// Move the old lists over; each leaves localStorage only once IndexedDB has it.
		/** @type {[string, string, any[]][]} */
		const old = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i) || '';
			for (const kind of /** @type {('outfits' | 'worn')[]} */ (['outfits', 'worn'])) {
				if (k.startsWith(HISTORY_OLD_KEY[kind])) {
					try {
						const list = JSON.parse(localStorage.getItem(k) || '[]');
						old.push([k, `${kind}.${k.slice(HISTORY_OLD_KEY[kind].length)}`, Array.isArray(list) ? list : []]);
					} catch (e) {
						old.push([k, '', []]);
					}
				}
			}
		}
		if (old.length) {
			await new Promise((resolve, reject) => {
				const tx = db.transaction(HISTORY_STORE, 'readwrite');
				const store = tx.objectStore(HISTORY_STORE);
				for (const [, key, list] of old) {
					// Another tab may have moved it already and added to it: the list with the newest entry wins.
					if (key && (historyLists.get(key)?.[0]?.at || 0) < (list[0]?.at || 0)) {
						historyLists.set(key, list);
						historySeen.set(key, list[0]?.at || 0);
						store.put({ key, list, seen: list[0]?.at || 0 });
					}
				}
				tx.oncomplete = () => resolve(undefined);
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
			for (const [k] of old) {
				localStorage.removeItem(k);
			}
		}
		historyDb = db;
		histPrune('outfits');
		histPrune('worn');
	};
	(typeof indexedDB === 'object' && indexedDB ? histStart() : Promise.reject(new Error('no IndexedDB')))
		.catch((e) => {
			historyDb = null;
			console.warn('SlimeCheat: histories stay in localStorage:', e);
		})
		.finally(() => {
			historyReady = true;
			histSweep();
			setInterval(histSweep, Math.min(60000, SESSION_GAP_MS));
			w.dispatchEvent(new CustomEvent('slimecheat-outfits', { detail: player()?.MemberNumber }));
		});

	// ---- 🕘 Outfit history: every look each player in the room settles into (you too; a change that holds for one
	// check, so dressing step by step isn't saved piece by piece) is kept in this browser, per member number, newest
	// first. Faces and blushes are left out, so a new expression is never a new look. Restoring puts the look back,
	// all of it or the parts you pick, with or without its locks.
	const OUTFITS_KEPT = 20;
	const OUTFIT_CHECK_MS = Number(w.SlimeCheatOutfitMs) || 3000;
	/**
	 * A member's saved looks, newest first.
	 * @param {number | undefined} n
	 * @returns {{ at: number, look: string, items: number, locks: number, names: string[] }[]}
	 */
	const outfitsOf = (n) => histGet('outfits', n);
	/**
	 * One worn thing as the game saves it. Your own crafted items keep their whole craft: the game shares only part of
	 * it (name, description, crafter, effects), which is all anyone else's has.
	 * @param {any} C
	 * @param {any} it
	 */
	const bundleOf = (C, it) => {
		const b = w.ServerAppearanceBundle([it])[0];
		if (b && it.Craft && C?.IsPlayer?.()) {
			b.Craft = JSON.parse(JSON.stringify(it.Craft));
		}
		return b;
	};
	/**
	 * A character's look as the game saves it, without expressions (one string, so two looks compare), or ''.
	 * @param {any} C
	 */
	const lookOf = (C) => {
		if (!C || !Array.isArray(C.Appearance) || typeof w.ServerAppearanceBundle !== 'function') {
			return '';
		}
		const bundles = C.Appearance.map((/** @type {any} */ it) => bundleOf(C, it))
			.filter(Boolean)
			.map((/** @type {any} */ b) => {
				if (!b?.Property || !('Expression' in b.Property)) {
					return b;
				}
				const rest = { ...b.Property };
				delete rest.Expression;
				return { ...b, Property: Object.keys(rest).length ? rest : undefined };
			});
		return JSON.stringify(bundles);
	};
	/** @type {Map<number, string>} the look last seen on each member, saved once it holds for a check */
	const lookSeen = new Map();
	/** @param {any} C */
	const recordOutfitOf = (C) => {
		if (!historyReady) {
			return;
		}
		const look = lookOf(C);
		if (!look || look !== lookSeen.get(C.MemberNumber)) {
			lookSeen.set(C.MemberNumber, look);
			return;
		}
		const list = outfitsOf(C.MemberNumber);
		if (list[0]?.look === look) {
			return;
		}
		const items = C.Appearance.filter((/** @type {any} */ it) => it?.Asset?.Group?.Category === 'Item');
		list.unshift({
			at: Date.now(),
			look,
			items: items.length,
			locks: typeof w.InventoryGetLock === 'function' ? items.filter((/** @type {any} */ it) => w.InventoryGetLock(it)).length : 0,
			names: items.slice(0, 4).map((/** @type {any} */ it) => it.Craft?.Name || it.Asset.Description || it.Asset.Name),
		});
		histSet('outfits', C.MemberNumber, list, OUTFITS_KEPT);
		w.dispatchEvent(new CustomEvent('slimecheat-outfits', { detail: C.MemberNumber }));
	};
	/** The account the history sweep last ran for: a new login sweeps at once instead of within the minute. */
	let sweptFor = 0;
	const recordOutfit = () => {
		const me = player();
		if (!me) {
			return;
		}
		if (historyReady && me.MemberNumber !== sweptFor) {
			sweptFor = me.MemberNumber;
			histSweep();
		}
		const room = Array.isArray(w.ChatRoomCharacter) && w.ChatRoomCharacter.length ? w.ChatRoomCharacter : [me];
		for (const C of room) {
			if (C && C.MemberNumber && Array.isArray(C.Appearance)) {
				recordOutfitOf(C);
			}
		}
	};
	setInterval(() => {
		try {
			recordOutfit();
		} catch (e) {
			console.warn('SlimeCheat outfit history:', e);
		}
	}, OUTFIT_CHECK_MS);
	/**
	 * Puts a saved look back on a character: the slots in `put` get the look's version, the slots in `off` are
	 * emptied; locks stay unless keepLock is false. Someone else gets each changed slot sent, like the game does.
	 * @param {any} C
	 * @param {{ look: string }} outfit
	 * @param {Set<string>} put
	 * @param {Set<string>} off
	 * @param {boolean} keepLock
	 */
	const applyLook = (C, outfit, put, off, keepLock) => {
		const missing = ['ServerBundledItemToAppearanceItem', 'ValidationDeleteLock', 'CharacterRefresh'].filter(
			(n) => typeof w[n] !== 'function',
		);
		if (missing.length) {
			throw new Error(`The game changed (${missing.join(', ')} is gone): restoring is off until SlimeCheat is updated.`);
		}
		const self = !!C.IsPlayer?.();
		if (!self && typeof w.ServerChatRoomGetAllowItem === 'function' && !w.ServerChatRoomGetAllowItem(player(), C)) {
			throw new Error(`${nickOf(C)} doesn't allow you to use items on them.`);
		}
		const items = JSON.parse(outfit.look)
			.map((/** @type {any} */ b) => w.ServerBundledItemToAppearanceItem(C.AssetFamily || 'Female3DCG', b))
			.filter((/** @type {any} */ it) => it && put.has(it.Asset.Group.Name));
		if (!keepLock) {
			for (const it of items) {
				if (it.Property) {
					w.ValidationDeleteLock(it.Property, false);
				}
			}
		}
		C.Appearance = [
			...C.Appearance.filter((/** @type {any} */ it) => !put.has(it?.Asset?.Group?.Name) && !off.has(it?.Asset?.Group?.Name)),
			...items,
		];
		if (self) {
			w.CharacterRefresh(C, true, false);
			if (typeof w.ChatRoomCharacterUpdate === 'function') {
				w.ChatRoomCharacterUpdate(C);
			}
			if (typeof w.ServerPlayerAppearanceSync === 'function') {
				w.ServerPlayerAppearanceSync();
			}
		} else {
			w.CharacterRefresh(C, false, false);
			if (typeof w.ChatRoomCharacterItemUpdate === 'function') {
				for (const g of new Set([...put, ...off])) {
					w.ChatRoomCharacterItemUpdate(C, g);
				}
			}
		}
	};
	// ✂ Whether restoring a look takes off what is worn now but wasn't in it: clothes and restraints each have their own
	// switch (remembered, both on unless switched off), used by the panel and !restoreoutfit. Body parts never come off.
	const STRIP_KEY = 'slimecheat.outfitStrip';
	/** @returns {{ clothes: boolean, items: boolean }} */
	const stripOf = () => {
		try {
			const saved = JSON.parse(localStorage.getItem(STRIP_KEY) || '{}');
			return { clothes: saved?.clothes !== false, items: saved?.items !== false };
		} catch (e) {
			return { clothes: true, items: true };
		}
	};
	/** @param {{ clothes: boolean, items: boolean }} strip */
	const saveStrip = (strip) => {
		try {
			localStorage.setItem(STRIP_KEY, JSON.stringify(strip));
		} catch (e) {
			/* not remembered */
		}
	};
	/**
	 * What a character wears now in slots a look doesn't have: clothes and restraints apart (body parts never).
	 * @param {any} C
	 * @param {Set<string>} slots the look's slots
	 * @returns {{ clothes: any[], items: any[] }}
	 */
	const extrasOf = (C, slots) => {
		/** @type {{ clothes: any[], items: any[] }} */
		const out = { clothes: [], items: [] };
		for (const it of C.Appearance || []) {
			const grp = it?.Asset?.Group;
			if (grp?.AllowNone && !slots.has(grp.Name)) {
				out[grp.Category === 'Item' ? 'items' : 'clothes'].push(it);
			}
		}
		return out;
	};
	/**
	 * Every slot of a look and what it takes off: all of the look's slots, and every slot the character wears now
	 * (clothes, restraints, each as its ✂ switch says) that the look didn't have.
	 * @param {any} C
	 * @param {{ look: string }} outfit
	 */
	const wholeLook = (C, outfit) => {
		const put = new Set(JSON.parse(outfit.look).map((/** @type {any} */ b) => b.Group));
		const extra = extrasOf(C, put);
		const strip = stripOf();
		const off = new Set([...(strip.clothes ? extra.clothes : []), ...(strip.items ? extra.items : [])].map((it) => it.Asset.Group.Name));
		return { put, off };
	};

	// ---- 🧾 Wear history: what comes off each player in the room (you too), one item or piece of clothing at a time,
	// as the game saves it (lock and its settings included), newest first, kept in this browser per member number.
	// Like the outfit history, a change counts once it holds for one check. Body parts (hair, eyes, skin...) are in it
	// when their style or colour changes: their old version is kept, to put back.
	const WORN_KEPT = 40;
	/** @type {Map<number, { stable: Record<string, { key: string, bundle: string, body: boolean }>, seen: string }>} */
	const wornSeen = new Map();
	/** @type {((n: number) => void) | null} Opens the wear history page on a member (set once the panel is built). */
	let showWear = null;
	/** @type {((n: number) => void) | null} Opens the outfit history on a member (set once the panel is built). */
	let showLooks = null;
	/**
	 * What came off a member, newest first.
	 * @param {number} n
	 * @returns {{ at: number, group: string, bundle: string, name: string, part: string, locked: boolean, changed: boolean, body?: boolean, items?: { at: number, group: string, bundle: string, name: string, part: string, locked: boolean, changed: boolean, body?: boolean }[] }[]}
	 */
	const wornList = (n) => histGet('worn', n);
	/** @param {any} C */
	const nickOf = (C) => (typeof w.CharacterNickname === 'function' ? w.CharacterNickname(C) : C.Nickname || C.Name || `#${C.MemberNumber}`);
	/** Everyone whose wear is watched: the room, or just you outside one. */
	const watched = () => {
		const me = player();
		if (!me) {
			return [];
		}
		const room = Array.isArray(w.ChatRoomCharacter) && w.ChatRoomCharacter.length ? w.ChatRoomCharacter : [me];
		return room.filter((/** @type {any} */ C) => C && C.MemberNumber && Array.isArray(C.Appearance));
	};
	/**
	 * What a character wears that the history follows: slot -> { key, bundle, body }. Items and clothes as the game
	 * saves them (a change to any of it counts, lock included); body parts (hair, eyes, skin...) by style and colour
	 * only, so faces and blushes changing all the time never count. A body part's saved version leaves its expression out.
	 * @param {any} C
	 * @returns {Record<string, { key: string, bundle: string, body: boolean }>}
	 */
	const removable = (C) => {
		/** @type {Record<string, { key: string, bundle: string, body: boolean }>} */
		const out = {};
		for (const it of C.Appearance) {
			const grp = it?.Asset?.Group;
			const bundle = grp ? bundleOf(C, it) : null;
			if (!bundle) {
				continue;
			}
			if (grp.AllowNone) {
				const text = JSON.stringify(bundle);
				out[grp.Name] = { key: text, bundle: text, body: false };
			} else if (grp.Category === 'Appearance') {
				if (bundle.Property) {
					delete bundle.Property.Expression;
				}
				out[grp.Name] = { key: JSON.stringify([bundle.Name, bundle.Color ?? null]), bundle: JSON.stringify(bundle), body: true };
			}
		}
		return out;
	};
	const trackWorn = () => {
		if (!historyReady || typeof w.ServerAppearanceBundle !== 'function') {
			return;
		}
		for (const C of watched()) {
			const now = removable(C);
			const key = JSON.stringify(Object.entries(now).map(([g, v]) => [g, v.key]));
			const seen = wornSeen.get(C.MemberNumber);
			if (!seen) {
				wornSeen.set(C.MemberNumber, { stable: now, seen: key });
				continue;
			}
			if (key !== seen.seen) {
				seen.seen = key;
				continue;
			}
			const gone = Object.entries(seen.stable).filter(([g, v]) => now[g]?.key !== v.key);
			seen.stable = now;
			if (!gone.length) {
				continue;
			}
			const list = wornList(C.MemberNumber);
			const at = Date.now();
			const pieces = gone.map(([g, v]) => {
				const bundle = JSON.parse(v.bundle);
				const asset = typeof w.AssetGet === 'function' ? w.AssetGet(C.AssetFamily || 'Female3DCG', g, bundle.Name) : null;
				return {
					at,
					group: g,
					bundle: v.bundle,
					name: bundle.Craft?.Name || asset?.Description || bundle.Name,
					part: asset?.Group?.Description || g,
					locked: !!bundle.Property?.LockedBy,
					changed: !!now[g],
					body: v.body,
				};
			});
			// One thing: its own line. Several at once (a wardrobe change, an outfit put on): one outfit change.
			if (pieces.length === 1) {
				list.unshift(pieces[0]);
			} else {
				list.unshift({
					at,
					group: '',
					bundle: '',
					name: 'Outfit change',
					part: `${pieces.length} pieces`,
					locked: pieces.some((p) => p.locked),
					changed: true,
					items: pieces,
				});
			}
			histSet('worn', C.MemberNumber, list, WORN_KEPT);
			w.dispatchEvent(new CustomEvent('slimecheat-worn', { detail: C.MemberNumber }));
		}
	};
	setInterval(() => {
		try {
			trackWorn();
		} catch (e) {
			console.warn('SlimeCheat wear history:', e);
		}
	}, OUTFIT_CHECK_MS);
	/**
	 * Puts things from the wear history back on a character, as they were: locks and their settings too, unless
	 * keepLock is false; body parts as they looked. Whatever is in those slots now comes off first. Oldest go on
	 * first, so with two from the same slot the newer one stays. One refresh, one update, one emote for all of them.
	 * Returns what to tell the player.
	 * @param {any} C
	 * @param {{ group: string, bundle: string, name: string, part?: string, body?: boolean, at?: number }[]} entries
	 * @param {boolean} keepLock
	 */
	const restoreMany = (C, entries, keepLock) => {
		const missing = ['ServerBundledItemToAppearanceItem', 'ValidationDeleteLock', 'CharacterRefresh'].filter(
			(n) => typeof w[n] !== 'function',
		);
		if (missing.length) {
			throw new Error(`The game changed (${missing.join(', ')} is gone): restoring is off until SlimeCheat is updated.`);
		}
		const self = !!C.IsPlayer?.();
		if (!self && typeof w.ServerChatRoomGetAllowItem === 'function' && !w.ServerChatRoomGetAllowItem(player(), C)) {
			throw new Error(`${nickOf(C)} doesn't allow you to use items on them.`);
		}
		/** @type {{ name: string, part: string, body: boolean, locked: boolean, group: string }[]} */
		const done = [];
		for (const entry of [...entries].sort((a, b) => (a.at || 0) - (b.at || 0))) {
			const item = w.ServerBundledItemToAppearanceItem(C.AssetFamily || 'Female3DCG', JSON.parse(entry.bundle));
			if (!item) {
				throw new Error(`${entry.name} isn't in the game anymore.`);
			}
			if (!keepLock && item.Property) {
				w.ValidationDeleteLock(item.Property, false);
			}
			C.Appearance = [...C.Appearance.filter((/** @type {any} */ it) => it?.Asset?.Group?.Name !== entry.group), item];
			const was = done.findIndex((d) => d.group === entry.group);
			if (was >= 0) {
				done.splice(was, 1);
			}
			done.push({
				name: entry.name,
				part: entry.part || entry.group,
				body: !!entry.body,
				locked: !!item.Property?.LockedBy,
				group: entry.group,
			});
		}
		if (!done.length) {
			return '';
		}
		w.CharacterRefresh(C, self, false);
		if (self) {
			// Tell the room, and save it to your account.
			if (typeof w.ChatRoomCharacterUpdate === 'function') {
				w.ChatRoomCharacterUpdate(C);
			}
			if (typeof w.ServerPlayerAppearanceSync === 'function') {
				w.ServerPlayerAppearanceSync();
			}
		} else if (typeof w.ChatRoomCharacterItemUpdate === 'function') {
			for (const d of done) {
				w.ChatRoomCharacterItemUpdate(C, d.group);
			}
		}
		const who = self ? 'you' : nickOf(C);
		const locks = done.filter((d) => d.locked).length;
		/** @param {string[]} names */
		const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]);
		// Silent: nothing is said in the room, the player alone is told.
		if (done.length === 1 && done[0].body) {
			const d = done[0];
			return `🕘 ${self ? 'Your' : `${nickOf(C)}'s`} ${d.part.toLowerCase()} is back to ${d.name}.`;
		}
		const names = list(done.map((d) => d.name));
		let how = '';
		if (locks) {
			how = done.length === 1 ? ', locked' : `, ${locks} locked`;
		}
		return `🕘 ${names} ${done.length === 1 ? 'is' : 'are'} back on ${who}${how}.`;
	};

	// ---- 🔒 Locks: put a lock from the wear history on whatever item is in that slot now (the owner's lock on a new
	// collar), or a new lock from the game's list (every lock the game knows, mods' included). Like any lock change,
	// the other player's game decides: an Owner, Lover or Family lock only holds when its owner, lover or family member
	// puts it on, or on yourself (your own changes always count as yours).
	/* global ValidationAllLockProperties, AssetLocks */
	/** The properties that make up a lock on an item: the game's own list (a copy of R133's if it's gone). */
	const lockKeys = () => {
		try {
			return [...ValidationAllLockProperties];
		} catch (e) {
			return [
				'LockedBy',
				'LockMemberNumber',
				'LockMemberName',
				'LockMessage',
				'EnableRandomInput',
				'RemoveItem',
				'ShowTimer',
				'CombinationNumber',
				'Password',
				'Hint',
				'LockSet',
				'LockPickSeed',
				'MemberNumberList',
				'RemoveTimer',
				'MemberNumberListKeys',
			];
		}
	};
	/**
	 * A lock's name as the game shows it, with whose it is when that's set.
	 * @param {any} lock
	 */
	const lockLabel = (lock) => {
		let locks = {};
		try {
			locks = AssetLocks;
		} catch (e) {
			/* no lock list: the plain name */
		}
		/** @type {any} */
		const asset = /** @type {any} */ (locks)[lock.LockedBy];
		const name = asset?.Description || lock.LockedBy;
		return lock.LockMemberName ? `${name} (${lock.LockMemberName})` : name;
	};
	/**
	 * Every lock in a member's wear history, newest first, each one once.
	 * @param {number} n
	 * @returns {{ at: number, group: string, part: string, item: string, lock: Record<string, any> }[]}
	 */
	const locksOf = (n) => {
		/** @type {{ at: number, group: string, part: string, item: string, lock: Record<string, any> }[]} */
		const out = [];
		const seen = new Set();
		for (const entry of wornList(n)) {
			for (const piece of entry.items || [entry]) {
				const property = JSON.parse(piece.bundle).Property;
				if (!property?.LockedBy) {
					continue;
				}
				/** @type {Record<string, any>} */
				const lock = {};
				for (const k of lockKeys()) {
					if (property[k] !== undefined) {
						lock[k] = property[k];
					}
				}
				const key = JSON.stringify([piece.group, lock]);
				if (!seen.has(key)) {
					seen.add(key);
					out.push({ at: entry.at, group: piece.group, part: piece.part || piece.group, item: piece.name, lock });
				}
			}
		}
		return out;
	};
	/**
	 * After a lock change on a character: refresh, update the room (your own look is saved too), and say `emote` if any.
	 * @param {any} C
	 * @param {string} group
	 * @param {string} emote
	 */
	const pushLockChange = (C, group, emote) => {
		const self = !!C.IsPlayer?.();
		w.CharacterRefresh(C, self, false);
		if (self) {
			if (typeof w.ChatRoomCharacterUpdate === 'function') {
				w.ChatRoomCharacterUpdate(C);
			}
			if (typeof w.ServerPlayerAppearanceSync === 'function') {
				w.ServerPlayerAppearanceSync();
			}
		} else if (typeof w.ChatRoomCharacterItemUpdate === 'function') {
			w.ChatRoomCharacterItemUpdate(C, group);
		}
		if (emote && typeof w.ServerPlayerIsInChatRoom === 'function' && w.ServerPlayerIsInChatRoom() && typeof w.ServerSend === 'function') {
			w.ServerSend('ChatRoomChat', { Content: emote, Type: 'Emote' });
		}
	};
	/**
	 * The item in a slot, ready for a lock, or an error saying why not.
	 * @param {any} C
	 * @param {string} group
	 */
	const lockableItem = (C, group) => {
		const item = (C.Appearance || []).find((/** @type {any} */ it) => it?.Asset?.Group?.Name === group);
		if (!item) {
			throw new Error('Nothing is worn in that slot to lock.');
		}
		if (typeof w.InventoryDoesItemAllowLock === 'function' && !w.InventoryDoesItemAllowLock(item)) {
			throw new Error(`${item.Craft?.Name || item.Asset.Description || item.Asset.Name} can't take a lock.`);
		}
		if (!C.IsPlayer?.() && typeof w.ServerChatRoomGetAllowItem === 'function' && !w.ServerChatRoomGetAllowItem(player(), C)) {
			throw new Error(`${nickOf(C)} doesn't allow you to use items on them.`);
		}
		return item;
	};
	/**
	 * Puts a lock from the history on the item in a slot now, as it was: whose it is, its timer, password and the rest.
	 * Returns what to tell the player.
	 * @param {any} C
	 * @param {string} group
	 * @param {Record<string, any>} lock
	 */
	const putLock = (C, group, lock) => {
		const item = lockableItem(C, group);
		const name = item.Craft?.Name || item.Asset.Description || item.Asset.Name;
		item.Property = { ...(item.Property || {}) };
		for (const k of lockKeys()) {
			delete item.Property[k];
		}
		Object.assign(item.Property, JSON.parse(JSON.stringify(lock)));
		item.Property.Effect = [...new Set([...(item.Property.Effect || []), 'Lock'])];
		const label = lockLabel(lock);
		const self = !!C.IsPlayer?.();
		// Silent, like every restore.
		pushLockChange(C, group, '');
		return `🔒 ${label} is on ${self ? 'your' : `${nickOf(C)}'s`} ${name}.`;
	};
	/**
	 * A new lock from the game's list on the item in a slot (a lock already on it comes off first), set by you.
	 * Returns what to tell the player.
	 * @param {any} C
	 * @param {string} group
	 * @param {string} lockName
	 */
	const addLock = (C, group, lockName) => {
		const item = lockableItem(C, group);
		if (typeof w.InventoryLock !== 'function') {
			throw new Error('The game changed (InventoryLock is gone): adding locks is off until SlimeCheat is updated.');
		}
		if (item.Property?.LockedBy) {
			const old = item.Property;
			for (const k of lockKeys()) {
				delete old[k];
			}
			old.Effect = (old.Effect || []).filter((/** @type {string} */ e) => e !== 'Lock');
		}
		w.InventoryLock(C, item, lockName, player()?.MemberNumber, false);
		if (item.Property?.LockedBy !== lockName) {
			throw new Error(`That lock doesn't fit the ${item.Asset.Description || item.Asset.Name}.`);
		}
		const name = item.Craft?.Name || item.Asset.Description || item.Asset.Name;
		const label = lockLabel(item.Property);
		const self = !!C.IsPlayer?.();
		pushLockChange(C, group, self ? `locks their ${name} with a ${label}.` : `locks ${nickOf(C)}'s ${name} with a ${label}.`);
		return `🔒 ${label} is on ${self ? 'your' : `${nickOf(C)}'s`} ${name}.`;
	};

	// ---- 🔁 Kept on (!keepon): an item that goes back on, as it was, whenever it comes off or loses its lock. One
	// check after another; three tries a minute at most, then it stops and says so (their game keeps refusing it).
	const KEEP_KEY = 'slimecheat.keepon';
	/** @returns {Record<string, Record<string, { bundle: string, name: string, part: string, paused?: boolean }>>} */
	const keptOn = () => {
		try {
			const kept = JSON.parse(localStorage.getItem(KEEP_KEY) || '{}');
			return kept && typeof kept === 'object' ? kept : {};
		} catch (e) {
			return {};
		}
	};
	/** @param {ReturnType<typeof keptOn>} kept */
	const saveKept = (kept) => {
		try {
			localStorage.setItem(KEEP_KEY, JSON.stringify(kept));
		} catch (e) {
			/* full: it simply isn't remembered */
		}
	};
	/**
	 * What must stay the same for a kept item: the item, and its lock with whose it is (colours may change).
	 * @param {any} b a saved item
	 */
	const keptKey = (b) => JSON.stringify([b?.Name || '', b?.Property?.LockedBy || '', b?.Property?.LockMemberNumber ?? '']);
	/** @type {Map<string, number[]>} recent restore times per member|slot */
	const keepTries = new Map();
	const enforceKeepOn = () => {
		const kept = keptOn();
		let changed = false;
		for (const C of watched()) {
			const mine = kept[C.MemberNumber];
			if (!mine) {
				continue;
			}
			for (const [group, k] of Object.entries(mine)) {
				if (k.paused) {
					continue;
				}
				const item = C.Appearance.find((/** @type {any} */ it) => it?.Asset?.Group?.Name === group);
				const now = item ? bundleOf(C, item) : null;
				if (keptKey(now) === keptKey(JSON.parse(k.bundle))) {
					continue;
				}
				const id = `${C.MemberNumber}|${group}`;
				const tries = (keepTries.get(id) || []).filter((t) => Date.now() - t < 60000);
				if (tries.length >= 3) {
					k.paused = true;
					changed = true;
					fireToast(
						`🔁 ${k.name} won't stay on ${C.IsPlayer() ? 'you' : nickOf(C)}: their game keeps refusing it. Paused; !keepon on that slot to try again.`,
						6000,
					);
					continue;
				}
				tries.push(Date.now());
				keepTries.set(id, tries);
				try {
					// Silent in the room; a small notice for you.
					fireToast(`🔁 ${restoreMany(C, [{ group, bundle: k.bundle, name: k.name, part: k.part }], true).replace(/^🕘 /, '')}`);
				} catch (err) {
					k.paused = true;
					changed = true;
					fireToast(`🔁 ${k.name} can't go back on: ${/** @type {Error} */ (err).message} Paused.`, 6000);
				}
			}
		}
		if (changed) {
			saveKept(kept);
		}
	};
	setInterval(() => {
		try {
			enforceKeepOn();
		} catch (e) {
			console.warn('SlimeCheat keep on:', e);
		}
	}, OUTFIT_CHECK_MS);

	/**
	 * The hidden commands' note, in the middle of the screen (one at a time).
	 * @param {string} text
	 * @param {number} [ms]
	 */
	const fireToast = (text, ms = 2500) => {
		document.getElementById('bc-fire-toast')?.remove();
		const el = document.createElement('div');
		el.id = 'bc-fire-toast';
		el.textContent = text;
		el.style.cssText =
			'position:fixed;left:50%;top:20%;transform:translateX(-50%);z-index:2147483647;background:rgba(0,0,0,0.85);color:#fff;padding:12px 18px;border-radius:10px;font-size:16px;font-weight:bold;pointer-events:none;max-width:80%;text-align:center;white-space:pre-line';
		document.body.appendChild(el);
		setTimeout(() => el.remove(), ms);
	};

	// ---- !burn: the owner's "BC Fire Burn" (v4.1), its burn kept as written. Hidden: no button; with an item slot
	// selected in the game, type !burn in a SlimeBeep chat box and press Enter (or Send). It is never sent.
	//
	// DISCLAIMER from the mod maker: using !burn or !burnlock on another player requires their explicit consent. They remove
	// items others are wearing, locked or not, so only ever use it on someone who has clearly agreed to it.
	// This is a rule for whoever uses it, not a limit in the code.
	/* global CharacterGetCurrent, ServerPlayerIsInChatRoom, ServerChatRoomGetAllowItem, CharacterNickname, InventoryGet,
	   InventoryRemove, ChatRoomCharacterUpdate, ServerPlayerAppearanceSync, ChatRoomCharacterItemUpdate */
	// Kept as the owner wrote it, so two style rules are off for this block only.
	/* eslint-disable curly, prefer-template */
	const fireBurn = (() => {
		// Your own words. {item} is the item's name, {target} who it was on.
		const SAY = {
			self: 'sets the {item} on fire and lets it burn away.',
			other: 'burns the {item} off {target}.',
		};

		const TOAST_ID = 'bc-fire-toast';

		function showToast(/** @type {string} */ text) {
			let el = document.getElementById(TOAST_ID);
			if (el) el.remove();
			el = document.createElement('div');
			el.id = TOAST_ID;
			el.textContent = text;
			el.style.cssText = [
				'position:fixed',
				'left:50%',
				'top:20%',
				'transform:translateX(-50%)',
				'z-index:2147483647',
				'background:rgba(0,0,0,0.85)',
				'color:#fff',
				'padding:12px 18px',
				'border-radius:10px',
				'font-size:16px',
				'font-weight:bold',
				'pointer-events:none',
				'max-width:80%',
				'text-align:center',
			].join(';');
			document.body.appendChild(el);
			const shown = el;
			setTimeout(function () {
				shown.remove();
			}, 2500);
		}

		// One emote to the room; the server sends it back, so it shows once for you too.
		function emote(/** @type {string} */ msg) {
			ServerSend('ChatRoomChat', { Content: msg, Type: 'Emote' });
		}

		function burn() {
			if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom' || !ServerPlayerIsInChatRoom()) {
				showToast('Burn works in a chat room.');
				return;
			}

			const C = CharacterGetCurrent();
			if (!C) {
				showToast('Open someone first (or yourself).');
				return;
			}

			const groupName = C.FocusGroup && C.FocusGroup.Name;
			if (!groupName) {
				showToast('Click an item slot first, then Burn.');
				return;
			}

			const item = InventoryGet(C, groupName);
			if (!item || !item.Asset) {
				showToast('Nothing worn there.');
				return;
			}
			if (!item.Asset.Group.AllowNone) {
				showToast("That's part of the body, not something worn.");
				return;
			}

			const self = C.IsPlayer();
			if (self && fireproof(item)) {
				showToast("🧯 That one's fireproof (⚙ Settings › 🧯 is on).");
				return;
			}
			if (!self) {
				// Lock check removed
				if (!ServerChatRoomGetAllowItem(Player, C)) {
					showToast(CharacterNickname(C) + " doesn't allow you to use items on them.");
					return;
				}
			}

			const itemName = (item.Craft && item.Craft.Name) || item.Asset.Description || item.Asset.Name;
			InventoryRemove(C, groupName, true);

			if (self) {
				// Tell the room, and save it to your account so it doesn't come back when you rejoin.
				ChatRoomCharacterUpdate(Player);
				ServerPlayerAppearanceSync();
			} else {
				ChatRoomCharacterItemUpdate(C, groupName);
			}

			const msg = (self ? SAY.self : SAY.other).replace('{item}', itemName).replace('{target}', CharacterNickname(C));
			emote(msg);
		}

		return () => {
			try {
				burn();
			} catch (err) {
				console.error('[Fire Burn]', err);
				showToast('Burn failed: ' + /** @type {Error} */ (err).message);
			}
		};
	})();
	/* eslint-enable curly, prefer-template */

	// ---- !burnlock: the lighter !burn. Same checks, on the selected slot, but it only burns the lock off: the item stays on.
	const fireBurnLock = (() => {
		const SAY = {
			self: 'holds a flame to the lock on their {item} until it melts away.',
			other: 'burns the lock off the {item} on {target}.',
		};
		const toast = fireToast;
		const burnLock = () => {
			if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom' || !ServerPlayerIsInChatRoom()) {
				toast('Burn works in a chat room.');
				return;
			}
			const C = CharacterGetCurrent();
			if (!C) {
				toast('Open someone first (or yourself).');
				return;
			}
			const groupName = C.FocusGroup && C.FocusGroup.Name;
			if (!groupName) {
				toast('Click an item slot first, then !burnlock.');
				return;
			}
			const item = InventoryGet(C, groupName);
			if (!item || !item.Asset) {
				toast('Nothing worn there.');
				return;
			}
			if (typeof w.InventoryGetLock !== 'function' || typeof w.InventoryUnlock !== 'function') {
				toast('⚠ The game changed (InventoryUnlock is gone): !burnlock is off until SlimeCheat is updated.');
				return;
			}
			if (!w.InventoryGetLock(item)) {
				toast("There's no lock on that.");
				return;
			}
			const self = C.IsPlayer();
			if (self && fireproof(item)) {
				toast("🧯 That one's fireproof (⚙ Settings › 🧯 is on).");
				return;
			}
			if (!self && !ServerChatRoomGetAllowItem(Player, C)) {
				toast(`${CharacterNickname(C)} doesn't allow you to use items on them.`);
				return;
			}
			const itemName = (item.Craft && item.Craft.Name) || item.Asset.Description || item.Asset.Name;
			w.InventoryUnlock(C, item, false);
			if (self) {
				// Tell the room, and save it to your account so the lock doesn't come back when you rejoin.
				ChatRoomCharacterUpdate(Player);
				ServerPlayerAppearanceSync();
			} else {
				ChatRoomCharacterItemUpdate(C, groupName);
			}
			ServerSend('ChatRoomChat', {
				Content: (self ? SAY.self : SAY.other).replace('{item}', itemName).replace('{target}', CharacterNickname(C)),
				Type: 'Emote',
			});
		};
		return () => {
			try {
				burnLock();
			} catch (err) {
				console.error('[Fire Burn]', err);
				toast(`Burn failed: ${/** @type {Error} */ (err).message}`);
			}
		};
	})();

	// ---- !burnlocks and !burnall: on the player open in the game (any slot, nothing to select), every lock or every
	// item at once. Same checks as !burn; clothes and body parts are never touched by !burnall, only items.
	const fireBurnEvery = (() => {
		const SAY = {
			locks: { self: 'holds a flame to every lock on them until they all melt away.', other: 'burns {n} off {target}.' },
			items: { self: 'sets everything they are tied up in on fire and lets it all burn away.', other: 'burns {n} off {target}.' },
		};
		/**
		 * @param {'locks' | 'items'} what
		 */
		const burnEvery = (what) => {
			const cmd = what === 'locks' ? '!burnlocks' : '!burnall';
			if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom' || !ServerPlayerIsInChatRoom()) {
				fireToast('Burn works in a chat room.');
				return;
			}
			const C = CharacterGetCurrent();
			if (!C) {
				fireToast(`Open someone first (or yourself), then ${cmd}.`);
				return;
			}
			if (typeof w.InventoryGetLock !== 'function' || typeof w.InventoryUnlock !== 'function') {
				fireToast(`⚠ The game changed (InventoryUnlock is gone): ${cmd} is off until SlimeCheat is updated.`);
				return;
			}
			const self = C.IsPlayer();
			if (!self && !ServerChatRoomGetAllowItem(Player, C)) {
				fireToast(`${CharacterNickname(C)} doesn't allow you to use items on them.`);
				return;
			}
			const worn = (C.Appearance || []).filter(
				(/** @type {any} */ it) =>
					it?.Asset?.Group?.AllowNone && (what === 'locks' ? w.InventoryGetLock(it) : it.Asset.Group.Category === 'Item'),
			);
			// Fireproof spares only your own items.
			const spared = self ? worn.filter(fireproof) : [];
			const burning = worn.filter((/** @type {any} */ it) => !spared.includes(it));
			const groups = burning.map((/** @type {any} */ it) => it.Asset.Group.Name);
			for (const it of burning) {
				if (what === 'locks') {
					w.InventoryUnlock(C, it, false);
				} else {
					InventoryRemove(C, it.Asset.Group.Name, false);
				}
			}
			const kept = spared.length ? ` (🧯 ${spared.length} fireproof left alone)` : '';
			if (!burning.length) {
				const none = what === 'locks' ? 'Nothing locked' : 'Nothing tying them up';
				fireToast(
					spared.length
						? `🧯 Only fireproof ${what} on you: ${spared.length} left alone.`
						: `${none} on ${self ? 'you' : CharacterNickname(C)}.`,
				);
				return;
			}
			if (what === 'items' && typeof w.CharacterRefresh === 'function') {
				w.CharacterRefresh(C, true, false);
			}
			if (self) {
				// Tell the room, and save it to your account so it doesn't come back when you rejoin.
				ChatRoomCharacterUpdate(Player);
				ServerPlayerAppearanceSync();
			} else {
				for (const g of groups) {
					ChatRoomCharacterItemUpdate(C, g);
				}
			}
			const n = `${burning.length} ${what === 'locks' ? 'lock' : 'item'}${burning.length > 1 ? 's' : ''}`;
			ServerSend('ChatRoomChat', {
				Content: (self ? SAY[what].self : SAY[what].other).replace('{n}', n).replace('{target}', CharacterNickname(C)),
				Type: 'Emote',
			});
			if (kept) {
				fireToast(`🔥 ${n} burnt${kept}`);
			}
		};
		return (/** @type {'locks' | 'items'} */ what) => {
			try {
				burnEvery(what);
			} catch (err) {
				console.error('[Fire Burn]', err);
				fireToast(`Burn failed: ${/** @type {Error} */ (err).message}`);
			}
		};
	})();

	// ---- Restore commands, on the player open in the game (or yourself). Silent in the room; a small notice tells you.
	// !restore / !restorenolock: the last thing that came off the selected slot (or off them, with no slot selected;
	// a whole outfit change comes back as one). !restorelist: the wear history page. !restoreoutfit /
	// !restoreoutfitnolock: their previous look. !listoutfit: their outfit history. !restorelock: the last lock that was
	// on the selected slot, on whatever is there now. !locklist: every lock they've had, to pick one. !addlock: a new
	// lock from the game's list (mods' locks too). !keepon: the item in the selected slot goes back on whenever it
	// comes off or loses its lock (again to let go).
	/** @type {((mode: 'add' | 'history', n: number, group: string) => void) | null} Opens the lock page (set by the panel). */
	let showLocks = null;
	/** @type {(() => void) | null} Opens the hack panel (set by the panel). */
	let showHack = null;
	/**
	 * The player open in the game, or a notice saying to open someone.
	 * @param {string} cmd
	 */
	const openChar = (cmd) => {
		const C = typeof w.CharacterGetCurrent === 'function' ? w.CharacterGetCurrent() : null;
		if (!C) {
			fireToast(`Open someone first (or yourself), then ${cmd}.`);
		}
		return C;
	};
	/**
	 * Runs a command, turning any failure into a notice.
	 * @param {string} cmd
	 * @param {() => void} fn
	 */
	const command = (cmd, fn) => {
		try {
			fn();
		} catch (err) {
			console.error(`[SlimeCheat ${cmd}]`, err);
			fireToast(`${cmd} failed: ${/** @type {Error} */ (err).message}`);
		}
	};
	/**
	 * Opens SlimeCheat on one of its hidden pages once the panel is there.
	 * @param {string} cmd
	 * @param {() => ((...args: any[]) => void) | null} hook
	 * @param {any[]} args
	 */
	const openPage = (cmd, hook, args) => {
		const api = slimeBeep();
		if (!api || typeof api.openPanel !== 'function') {
			fireToast(`SlimeCheat needs SlimeBeep and a login for ${cmd}.`);
			return;
		}
		api.openPanel('slimecheat');
		// The panel is built when it first opens.
		setTimeout(() => {
			const fn = hook();
			if (fn) {
				fn(...args);
			} else {
				fireToast(`Open SlimeCheat once, then ${cmd} again.`);
			}
		}, 50);
	};
	/** @param {boolean} keepLock */
	const restoreCmd = (keepLock) => {
		const cmd = keepLock ? '!restore' : '!restorenolock';
		command(cmd, () => {
			const C = openChar(cmd);
			if (!C) {
				return;
			}
			const group = C.FocusGroup?.Name;
			const list = wornList(C.MemberNumber);
			/** @type {any[]} */
			let pieces = [];
			if (group) {
				for (const entry of list) {
					const piece = (entry.items || [entry]).find((p) => p.group === group);
					if (piece) {
						pieces = [piece];
						break;
					}
				}
			} else if (list[0]) {
				pieces = list[0].items || [list[0]];
			}
			if (!pieces.length) {
				let where = C.IsPlayer() ? 'you' : nickOf(C);
				if (group) {
					where = 'that slot';
				}
				fireToast(`Nothing came off ${where} while SlimeCheat was watching.`);
				return;
			}
			fireToast(restoreMany(C, pieces, keepLock));
		});
	};
	/** @param {boolean} keepLock */
	const restoreOutfitCmd = (keepLock) => {
		const cmd = keepLock ? '!restoreoutfit' : '!restoreoutfitnolock';
		command(cmd, () => {
			const C = openChar(cmd);
			if (!C) {
				return;
			}
			const now = lookOf(C);
			const previous = outfitsOf(C.MemberNumber).find((o) => o.look !== now);
			if (!previous) {
				fireToast(`No earlier look of ${C.IsPlayer() ? 'yours' : nickOf(C)} saved yet.`);
				return;
			}
			const { put, off } = wholeLook(C, previous);
			applyLook(C, previous, put, off, keepLock);
			const tookOff = off.size ? `, ${off.size} thing${off.size > 1 ? 's' : ''} taken off` : '';
			const when = new Date(previous.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			fireToast(
				`🕘 ${C.IsPlayer() ? 'Your' : `${nickOf(C)}'s`} look from ${when} is back${keepLock ? ', locks included' : ', unlocked'}${tookOff}.`,
			);
		});
	};
	const restoreListCmd = () => {
		const C = (typeof w.CharacterGetCurrent === 'function' && w.CharacterGetCurrent()) || player();
		if (C) {
			openPage('!restorelist', () => showWear, [C.MemberNumber]);
		}
	};
	const listOutfitCmd = () => {
		const C = (typeof w.CharacterGetCurrent === 'function' && w.CharacterGetCurrent()) || player();
		if (C) {
			openPage('!listoutfit', () => showLooks, [C.MemberNumber]);
		}
	};
	const restoreLockCmd = () =>
		command('!restorelock', () => {
			const C = openChar('!restorelock');
			if (!C) {
				return;
			}
			const group = C.FocusGroup?.Name;
			if (!group) {
				fireToast('Click the slot to lock first, then !restorelock.');
				return;
			}
			const found = locksOf(C.MemberNumber).find((l) => l.group === group);
			if (!found) {
				fireToast('No lock was seen on that slot while SlimeCheat was watching. !locklist shows every lock they had.');
				return;
			}
			fireToast(putLock(C, group, found.lock));
		});
	/** @param {'add' | 'history'} mode */
	const lockListCmd = (mode) => {
		const cmd = mode === 'add' ? '!addlock' : '!locklist';
		const C = openChar(cmd);
		if (!C) {
			return;
		}
		const group = C.FocusGroup?.Name;
		if (!group) {
			fireToast(`Click the slot to lock first, then ${cmd}.`);
			return;
		}
		openPage(cmd, () => showLocks, [mode, C.MemberNumber, group]);
	};
	const keepOnCmd = () =>
		command('!keepon', () => {
			const C = openChar('!keepon');
			if (!C) {
				return;
			}
			const group = C.FocusGroup?.Name;
			const item = group && C.Appearance.find((/** @type {any} */ it) => it?.Asset?.Group?.Name === group);
			const kept = keptOn();
			const mine = (kept[C.MemberNumber] ||= {});
			const who = C.IsPlayer() ? 'you' : nickOf(C);
			if (group && mine[group] && !mine[group].paused) {
				const name = mine[group].name;
				delete mine[group];
				saveKept(kept);
				fireToast(`🔁 ${name} on ${who} is free again.`);
				return;
			}
			if (!item) {
				fireToast('Click a slot with something in it first, then !keepon.');
				return;
			}
			const name = item.Craft?.Name || item.Asset.Description || item.Asset.Name;
			mine[group] = { bundle: JSON.stringify(bundleOf(C, item)), name, part: item.Asset.Group.Description || group };
			keepTries.delete(`${C.MemberNumber}|${group}`);
			saveKept(kept);
			fireToast(`🔁 ${name} stays on ${who}: it goes back on, lock included, whenever it comes off. !keepon again to let go.`, 5000);
		});

	// ---- !owner: the list of hidden commands. Only answers to the owner's member number; for anyone else it is an
	// ordinary line and goes out as typed.
	const ownerCard = () =>
		fireToast(
			[
				'👑 SlimeCheat hidden commands (type in a SlimeBeep chat box)',
				'',
				'!burn: burns off the item in the selected slot',
				'!burnlock: burns only the lock off the selected slot',
				'!burnlocks: burns every lock off the open player',
				'!burnall: burns every item off the open player (clothes stay)',
				'!restore / !restorenolock: puts back what last came off the selected slot (or off the open player)',
				'!restorelist: everything that came off the open player, outfit changes as one line',
				"!restoreoutfit / !restoreoutfitnolock: the open player's previous look",
				"!listoutfit: the open player's outfit history, to bring back all of a look or parts",
				'!restorelock: the last lock of the selected slot, on what is there now',
				'!locklist: every lock the open player had, to pick one for the selected slot',
				'!addlock: a new lock from every lock the game knows (mods too) on the selected slot',
				'!keepon: the selected item goes back on whenever it comes off (again to let go)',
				'!burnbutton: a floating 🔥 button that burns like !burn; drag it to move it, × removes it',
				'!hackpanel: all of these as buttons, on the player open in the game',
				'Restores are silent in the room: only you get a notice.',
				'!cheats: opens SlimeCheat',
				'!owner: this list',
				'',
				`🧯 Fireproof (⚙ Settings) is ${fireproofOn() ? 'on' : 'off'}: it spares your own items only.`,
			].join('\n'),
			12000,
		);

	// ---- 🔥 Burn button (!burnbutton): a floating button that burns like !burn (the selected slot of the player open in
	// the game). Drag it anywhere; it stays there, reloads included, until its × removes it.
	const BURN_BUTTON_KEY = 'slimecheat.burnButton';
	/** Where the button sits, or null when it is off. */
	const burnButtonSaved = () => {
		try {
			const p = JSON.parse(localStorage.getItem(BURN_BUTTON_KEY) || 'null');
			return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
		} catch (e) {
			return null;
		}
	};
	/** @param {{ x: number, y: number } | null} p */
	const saveBurnButton = (p) => {
		try {
			if (p) {
				localStorage.setItem(BURN_BUTTON_KEY, JSON.stringify(p));
			} else {
				localStorage.removeItem(BURN_BUTTON_KEY);
			}
		} catch (e) {
			/* not remembered */
		}
	};
	/** @param {{ x: number, y: number }} [at] */
	const showBurnButton = (at) => {
		if (document.getElementById('sc-burnbutton')) {
			return;
		}
		const size = 56;
		const place = (/** @type {{ x: number, y: number }} */ p) => ({
			x: Math.min(Math.max(0, p.x), innerWidth - size),
			y: Math.min(Math.max(0, p.y), innerHeight - size),
		});
		let pos = place(at || burnButtonSaved() || { x: innerWidth - size - 24, y: Math.round(innerHeight / 3) });
		const wrap = document.createElement('div');
		wrap.id = 'sc-burnbutton';
		wrap.title = 'Burn the selected item (drag to move)';
		wrap.style.cssText = `position:fixed;left:${pos.x}px;top:${pos.y}px;width:${size}px;height:${size}px;z-index:2147483000;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffb347,#ff4500 60%,#a01800);box-shadow:0 2px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:28px;cursor:grab;user-select:none;touch-action:none`;
		wrap.textContent = '🔥';
		const close = document.createElement('button');
		close.textContent = '×';
		close.title = 'Remove the burn button';
		close.style.cssText =
			'position:absolute;top:-6px;right:-6px;width:20px;height:20px;padding:0;border:none;border-radius:50%;background:#222;color:#fff;font:bold 14px/20px sans-serif;cursor:pointer';
		close.addEventListener('pointerdown', (e) => e.stopPropagation());
		close.addEventListener('click', (e) => {
			e.stopPropagation();
			wrap.remove();
			saveBurnButton(null);
		});
		wrap.append(close);
		// A press that doesn't move burns; one that moves drags.
		/** @type {{ x: number, y: number, left: number, top: number, moved: boolean } | null} */
		let drag = null;
		wrap.addEventListener('pointerdown', (e) => {
			if (e.button !== 0) {
				return;
			}
			drag = { x: e.clientX, y: e.clientY, left: pos.x, top: pos.y, moved: false };
			wrap.setPointerCapture(e.pointerId);
			wrap.style.cursor = 'grabbing';
			e.preventDefault();
		});
		wrap.addEventListener('pointermove', (e) => {
			if (!drag) {
				return;
			}
			const dx = e.clientX - drag.x;
			const dy = e.clientY - drag.y;
			if (!drag.moved && Math.hypot(dx, dy) < 5) {
				return;
			}
			drag.moved = true;
			pos = place({ x: drag.left + dx, y: drag.top + dy });
			wrap.style.left = `${pos.x}px`;
			wrap.style.top = `${pos.y}px`;
		});
		const end = (/** @type {PointerEvent} */ e) => {
			if (!drag) {
				return;
			}
			const moved = drag.moved;
			drag = null;
			wrap.style.cursor = 'grab';
			if (moved) {
				saveBurnButton(pos);
			} else if (e.type === 'pointerup') {
				fireBurn();
			}
		};
		wrap.addEventListener('pointerup', end);
		wrap.addEventListener('pointercancel', end);
		// Kept on screen when the window gets smaller.
		w.addEventListener('resize', () => {
			pos = place(pos);
			wrap.style.left = `${pos.x}px`;
			wrap.style.top = `${pos.y}px`;
		});
		document.body.appendChild(wrap);
		saveBurnButton(pos);
	};
	const burnButtonCmd = () => {
		if (document.getElementById('sc-burnbutton')) {
			fireToast('🔥 The burn button is already on screen (its × removes it).');
			return;
		}
		showBurnButton();
		fireToast('🔥 Burn button added: click it to burn the selected item, drag it to move it, × removes it.', 4000);
	};
	// Back where you left it after a reload.
	if (burnButtonSaved()) {
		if (document.body) {
			showBurnButton();
		} else {
			w.addEventListener('DOMContentLoaded', () => showBurnButton(), { once: true });
		}
	}

	// SlimeBeep's chat box (#sb-text) with a hidden command in it: caught before SlimeBeep sends it (capture),
	// on Enter or on its Send button, so it never goes out as a beep or a group message.
	/** @type {Record<string, () => void>} */
	const BURNS = {
		'!burn': () => fireBurn(),
		'!burnlock': () => fireBurnLock(),
		'!burnlocks': () => fireBurnEvery('locks'),
		'!burnall': () => fireBurnEvery('items'),
		'!restore': () => restoreCmd(true),
		'!restorenolock': () => restoreCmd(false),
		'!restorelist': () => restoreListCmd(),
		'!restoreoutfit': () => restoreOutfitCmd(true),
		'!restoreoutfitnolock': () => restoreOutfitCmd(false),
		'!listoutfit': () => listOutfitCmd(),
		'!restorelock': () => restoreLockCmd(),
		'!locklist': () => lockListCmd('history'),
		'!addlock': () => lockListCmd('add'),
		'!keepon': () => keepOnCmd(),
		'!hackpanel': () => openPage('!hackpanel', () => showHack, []),
		'!burnbutton': () => burnButtonCmd(),
		'!owner': ownerCard,
	};
	const burnTyped = () => {
		const box = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('sb-text'));
		const cmd = box ? box.value.trim().toLowerCase() : '';
		if (!box || !Object.hasOwn(BURNS, cmd) || (cmd === '!owner' && !isOwnerNumber())) {
			return null;
		}
		return { box, run: BURNS[cmd] };
	};
	document.addEventListener(
		'keydown',
		(e) => {
			const typed = burnTyped();
			if (!typed || e.target !== typed.box || e.key !== 'Enter' || e.shiftKey) {
				return;
			}
			e.preventDefault();
			e.stopImmediatePropagation();
			typed.box.value = '';
			typed.run();
		},
		true,
	);
	document.addEventListener(
		'click',
		(e) => {
			const typed = burnTyped();
			if (!typed || !(e.target instanceof Element) || !e.target.closest('#sb-send')) {
				return;
			}
			e.preventDefault();
			e.stopImmediatePropagation();
			typed.box.value = '';
			typed.run();
		},
		true,
	);

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
