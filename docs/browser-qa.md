# Browser gameplay verification

The suite starts the real Node HTTPS game server and opens the packaged games in
Chromium. It uses an ephemeral test certificate and trusts only that certificate's
public-key fingerprint. CSP, TLS, server authentication and input validation stay
enabled. Test rooms, identities and messages are local synthetic data.

Run after building the games:

```sh
npm ci --ignore-scripts
npm run build:games
npx playwright install --with-deps chromium
npm run test:browser
```

Use `BROWSER_EXECUTABLE=/path/to/chromium` for an existing cloud test browser.
`BROWSER_FILTER=random` runs matching cases; omit it for the complete suite.
Screenshots, console errors and machine-readable results are saved under
`test-results/` (ignored by Git). CI uploads them for seven days. Expected network
errors are permitted only in cases that deliberately abort downloads.

## Coverage

| Game / page | Browser checks |
| --- | --- |
| Playdock | Five packaged games, favourites, reload persistence, search, personal links, recent launches, new-tab launch and narrow/wide layouts |
| Random Eras | Menu navigation, settings and keybind persistence, player name, Training movement and attacks, camera switching, score panel, Frontier generation/map, bot Arena and career |
| Random Eras Focus | Five real training hits charge the bar, keyboard/touch activation, continued attacks, slower scene time, expiry and no recharge while active |
| Random Eras touch | Real multi-touch events for movement, look, attack, guard/cancel and view; portrait/landscape HUD bounds and pause/resume |
| Random Eras recovery | Blocked storage, missing pointer-lock API with quick-click attacks, failed entry download and failed renderer download followed by reload/retry |
| Random Eras Arena | Two-tab invite/answer exchange, ready states, host/guest match startup and disconnect |
| Riftfall / Skybreak Island | Settings and outfit, movement, shooting, reload, building, pause/resume and each listed mode |
| Skybreak Classic | Movement, wall building, pause/resume and pointer-lock fallback |
| Boost Circuit | Garage/loadout save, game modes, scoring and replay playback; two-player dedicated lobby join, teams, ready/start, guest input and shared chat |

Combat tests verify hit streaks, charge limits, opponent slowdown, simultaneous
Focus counters and guest activation rules. The existing unit/integration suites additionally cover physics, packet handling,
rooms, matchmaking, encrypted endpoints and validation. They run separately from
the browser tests.

## Findings addressed in this update

- Random Eras had no gameplay touch controls. Responsive menus alone left phone
  players unable to move or fight. The new input layer clears held actions on
  cancellation, blur, rotation and menu transitions.
- Accessing `localStorage` in a career function's default argument could throw
  before its recovery code ran. Storage access now occurs inside the guarded
  operation, including when a match ends.
- Failed entry downloads could leave menu buttons without their handlers. An
  independent bootstrap gates the menu and offers a reload. Renderer failures
  have a separate recovery action and early rejection handling. Late pointer-lock
  requests are released when a loading error or menu is visible, keeping recovery
  buttons clickable.
- Quick-click attacks in Random Eras now survive release when drag-look is the available input method. Classic depended on pointer lock to start and pause. It now supports drag-look
  when capture is unavailable and explicitly handles Escape. Random Eras also
  keeps click attacks active after releasing a drag-look click. Its blocked Google
  Fonts import was removed without relaxing the site's security policy.

## Practical limits

These are functional tests using Chromium's software WebGL renderer, plus touch
event emulation. They are not a measurement of physical phone performance,
Safari behaviour, controller hardware or real cross-house NAT/latency. The repeated
Focus attack scenario uses drag-look to avoid CDP cursor warps under native
pointer lock; native capture remains covered by the general desktop case. The local
Arena test uses its documented two-tab transport; the dedicated-server test uses
two separate browser profiles. Real WebRTC connectivity still depends on the
players' networks and available ICE routes. Browser autoplay and fullscreen
restrictions still apply.

The reported Random Eras failure was not reproducible in the clean desktop
production session. The concrete storage, touch and recovery faults above were
reproduced or exercised separately; they should not be treated as a confirmed
explanation for every device-specific startup failure.
