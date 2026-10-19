# Underwater train tunnels

Nearby rail-capable buildings connect across rivers or seas when **both are
level 31 or higher**. The existing station range (110 tiles) and maximum rail
path length apply. Cities, Ports and Factories can reach this requirement;
buildings with lower level caps retain their normal rail connections.

Connections appear automatically within two game seconds after the second
endpoint qualifies. Existing shallow-water bridges upgrade to tunnels. Deep-water
tunnels use continuous cardinal paths and do not change water terrain or ship
routes. The underwater portion appears as a dashed cyan line.

Tunnels join normal rail clusters. Factory trains travel through them and pay
the same station income, logistics bonuses and customs bonuses as surface rail.
Normal trade permissions still apply. A factory is required to spawn trains.

Destroying an endpoint removes the tunnel. An endpoint dropping below level 31
stops in-flight trains immediately; network housekeeping removes the link within
two seconds. Intermediate buildings cannot split a tunnel or bypass its portal
level requirement. Impassable terrain is never drilled through.

Solo, multiplayer, simulation snapshots and visual replays preserve tunnels.

Validation: `npx vitest run tests/economy/WaterTunnels.test.ts`.
