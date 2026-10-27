# Strait Control Station

Build on your coastal land beside a narrow strait or canal. Both banks must
belong to you. The first station costs **3.5M gold**, the second **5M**. Each
player may own **two stations**, including construction sites. Stations take
**90 game seconds** to build and have **one level**. Instant Build applies.
The shortcut is **Shift+0**, shown as **S0** in the building bar.

## Valid waterways

The placement check finds a water cross-section between your banks, up to
80 tiles wide. Removing that cross-section must separate two navigable local
waterways that continue away from the crossing. Open coasts, ponds, dead-end
bays and water that reconnects around a nearby headland do not qualify.
One-tile canals and diagonal straits are supported. Nearby overlapping
stations cannot charge the same local passage twice.

The placement preview and the simulation use the same authoritative rule.
The station sits on the bank; its gate spans the water to the opposite bank.
Aim at the water or nearby land: placement snaps to the nearest valid bank within
12 tiles and previews the full crossing in cyan. Stations can be eight tiles from
another building, allowing coastal placement near ports while preserving spacing.

## Setting a toll

Open **Strait tolls** below the building bar. Select a rate from **1% to 10%**,
choose whether **Allies pass for free**, and press **Apply toll**. New stations
start with tolls off. **Open free passage** disables collection and restrictions.
Changing terms sends a fresh request and clears previous consent.
The owner panel shows paid passage counts and total gold collected. Capturing a
station clears its former owner's counters.

Other human players receive a notification and an automatically opened panel
with **Accept toll** and **Reject passage**. They may change their decision
later. AI traders accept commercial tolls automatically.

Commercial Trade Ships require accepted terms unless their sender owns the
station or qualifies for the owner's ally exemption. Pending and rejected
agreements close that passage to the sender's trade ships. Routing searches
for an alternative water route. If no route exists, ports stop dispatching
ships on that connection; ships already sailing wait until passage becomes
available. Other ports and destinations can still trade when reachable.

## Payment

A voyage's cargo value is fixed from its planned journey when it enters the
toll system. Each station collects once per voyage, when the ship crosses
its water gate. A 100K cargo at a 10% rate transfers **10K from the sender's
balance** to the station owner. The receiver still receives **100K**. Cargo
is never reduced by a toll. A sender who cannot afford the full fee must
use another route or wait; tolls cannot overdraw their balance.

## Losing control

Destroying the station removes its toll and passage restriction. Bombs can
destroy stations. Losing either bank cancels the existing toll. Capturing a
station destroys it immediately, clears the former toll and consent, and awards
no captured station to the conqueror. Build a new station under your own control
to charge tolls again. Customs Offices are also destroyed on capture rather than
transferring their train-income bonus.

Water terrain changes also trigger a topology check and cancel a toll if
the crossing no longer qualifies. Regaining control does not silently
restore the former toll.

Available in solo and multiplayer, including **Disable Units** in lobby
settings. Save/reconnect snapshots preserve settings, consent, cargo,
paid tolls and voyages waiting at closed routes.

Run the focused checks with:

```sh
npx vitest run tests/economy/StraitControl.test.ts tests/client/StraitTollPanel.test.ts tests/core/executions/TradeShipExecution.test.ts
```
