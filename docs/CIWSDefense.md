# CIWS Defense

CIWS uses the SAM's 30-second build duration, range progression, and per-tick
reaction checks. It guarantees interception inside its operating range, including
stealth missiles, hypersonic missiles, MIRV carriers, and MIRV warheads.
Simultaneous attacks do not exhaust its protection. Friendly missiles are ignored.
Unlike ordinary SAMs, CIWS can intercept hypersonic missiles crossing its country.

The simulation checks the whole movement segment, so a fast missile cannot jump
across the protected area between ticks. Unfinished sites provide no protection.

| Level |                  Cost |
| ----- | --------------------: |
| 1     |             2,000,000 |
| 2     |             3,000,000 |
| 3–5   | 3,500,000 per upgrade |

Each site supports five levels. Players can build multiple sites. Bots and nations
can build and upgrade CIWS; the solo and multiplayer Disable Units option applies.
Attack previews show CIWS and applicable SAM coverage.

New default shortcuts are editable in Settings:

| Shortcut | Building or missile |
| -------- | ------------------- |
| Shift+1  | Oil Factory         |
| Shift+2  | Copper Mine         |
| Shift+3  | Logistics Center    |
| Shift+4  | Customs Office      |
| Shift+5  | Bunker Missile Site |
| Shift+6  | CIWS Defense        |
| Shift+8  | Stealth Missile     |
| Shift+9  | Hypersonic Missile  |

Copper Mine and Oil Factory hotbar buttons stay available at the building count
cap if any completed building can still be upgraded. Click an existing building
to upgrade it; selecting an empty tile cannot create a building beyond the cap.
