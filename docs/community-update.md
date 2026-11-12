# Custom lobbies, controllers and supplied artwork — 1.11

The 1.10 fixes remain: long valid control gaps resynchronize, current held controls replace queued old controls, jump edges survive short bursts, and local predicted ball/car contacts respond before host correction. Mouse chords release correctly, controller steering follows the screen, right-stick look returns, and opposing pitch cancels a flip's pitch rotation. [Guest response and recovery details](network-recovery.md).

## Custom private lobbies

Choose **Private Match → Custom Lobby**. The host selects **2–8 people**, including spectators, and **1–30 minutes**. Share the complete `BC2-…` invite. Everyone initially joins as a spectator and may select Blue or Orange in the lobby, with at most four players per team. The host can stay spectating. Playing members select Ready; the host starts after selected models are prepared. Custom lobbies do not add filler bots.

Team/role choices are available before a match and after results. Arrivals during an active match watch as spectators until the next match. They receive its current score, clock and poses without an input-owned car. This release does not implement mid-match team switching or host migration. Choices lock during vehicle preparation so the captured player list cannot disagree with the lobby. Spectators receive no driving controls, boost HUD or career rewards.

At full time every playing member must request a rematch. Spectators do not block it, and the host's Start New Match cannot bypass consent. Find Next Match leaves the lobby and starts the existing casual queue. Leaving the host ends its lobby. Departed players are removed from admission and their old cars are hidden; replacement spectators cannot inherit them. If the final playing member leaves a spectating host, the match ends.

One host runs authoritative physics. Each guest has a separate WebRTC link, bounded input state and recipient-specific acknowledgements. Spectators receive state without driving inputs. Rooms with more than two field cars use up to 20 Hz snapshots, rounded to millimetre-scale values to reduce uplink load; two-car rooms retain up to 30 Hz. Rendering stays local. Host upload speed and CPU matter more as a lobby grows.

The public NetplayJS service permits only `offer`, `answer` and `candidate` forwarding. Admission uses a namespaced application envelope inside supported offer/answer messages; actual SDP/ICE follows the normal peer setup. The invite includes the registered host UUID and a random 128-bit lobby secret. Public roster messages do not expose per-player recovery tokens. Private lobby admission is separate from the public website audience.

An established guest can reconnect for up to 20 seconds through a per-peer secret queue. Other connected players continue. When every guest connection is missing, the host holds the match during recovery. The returning player keeps their car and match; input counters reset together. Failed resume sends retry without prematurely unfreezing physics. Intentional Leave over an open recovery connection ends it immediately. Missing playing members retain their rematch place until recovery or removal.

## Controller, names and chat

Xbox and PlayStation controllers use the browser's standard Gamepad mapping. **Options → Controls** offers button assignments, steering/pitch/look axes, inversion and restoration. Assigning an occupied button swaps the actions. Existing sensitivity/deadzones remain. HUD button hints follow saved bindings. Physical compatibility depends on browser/OS mapping.

Menus use D-pad/left stick to move, **A / Cross** to select and **B / Circle** to return. Left/right switches Options tabs or changes a focused select/range. An on-screen keyboard edits names, invite codes, chat and multiline quick-chat presets. Select/Back presses are consumed by menus instead of leaking into jump/boost; held throttle is retained. Browser permissions for audio, fullscreen and clipboard remain browser-controlled.

**Options → Interface → Display name** saves up to 20 plain-text characters in this browser. Names travel with appearances and update rosters, nameplates, scores and chat. Default chat keys are **Y** for text and **G** for quick chat; controller defaults are D-pad Right/Left. Both keyboard and controller bindings are editable. Chat releases driving controls without pausing other players.

Messages are capped at 140 characters and rate-limited. Peer chat is reliable; sender names come from accepted profiles and UI uses text rather than HTML. There are no accounts or server chat history. Offline chat is explicitly local. Up to 20 quick-chat entries can be edited. Requested playful/gameplay lines are included; self-harm encouragement and identity-based attack presets were omitted.

## Stadium and vehicles

The supplied Champions Field's actual turf, ramp/perimeter trim and native goals replace generated pitch/goal primitives. Existing interactive boost pads and pitch markings remain. Source vertices are calibrated to the floor/ramp solver; the flared goal mouth is locally fitted at the scoring plane. Forty-six aperture rays fit within 0.911 mm. All 740 boundary rays hit, with maximum sampled ramp error 20.37 mm. Obstructing cage/dome parts are excluded; native curved goal backs approximate rectangular collisions. [Source, transformations and limits](champions-inner.md).

Garage contains **15 bodies**. New choices: **Randy Marsh, Ridiculous Vehicle, Viking Battle Vehicle, Sci-fi Three-Wheeler, Wooden Golf Cart, Autorickshaw and Infantry Fighting Vehicle**. They share the existing hitbox/handling and load only when selected or required by a participant. Wheels roll/steer where appropriate; IFV running gear rolls with fixed tracks, Randy has an authored run cycle and Ridiculous retains its walking clip. Skeleton instances are independent. [Character/wagon details](novelty-assets-a.md) and [vehicle details](novelty-assets-b.md).

Artwork keeps its own licenses, separate from MIT code. Three supplied archives lacked usable author/license notices; their reports mark them undetermined. The rickshaw identifies Sketchfab Standard rather than CC BY and retains its recorded conditions. The other three new mechanical models and Champions Field identify CC BY 4.0. Import reports preserve metadata and hashes without inventing permissions.

## Verification

**193 automated tests pass** for version 1.11.0. Coverage includes eight-person ownership, a spectating host, late spectators, individual acknowledgements, preparation locking, reused IDs, stale callbacks, consent, failed resume sends, recovery departure, constrained-bandwidth guest response, controller menus/tabs/text entry, saved bindings/names/chat, all seven actual GLB rigs and native pitch/goal rays. Node image loaders are stubbed; final asset previews were inspected offline in Blender.

The final actual WebRTC check used **four clients: two players and two spectators, including the host**. It passed invitations, readiness, state, per-player acknowledgements, chat, independent guest recovery while another player continued, mutual rematch and cleanup. Recovery took **12.661 seconds**, acknowledging **119** guest controls before and **99** after counter reset. Data used same-container host ICE candidates; signaling reached the public service through the inherited proxy. Independent-home-network and TURN traversal remain unverified.

Interactive game rendering, device FPS, physical Xbox/PlayStation hardware and full browser layout remain unverified because the required managed browser tool is unavailable. No alternative game preview/controller or browser installation was used for release QA. No software was installed or settings changed on the user's PC.
