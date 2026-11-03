# Electricity and Power Plants

Electricity is enabled in new solo and multiplayer games. In **Disable Units**,
turning off **Power Plant** hides the building and removes every electricity
requirement, restoring the previous production and city rules.

Power Plants have no building-count or level cap. The first level costs **750K**;
each next level costs 250K more (1M for level 2, 1.25M for level 3, and so on).
Construction takes **30 seconds**; Instant Build still works. Plants supply
**100 MW per level** to their owner's national grid, regardless of distance.
They also connect to the existing rail network without earning station income.

| Building        | Demand per level  | What pauses without electricity                      |
| --------------- | ----------------- | ---------------------------------------------------- |
| City            | 20 MW             | Extra troop capacity and train-stop income           |
| Factory         | 30 MW             | New train production                                 |
| Oil Factory     | 40 MW             | Tanker production/replacement and new oil departures |
| Copper Mine     | 25 MW             | Periodic copper income and train-stop income         |
| Missile Factory | 30 MW (one level) | Missile manufacturing progress                       |

Only completed buildings consume or supply electricity. During a shortage,
completed buildings are allocated their full load in creation order. A building
whose load will not fit stays offline; smaller later loads can still use the
remaining capacity. Nothing is destroyed by an outage. Supply is recalculated
after construction, upgrades, destruction and ownership changes. Production
resumes automatically; copper does not back-pay missed income.

Existing loaded trains and tankers may complete their voyages. Unpowered trade
stops do not earn income. Rails remain intact. Oil hull replacement timers still
elapse during an outage, but a replacement is launched only once both its timer
has expired and its factory has power.

The HUD shows used power, generation, total demand and the number of offline
buildings. Offline buildings are dimmed orange. Build menus show each consumer's
per-level demand. **Shift+P** selects Power Plant (displayed as **SP**).

AI tribes and nations build generation ahead of demand, preserve plants and
upgrade plants when space is unavailable. Their consumer upgrades respect power
headroom. Power Plants transfer intact on capture, including their upgrades;
bombs and normal destruction can still destroy them.

The shared integer allocation is in `packages/engine-api/src/game/Power.ts`.
The engine caches it by the existing unit revision, while the HUD and renderer
derive the same allocation from synchronized buildings. No independent power
timer or additional network state can drift between clients. Save/reconnect
rebuilds this derived state.

`tests/economy/PowerPlant.test.ts` covers supply, shortages, prices, unlimited
upgrades/buildings, city and factory behavior, oil/copper production, capture,
construction, AI, disabled-power lobbies and snapshot restoration. Existing
engine test fixtures use the no-electricity lobby mode; electricity scenarios
opt in with `electricity: true` in the test setup helper.
