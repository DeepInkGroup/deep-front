import { LobbyInfoEvent } from "@openfront/shared/WireSchemas";
import { render } from "lit";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/DesktopPresence", () => ({
  desktopPresence: {
    isAvailable: vi.fn(() => false),
    openInviteDialog: vi.fn(async () => true),
    set: vi.fn(),
    consumePendingInvite: vi.fn(async () => null),
    subscribeInvites: vi.fn(() => () => undefined),
  },
}));

import { HostLobbyModal } from "../../src/client/HostLobbyModal";

const LOBBY = "ABCD1234";
function lobbyInfo(ticks = 0, gameID = LOBBY) {
  return new LobbyInfoEvent(
    {
      gameID,
      clients: [],
      gameConfig: { spawnImmunityDuration: ticks },
    } as any,
    "host",
  );
}

function host() {
  const modal = new HostLobbyModal() as any;
  modal.lobbyId = LOBBY;
  modal.constructUrl = vi.fn(async () => "http://localhost/");
  modal.updateLobbyHistory = vi.fn();
  return modal;
}

async function sent(modal: any) {
  let config: any;
  modal.addEventListener(
    "update-game-config",
    (event: CustomEvent) => {
      config = event.detail.config;
    },
    { once: true },
  );
  await modal.putGameConfig();
  return config.spawnImmunityDuration;
}

describe("Create lobby peace time", () => {
  it.each([0, 3, 5, 10])(
    "sends %i minutes as shared simulation ticks",
    async (minutes) => {
      const modal = host();
      modal.putGameConfig = vi.fn();
      modal.handlePeaceTimeChange({ target: { value: String(minutes) } });
      expect(modal.putGameConfig).toHaveBeenCalledOnce();
      delete modal.putGameConfig;
      expect(await sent(modal)).toBe(minutes * 600);
    },
  );

  it("offers exactly Off, 3, 5 and 10 minutes", () => {
    const modal = host();
    const container = document.createElement("div");
    render(modal.renderBody(), container);
    const settings = container.querySelector("game-config-settings")! as any;
    // These cards are templates passed to the shared settings component.
    const cards = document.createElement("div");
    render(settings.settings.options.inputCards, cards);
    const select = cards.querySelector("#peace-time") as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      "0",
      "3",
      "5",
      "10",
    ]);
    expect(select.value).toBe("0");
    expect(select.getAttribute("aria-labelledby")).toBe("peace-time-label");
  });

  it("restores the server setting when the host returns", async () => {
    const modal = host();
    modal.handleLobbyInfo(lobbyInfo(3000));
    expect(modal.peaceTimeMinutes).toBe(5);
    expect(await sent(modal)).toBe(3000);
  });

  it("preserves an existing lobby before its first broadcast", async () => {
    expect(await sent(host())).toBeUndefined();
  });

  it("does not undo an edit with a delayed lobby broadcast", async () => {
    const modal = host();
    modal.putGameConfig = vi.fn();
    modal.handlePeaceTimeChange({ target: { value: "10" } });
    modal.handleLobbyInfo(lobbyInfo(1800));
    expect(modal.peaceTimeMinutes).toBe(10);
    modal.handlePeaceTimeChange({ target: { value: "0" } });
    modal.handleLobbyInfo(lobbyInfo(6000));
    expect(modal.peaceTimeMinutes).toBe(0);
  });

  it("ignores another lobby and unsupported selections", () => {
    const modal = host();
    modal.putGameConfig = vi.fn();
    modal.handleLobbyInfo(lobbyInfo(3000, "OTHER999"));
    modal.handlePeaceTimeChange({ target: { value: "7" } });
    expect(modal.peaceTimeMinutes).toBe(0);
    expect(modal.putGameConfig).not.toHaveBeenCalled();
  });
});
