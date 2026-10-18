# Bunker Missile Site

The bunker is available in solo and multiplayer. It takes 50 seconds to build.
Level 1 costs 1,000,000 gold; upgrading to level 2 costs 1,300,000; every
subsequent level costs 1,500,000. Every upgrade takes 5 seconds and temporarily
locks launching and further upgrades. There is no level or building cap.

Each level adds one missile tube. Tubes use the existing silo reload time
(9 seconds). Existing tubes and reload timers survive captures and saves.
An upgrade interrupted by capture or destruction does not grant another level.

| Missile            |          Price | Behavior                                                                                                                                                                                                                           |
| ------------------ | -------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stealth Missile    | 1,500,000 gold | Hidden from opponents' sprites, trails, blast markers and launch status until it enters the targeted country's territory; the warning is also delayed. Each SAM has a deterministic 25% chance to fail detection for that missile. |
| Hypersonic Missile |   950,000 gold | Four times the normal atom missile speed. SAMs belonging to transit countries cannot engage; only the country targeted at launch can attempt SAM interception. CIWS can intercept within any hostile CIWS coverage.                |

Hypersonic missiles use the atom bomb blast radius and damage rules. Stealth missiles have 50% of the atom bomb blast area (both radii multiplied by sqrt(1/2)).
They require a completed, ready bunker, rather than an ordinary Missile Silo.
Peace time and teammate protections apply to targeting and splash damage.
Ordinary SAM interception still depends on range, flight timing and reload state. CIWS guarantees interceptions inside its operating range.

Bots and nations build bunkers, upgrade them and launch affordable missiles.
The lobby's **Disable Units** list contains the bunker and each missile
independently. Disabled types are rejected by the simulation for humans and AI.

Capped building blueprints stay selectable while existing buildings can still be upgraded. Additional buildings remain blocked by the simulation. Once all available upgrades are exhausted, the button is dimmed and disabled.

Verification: `npx vitest run tests/combat/BunkerMissileSite.test.ts tests/client/BunkerControls.test.ts`
