// SlimeCheat lives in SlimeBeep's window (SlimeBeep.api.addPanel) and signs uploads in with SlimeBeep
// (SlimeBeep.api.proveIdentity). Rule: SlimeCheat may break, the game may not. Everything it does to the game
// runs inside `guard`, so a failure shows as an error in the panel and the game carries on.
(() => {
	'use strict';
	const w = /** @type {any} */ (window);
	if (w.SlimeCheat) {
		return;
	}
	const VERSION = '2.8.0';
	w.SlimeCheat = Object.freeze({ version: VERSION });

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
					<div class="sb-name">🕘 Outfit history</div>
					<div class="sb-hint">Every look you've worn (newest first, the last ${OUTFITS_KEPT}, kept in this browser). Pick what to bring back: all of it, only the clothes, only the restraints, or item by item.</div>
					<div class="sc-line" style="margin-top:6px"><select class="sb-search" id="sc-outfit" style="flex:1"></select></div>
					<div class="sc-line" style="margin-top:6px"><button class="sb-pill" id="sc-pickall">All</button><button class="sb-pill" id="sc-pickclothes">👗 Clothes</button><button class="sb-pill" id="sc-pickitems">⛓ Restraints</button><button class="sb-pill" id="sc-pickbody">💇 Body</button><button class="sb-pill" id="sc-picknone">None</button></div>
					<div class="sc-parts" id="sc-outfitparts"></div>
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
				<div class="sb-hint">What came off, newest first (the last ${WORN_KEPT}, kept in this browser). Restore puts it back as it was, lock included; Unlocked puts it back without its lock.</div>
				<span class="sb-hint" id="sc-weardone"></span>
				<div id="sc-wearlist"></div>
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
			for (const p of ['files', 'dice', 'cheats', 'settings', 'wear']) {
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

		// ---- 🕘 Outfit history (recorded by recordOutfit, below the panel).
		const OUTFIT_LOCKS_KEY = 'slimecheat.outfitLocks';
		const outfitLocksBox = /** @type {HTMLInputElement} */ ($('outfitlocks'));
		outfitLocksBox.checked = stored(OUTFIT_LOCKS_KEY) === '1';
		outfitLocksBox.addEventListener('change', () =>
			guard(() => localStorage.setItem(OUTFIT_LOCKS_KEY, outfitLocksBox.checked ? '1' : '0')),
		);
		const fillOutfits = () => {
			const select = /** @type {HTMLSelectElement} */ ($('outfit'));
			const was = select.value;
			select.replaceChildren();
			const list = outfits();
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
				select.append(make('option', '', 'Nothing saved yet'));
			}
			if (was && list.some((o) => String(o.at) === was)) {
				select.value = was;
			}
		};
		fillOutfits();
		w.addEventListener('slimecheat-outfits', () => guard(fillOutfits));

		// What the chosen look holds, as ticked boxes: each item and piece of clothing it had, what you wear now that
		// it didn't (to take off), and the body (hair, eyes, skin...) as one line. The buttons tick one kind at a time.
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
			const outfit = outfits().find((o) => String(o.at) === at);
			const me = player();
			if (!outfit || !me || typeof w.ServerBundledItemToAppearanceItem !== 'function') {
				return null;
			}
			/** @type {any[]} */
			const items = JSON.parse(outfit.look)
				.map((/** @type {any} */ b) => w.ServerBundledItemToAppearanceItem(me.AssetFamily, b))
				.filter(Boolean);
			return { outfit, items };
		};
		let partsFor = '';
		const fillOutfitParts = () => {
			const box = $('outfitparts');
			const look = chosenLook();
			const me = player();
			// Same look shown again (you changed clothes meanwhile): keep the ticks you set; new lines come ticked.
			/** @type {Map<string, boolean>} */
			const ticks = new Map();
			if (look && String(look.outfit.at) === partsFor) {
				for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (box.querySelectorAll('input'))) {
					ticks.set(`${input.dataset.put || ''}|${input.dataset.off || ''}`, input.checked);
				}
			}
			partsFor = look ? String(look.outfit.at) : '';
			box.replaceChildren();
			if (!look || !me) {
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
			for (const it of me.Appearance || []) {
				const sort = it?.Asset?.Group ? kindOf(it) : 'body';
				if (sort !== 'body' && !inLook.has(it.Asset.Group.Name)) {
					add(`✂ Take off ${itemName(it)} (${partName(it)})`, { kind: sort, off: it.Asset.Group.Name });
				}
			}
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
		fillOutfitParts();
		// What you wear changed (a new look was saved): the take-off lines follow it, your ticks stay.
		w.addEventListener('slimecheat-outfits', () => guard(fillOutfitParts));
		onClick('restore', () => {
			const g = game();
			const look = chosenLook();
			if (!g || !look) {
				return;
			}
			if (typeof w.ValidationDeleteLock !== 'function') {
				fail('⚠ The game changed (ValidationDeleteLock is gone): restoring is off until SlimeCheat is updated.');
				return;
			}
			const me = player();
			// The ticks must be the chosen look's (the list follows the select, but only on its change event).
			if (String(look.outfit.at) !== partsFor) {
				fillOutfitParts();
			}
			const boxes = /** @type {HTMLInputElement[]} */ ([...$('outfitparts').querySelectorAll('input')]);
			const chosen = boxes.filter((i) => i.checked);
			if (!chosen.length) {
				$('restored').textContent = 'Tick what to bring back first.';
				return;
			}
			const put = new Set(chosen.flatMap((i) => (i.dataset.put ? i.dataset.put.split(',') : [])));
			const off = new Set(chosen.map((i) => i.dataset.off).filter(Boolean));
			const items = look.items.filter((it) => put.has(it.Asset.Group.Name));
			if (!outfitLocksBox.checked) {
				for (const it of items) {
					if (it.Property) {
						w.ValidationDeleteLock(it.Property, false);
					}
				}
			}
			me.Appearance = [
				...me.Appearance.filter((/** @type {any} */ it) => !put.has(it?.Asset?.Group?.Name) && !off.has(it?.Asset?.Group?.Name)),
				...items,
			];
			pushLook(g);
			if (typeof w.ServerPlayerAppearanceSync === 'function') {
				w.ServerPlayerAppearanceSync();
			}
			const what = chosen.length === boxes.length ? 'Look' : `${chosen.length} part${chosen.length > 1 ? 's' : ''} of the look`;
			const when = new Date(look.outfit.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			$('restored').textContent = `🕘 ${what} from ${when} restored${outfitLocksBox.checked ? ' with its locks' : ', unlocked'}.`;
			fillParts();
			fillOutfitParts();
		});

		// ---- 🧾 Wear history page: hidden from the tabs. !restorelist opens it on the player open in the game,
		// 🧾 on yourself. Each thing that came off can go back on, with its lock or without.
		let wearMember = 0;
		/** The member the page shows, if in the room with you. */
		const wearChar = () => watched().find((c) => c.MemberNumber === wearMember) || null;
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
			if (!list.length) {
				box.append(make('div', 'sb-hint', 'Nothing yet: SlimeCheat notes what comes off while you are in the room with them.'));
				return;
			}
			list.forEach((e, i) => {
				const row = make('div', 'sb-row sc-worn');
				const main = make('div', 'sb-main');
				const when = new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
				main.append(
					make('b', '', `${e.locked ? '🔒 ' : ''}${e.name}`),
					make('div', 'sb-hint', `${e.part} · ${e.changed ? 'changed' : 'came off'} ${when}`),
				);
				const back = make('button', 'sb-go', 'Restore');
				back.addEventListener('click', () => guard(() => restoreFromList(i, true)));
				row.append(main, back);
				if (e.locked) {
					const bare = make('button', 'sb-pill', 'Unlocked');
					bare.addEventListener('click', () => guard(() => restoreFromList(i, false)));
					row.append(bare);
				}
				box.append(row);
			});
		};
		/**
		 * @param {number} i
		 * @param {boolean} keepLock
		 */
		const restoreFromList = (i, keepLock) => {
			const entry = wornList(wearMember)[i];
			const C = wearChar();
			if (!entry) {
				return;
			}
			if (!C) {
				$('weardone').textContent = "They aren't in the room with you.";
				return;
			}
			$('weardone').textContent = restoreWorn(C, entry, keepLock);
			fillParts();
		};
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

		// Keys typed in the panel stay out of the game.
		for (const type of ['keydown', 'keyup', 'keypress']) {
			root.addEventListener(type, (e) => e.stopPropagation());
		}
		page('songs');
	};

	// ---- 🕘 Outfit history: every look you settle into (a change that holds for one check, so dressing step by
	// step isn't saved piece by piece) is kept in this browser, per member number, newest first. Whatever changed it:
	// you, the wardrobe, or someone else tying you up. Restoring puts the whole look back, with or without its locks.
	const OUTFIT_KEY = 'slimecheat.outfits.';
	const OUTFITS_KEPT = 20;
	const OUTFIT_CHECK_MS = Number(w.SlimeCheatOutfitMs) || 3000;
	/**
	 * Your saved looks, newest first.
	 * @returns {{ at: number, look: string, items: number, locks: number, names: string[] }[]}
	 */
	const outfits = () => {
		try {
			const list = JSON.parse(localStorage.getItem(OUTFIT_KEY + player()?.MemberNumber) || '[]');
			return Array.isArray(list) ? list : [];
		} catch (e) {
			return [];
		}
	};
	/** Your look as the game saves it (one string, so two looks compare), or '' when it can't be read. */
	const lookNow = () => {
		const me = player();
		return me && Array.isArray(me.Appearance) && typeof w.ServerAppearanceBundle === 'function'
			? JSON.stringify(w.ServerAppearanceBundle(me.Appearance))
			: '';
	};
	let lookSeen = '';
	const recordOutfit = () => {
		const look = lookNow();
		if (!look || look !== lookSeen) {
			lookSeen = look;
			return;
		}
		const list = outfits();
		if (list[0]?.look === look) {
			return;
		}
		const me = player();
		const items = me.Appearance.filter((/** @type {any} */ it) => it?.Asset?.Group?.Category === 'Item');
		list.unshift({
			at: Date.now(),
			look,
			items: items.length,
			locks: typeof w.InventoryGetLock === 'function' ? items.filter((/** @type {any} */ it) => w.InventoryGetLock(it)).length : 0,
			names: items.slice(0, 4).map((/** @type {any} */ it) => it.Craft?.Name || it.Asset.Description || it.Asset.Name),
		});
		// Storage full: the oldest go first.
		for (let keep = Math.min(list.length, OUTFITS_KEPT); keep > 0; keep--) {
			try {
				localStorage.setItem(OUTFIT_KEY + me.MemberNumber, JSON.stringify(list.slice(0, keep)));
				break;
			} catch (e) {
				/* too big: try with one fewer */
			}
		}
		w.dispatchEvent(new Event('slimecheat-outfits'));
	};
	setInterval(() => {
		try {
			recordOutfit();
		} catch (e) {
			console.warn('SlimeCheat outfit history:', e);
		}
	}, OUTFIT_CHECK_MS);

	// ---- 🧾 Wear history: what comes off each player in the room (you too), one item or piece of clothing at a time,
	// as the game saves it (lock and its settings included), newest first, kept in this browser per member number.
	// Like the outfit history, a change counts once it holds for one check. Body parts are never in it.
	const WORN_KEY = 'slimecheat.worn.';
	const WORN_KEPT = 40;
	/** @type {Map<number, { stable: Record<string, string>, seen: string }>} */
	const wornSeen = new Map();
	/** @type {((n: number) => void) | null} Opens the wear history page on a member (set once the panel is built). */
	let showWear = null;
	/**
	 * What came off a member, newest first.
	 * @param {number} n
	 * @returns {{ at: number, group: string, bundle: string, name: string, part: string, locked: boolean, changed: boolean }[]}
	 */
	const wornList = (n) => {
		try {
			const list = JSON.parse(localStorage.getItem(WORN_KEY + n) || '[]');
			return Array.isArray(list) ? list : [];
		} catch (e) {
			return [];
		}
	};
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
	 * A character's removable things (items and clothes, not body parts): slot -> the thing as the game saves it.
	 * @param {any} C
	 * @returns {Record<string, string>}
	 */
	const removable = (C) => {
		/** @type {Record<string, string>} */
		const out = {};
		for (const it of C.Appearance) {
			const grp = it?.Asset?.Group;
			if (grp?.AllowNone) {
				const bundle = w.ServerAppearanceBundle([it])[0];
				if (bundle) {
					out[grp.Name] = JSON.stringify(bundle);
				}
			}
		}
		return out;
	};
	const trackWorn = () => {
		if (typeof w.ServerAppearanceBundle !== 'function') {
			return;
		}
		for (const C of watched()) {
			const now = removable(C);
			const key = JSON.stringify(now);
			const seen = wornSeen.get(C.MemberNumber);
			if (!seen) {
				wornSeen.set(C.MemberNumber, { stable: now, seen: key });
				continue;
			}
			if (key !== seen.seen) {
				seen.seen = key;
				continue;
			}
			const gone = Object.entries(seen.stable).filter(([g, b]) => now[g] !== b);
			seen.stable = now;
			if (!gone.length) {
				continue;
			}
			const list = wornList(C.MemberNumber);
			for (const [g, b] of gone) {
				const bundle = JSON.parse(b);
				const asset = typeof w.AssetGet === 'function' ? w.AssetGet(C.AssetFamily || 'Female3DCG', g, bundle.Name) : null;
				list.unshift({
					at: Date.now(),
					group: g,
					bundle: b,
					name: bundle.Craft?.Name || asset?.Description || bundle.Name,
					part: asset?.Group?.Description || g,
					locked: !!bundle.Property?.LockedBy,
					changed: !!now[g] && JSON.parse(now[g]).Name === bundle.Name,
				});
			}
			// Storage full: the oldest go first.
			for (let keep = Math.min(list.length, WORN_KEPT); keep > 0; keep--) {
				try {
					localStorage.setItem(WORN_KEY + C.MemberNumber, JSON.stringify(list.slice(0, keep)));
					break;
				} catch (e) {
					/* too big: try with one fewer */
				}
			}
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
	 * Puts something that came off back on a character, as it was: its lock and the lock's settings too, unless
	 * keepLock is false. Whatever is in that slot now comes off first. Returns what to tell the player.
	 * @param {any} C
	 * @param {{ group: string, bundle: string, name: string }} entry
	 * @param {boolean} keepLock
	 */
	const restoreWorn = (C, entry, keepLock) => {
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
		const item = w.ServerBundledItemToAppearanceItem(C.AssetFamily || 'Female3DCG', JSON.parse(entry.bundle));
		if (!item) {
			throw new Error(`${entry.name} isn't in the game anymore.`);
		}
		if (!keepLock && item.Property) {
			w.ValidationDeleteLock(item.Property, false);
		}
		const locked = !!item.Property?.LockedBy;
		C.Appearance = [...C.Appearance.filter((/** @type {any} */ it) => it?.Asset?.Group?.Name !== entry.group), item];
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
			w.ChatRoomCharacterItemUpdate(C, entry.group);
		}
		const inRoom = typeof w.ServerPlayerIsInChatRoom === 'function' && w.ServerPlayerIsInChatRoom();
		if (inRoom && typeof w.ServerSend === 'function') {
			const how = locked ? ', locked' : '';
			w.ServerSend('ChatRoomChat', {
				Content: self ? `puts their ${entry.name} back on${how}.` : `puts the ${entry.name} back on ${nickOf(C)}${how}.`,
				Type: 'Emote',
			});
		}
		return `🕘 ${entry.name} is back on ${self ? 'you' : nickOf(C)}${locked ? ', locked' : ''}.`;
	};

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

	// ---- !restore and !restorelist: on the player open in the game (or yourself), from the 🧾 wear history.
	// !restore puts back the last thing that came off the selected slot, or off them at all with no slot selected,
	// lock included. !restorelist opens SlimeCheat on everything that came off them, to put back one by one.
	const restoreCmd = () => {
		try {
			const C = typeof w.CharacterGetCurrent === 'function' ? w.CharacterGetCurrent() : null;
			if (!C) {
				fireToast('Open someone first (or yourself), then !restore.');
				return;
			}
			const group = C.FocusGroup?.Name;
			const list = wornList(C.MemberNumber);
			const entry = group ? list.find((e) => e.group === group) : list[0];
			if (!entry) {
				let where = C.IsPlayer() ? 'you' : nickOf(C);
				if (group) {
					where = 'that slot';
				}
				fireToast(`Nothing came off ${where} while SlimeCheat was watching.`);
				return;
			}
			fireToast(restoreWorn(C, entry, true));
		} catch (err) {
			console.error('[SlimeCheat restore]', err);
			fireToast(`Restore failed: ${/** @type {Error} */ (err).message}`);
		}
	};
	const restoreListCmd = () => {
		const C = (typeof w.CharacterGetCurrent === 'function' && w.CharacterGetCurrent()) || player();
		const api = slimeBeep();
		if (!C || !api || typeof api.openPanel !== 'function') {
			fireToast('SlimeCheat needs SlimeBeep and a login for !restorelist.');
			return;
		}
		api.openPanel('slimecheat');
		// The panel is built when it first opens.
		setTimeout(() => (showWear ? showWear(C.MemberNumber) : fireToast('Open SlimeCheat once, then !restorelist again.')), 50);
	};

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
				'!restore: puts back what last came off the selected slot (or off the open player), lock included',
				'!restorelist: everything that came off the open player, to put back one by one',
				'!cheats: opens SlimeCheat',
				'!owner: this list',
				'',
				`🧯 Fireproof (⚙ Settings) is ${fireproofOn() ? 'on' : 'off'}: it spares your own items only.`,
			].join('\n'),
			12000,
		);

	// SlimeBeep's chat box (#sb-text) with a hidden command in it: caught before SlimeBeep sends it (capture),
	// on Enter or on its Send button, so it never goes out as a beep or a group message.
	/** @type {Record<string, () => void>} */
	const BURNS = {
		'!burn': () => fireBurn(),
		'!burnlock': () => fireBurnLock(),
		'!burnlocks': () => fireBurnEvery('locks'),
		'!burnall': () => fireBurnEvery('items'),
		'!restore': () => restoreCmd(),
		'!restorelist': () => restoreListCmd(),
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
