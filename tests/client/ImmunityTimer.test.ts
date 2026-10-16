import { GameMode } from "@openfront/engine-api/game/GameTypes";
import { ImmunityTimer } from "../../src/client/hud/layers/ImmunityTimer";

describe("Peace time countdown", () => {
  it("uses elapsed game time and disappears exactly at the end", () => {
    const timer = new ImmunityTimer() as any;
    const elapsed = vi.fn(() => 0);
    const inSpawnPhase = vi.fn(() => true);
    timer.game = {
      config: () => ({
        gameConfig: () => ({ gameMode: GameMode.FFA }),
        spawnImmunityDuration: () => 1800,
        hasExtendedSpawnImmunity: () => true,
      }),
      elapsedGameSeconds: elapsed,
      inSpawnPhase,
    };
    timer.init();
    timer.tick();
    expect(timer.isActive).toBe(false);
    inSpawnPhase.mockReturnValue(false);
    timer.tick();
    expect(timer.isActive).toBe(true);
    expect(timer.remainingSeconds).toBe(180);
    elapsed.mockReturnValue(179.9);
    timer.tick();
    expect(timer.remainingSeconds).toBe(1);
    elapsed.mockReturnValue(180);
    timer.tick();
    expect(timer.isActive).toBe(false);
  });
});
