# Porting the campaign interface

The references use a burnt-umber dusk, amber highlights, dark ridgelines, parchment notes, wax seals and serif titles. The browser design uses Cinzel display type, Caveat notes and DM Sans labels and controls. Squared controls with shallow radii, dashed dividers and visible gold focus rings set the shape language.

## Tokens and layout

`src/campaign.css` holds the portable `--campaign-*` tokens. They map directly to named colors, type styles, spacing, corners and transition durations in UMG or UI Toolkit. `--era-ink` resolves from `[data-era]`; themes share the same structural tokens. Use the live layout columns as your responsive breakpoints.

```json
{
  "colors": {
    "ink": "#241a14",
    "night": "#1c130f",
    "cream": "#f1e3c4",
    "paper": "#e8d7af",
    "gold": "#daa74d",
    "red": "#9a4031"
  },
  "eraAccents": {
    "flintwake": "#c5a877",
    "sunscar": "#f0c373",
    "ironwood": "#daa74d",
    "redcanopy": "#e98c83",
    "frostfall": "#ddb183",
    "ashline": "#b5bfc4",
    "glassreach": "#8be0dd"
  },
  "radiusPx": 5,
  "transitionMs": 160,
  "home": ["navigation", "dailySeed", "eraPreviewButtons"],
  "camp": ["playerSlots", "terrainPreview", "chat"],
  "pit": ["localFighter", "rulesAndTerrain", "challenger"]
}
```

## Flow and components

- **Home → Play → Frontier** opens the seeded setup, then loading and first-person play. The daily-seed button skips setup.
- **Home → Training** opens the safe Training Yard. It uses the same HUD and input as the rest of the game.
- **Home → Join a lobby** opens the local camp. Its mock roster, chat, map and ready state can be bound to a native lobby adapter.
- **Home or Camp → The Pit** opens an Arena lobby. The same screen handles bot practice and the invite and response exchange. An online countdown starts after both fighters mark ready.
- **Home → Loadout / Career / Controls / Settings / Credits** provides persistent local choices and attribution. **Match → Pause → Settings** reuses the settings dialog. Match status is available on Tab. M opens the parchment field map in Frontier.

Use text and shape together for readiness and swing prompts. The browser honors reduced-motion preferences, provides a scale control and rebindable movement keys, and keeps menus keyboard accessible. UMG subwidgets or UI Toolkit templates can reuse the same menu actions, paper panels, mode cards, fighter cards, status meters, field rows, and dialog states.

## Runtime boundaries

`src/interface.js` owns menu navigation and the local camp preview, and calls `onStart(mode, config)`. `src/settings.js` persists settings and profile state. The Pit uses `src/network.js` to exchange session, ready-up and match messages. Gameplay feeds the HUD with the latest simulation snapshot, so ported screens can subscribe to game events without depending on the renderer. The browser plays a velocity-shifted weapon swoosh and surface-specific contacts with optional captions. Career stores local totals. Match summaries read the host’s fighter statistics in an online match.
