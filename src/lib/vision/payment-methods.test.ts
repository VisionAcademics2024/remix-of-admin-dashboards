import { describe, expect, it } from "vitest";

import { INVOICE_RUN_METHODS, isInvoiceRunMethod, LABELS, paymentMethodLabel } from "./types";

describe("invoice run methods", () => {
  it("treats bank transfer as a run, not as unassigned", () => {
    // The bug this guards: the invoice queue split on cash and card only, so a
    // charge set to bank transfer matched neither and sat under Unassigned
    // however many times someone set it.
    expect(isInvoiceRunMethod("bank_transfer")).toBe(true);
    expect(isInvoiceRunMethod("cash")).toBe(true);
  });

  it("does not offer card, which is not taken", () => {
    expect(INVOICE_RUN_METHODS).not.toContain("card");
    expect(isInvoiceRunMethod("card")).toBe(false);
  });

  it("leaves a charge with no method unassigned", () => {
    expect(isInvoiceRunMethod(null)).toBe(false);
    expect(isInvoiceRunMethod(undefined)).toBe(false);
    expect(isInvoiceRunMethod("")).toBe(false);
  });

  it("gives every offered method a label, so no tab reads as a column name", () => {
    for (const method of INVOICE_RUN_METHODS) {
      expect(isInvoiceRunMethod(method)).toBe(true);
      const label = paymentMethodLabel(method);
      expect(label).toBeTruthy();
      expect(label).not.toContain("_");
    }
    expect(paymentMethodLabel("bank_transfer")).toBe("Bank transfer");
  });

  it("still names methods it no longer offers, so old rows keep reading right", () => {
    // payment_method is wider than the picker on purpose: history must keep
    // meaning what it meant.
    expect(paymentMethodLabel("card")).toBe(LABELS.paymentMethod.card);
    expect(paymentMethodLabel("other")).toBe(LABELS.paymentMethod.other);
    expect(paymentMethodLabel(null)).toBe("No method");
  });
});
