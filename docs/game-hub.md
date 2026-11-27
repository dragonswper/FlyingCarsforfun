# Playdock game hub

Playdock is a separate browser-game launcher at:

https://flyingcarsforfun.connstors.workers.dev/hub/

It launches Boost Circuit, Riftfall, Skybreak Island, Skybreak Classic and Random
Eras from the same server. All five clients, their source and the hub are saved
in FlyingCarsforfun. [Repository layout and build commands](../games/README.md).

Boost Circuit retains its original root URL and multiplayer authority. The other
games mount below `/games/`. The merged copies use the existing public game host;
the older private Sites copies retain their access settings and remain available.

## Library features

- Search titles, tags and descriptions; filter by game style.
- Favourites, recent launches and quick return links.
- Add up to 40 personal HTTPS game links, with a name and game style.
- Local hub display name and a preference for opening games in a new tab.
- Keyboard search shortcut, native link navigation and dialogs, compact mobile
  navigation, reduced-motion support and touch-size primary actions.

Preferences are stored in this browser under `playdock.library.v1`. They are not
accounts and do not synchronize across devices or between different site origins.
The hub stores no game passwords, server credentials or admin codes. Destination
URLs reject non-HTTPS schemes and embedded credentials; user text is escaped.
Blocked/corrupt browser storage falls back to a library for the current visit.

## Editing and original art

The public runtime files live in `dist/hub/`. Add shared catalogue entries to
`dist/hub/library.js`; the Add game form adds personal links on one browser only.
An older owner-private Sites copy remains independent. The GitHub repository and
public `/hub/` route are now the canonical collection and deployment.

The blue car/football arena illustration is original Blender work:
`art/playdock-hero.blend`, generated with `scripts/create-playdock-hero.py`.
The other cover illustrations and app icon are original SVGs. Cover illustrations
are promotional artwork, rather than screenshots of the destination prototypes.
The locally served Barlow Condensed heading font retains its OFL licence.

Regenerate the Blender artwork with:

```sh
blender --background --python scripts/create-playdock-hero.py
```

The hub uses HTML/CSS/JavaScript with no runtime framework, analytics, third-party
requests or installation. Images load lazily except for the featured artwork.
Opening a game uses its own top-level tab/page rather than an embedded frame.

## Verification

The library tests exercise link validation, bounded local data, storage recovery,
composed search/style/favourite/history filters and packaged file references.
JavaScript syntax and HTML/SVG structure are checked too. Chromium browser tests
now exercise favourites and reload persistence, search, adding/removing a
personal game, new-tab launching, recent history and responsive widths. The
suite also plays each of the five games. See [browser QA](browser-qa.md) for
coverage and limitations; software-rendered checks do not establish phone FPS
or cross-country multiplayer latency.

## Shared hosting and saves

`npm run build:games` builds and packages every imported game; the standard CI
workflow checks the builds and all game tests. The shared Node and Cloudflare
servers serve nested game directories with the correct static content types.
Random Eras permits its local WebAssembly model decoder only on its own routes;
JavaScript eval remains blocked, and admin/server data stay protected.

Hub favourites and recent game IDs continue to work. Games keep separate progress
keys so one cannot overwrite another's settings. Browser saves on the older Sites
domains stay there; the merged host cannot read another origin's local storage.
