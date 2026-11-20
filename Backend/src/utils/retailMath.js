/**
 * Money math for the retail POS. Everything is computed in integer piastres
 * (1 EGP = 100) so totals, discounts and vendor/gym splits always add up exactly.
 */
const { dayKey } = require("./revenueUtils");

const toCents = (value) => Math.round((Number(value) || 0) * 100);
const fromCents = (cents) => Math.round(cents) / 100;
const roundMoney = (value) => fromCents(toCents(value));

/**
 * Spread a discount across line gross amounts (all cents) proportionally,
 * giving leftover piastres to the largest lines so the parts sum to the discount.
 */
function allocateDiscount(grossCents, discountCents) {
    const total = grossCents.reduce((sum, v) => sum + v, 0);
    const discount = Math.min(Math.max(0, discountCents), total);
    if (!total || !discount) return grossCents.map(() => 0);

    const raw = grossCents.map((gross) => (gross * discount) / total);
    const parts = raw.map(Math.floor);
    let remainder = discount - parts.reduce((sum, v) => sum + v, 0);
    const order = raw
        .map((value, index) => ({ index, frac: value - Math.floor(value) }))
        .sort((a, b) => b.frac - a.frac || a.index - b.index);
    for (let i = 0; remainder > 0 && i < order.length; i += 1, remainder -= 1) {
        parts[order[i].index] += 1;
    }
    return parts;
}

/** Split a net line amount (cents) into the gym's share and the vendor's share. */
function splitLine(lineCents, commissionPercent) {
    const pct = Math.min(100, Math.max(0, Number(commissionPercent) || 0));
    const gym = Math.round((lineCents * pct) / 100);
    return { gym, vendor: lineCents - gym };
}

/**
 * @param {{unitPrice:number, qty:number, commissionPercent:number}[]} lines
 * @param {number} discount
 * @returns computed line amounts plus sale totals, in EGP.
 */
function computeSaleTotals(lines, discount = 0) {
    const gross = lines.map((line) => toCents(line.unitPrice) * line.qty);
    const subtotal = gross.reduce((sum, v) => sum + v, 0);
    const discountCents = Math.min(toCents(discount), subtotal);
    const allocated = allocateDiscount(gross, discountCents);

    let gymTotal = 0;
    let vendorTotal = 0;
    const computed = lines.map((line, index) => {
        const lineCents = gross[index] - allocated[index];
        const { gym, vendor } = splitLine(lineCents, line.commissionPercent);
        gymTotal += gym;
        vendorTotal += vendor;
        return {
            lineTotal: fromCents(lineCents),
            gymShare: fromCents(gym),
            vendorShare: fromCents(vendor),
        };
    });

    return {
        lines: computed,
        subtotal: fromCents(subtotal),
        discount: fromCents(discountCents),
        total: fromCents(subtotal - discountCents),
        gymShare: fromCents(gymTotal),
        vendorShare: fromCents(vendorTotal),
    };
}

/**
 * Portion of `amount` that belongs to `refundQty` more units when `alreadyQty`
 * of `qty` units were refunded before. Cumulative rounding means a full refund
 * always returns exactly the original amount.
 */
function proportionalRefund(amount, qty, alreadyQty, refundQty) {
    const cents = toCents(amount);
    const upTo = (n) => Math.round((cents * n) / qty);
    return fromCents(upTo(alreadyQty + refundQty) - upTo(alreadyQty));
}

function emptyBucket() {
    return { gross: 0, refunded: 0, net: 0, gymShare: 0, vendorShare: 0, units: 0, sales: 0 };
}

function addToBucket(bucket, item, qtyNet) {
    const refunded = Number(item.refundedAmount) || 0;
    const gym = (Number(item.gymShare) || 0) - (Number(item.refundedGymShare) || 0);
    const vendor = (Number(item.vendorShare) || 0) - (Number(item.refundedVendorShare) || 0);
    bucket.gross += Number(item.lineTotal) || 0;
    bucket.refunded += refunded;
    bucket.net += (Number(item.lineTotal) || 0) - refunded;
    bucket.gymShare += gym;
    bucket.vendorShare += vendor;
    bucket.units += qtyNet;
}

function finishBucket(bucket) {
    return {
        ...bucket,
        gross: roundMoney(bucket.gross),
        refunded: roundMoney(bucket.refunded),
        net: roundMoney(bucket.net),
        gymShare: roundMoney(bucket.gymShare),
        vendorShare: roundMoney(bucket.vendorShare),
    };
}

/**
 * Reduce sales to totals, per vendor, per product and per Cairo day.
 * Refunds are netted against the sale they belong to.
 */
function summarizeSales(sales, { vendorId = null, categoryId = null } = {}) {
    const totals = emptyBucket();
    const vendors = new Map();
    const products = new Map();
    const days = new Map();
    const methods = new Map();

    for (const sale of sales) {
        const day = dayKey(sale.createdAt);
        const touchedVendors = new Set();
        let saleTouched = false;

        for (const item of sale.items || []) {
            if (vendorId && String(item.vendorId) !== String(vendorId)) continue;
            if (categoryId && String(item.categoryId) !== String(categoryId)) continue;
            saleTouched = true;
            const qtyNet = (Number(item.qty) || 0) - (Number(item.refundedQty) || 0);

            addToBucket(totals, item, qtyNet);

            const vKey = String(item.vendorId);
            if (!vendors.has(vKey)) {
                vendors.set(vKey, { vendorId: vKey, vendorName: item.vendorName || "", ...emptyBucket() });
            }
            addToBucket(vendors.get(vKey), item, qtyNet);
            touchedVendors.add(vKey);

            const pKey = String(item.productId);
            if (!products.has(pKey)) {
                products.set(pKey, {
                    productId: pKey,
                    name: item.name,
                    vendorName: item.vendorName || "",
                    ...emptyBucket(),
                });
            }
            addToBucket(products.get(pKey), item, qtyNet);

            if (!days.has(day)) days.set(day, { date: day, ...emptyBucket() });
            addToBucket(days.get(day), item, qtyNet);

            const mKey = sale.paymentMethod || "cash";
            if (!methods.has(mKey)) methods.set(mKey, { method: mKey, ...emptyBucket() });
            addToBucket(methods.get(mKey), item, qtyNet);
        }

        if (saleTouched) {
            totals.sales += 1;
            for (const key of touchedVendors) vendors.get(key).sales += 1;
        }
    }

    const byNet = (a, b) => b.net - a.net || String(a.name || a.vendorName).localeCompare(String(b.name || b.vendorName));
    return {
        totals: finishBucket(totals),
        vendors: [...vendors.values()].map(finishBucket).sort(byNet),
        products: [...products.values()].map(finishBucket).sort((a, b) => b.units - a.units || byNet(a, b)),
        daily: [...days.values()].map(finishBucket).sort((a, b) => a.date.localeCompare(b.date)),
        paymentMethods: [...methods.values()].map(finishBucket).sort(byNet),
    };
}

module.exports = {
    toCents,
    fromCents,
    roundMoney,
    allocateDiscount,
    splitLine,
    computeSaleTotals,
    proportionalRefund,
    summarizeSales,
};
