# Custom usernames and shared chat — 1.12

Choose **Edit Name** beside your lobby profile or in the pause menu. Enter a username and select **Save Name**. The existing **Options → Interface → Display name** field edits the same setting. Names save in local browser storage, survive reloads and remain separate between browser profiles/devices. A blocked storage write is reported as session-only. Accepted profile changes update other participants' rosters, nameplates, scoreboard and future chat messages. There are no separate game accounts or unique-name reservations.

Choose **Chat** from the match HUD, pause menu, private/custom lobbies or results. During play, **Enter** or the default **Y** key opens text chat, and **G** opens quick chat. During a goal replay, Enter keeps its Skip function. Default controller chat bindings are D-pad Right (text) and Left (quick); saved custom bindings remain available. Menus and their text fields work with the existing controller keyboard. Opening chat releases driving controls; closing returns focus to the match or the menu underneath it. The dialog includes the same recent transcript as the HUD feed.

## Shared history

Everyone connected to the current room sees the same messages, including spectators and the host when spectating. Messages use reliable peer channels and canonical sender names. Each host keeps at most **five messages** in memory; the sixth removes the oldest. The first message in an empty feed starts a **five-minute deadline**. All messages clear together at that deadline, even if later messages have replaced the original first message. New messages do not extend the deadline. The next message starts a fresh cycle. Rematches in the same room retain the current cycle; leaving or starting another room clears the local feed.

The host sends the current bounded feed and remaining lifetime on admission, late match entry and reconnection. Clearing is broadcast to all connected peers, with local timers as a fallback. Game pause does not pause the chat timer. Clients cannot replace the host's feed. The feed is not written to local storage or a server chat database. Offline chat is explicitly local. Existing 140-character limits, rate limiting, plain-text rendering and editable quick-chat presets remain.

## Verification

**203 automated tests pass** for version **1.12.0**, along with the JavaScript syntax and static HTML/module checks. New tests cover independent browser name saves/reloads, blocked storage, edit/cancel, visible chat controls and focus return, replay shortcuts, shared HUD/dialog transcripts, the exact five-message limit, the 299,999/300,000 ms clearing boundary, a deadline that does not slide, malformed state rejection, late spectators, reconnect snapshots, host authority, automatic-match callback forwarding and timer cleanup.

The actual WebRTC check used four clients: two players and two spectators, including the host. All four received the same newest-five feed and the reliable shared-clear message. It also passed room admission, readiness, per-player input acknowledgements, independent guest recovery, mutual rematch and departure cleanup. Recovery took **13.143 seconds**, with **119** controls acknowledged before the drop and **98** after counters reset. The exact five-minute interval is tested with a virtual clock; the live session checks the network clear path without a five-minute wait.

Data used same-container host ICE candidates and public signaling through the inherited cloud proxy. Independent home networks, browser-rendered layout, WebGL performance and physical controllers remain unverified because managed browser control is unavailable. No browser installation, alternate browser controller or preview server was used. No software or settings were changed on the user's PC.

Every player must reload for the **boost-circuit-1.12.0** network build. The hosted site's existing Public access is preserved.
