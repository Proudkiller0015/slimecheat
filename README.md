# Room Uploads

A small Bondage Club userscript: pick an mp3 or an image, it uploads to your own Cloudflare R2 storage,
and you get a direct link with a **Copy link** button to paste into your room's customization: the
music setting for a song, the Image URL for a background. Everyone in the room hears and sees it,
add-on or not, since it's a plain link. It doesn't touch the game: no room data, no game state, no bcModSdk.

- **Songs**: mp3 only (checked by name and by the file's first bytes), up to 500 MB, sent in 50 MB parts
  with progress.
- **Images**: .jpg, .jpeg, .png or .webp only, the formats the game's Image URL accepts
  (`ChatAdminRoomCustomizationImageFormats` in R133: the link's path must end in one of them). Checked by
  name and by the file's first bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `RIFF....WEBP`), up to
  25 MB, sent in one request with progress. The link ends in the extension of the real type (`.jpg` for
  a JPEG, even one named `.jpeg` or `.png`).
- Links last 5 days.
- **My files**: your songs and images, newest first, with name, size, upload date, time left, Copy link
  and Delete (click twice: "Sure?"); images show a small thumbnail. Shows the storage used.
- **⚙**: the upload address and upload key, kept in this browser's localStorage only.

The round upload button can be dragged anywhere; it remembers where. The file, Worker and bucket keep
their first name, `song-upload`.

## The Worker (`worker/`)

Only someone with the upload key can upload, list or delete. Anyone can play a song or load an image.

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
- An image needs a .jpg/.jpeg/.png/.webp name, at most 25 MB (by its Content-Length, before anything is
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

Then install `song-upload.user.js` in Tampermonkey or Violentmonkey, open the game, click the round
upload button, and enter the Worker's address and the same key.

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
