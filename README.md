# Armed With Wings 3

Static Ruffle wrapper for running `game.swf` in a browser or Discord Activity iframe.

## Local run

```sh
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## Discord Activity notes

- The app is single-player.
- Ruffle stores Flash SharedObject save data in persistent browser storage, so progress survives normal reloads for the same browser or Discord Activity origin.
- `app.js` uses the same Discord RPC status flow as the Fireboy/Watergirl wrapper: SDK ready, authorize, exchange the code through `/api/auth/discord/token`, authenticate, then call `setActivity`.
- `src/worker.ts` provides the token exchange endpoint for Cloudflare Workers. Configure `DISCORD_CLIENT_SECRET` before deploying it.
- Set the Discord Activity URL to the deployed static site root.

## Files

- `game.swf`: original Flash game.
- `vendor/ruffle/`: vendored Ruffle runtime copied from the Fireboy/Watergirl wrapper.
- `vendor/discord-sdk.js`: vendored Discord SDK bundle.
