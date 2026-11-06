const { BILLING_CURRENCY } = require("../config/currency");

function forceCurrencyUpdate() {
    const update = this.getUpdate() || {};
    const hasOperator = Object.keys(update).some((key) => key.startsWith("$"));
    if (hasOperator) {
        update.$set = { ...(update.$set || {}), currency: BILLING_CURRENCY };
    } else {
        update.currency = BILLING_CURRENCY;
    }
    this.setUpdate(update);
}

/**
 * Persist and serialize the currency field as EGP on create, update, and JSON output.
 * Pass `{ updates: false }` for append-only models that reject updates.
 */
function enforceEgpCurrency(schema, { updates = true } = {}) {
    schema.pre("save", function () {
        this.currency = BILLING_CURRENCY;
    });

    if (updates) {
        schema.pre(["findOneAndUpdate", "updateOne", "updateMany"], forceCurrencyUpdate);
    }

    schema.set("toJSON", {
        ...(schema.get("toJSON") || {}),
        transform(_doc, ret) {
            if (ret && typeof ret === "object") ret.currency = BILLING_CURRENCY;
            return ret;
        },
    });
}

module.exports = { enforceEgpCurrency, BILLING_CURRENCY };
