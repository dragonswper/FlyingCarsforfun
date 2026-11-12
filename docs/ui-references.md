# Rocket League interface references

Reviewed 12 November 2026 for Boost Circuit 1.5.

The user's requested reference is [Game UI Database — Rocket League, game 134](https://www.gameuidatabase.com/gameData.php?id=134). Its HTML returned HTTP 403 from the workspace, and the web tool reported a robots exclusion. The Overview and HUD/gameplay tabs could not be inspected, so their contents and a pixel-identical match cannot be verified.

As an accessible alternative, the [Rocket League collection on Interface In Game](https://interfaceingame.com/games/rocket-league/) provides public screenshots of the classic interface. These eight 1920×1080 images were downloaded to scratch and visually inspected:

| Screenshot | Implemented reference |
| --- | --- |
| [Main menu](https://interfaceingame.com/screenshots/rocket-league-main-menu/) | Slim white text, left-side black slanted rows, pale blue selection glow and the blue player banner along the bottom |
| [Exhibition match](https://interfaceingame.com/screenshots/rocket-league-exhibition-match/) | Light heading, left-aligned local match setup, dark selector bars and Create Match action |
| [Garage](https://interfaceingame.com/screenshots/rocket-league-garage/) | Left-side customization with the actual live vehicle visible on the field |
| [Paused](https://interfaceingame.com/screenshots/rocket-league-paused/) | Compact central blue panel, pale highlighted Resume button, Options and Exit actions |
| [Chat / Options](https://interfaceingame.com/screenshots/rocket-league-chat/) | Blue glass options shell, narrow category tabs, light selected tab with a pointer; only implemented categories are shown |
| [Go](https://interfaceingame.com/screenshots/rocket-league-go/) | Blue/orange score blocks around a dark clock, gold countdown/GO, colored nameplates, red ball-cam label and amber boost gauge |
| [Shot on goal](https://interfaceingame.com/screenshots/rocket-league-shot-on-goal/) | Thin numeric HUD, sparse overlay and segmented partial boost arc; no invented shot/point events were added |
| [Replay](https://interfaceingame.com/screenshots/rocket-league-replay/) | Red Replay label at lower left, bottom scorer banner and actual goal speed, skip hint at lower right |

The corresponding image URLs are `https://interfaceingame.com/wp-content/uploads/rocket-league/rocket-league-<name>-1920x1080.jpg`. The source images are reference material only and are not bundled, hotlinked or displayed as interactive game UI.

## Implementation and scope

Menus and HUD are new HTML, CSS and SVG. The layout uses a 1920×1080 baseline with responsive sizing. The scoreboard is approximately 354×87 baseline units; the boost dial is 215 units wide and uses a 225-degree masked segmented arc. Its path is normalized to 100 units so fuel directly controls the fill. Free Play and Training display actual unlimited fuel as 100 and hide the competitive scoreboard.

The classic interface is adapted to Boost Circuit's own name and available features. Duel/Doubles are local bot exhibition matches. Free Play and five-drill Training have a separate menu. The Fennec, original car alternatives, paints, difficulty levels and all existing camera/control/graphics/audio settings remain usable. Career shows actual local records. The scoreboard uses real score/goals/assists/saves, and replay speed comes from the simulation's goal event. Player labels are pooled HTML elements projected from the interpolated 3D render positions; demoed, rearward and offscreen cars are hidden.

Pass, shop, monetization, matchmaking, social panels, clubs and other unavailable screens were omitted. The live stadium replaces the native game's scene; the original game's proprietary typeface is approximated with locally hosted Rajdhani (Light, Medium and SemiBold), by Indian Type Foundry under SIL OFL 1.1. Latin/UI glyph subsets are packaged as WOFF, with the source license included. Text falls back to the system font for any unbundled symbol.

Exact texture/shader effects, native UI perspective, proprietary font metrics and the requested blocked reference tabs are not verified. Browser rendering tools were unavailable under the managed Sites workflow, so automated checks establish source/behavior correctness, not pixel equivalence or measured FPS. See [verification](verification.md).
