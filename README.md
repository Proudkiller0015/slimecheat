# SlimeCheat

<img src="icon-128.png" alt="" width="96" align="right">

> **⚠ SlimeCheat requires [SlimeBeep](https://proudkiller0015.github.io/slimebeep/install.html).** It opens inside
> SlimeBeep's window and signs you in through it. Get SlimeBeep from its
> [install page](https://proudkiller0015.github.io/slimebeep/install.html), or turn it on in
> [FUSAM](https://sidiousious.gitlab.io/bc-addon-loader/), the game's add-on manager. Without SlimeBeep,
> SlimeCheat only shows a note saying so.

A hack panel for Bondage Club that lives in SlimeBeep's window (💻 tab, or type `!cheats` in a SlimeBeep chat)
and follows SlimeBeep's theme.

**[Install SlimeCheat](https://proudkiller0015.github.io/slimecheat/install.html)**: a bookmark (no extension, phones
too) or a userscript ([direct link](https://proudkiller0015.github.io/slimecheat/slimecheat.user.js) for Tampermonkey or
Violentmonkey). Like SlimeBeep, it always runs the newest version: the installed script only loads
`slimecheat.js` from this repo on every game load.

- **🎵 Songs / 🖼 Images**: upload an mp3 (up to 500 MB) or a room background (.jpg, .png, .webp, up to 100 MB)
  and get a direct link to paste into your room's music or Image URL. Everyone in the room hears and sees
  it, add-on or not.
- **📁 My files**: your uploads, newest first, with Copy link and Delete. Your files last 12 hours.
- **🎲 Dice**: rolls into the room exactly like `/dice`, with the result you type (or a fair roll).
- **🔓 Cheats**, on yourself only:
  - 🔥 **Lock burner**: pick a body part and burn its lock off, take the item off, or burn every lock.
  - 🎁 **Unlock every item**: adds every item in the game to your inventory (saved to your account).

SlimeCheat is built so it breaks before the game does: every cheat runs inside a guard, so if the game
changes, the cheat shows an error in the panel (or says which game function is gone) and the game carries on.

Uploads need no key: SlimeBeep signs a short proof with your SlimeBeep key (`SlimeBeep.api.proveIdentity`),
and the upload server remembers that key for your member number the first time.

## The Worker (`worker/`)

Uploading, listing and deleting need a SlimeBeep proof (`Authorization: SlimeBeep <base64 JSON>`) or the
owner's upload key. Anyone can play a song or load an image.

- **Who:** a proof is `slimebeep-proof|slimecheat|<member>|<time>` signed with the player's SlimeBeep key,
  at most 5 minutes old. The first proof for a member number pins that key (in the bucket under `_auth/`);
  later ones must use it, or a new key the pinned one signed over to (SlimeBeep's hand-over `rk`).
- **Per player:** each player sees and deletes only their own files; their files last 12 hours and they
  can keep 1000 MB at a time. The owners (`OWNERS` in `wrangler.toml`) keep files 5 days, and can list
  everyone's (`GET /upload/files?all=1`, grouped by player in the panel) and delete any. When the bucket is
  full, other players' files go first.

| Request                              | What it does                                  | Key |
| ------------------------------------ | --------------------------------------------- | --- |
| `POST /upload` `{ name, size }`      | starts an upload, answers `{ key, uploadId }` | yes |
| `PUT /upload/<key>/<part>?uploadId=` | one 50 MB part                                | yes |
| `POST /upload/<key>/done?uploadId=`  | finishes, answers `{ url }`                   | yes |
| `DELETE /upload/<key>?uploadId=`     | cancels an upload                             | yes |
| `PUT /upload/image?name=`            | the whole image, answers `{ url }`            | yes |
| `GET /upload/files`                  | songs and images, newest first, storage used  | yes |
| `DELETE /upload/files/<key>`         | deletes a song or an image                    | yes |
| `GET /<key>.mp3` / `.jpg .png .webp` | the file (Range supported, open CORS)         | no  |

- The key is a Worker secret, sent as `Authorization: Bearer <key>` and compared in constant time.
- Upload calls answer CORS only for the game's sites (elementfx, bondageprojects.com, bondage-europe,
  bondage-asia). Files are served with their type (`audio/mpeg`, `image/jpeg`, `image/png`,
  `image/webp`), `X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: *` (so an image can be
  drawn on a canvas and still read back) and byte ranges, through the Worker rather than the
  rate-limited r2.dev address.
- It never fetches other sites: there is no URL parameter anywhere, only uploads into its own bucket.
- Every part must be exactly the size the declared total allows, so the parts can't add up to more;
  the first part must start like an mp3 (ID3 tag or an MPEG Layer III frame), or the upload is cancelled.
- An image over 25 MB goes up in 50 MB parts like a song (up to 100 MB; its first part must really be the
  type its name says). One of 25 MB or less goes in one request.
- An image needs a .jpg/.jpeg/.png/.webp name, at most 25 MB in one request (by its Content-Length, before anything is
  read), and real JPEG, PNG or WEBP bytes; anything else (a gif, an svg, a renamed file) gets 415.
- **Never billed:** the bucket is kept under 9.5 GB (`CAP_BYTES`; the free plan stores 10 GB), songs and
  images together. When a new file wouldn't fit, the oldest files are deleted first, whatever their
  kind, until it does, checked when an upload starts and again when it finishes. Unfinished uploads
  count by their declared size; the file being uploaded is never deleted. If unfinished uploads alone
  fill the cap, the new upload is refused.
- The bucket's lifecycle rule (`worker/lifecycle.json`) deletes every file 5 days after upload and aborts
  unfinished uploads after 1 day. A song upload costs one R2 write per 50 MB part plus five (a 500 MB
  song: 15, of the free plan's million a month); an image costs one.

## One-time setup

Needs R2 turned on in the Cloudflare account. From `worker/`:

```sh
npm install
npx wrangler r2 bucket create song-upload
npx wrangler r2 bucket lifecycle set song-upload --file lifecycle.json -y
npx wrangler secret put UPLOAD_KEY      # paste a long random key when asked
npx wrangler deploy
```

`lifecycle set` replaces the bucket's default rules with this one; check it with
`npx wrangler r2 bucket lifecycle list song-upload`. The deploy prints the Worker's address
(`https://song-upload.<subdomain>.workers.dev`).

Then install `slimecheat.user.js` in Tampermonkey or Violentmonkey (with SlimeBeep) and open the game.

## Checks

```sh
npm install
npm run check                          # prettier, eslint, node --check
cd worker && npm run dev:test          # local Worker with a test key and a 400 MB cap, fresh storage
node test.js                           # in another terminal, from the repo root
```

`test.js` (it expects Chrome and puppeteer-core at the paths at its top) runs the Worker checks over HTTP and the userscript in headless Chrome on a page at the game's
address, including drawing an uploaded image on a canvas from the game's origin and reading its pixels
back. The local Worker can't run lifecycle rules, so the test checks `lifecycle.json` itself.
