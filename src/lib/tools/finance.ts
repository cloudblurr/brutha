import { tool } from "ai";
import { z } from "zod";

/**
 * Finance tools — pure math, no external APIs, no keys. These add high
 * perceived value for business users and never fail on a network blip.
 *
 * All monetary outputs are rounded to 2 decimals; rates are expressed as
 * percentages in the input (e.g. 5 = 5%) and converted internally.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const financeTools = {
  calculateRoi: tool({
    description:
      "Calculate return on investment (ROI). Given an initial investment and the final/returned value (and optionally a holding period in years), returns net profit, ROI %, and annualized ROI %.",
    inputSchema: z.object({
      initialInvestment: z.number().positive(),
      finalValue: z.number(),
      years: z.number().positive().optional().describe("Holding period in years for annualized ROI."),
    }),
    execute: async ({ initialInvestment, finalValue, years }) => {
      const netProfit = finalValue - initialInvestment;
      const roiPct = (netProfit / initialInvestment) * 100;
      const result: Record<string, number> = {
        initialInvestment,
        finalValue,
        netProfit: round2(netProfit),
        roiPercent: round2(roiPct),
      };
      if (years && years > 0) {
        const annualized = (Math.pow(finalValue / initialInvestment, 1 / years) - 1) * 100;
        result.annualizedRoiPercent = round2(annualized);
      }
      return result;
    },
  }),

  amortizeLoan: tool({
    description:
      "Compute a loan's monthly payment and amortization summary. Given principal, annual interest rate (percent), and term in years, returns the monthly payment, total paid, and total interest. Optionally returns the first N rows of the schedule.",
    inputSchema: z.object({
      principal: z.number().positive(),
      annualRatePercent: z.number().min(0),
      years: z.number().positive(),
      scheduleRows: z.number().int().min(0).max(12).optional().describe("How many leading schedule rows to include (0-12)."),
    }),
    execute: async ({ principal, annualRatePercent, years, scheduleRows }) => {
      const n = Math.round(years * 12);
      const r = annualRatePercent / 100 / 12;
      // Handle the zero-interest case to avoid division by zero.
      const monthlyPayment = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
      const totalPaid = monthlyPayment * n;
      const totalInterest = totalPaid - principal;

      const rows: Array<{ month: number; interest: number; principal: number; balance: number }> = [];
      const wanted = scheduleRows ?? 0;
      if (wanted > 0) {
        let balance = principal;
        for (let month = 1; month <= Math.min(wanted, n); month++) {
          const interest = balance * r;
          const principalPaid = monthlyPayment - interest;
          balance = Math.max(0, balance - principalPaid);
          rows.push({
            month,
            interest: round2(interest),
            principal: round2(principalPaid),
            balance: round2(balance),
          });
        }
      }

      return {
        monthlyPayment: round2(monthlyPayment),
        numberOfPayments: n,
        totalPaid: round2(totalPaid),
        totalInterest: round2(totalInterest),
        ...(rows.length ? { schedule: rows } : {}),
      };
    },
  }),

  breakEvenAnalysis: tool({
    description:
      "Break-even analysis. Given fixed costs, price per unit, and variable cost per unit, returns the break-even point in units and revenue. Optionally include a target profit.",
    inputSchema: z.object({
      fixedCosts: z.number().min(0),
      pricePerUnit: z.number().positive(),
      variableCostPerUnit: z.number().min(0),
      targetProfit: z.number().min(0).optional(),
    }),
    execute: async ({ fixedCosts, pricePerUnit, variableCostPerUnit, targetProfit }) => {
      const contributionMargin = pricePerUnit - variableCostPerUnit;
      if (contributionMargin <= 0) {
        return {
          error:
            "Price per unit must exceed variable cost per unit — otherwise there is no break-even point.",
        };
      }
      const breakEvenUnits = fixedCosts / contributionMargin;
      const result: Record<string, number> = {
        contributionMarginPerUnit: round2(contributionMargin),
        breakEvenUnits: Math.ceil(breakEvenUnits),
        breakEvenRevenue: round2(Math.ceil(breakEvenUnits) * pricePerUnit),
      };
      if (targetProfit && targetProfit > 0) {
        const unitsForTarget = (fixedCosts + targetProfit) / contributionMargin;
        result.unitsForTargetProfit = Math.ceil(unitsForTarget);
        result.revenueForTargetProfit = round2(Math.ceil(unitsForTarget) * pricePerUnit);
      }
      return result;
    },
  }),

  invoiceEstimate: tool({
    description:
      "Build an invoice/quote estimate from line items. Each item has a description, quantity, and unit price. Returns per-line totals, subtotal, optional tax, optional discount, and the grand total.",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            description: z.string(),
            quantity: z.number().positive(),
            unitPrice: z.number().min(0),
          })
        )
        .min(1),
      taxPercent: z.number().min(0).max(100).optional(),
      discountPercent: z.number().min(0).max(100).optional(),
      currency: z.string().optional().describe("ISO code for display, e.g. 'USD'."),
    }),
    execute: async ({ items, taxPercent, discountPercent, currency }) => {
      const lines = items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: round2(it.unitPrice),
        lineTotal: round2(it.quantity * it.unitPrice),
      }));
      const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
      const discount = discountPercent ? round2(subtotal * (discountPercent / 100)) : 0;
      const taxedBase = subtotal - discount;
      const tax = taxPercent ? round2(taxedBase * (taxPercent / 100)) : 0;
      const grandTotal = round2(taxedBase + tax);
      return {
        currency: currency?.toUpperCase(),
        lines,
        subtotal,
        ...(discount ? { discount } : {}),
        ...(tax ? { tax } : {}),
        grandTotal,
      };
    },
  }),
};
