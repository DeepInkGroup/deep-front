# Bunker Missile Site

The bunker is available in solo and multiplayer. It takes 50 seconds to build.
Level 1 costs 1,000,000 gold; upgrading to level 2 costs 1,300,000; every
subsequent level costs 1,500,000. Every upgrade takes 2 seconds and temporarily
locks launching and further upgrades. There is no level or building cap.

Each level adds one missile tube. Tubes use the existing silo reload time
(9 seconds). Existing tubes and reload timers survive captures and saves.
An upgrade interrupted by capture or destruction does not grant another level.

All offensive missiles now launch from this building, including Atom Bombs,
Hydrogen Bombs and MIRVs. The old Missile Silo has been removed from purchasing,
the hotbar and lobby options. Its type ID remains readable in historical saves.
The old 5 key now selects the bunker; S5 also works.

| Missile            |          Price | Behavior                                                                                                                                                                                                                           |
| ------------------ | -------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stealth Missile    | 1,500,000 gold | Hidden from opponents' sprites, trails, blast markers and launch status until it enters the targeted country's territory; the warning is also delayed. Each SAM has a deterministic 25% chance to fail detection for that missile. |
| Hypersonic Missile |   950,000 gold | Four times the normal atom missile speed. SAMs belonging to transit countries cannot engage; only the country targeted at launch can attempt SAM interception. CIWS can intercept within any hostile CIWS coverage.                |
| EMP Missile        | 1,000,000 gold | Hidden until the target border. An undetected arrival disables hostile CIWS within 70 tiles for 5 seconds, with no damage. Any successful SAM detection permanently cancels that missile's EMP effect. S7 selects it.              |

Hypersonic missiles use the atom bomb's radius; Stealth missiles use 50% of its area (both radii multiplied by sqrt(1/2)). Both are conventional building strikes: they destroy structures only, leave land ownership and troops intact, and never create fallout or convert land to water, even with Water Nukes enabled.
Every missile requires a completed, ready bunker and shares its missile tubes.
Peace time and teammate protections apply to targeting and splash damage.
Ordinary SAM interception still depends on range, flight timing and reload state.
Active CIWS intercepts supported missiles inside its operating range. Hydrogen
Bombs bypass CIWS and can destroy it; SAM Launchers still engage them. An
undetected EMP bypasses CIWS. Once a SAM detects it, CIWS can intercept the EMP.
Detection sensors work while the SAM is reloading. Disabled CIWS is dimmed and
its defense overlay disappears until recovery. EMP impacts show a blue pulse.

Bots and nations build bunkers, upgrade them and launch affordable missiles.
The lobby's **Disable Units** list contains the bunker and each missile
independently. Disabled types are rejected by the simulation for humans and AI.

Capped building blueprints stay selectable while existing buildings can still be upgraded. Additional buildings remain blocked by the simulation. Once all available upgrades are exhausted, the button is dimmed and disabled.

Verification: `npx vitest run tests/combat/BunkerMissileSite.test.ts tests/client/BunkerControls.test.ts`
