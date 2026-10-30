# Song Upload

A small Bondage Club userscript: pick an mp3, it uploads to your own Cloudflare R2 storage, and you get a
direct `.mp3` link with a **Copy link** button to paste into your room's music setting. Everyone in the
room hears it, add-on or not, since it's a plain mp3 link. It doesn't touch the game: no room data, no
game state, no bcModSdk.

- **Upload**: mp3 only (checked by name and by the file's first bytes), up to 500 MB, sent in 50 MB parts
  with progress. Links last 5 days.
- **My songs**: your songs, newest first, with name, size, upload date, time left, Copy link and Delete
  (click twice: "Sure?"). Shows the storage used.
- **⚙**: the upload address and upload key, kept in this browser's localStorage only.

The round ♪ button can be dragged anywhere; it remembers where.

## The Worker (`worker/`)

Only someone with the upload key can upload, list or delete. Anyone can play a song.

| Request                              | What it does                                  | Key |
| ------------------------------------ | --------------------------------------------- | --- |
| `POST /upload` `{ name, size }`      | starts an upload, answers `{ key, uploadId }` | yes |
| `PUT /upload/<key>/<part>?uploadId=` | one 50 MB part                                | yes |
| `POST /upload/<key>/done?uploadId=`  | finishes, answers `{ url }`                   | yes |
| `DELETE /upload/<key>?uploadId=`     | cancels an upload                             | yes |
| `GET /upload/songs`                  | the songs, newest first, and storage used     | yes |
| `DELETE /upload/songs/<key>`         | deletes a song                                | yes |
| `GET /<key>.mp3`                     | plays the song (Range supported, open CORS)   | no  |

- The key is a Worker secret, sent as `Authorization: Bearer <key>` and compared in constant time.
- Upload calls answer CORS only for the game's sites (elementfx, bondageprojects.com, bondage-europe,
  bondage-asia). Songs are served with `Access-Control-Allow-Origin: *` and byte ranges, through the
  Worker rather than the rate-limited r2.dev address.
- It never fetches other sites: there is no URL parameter anywhere, only uploads into its own bucket.
- Every part must be exactly the size the declared total allows, so the parts can't add up to more;
  the first part must start like an mp3 (ID3 tag or an MPEG Layer III frame), or the upload is cancelled.
- **Never billed:** the bucket is kept under 9.5 GB (`CAP_BYTES`; the free plan stores 10 GB). When a
  new song wouldn't fit, the oldest songs are deleted first until it does, checked when an upload starts
  and again when it finishes. Unfinished uploads count by their declared size; the song being uploaded
  is never deleted. If unfinished uploads alone fill the cap, the new upload is refused.
- The bucket's lifecycle rule (`worker/lifecycle.json`) deletes songs 5 days after upload and aborts
  unfinished uploads after 1 day. An upload costs one R2 write per 50 MB part plus five (a 500 MB song: 15, of the free plan's million a month).

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

Then install `song-upload.user.js` in Tampermonkey or Violentmonkey, open the game, click ♪, and enter
the Worker's address and the same key.

## Checks

```sh
npm install
npm run check                          # prettier, eslint, node --check
cd worker && npm run dev:test          # local Worker with a test key and a 400 MB cap, fresh storage
node test.js                           # in another terminal, from the repo root
```

`test.js` (it expects Chrome and puppeteer-core at the paths at its top) runs the Worker checks over HTTP and the userscript in headless Chrome on a page at the game's
address. The local Worker can't run lifecycle rules, so the test checks `lifecycle.json` itself.
