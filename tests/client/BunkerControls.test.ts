import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { Config } from "@openfront/engine-lib/configuration/Config";
import { EventBus } from "@openfront/shared/EventBus";
import { UnitDisplay } from "../../src/client/hud/layers/UnitDisplay";
import { extractNukeTelegraphs } from "../../src/client/render/frame/derive/NukeTelegraphs";
import { computePlayerStatus } from "../../src/client/render/frame/derive/PlayerStatus";
import { UnitState } from "../../src/client/render/types";

describe("Bunker controls and concealed missiles", () => {
  it("renders capped building buttons dimmed and disabled, then re-enables after a loss", async () => {
    let capped = true;
    const config = new Config({} as never, false);
    const player = {
      gold: () => 100_000_000n,
      isAlive: () => true,
      units: (type: UnitType) =>
        Array(
          capped
            ? type === UnitType.OilFactory
              ? 5
              : type === UnitType.CopperMine
                ? 2
                : type === UnitType.LogisticsCenter
                  ? 1
                  : 0
            : 0,
        ).fill({}),
      totalUnitLevels: () => 0,
    };
    const display = new UnitDisplay();
    display.game = {
      config: () => config,
      myPlayer: () => player,
      inSpawnPhase: () => false,
    } as never;
    display.uiState = { ghostStructure: null } as never;
    display.eventBus = new EventBus();
    document.body.append(display);
    await display.updateComplete;
    for (const name of ["Oil Factory", "Copper Mine", "Logistics Center"]) {
      const button = display.querySelector(
        `button[aria-label="${name}"]`,
      ) as HTMLButtonElement;
      // Test setup keeps translation keys as labels; fallback to native icon.
      const target =
        button ??
        display
          .querySelector(`img[alt="${name.toLowerCase().replace(/ /g, "_")}"]`)
          ?.closest("button");
      expect(target).toBeTruthy();
      expect(target?.disabled).toBe(true);
      expect(target?.className).toContain("opacity-30");
      target?.click();
      expect(display.uiState.ghostStructure).toBeNull();
    }
    capped = false;
    display.requestUpdate();
    await display.updateComplete;
    const oil = display
      .querySelector('img[alt="oil_factory"]')!
      .closest("button")!;
    expect(oil.disabled).toBe(false);
    oil.click();
    expect(display.uiState.ghostStructure).toBe(UnitType.OilFactory);
    display.remove();
  });
  it("hides enemy stealth blast markers and launch status until border detection", () => {
    const missile = {
      id: 1,
      unitType: UnitType.StealthMissile,
      ownerID: 2,
      isActive: true,
      targetable: false,
      targetTile: 500,
      waitTicks: 0,
    } as UnitState;
    const units = new Map([[1, missile]]);
    expect(extractNukeTelegraphs(units, 100, 1)).toHaveLength(0);
    expect(extractNukeTelegraphs(units, 100, 2)).toHaveLength(1);
    const players = new Map([
      [
        2,
        {
          smallID: 2,
          isAlive: true,
          tilesOwned: 1,
          alliances: [],
          embargoes: [],
          outgoingAllianceRequests: [],
          incomingAllianceRequests: [],
        } as never,
      ],
    ]);
    expect(
      computePlayerStatus(players, units, { localPlayerSmallID: 1 }).get(2)
        ?.nukeActive,
    ).toBe(false);
    missile.targetable = true;
    expect(extractNukeTelegraphs(units, 100, 1)).toHaveLength(1);
    expect(
      computePlayerStatus(players, units, { localPlayerSmallID: 1 }).get(2)
        ?.nukeActive,
    ).toBe(true);
  });
});
