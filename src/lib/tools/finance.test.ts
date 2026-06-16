import { describe, it, expect } from "vitest";
import { financeTools } from "@/lib/tools/finance";

type ExecFn = (args: Record<string, unknown>, opts: { toolCallId: string; messages: [] }) => Promise<unknown>;
function exec(tool: unknown): ExecFn {
  const e = (tool as { execute?: ExecFn }).execute;
  if (!e) throw new Error("no execute");
  return e;
}
const OPTS = { toolCallId: "t", messages: [] as [] };

describe("calculateRoi", () => {
  it("computes net profit and ROI %", async () => {
    const r = (await exec(financeTools.calculateRoi)(
      { initialInvestment: 1000, finalValue: 1500 },
      OPTS
    )) as { netProfit: number; roiPercent: number };
    expect(r.netProfit).toBe(500);
    expect(r.roiPercent).toBe(50);
  });
  it("computes annualized ROI when years given", async () => {
    const r = (await exec(financeTools.calculateRoi)(
      { initialInvestment: 1000, finalValue: 2000, years: 2 },
      OPTS
    )) as { annualizedRoiPercent: number };
    // sqrt(2)-1 ≈ 0.4142 -> ~41.42%
    expect(r.annualizedRoiPercent).toBeCloseTo(41.42, 1);
  });
});

describe("amortizeLoan", () => {
  it("computes a known monthly payment", async () => {
    // 200000 @ 6% for 30y -> ~1199.10/mo
    const r = (await exec(financeTools.amortizeLoan)(
      { principal: 200000, annualRatePercent: 6, years: 30 },
      OPTS
    )) as { monthlyPayment: number; numberOfPayments: number };
    expect(r.numberOfPayments).toBe(360);
    expect(r.monthlyPayment).toBeCloseTo(1199.1, 0);
  });
  it("handles zero interest", async () => {
    const r = (await exec(financeTools.amortizeLoan)(
      { principal: 1200, annualRatePercent: 0, years: 1 },
      OPTS
    )) as { monthlyPayment: number; totalInterest: number };
    expect(r.monthlyPayment).toBe(100);
    expect(r.totalInterest).toBe(0);
  });
});

describe("breakEvenAnalysis", () => {
  it("computes break-even units", async () => {
    const r = (await exec(financeTools.breakEvenAnalysis)(
      { fixedCosts: 1000, pricePerUnit: 10, variableCostPerUnit: 5 },
      OPTS
    )) as { breakEvenUnits: number };
    expect(r.breakEvenUnits).toBe(200);
  });
  it("errors when margin is non-positive", async () => {
    const r = (await exec(financeTools.breakEvenAnalysis)(
      { fixedCosts: 1000, pricePerUnit: 5, variableCostPerUnit: 5 },
      OPTS
    )) as { error?: string };
    expect(r.error).toBeTruthy();
  });
});

describe("invoiceEstimate", () => {
  it("totals lines with tax and discount", async () => {
    const r = (await exec(financeTools.invoiceEstimate)(
      {
        items: [
          { description: "A", quantity: 2, unitPrice: 100 },
          { description: "B", quantity: 1, unitPrice: 50 },
        ],
        discountPercent: 10,
        taxPercent: 20,
      },
      OPTS
    )) as { subtotal: number; discount: number; tax: number; grandTotal: number };
    expect(r.subtotal).toBe(250);
    expect(r.discount).toBe(25);
    expect(r.tax).toBe(45); // (250-25)*0.2
    expect(r.grandTotal).toBe(270);
  });
});
