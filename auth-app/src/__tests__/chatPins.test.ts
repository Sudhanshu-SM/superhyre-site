import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderCampaigns, type PickerCampaign } from "../CampaignsPicker";
import { pinKey, readPins, reloadPins, toggled, togglePin } from "../chatPins";

/* A storage of the browser's shape, since these tests run without one. */
const store = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

describe("pins", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", { localStorage, addEventListener: () => {}, removeEventListener: () => {} });
    reloadPins();
  });

  it("puts the latest pin first and takes one away when it is pressed again", () => {
    const one = toggled([], "chat", "a");
    const two = toggled(one, "campaign", "b");
    expect(two).toEqual([pinKey("campaign", "b"), pinKey("chat", "a")]);
    expect(toggled(two, "chat", "a")).toEqual([pinKey("campaign", "b")]);
  });

  it("is kept in the browser and read back", () => {
    togglePin("chat", "x");
    togglePin("campaign", "y");
    expect(readPins()).toEqual([pinKey("campaign", "y"), pinKey("chat", "x")]);
  });

  it("ignores what is not a pin (an old or damaged value)", () => {
    localStorage.setItem("superhyre.chatrail.pins", JSON.stringify(["chat:ok", 4, "nonsense", "campaign:", { a: 1 }, "chat:ok"]));
    expect(readPins()).toEqual(["chat:ok"]);
    localStorage.setItem("superhyre.chatrail.pins", "{not json");
    expect(readPins()).toEqual([]);
  });

  it("holds at a hundred, dropping the oldest", () => {
    let pins: readonly string[] = [];
    for (let i = 0; i < 130; i++) pins = toggled(pins, "chat", `c${i}`);
    expect(pins).toHaveLength(100);
    expect(pins[0]).toBe(pinKey("chat", "c129"));
  });
});

describe("the campaigns page order", () => {
  const c = (id: string, lastAt: number): PickerCampaign => ({ id, name: id, meta: "", found: 0, shortlisted: 0, chats: 0, lastAt });
  it("is the pinned ones first, then the one chatted about most recently, then the order they came in", () => {
    const list = [c("A", 0), c("B", 50), c("C", 90), c("D", 0)];
    expect(orderCampaigns(list, [pinKey("campaign", "D")]).map((x) => x.id)).toEqual(["D", "C", "B", "A"]);
    expect(orderCampaigns(list, []).map((x) => x.id)).toEqual(["C", "B", "A", "D"]);
    expect(orderCampaigns(list, [pinKey("campaign", "A"), pinKey("campaign", "D")]).map((x) => x.id)).toEqual(["A", "D", "C", "B"]);
  });
});
