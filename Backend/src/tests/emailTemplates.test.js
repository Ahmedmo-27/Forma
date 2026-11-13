import { describe, it, expect } from "vitest";
import {
    paymentRejectedEmail,
    campaignEmail,
} from "../services/emailTemplates";
import { renderInvoiceHtml } from "../services/invoiceService";
import { daysUntil, normalizeReminderDays } from "../services/ownerMail";

describe("owner email templates", () => {
    it("escapes the payment rejection reason", () => {
        const { html, text } = paymentRejectedEmail({
            name: "Ada",
            gymName: "North Gym",
            reason: '<script>alert("x")</script>',
            appUrl: "https://app.forma-official.com",
        });
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
        expect(text).toContain("North Gym");
        expect(html).toContain("https://app.forma-official.com");
        expect(html).toContain("cid:forma-logo.png");
    });

    it("escapes campaign message html", () => {
        const { html } = campaignEmail({
            name: "Ada",
            gymName: "North Gym",
            subject: "Update",
            message: "Hello\n\n<script>nope</script>",
            ctaLabel: "Open Forma",
            ctaUrl: "https://app.forma-official.com",
        });
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;nope&lt;/script&gt;");
        expect(html).toContain("North Gym");
    });

    it("renders the invoice in the Forma palette", () => {
        const html = renderInvoiceHtml({
            invoiceNumber: "INV-2026-0001",
            status: "paid",
            issuedAt: new Date("2026-11-13"),
            planKey: "growth",
            cycle: "yearly",
            amount: 12000,
            currency: "EGP",
            paymentMethod: "manual_transfer",
            paymentRef: "REF",
            sellerDetails: {
                name: "Forma",
                taxId: "EG-TAX",
                address: "Cairo",
                supportEmail: "billing@forma-official.com",
            },
            buyerDetails: {
                tenantName: "North Gym",
                tenantSlug: "north-gym",
                ownerName: "Ada",
                ownerEmail: "ada@gym.com",
            },
        });
        expect(html).toContain("cid:forma-logo.png");
        expect(html).toContain("#142843");
        expect(html).toContain("#FCF3E2");
        expect(html).toContain("INV-2026-0001");
    });

    it("counts whole days until a date and ignores the past", () => {
        const now = new Date("2026-11-13T00:00:00.000Z");
        expect(daysUntil("2026-11-15T01:00:00.000Z", now)).toBe(3);
        expect(daysUntil("2026-11-13T01:00:00.000Z", now)).toBe(1);
        expect(daysUntil("2026-11-12T00:00:00.000Z", now)).toBeNull();
        expect(normalizeReminderDays(undefined)).toEqual([3, 1]);
        expect(normalizeReminderDays([3, 0, 1])).toEqual([3, 1]);
    });
});
