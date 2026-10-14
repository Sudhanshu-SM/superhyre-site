import { beforeEach, describe, expect, it } from "vitest";
import { draftForm } from "../formKit";
import { __resetFormsStore, addCampaignStub, addForm, campaignById, clearPendingForm, ensureDraft, getForm, peekPendingForm, requestOpenForm, updateForm } from "../formsStore";
describe("formsStore", () => {
  beforeEach(() => __resetFormsStore());
  it("adds and finds a form", () => {
    const f = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "backend" });
    addForm(f);
    expect(getForm(f.id)?.title).toBe(f.title);
  });
  it("update makes a new form object and leaves the old one alone", () => {
    const f = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "backend" });
    addForm(f);
    const before = getForm(f.id)!;
    updateForm(f.id, (x) => ({ ...x, name: "Renamed", theme: "sage" }));
    const after = getForm(f.id)!;
    expect(after).not.toBe(before);
    expect(before.name).toMatch(/^Senior Backend Engineer screening, /);
    expect(after.name).toBe("Renamed");
    /* A stored cover colour does nothing now: the form stays the brand orange. */
    expect(after.accent).toBe("#cc4d17");
  });
  it("never gives two forms in a campaign the same name", () => {
    const a = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "backend" });
    const b = draftForm({ campaignId: "backend-snr", family: "engineering", sub: "backend" });
    addForm(a);
    addForm(b);
    const names = [getForm(a.id)!.name, getForm(b.id)!.name];
    expect(new Set(names).size).toBe(2);
  });
  it("ensureDraft is idempotent per key", () => {
    const make = () => draftForm({ campaignId: "design-lead", family: "design", sub: "product" });
    const a = ensureDraft("k", make);
    const b = ensureDraft("k", make);
    expect(a.id).toBe(b.id);
  });
  it("hands a pending form to the builder once", () => {
    requestOpenForm("x", "build");
    expect(peekPendingForm()).toEqual({ formId: "x", view: "build" });
    clearPendingForm();
    expect(peekPendingForm()).toBeNull();
  });
  it("resolves a campaign made from chat", () => {
    const c = addCampaignStub({ name: "Staff Data Engineer", department: "Engineering" });
    expect(campaignById(c.id)?.name).toBe("Staff Data Engineer");
    expect(addCampaignStub({ name: "Staff Data Engineer", department: "Engineering" }).id).toBe(c.id);
  });
});
