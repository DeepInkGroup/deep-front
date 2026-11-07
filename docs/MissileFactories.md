# Missile Factory

Missile Factories cost **1M gold**, take **40 seconds** to construct, and consume **30 MW**. Players may build any number; each stays at level 1. Build with **Shift+M** and open **Missiles** above the hotbar to manufacture ammunition.

Production uses **20 queued orders per player**, shared across all factories. Select a completed factory, then order one or five missiles. Each factory processes one missile at a time, in order. The next missile starts after the current missile finishes; separate factories can work independently. Orders cost gold immediately. Power shortages pause the factory's progress without losing it. Production resumes when electricity returns; there is no offline catch-up. Disabling Power Plants removes the electricity requirement.

| Missile                 | Manufacturing cost                                  | Powered production time |
| ----------------------- | --------------------------------------------------- | ----------------------- |
| Atom Bomb               | 750K                                                | 60 seconds              |
| Hydrogen Bomb           | 5M                                                  | 90 seconds              |
| MIRV                    | 25M + 15M per MIRV previously launched in the match | 120 seconds             |
| Stealth Missile         | 1.5M                                                | 35 seconds              |
| Hypersonic Missile      | 950K                                                | 30 seconds              |
| EMP Missile             | 750K                                                | 20 seconds              |
| Air-defense interceptor | 25K                                                 | 5 seconds               |

Finished missiles enter the player's shared inventory. The price is locked when the order is placed; launching does not cost gold again. A Bunker Missile Site needs both a ready launch tube and the correct missile in inventory. A MIRV's released warheads are part of the manufactured MIRV, not additional purchases.

SAM Launchers and CIWS share air-defense interceptor inventory. Each SAM shot consumes one, including shots that miss; each successful CIWS interception consumes one. Neither can intercept with empty stock. Existing reaction times, launcher capacities, cooldowns, EMP effects, Hydrogen/CIWS bypass and detection rules remain in force. SAM cooldown recovery only frees a firing slot; it does not create ammunition.

Inventory has no storage cap and stays with its owner if a factory is lost. Capturing or destroying a factory destroys its unfinished orders, without a refund or transferring them to the captor. The captured factory can accept its new owner's orders. Completed missiles can be launched even while factories lack power or after all factories are lost.

AI nations and bots build a factory when they own offensive launchers or air defenses, manufacture offensive missiles, keep a defensive stockpile and supply electricity through their existing Power Plant behavior. Solo and multiplayer use the same deterministic rules; queues and stock survive snapshots and reconnects.

**Disable Units → Missile Factory** disables the building and restores the previous direct-purchase launch and automatic defense-ammunition rules. Enabled by default. Instant Build affects building construction, not missile manufacturing time. Infinite Gold removes manufacturing prices without skipping production.
