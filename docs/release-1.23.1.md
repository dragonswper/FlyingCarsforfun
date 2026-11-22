# 1.23.1 — Compact mobile menus

Reload https://flyingcarsforfun.connstors.workers.dev for **boost-circuit-1.23.1**. Existing vehicle, name, HUD and friend settings remain saved. This release changes menu layout and matchmaking explanations; it retains the existing gameplay and free dedicated-server configuration.

The screenshots exposed three layout problems: desktop garage heading/card rules still won the CSS cascade; compact styling depended on touch detection, which can differ in desktop-site mode; and the showroom radio remained visible beside other screens. The online form also mixed essential choices with long connection configuration in a scrolling modal.

The compact layout now follows the viewport, including small mouse-only windows and touch tablets. The home screen uses six main actions in a two-column grid, with three smaller utility actions. Touch targets stay at least 44 px high. Profile and footer areas have separate space. The radio moves into a **Music** sheet opened from the footer; the same audio element, controls and saved track selection are retained.

Garage uses an opaque panel, a compact heading, a fixed close button and a separate scrolling vehicle grid. Landscape shows four cards per row; narrow portrait shows two. Repeated technical subtitles are hidden in this view. Lobby decorations and presence are hidden while a modal owns focus, avoiding overlapping headings, music and profile panels.

Online Match initially shows **Game Mode**, **Region** and **Arena Preference**. **Connection & Ping Settings** expands the server address, connection type, ping preference and policy; these controls still work and retain their saved values. The Find/Back row remains outside the scrolling content. If a dedicated connection needs an address, the advanced section opens so it can be entered. Free Play, Training and Custom show their actual action and explanation rather than promising an opponent search.

Inputs use consistent sizing and select arrows, with Safari automatic landscape text inflation disabled while ordinary page zoom remains available. Desktop layouts retain the showroom radio and the advanced connection controls initially expanded. HUD layout editing, touch driving and phone fullscreen/home-screen features remain available.

Validation: **400 automated tests pass**, with syntax and Cloudflare dry-run checks. New unit coverage verifies radio relocation/restoration without cloning playback controls, preserving manual disclosure choices, cleanup on layout changes, dedicated practice/lobby descriptions and missing-address guidance. Browser checks cover **844×390**, **390×844**, **667×375 with mouse-only input**, and **320×568**: navigation and action bounds, separate profile/footer space, vehicle density and heading size, sticky garage close, advanced-setting reachability, track switching/persistence and settings access. Tests use Chromium with touch emulation; physical Safari/device testing still requires player feedback.
