# Launcher integration

Serve dist/ over HTTP(S). Example: `node scripts/serve.mjs`, then http://127.0.0.1:4173/launcher-example.html.

```html
<iframe src="https://YOUR-GAME-HOST/?parentOrigin=https%3A%2F%2Flauncher.example"
 title="Riftfall" sandbox="allow-scripts allow-same-origin allow-pointer-lock"
 allow="fullscreen" allowfullscreen style="width:100%;height:100%;border:0"></iframe>
```

parentOrigin must be the exact HTTP(S) parent origin with no trailing slash. Without it, only a same-origin parent can send commands. Both origins and event.source are checked. The parent must also check event.origin and event.source when receiving messages.

Messages include `{type, version:1}`. Game events: `riftfall:ready` (capabilities), `riftfall:match-start` (mode), `riftfall:match-end` (result), `riftfall:paused`, `riftfall:resumed`, `riftfall:exit`. Parent commands: `riftfall:pause`, `riftfall:resume`, `riftfall:stop`. Resuming may require a click inside the frame to capture the mouse.

`window.riftfall.getState()` returns a cloned read-only gameplay snapshot for diagnostics. The bridge does not grant filesystem, shell, native process or account access. It cannot run Fortnite or load a DLL. Frame integration was retained from the supplied prototype; its browser suites have not been rerun for v0.2.0 in this environment.
