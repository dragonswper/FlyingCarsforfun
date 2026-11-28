# Weapon balance

Values are starting points for playtesting. Reach is the game simulation's range in metres. Phase times are seconds. Recovery excludes the shared 0.10 second cooldown.

| Weapon | kg | Damage | Reach | Windup | Swing | Recovery | Stamina |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Knight’s Dagger | 0.62 | 16 | 1.85 | .12 | .18 | .20 | 11 |
| Bronze Sword | 1.30 | 24 | 2.85 | .17 | .24 | .26 | 17 |
| Steel Longsword | 2.10 | 31 | 3.45 | .24 | .25 | .34 | 22 |
| Iron Axe | 3.20 | 39 | 3.05 | .30 | .30 | .43 | 27 |
| Plasma Blade | 0.80 | 26 | 3.05 | .14 | .21 | .32 | 20 |
| Knapped Club | 2.70 | 34 | 2.50 | .27 | .29 | .38 | 24 |
| Ash Spear | 2.40 | 28 | 4.05 | .28 | .25 | .42 | 24 |
| Redcanopy Blade | 1.35 | 27 | 3.22 | .16 | .21 | .29 | 19 |
| Pulse Mace | 3.80 | 43 | 2.77 | .34 | .28 | .47 | 31 |

Dagger and Bronze Sword buy fast recoveries with shorter reach. The Longsword sets the middle of the range. Axe and Mace charge more stamina and leave larger openings. The Club gives up reach for a shorter reset than the Axe. The Spear has the longest reach and takes nearly as long to recover as the Axe. The Redcanopy Blade gets another cut out quickly. Plasma has a faster first cut and costs more per follow-up.

Horizontal cuts cover a wider angle and deal 92% damage. Rising cuts delay the defender for 150 ms. Downward cuts cost the defender the most guard stamina. A fresh guard has a 160 ms parry window. Holding costs eight stamina per second, and heavier weapons cost more to block.

## Expedition and advanced combat (0.5.0)

| Rule | Value |
| --- | ---: |
| Home core / repair | 400 HP / +50 HP for 30 stamina |
| Captain health | 280 × (1 + .45 × additional players) |
| Captain enrage | At or below 50% health |
| Slam warning / radius | .95 seconds / 3.7 metres |
| Slam damage / enraged damage | 18 / 25 |
| Slam interval / enraged interval | 8 / 5 actor-clock seconds |
| Shield / flanker / mender HP | 135 / 80 / 90 |
| Mender healing / cooldown | 18 HP / 6 actor-clock seconds |
| Era shift interval | 60 game seconds |
| Sunscar pulse | 8 damage every 3 game seconds within 3.2 metres |
| Ward seals | Three at 45 HP each |
| Caravan HP / speed / escort radius | 180 / 3 metres per second / 7 metres |
| Caravan repair / restart | +55 HP for 25 stamina / 8 seconds after destruction |
| Relay channel | 1.5 seconds, cancelled by damage or leaving 2.7-metre range |
| Finisher requirement / cost / damage | 3-hit streak / 35 stamina / ×1.65 |
| Parry riposte window / damage | 1.2 actor-clock seconds / ×1.35 |
| Hourglass Focus | 5.5 seconds (base 4) |

Relic modifiers are declared in `src/expedition.js`. Finisher cost stays fixed; the Warden Seal discounts basic attacks only. Weapon damage still applies its directional cut multiplier. Captains do not respawn; normal squads return after 12 seconds while their core survives. Completing an objective exposes its core. These are explicit design values for this game, not measurements of another title.
