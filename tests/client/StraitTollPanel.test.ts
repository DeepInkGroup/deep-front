import { afterEach, describe, expect, it } from "vitest";
import { EventBus } from "@openfront/shared/EventBus";
import { StraitTollPanel } from "../../src/client/hud/layers/StraitTollPanel";
import { SendStraitTollIntentEvent } from "../../src/client/Transport";

afterEach(() => document.body.replaceChildren());
async function panel(mine = false) {
  const state = {
    bankA: 1,
    bankB: 4,
    gate: [2, 3],
    enabled: true,
    rate: 10,
    exemptAllies: false,
    revision: 3,
    accepted: [],
    rejected: [],
  };
  const me = { smallID: () => 2 },
    other = { displayName: () => "Strait owner", isFriendly: () => false };
  const unit = {
    id: () => 7,
    isActive: () => true,
    isUnderConstruction: () => false,
    owner: () => (mine ? me : other),
    straitState: () => state,
  };
  const element = new StraitTollPanel();
  element.game = { myPlayer: () => me, units: () => [unit] } as never;
  element.eventBus = new EventBus();
  const sent: SendStraitTollIntentEvent[] = [];
  element.eventBus.on(SendStraitTollIntentEvent, (e) => sent.push(e));
  document.body.append(element);
  await element.updateComplete;
  return { element, state, sent };
}
describe("Strait toll controls", () => {
  it("opens new requests with explicit accept/reject actions and sends the terms revision", async () => {
    const { element, sent } = await panel();
    expect(element.shadowRoot!.querySelector("section")?.textContent).toContain(
      "10% toll",
    );
    (
      element.shadowRoot!.querySelector("button.accept") as HTMLButtonElement
    ).click();
    expect(sent[0].intent).toMatchObject({
      type: "strait_toll",
      stationId: 7,
      revision: 3,
      action: "accept",
    });
    (
      element.shadowRoot!.querySelector("button.reject") as HTMLButtonElement
    ).click();
    expect(sent[1].intent.action).toBe("reject");
  });
  it("lets owners choose a rate and ally exemption and reopen free passage", async () => {
    const { element, sent } = await panel(true);
    (
      element.shadowRoot!.querySelector("button.entry") as HTMLButtonElement
    ).click();
    await element.updateComplete;
    const rate = element.shadowRoot!.querySelector(
      "input[type=range]",
    ) as HTMLInputElement;
    rate.value = "4";
    rate.dispatchEvent(new Event("input"));
    await element.updateComplete;
    const allies = element.shadowRoot!.querySelector(
      "input[type=checkbox]",
    ) as HTMLInputElement;
    allies.checked = true;
    allies.dispatchEvent(new Event("change"));
    await element.updateComplete;
    (
      element.shadowRoot!.querySelector("button.accept") as HTMLButtonElement
    ).click();
    expect(sent[0].intent).toMatchObject({
      action: "configure",
      rate: 4,
      exemptAllies: true,
      enabled: true,
    });
    const free = [...element.shadowRoot!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Open free passage"),
    )!;
    free.click();
    expect(sent[1].intent.enabled).toBe(false);
  });
});
