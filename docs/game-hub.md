# Playdock game hub

Playdock is a separate browser-game launcher at:

https://flyingcarsforfun.connstors.workers.dev/hub/

It features Boost Circuit and links to the existing Skybreak, Riftfall and Random
Era’s prototypes. The prototypes retain their existing invited-account gates.
The launcher does not change sharing, player accounts, matchmaking, game physics
or the persistent server identity. Direct game links continue to work.

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
The same runtime files are also published as an owner-private Sites copy. That
copy is independent of the public `/hub/` route and retains its own sharing gate.

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
JavaScript syntax and HTML/SVG structure are checked too. The Cloud environment
does not expose the Sites browser-control tool, so interactive browser and visual
layout QA for this hub remain unverified; a deployment success alone is not a
claim that every device has been tested.
