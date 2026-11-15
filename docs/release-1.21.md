# Version 1.21 — friends, shared lobbies and the reference van

Open **Friends & Lobbies** on the main menu, from the online-count button, or through **Friends / Share Lobby** inside a private lobby. It is also available from the pause menu.

## Player identity and friends

The first secure connection creates a public ID such as `BC-12AB34CD56EF`. Its private device credential is generated with browser cryptography and stored separately from game preferences. The server stores a SHA-256 credential hash, not that credential. Names can change and are not unique; search by name or use the complete ID to distinguish people with the same name. The existing Edit Name control updates the friend directory as well as the game profile.

Select **Find Player → Add Friend**. The recipient chooses **Accept**, **Decline** or **Block**. Accepted friendships are mutual and persist through page/server reloads. The panel shows online/in-lobby/in-game/away/offline status, pending requests and lobby invitations. Remove and Block update both friend lists; Unblock does not silently restore a friendship. Profiles are specific to the game community server. No email or real-name account is required.

Your credential belongs to this browser profile. Clearing browser data or using a different browser creates another identity; knowing a display name/public ID does not recover its private credential. Keep the device credential private. Only the public ID is shown by Copy ID.

The top-right count shows distinct browser identities seen on the community server within the last 60 seconds. It refreshes approximately every ten seconds, counts menus and matches, and excludes bots and duplicate tabs sharing an ID. Closed pages attempt to leave immediately; expired presence is removed automatically. Unavailable connections show a dash rather than a fabricated zero. This is presence on this server, not a count of verified physical people or players in other deployments.

## Lobbies and invitations

**Create Lobby** opens the existing dedicated-lobby controls on the community server. Choose arena, mode, capacity and match length, create it, then open Friends / Share Lobby:

- **Friends Only:** accepted friends can discover the shared lobby.
- **Invite Only:** it stays out of other players' listings; accepted friends can receive an explicit invitation.
- **Public:** anyone using this community directory can discover it.
- **Stop Sharing:** removes directory access and pending directory invitations.

Invite a friend from their row; they select **Join** on the incoming invite. Invites expire after two minutes. Drivers choose Blue/Orange and Ready; the host starts. Late arrivals can spectate the running match using the existing room controls. The host can also spectate. Leave the current match before joining a different lobby. Shared listings use live capacity/arena/match state, and full, abandoned or transferred-host listings stop admitting people through the directory.

The server verifies the host's private room capability before publishing. Listing/search responses do not contain room codes, credential hashes or host tokens. Admission through Friends checks visibility, accepted relationships, invitation lifetime, blocks and capacity before returning the room capability. Existing manually shared BCS invites continue to work: someone who already copied a room code can still use it until that room closes. Visibility controls directory discovery and invitations; it does not revoke previously copied codes.

Cloudflare keeps profiles and friendships in the existing SQLite Durable Object storage, with atomic relationship writes. Presence, invites and shared room capabilities stay in memory and expire; heartbeats do not write persistent storage. The standalone Node launcher uses `.social-data/` by default; set `SOCIAL_DATA_DIR` to a persistent private volume for that deployment. This directory is excluded from Git and static serving. The existing free Cloudflare service still allows one simultaneous game room; the social features add no paid service or extra Durable Object class.

## Music on load

Lobby Radio now attempts to play the selected song as soon as the interface initializes, with the saved music/master volumes. If the browser blocks audible autoplay, a notice explains that a click or keypress is needed; the first ordinary interaction retries playback without a separate Play step. Controller input also attempts to unlock playback, although the browser decides which gestures qualify. Explicit Pause cancels pending autoplay. Music still pauses during matches and hidden tabs, resumes in the lobby when requested, and switches between both supplied tracks.

## Photo-based van

Select **Garage → Bonnie Blue’s Van**. The original modeled mesh includes a rounded shell, cut-out wheel arches, sloped glass, mirrors, handles, door/roof seams, bumpers, grille, lamps and steel wheels. Steering, wheel roll, suspension and boost use the existing vehicle rig; opponents prepare the same model before starting. The wrap adapts the supplied turquoise/heart/lettering reference using an AI-assisted decal. The little QR-style mark is decorative; no source destination was supplied.

Only one side image was supplied, so the hidden side, front, rear and depth are inferred. This is a photo-based recreation, not a verified 1:1 scan. It uses the same gameplay hitbox and handling as other novelty bodies. The optimized embedded-texture GLB is about 1.2 MB and loads on selection. The source decal is [art/reference-van-wrap.png](../art/reference-van-wrap.png); reproduce the model with [create-reference-van.py](../scripts/create-reference-van.py). Reference branding/artwork remains separate from the original MIT game code; the import record documents the adaptation.

## Verification

**381 automated tests pass**, along with syntax checks and a Cloudflare deployment dry run. New coverage exercises authenticated identity, duplicate names, profile persistence, atomic storage and outage rollback, mutual requests, blocking, duplicate-tab counts, expiry, host proof, lobby visibility/invites/full rooms/reconnects, HTTPS/origin validation, browser-autoplay fallback and the van's actual texture UVs/animated wheel geometry. The van's body and independently animated wheel details use 18 material batches, with a regression budget below 30.

The two-browser test adds/accepts a friend, shares/invites/joins a real dedicated lobby, selects opposing teams, readies/starts/drives the same field, reloads the same ID/friendship, checks duplicate-tab counting, equips/renders the van, verifies autoplay/gesture fallback and reaches the controls at 720px. Run `npm run check`, `npm test`, and `npm run cloudflare:check` for repository validation.

For two-PC testing, reload both tabs for **boost-circuit-1.21.0**, exchange public IDs, add/accept, create/share a dedicated lobby and send an invite. Join, choose opposing teams, ready/start and drive. Leave and reload to confirm the same IDs/friendship; open a second tab to check that it does not add another identity to the count. Test both immediate autoplay in an allowed browser and first-interaction fallback in a fresh profile. The automated browser checks use software rendering; a player's GPU FPS, physical controllers and independent Australian network routes still need player evaluation.
