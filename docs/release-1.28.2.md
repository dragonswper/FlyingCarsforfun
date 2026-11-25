# 1.28.2 — friend invitations and shared lobby cars

Invite is available directly in Friends & Lobbies. It creates a dedicated
eight-person private game lobby when needed, reuses a connected lobby, verifies
admission, then sends the invitation. Accepted invitations join that exact room;
they do not create another game. The sender sees confirmation or a useful error,
and recipients can refresh or use the normal lobby/menu presence updates.
Existing lobby visibility is preserved when inviting again.

The main menu now renders every member's selected body and paint beside the
local car. A party panel lists names, the host, capacity and reconnect status,
with Lobby Settings, Invite Friends and Leave actions. Garage changes propagate
through validated lobby appearance messages. Leaving removes the member's car;
brief reconnects keep the group preview in place. Models load lazily, failed
remote models get an original-body fallback, and stale loading callbacks cannot
replace a running match. A shared preview clock and the existing vehicle rigs
are reused; this is presentation rather than another network simulation.

Lobby settings have a separate Back to Lobby action. Closing that panel or using
Escape no longer silently disconnects the group. The online-play menu opens the
existing shared lobby controls instead of starting a separate solo search.
Joining through Friends assigns a team and readies the player initially; teams,
spectating and readiness remain editable before the host starts the game.

Connected members can invite their own mutual friends into the current party.
The service validates their unguessable membership proof against the live room,
keeps visibility under host control, and respects host/sender blocks, friendship
removal, membership expiry and invitation expiry. Capabilities stay out of
listings. Appearance changes are sanitized and accepted only in a lobby or
after a match. In-game vehicle state, collision, score and time remain server
authoritative.

Lobby heartbeat grace is one minute to tolerate menus and background tabs.
Active matches retain the existing three-second watchdog and twenty-second
reconnect window. The showroom remains visible during a brief reconnect.
Friends sync more frequently in menu/lobby states while retaining backoff on
errors. The free service and eight-person limit stay in place.

Verified build negotiation now works in both directions. A new client can
speak a pinned older server's build tag while frontend/backend updates propagate;
the server already supports verified older clients. Only reliable build tags
are normalized. Unknown versions still fail safely, and the shared physics,
catalog and binary state remain pinned to their compatibility hashes.

## Verification

A three-context Chromium test uses real HTTPS/WSS and the actual UI to create
friendships, invite from the main menu, join the same room, render two and three
cars, change a body, send an invitation as a guest, remove a departing member,
close lobby settings without leaving and start a shared match. Desktop, phone
portrait and phone landscape layouts are checked; compact touch actions are
at least 44 px. No JavaScript errors remain. These functional software-rendered
checks do not measure physical-phone FPS or Australian two-PC latency.

Unit/integration coverage includes guest-invite permission/revocation,
appearance validation, stale preview cancellation, shared loading promises,
one/eight-person layouts, lobby versus match heartbeat thresholds, and
per-connection build normalization. Unmodified archived v1.27/v1.28 clients and
a current client against an archived v1.28.1 server retain join/driving coverage.
Public build/assets, private sessions, reconnects, matchmaking and test-room
cleanup are verified after deployment.

All **502 automated tests**, the recursive syntax check and the Cloudflare
deployment dry-run pass. Cloudflare integration tests exercise the full
host → guest → third-player invite chain and appearance broadcasts.
