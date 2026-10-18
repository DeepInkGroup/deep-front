import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { Config } from "@openfront/engine-lib/configuration/Config";
import { EventBus } from "@openfront/shared/EventBus";
import { UnitDisplay } from "../../src/client/hud/layers/UnitDisplay";
import { extractNukeTelegraphs } from "../../src/client/render/frame/derive/NukeTelegraphs";
import { computePlayerStatus } from "../../src/client/render/frame/derive/PlayerStatus";
import { UnitState } from "../../src/client/render/types";
import { getDefaultKeybinds } from "../../src/client/UserSettings";
import { EXTRA_BUILD_SHORTCUTS } from "../../src/client/BuildShortcuts";
import { InputHandler } from "../../src/client/InputHandler";
import { BuildPreviewController } from "../../src/client/controllers/BuildPreviewController";
import { hasBuildOrUpgradeCapacity } from "../../src/client/utilities/BuildingLimits";
import { buildNukeTrajectory } from "../../src/client/render/gl/utils/NukeTrajectory";

describe("Bunker controls and concealed missiles", () => {
  it("keeps capped Copper Mines selectable for upgrades and dims them only after both reach level 2", async () => {
    let level = 1;
    const units = Array.from({ length: 2 }, () => ({
      level: () => level,
      isUnderConstruction: () => false,
    }));
    const config = new Config({} as never, false);
    const player = {
      gold: () => 10_000_000n,
      isAlive: () => true,
      units: (t: UnitType) => (t === UnitType.CopperMine ? units : []),
      totalUnitLevels: () => 0,
    };
    const display = new UnitDisplay();
    display.game = {
      config: () => config,
      myPlayer: () => player,
      inSpawnPhase: () => false,
      ticks: () => 0,
      units: () => [],
    } as never;
    display.uiState = { ghostStructure: null } as never;
    display.eventBus = new EventBus();
    document.body.append(display);
    await display.updateComplete;
    const button = display
      .querySelector('img[alt="copper_mine"]')!
      .closest("button")!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(display.uiState.ghostStructure).toBe(UnitType.CopperMine);
    const controller = Object.create(BuildPreviewController.prototype) as any;
    controller.game = display.game;
    controller.uiState = display.uiState;
    controller.ghostUnit = { buildableUnit: { type: UnitType.CopperMine } };
    controller.removeGhostStructure = vi.fn();
    controller.syncGhostState();
    expect(controller.removeGhostStructure).not.toHaveBeenCalled();
    level = 2;
    display.requestUpdate();
    await display.updateComplete;
    expect(button.disabled).toBe(true);
    controller.syncGhostState();
    expect(controller.removeGhostStructure).toHaveBeenCalledOnce();
    display.remove();
  });
  it("keeps capped Oil Factories upgradeable and handles unfinished resource buildings", () => {
    const config = new Config({} as never, false),
      info = config.unitInfo(UnitType.OilFactory);
    let level = 2,
      unfinished = false;
    const units = Array.from({ length: 5 }, () => ({
      level: () => level,
      isUnderConstruction: () => unfinished,
    }));
    expect(hasBuildOrUpgradeCapacity(info, units)).toBe(true);
    unfinished = true;
    expect(hasBuildOrUpgradeCapacity(info, units)).toBe(false);
    unfinished = false;
    level = 3;
    expect(hasBuildOrUpgradeCapacity(info, units)).toBe(false);
  });
  it("resolves every additional shortcut, its numpad alias, and customized bindings", () => {
    const handler = Object.create(InputHandler.prototype) as any;
    handler.keybinds = getDefaultKeybinds(false);
    expect(new Set(EXTRA_BUILD_SHORTCUTS.map((s) => s.code)).size).toBe(
      EXTRA_BUILD_SHORTCUTS.length,
    );
    for (const shortcut of EXTRA_BUILD_SHORTCUTS) {
      const code = shortcut.code.substring(6);
      expect(handler.resolveBuildKeybind(code, true)).toBe(shortcut.type);
      expect(
        handler.resolveBuildKeybind(code.replace("Digit", "Numpad"), true),
      ).toBe(shortcut.type);
    }
    handler.keybinds.buildCIWSDefense = "KeyV";
    expect(handler.resolveBuildKeybind("KeyV", false)).toBe(
      UnitType.CIWSDefense,
    );
    expect(handler.resolveBuildKeybind("Digit2", false)).toBe(UnitType.Factory);
  });
  it("shows CIWS interception in the normally untargetable middle of a trajectory", () => {
    const sam = { x: 500, y: 250, r: 80 };
    const ordinary = buildNukeTrajectory(0, 500, 1000, 500, 1000, true, [sam]);
    const guaranteed = buildNukeTrajectory(0, 500, 1000, 500, 1000, true, [
      { ...sam, alwaysIntercept: true },
    ]);
    expect(ordinary.tSamIntercept).toBe(1);
    expect(guaranteed.tSamIntercept).toBeLessThan(1);
    const stealth = buildNukeTrajectory(
      0,
      500,
      1000,
      500,
      1000,
      true,
      [sam],
      (x) => x > 800,
    );
    expect(stealth.tSamIntercept).toBe(1);
    expect(stealth.tUntargetableStart).toBe(0);
    expect(stealth.tUntargetableEnd).toBeGreaterThan(0.5);
  });
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
        ).fill({
          level: () => (type === UnitType.OilFactory ? 3 : 2),
          isUnderConstruction: () => false,
        }),
      totalUnitLevels: () => 0,
    };
    const display = new UnitDisplay();
    display.game = {
      config: () => config,
      myPlayer: () => player,
      inSpawnPhase: () => false,
      ticks: () => 0,
      units: () => [],
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
