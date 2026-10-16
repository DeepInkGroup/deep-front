import { afterEach, describe, expect, it, vi } from "vitest";
import { GameEnv } from "@openfront/shared/configuration/Env";
import { ServerEnv } from "../../src/server/ServerEnv";
import { verifyClientToken } from "../../src/server/jwt";
import { MapPlaylist } from "../../src/server/MapPlaylist";

vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTiles: async () => 1_000_000,
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const id = "11111111-1111-4111-8111-111111111111";
describe("standalone anonymous multiplayer", () => {
  it("accepts local identities only after explicit standalone opt-in in production", async () => {
    vi.spyOn(ServerEnv, "env").mockReturnValue(GameEnv.Prod);
    vi.stubEnv("STANDALONE", "false");
    expect((await verifyClientToken(id)).type).toBe("error");
    vi.stubEnv("STANDALONE", "true");
    expect(await verifyClientToken(id)).toEqual({
      type: "success",
      persistentId: id,
      claims: null,
    });
  });
  it("never schedules account-locked lobbies on standalone servers", async () => {
    vi.stubEnv("STANDALONE", "true");
    const playlist = new MapPlaylist();
    const modes = ["ffa", "team", "special"] as const;
    for (let i = 0; i < 21; i++)
      expect((await playlist.gameConfig(modes[i % 3])).trusted).not.toBe(true);
  });
});
