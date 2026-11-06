const crypto = require("crypto");

function bankInstructions(paymentRef) {
    const bankName = (process.env.PAYMENT_BANK_NAME || "").trim();
    const accountName = (process.env.PAYMENT_ACCOUNT_NAME || "").trim();
    const iban = (process.env.PAYMENT_IBAN || "").trim();
    const swift = (process.env.PAYMENT_SWIFT || "").trim();
    const missing = !bankName || !accountName || !iban;

    if (missing && process.env.NODE_ENV === "production") {
        const error = new Error("Bank transfer details are not configured");
        error.statusCode = 503;
        throw error;
    }

    return {
        bankName: bankName || "Configure PAYMENT_BANK_NAME",
        accountName: accountName || "Configure PAYMENT_ACCOUNT_NAME",
        iban: iban || "Configure PAYMENT_IBAN",
        swift,
        referenceCode: paymentRef,
        notice: "Include the referenceCode in your transfer remarks. Platform admin will approve once funds clear.",
    };
}

/**
 * Payment Adapter Interface
 */
class BasePaymentAdapter {
    async initiatePayment(params) {
        throw new Error("initiatePayment must be implemented by adapter subclass.");
    }

    async verifyWebhook(payload, signature) {
        throw new Error("verifyWebhook must be implemented by adapter subclass.");
    }
}

/**
 * Manual / Bank Transfer Adapter
 * Generates an offline payment reference and instructions for direct bank transfer or cash deposit.
 */
class ManualTransferAdapter extends BasePaymentAdapter {
    async initiatePayment({ tenant, plan, planPrice, amount, currency, actorId, metadata = {} }) {
        const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
        const paymentRef = `MANUAL-${Date.now()}-${randomHex}`;
        const instructions = bankInstructions(paymentRef);

        return {
            paymentRef,
            paymentMethod: "manual_transfer",
            status: "pending",
            amount,
            currency,
            instructions,
            metadata: {
                ...metadata,
                tenantId: tenant._id ? tenant._id.toString() : tenant.id,
                planKey: plan.key,
                actorId: actorId ? actorId.toString() : null,
            },
        };
    }

    async verifyWebhook() {
        return { valid: true };
    }
}

/**
 * Online Payment Provider Adapter Stub (Paymob / Stripe)
 */
class OnlinePaymentAdapterStub extends BasePaymentAdapter {
    async initiatePayment({ tenant, plan, planPrice, amount, currency, actorId, metadata = {} }) {
        const randomHex = crypto.randomBytes(6).toString("hex");
        const paymentRef = `ONLINE-${Date.now()}-${randomHex}`;

        const providerBaseUrl = process.env.PAYMENT_GATEWAY_URL || "https://checkout.leapgym.com/pay";
        const checkoutUrl = `${providerBaseUrl}/${paymentRef}`;

        return {
            paymentRef,
            paymentMethod: "online",
            status: "pending",
            amount,
            currency,
            checkoutUrl,
            provider: process.env.PAYMENT_PROVIDER_NAME || "stripe_stub",
            metadata: {
                ...metadata,
                tenantId: tenant._id ? tenant._id.toString() : tenant.id,
                planKey: plan.key,
                actorId: actorId ? actorId.toString() : null,
            },
        };
    }

    async verifyWebhook(payload, _signature) {
        return {
            valid: true,
            paymentRef: payload?.paymentRef || payload?.data?.paymentRef,
            status: payload?.status || "paid",
        };
    }
}

function getPaymentAdapter(method = "manual_transfer") {
    switch (method) {
        case "online":
            return new OnlinePaymentAdapterStub();
        case "manual_transfer":
        case "cash":
        default:
            return new ManualTransferAdapter();
    }
}

module.exports = {
    BasePaymentAdapter,
    ManualTransferAdapter,
    OnlinePaymentAdapterStub,
    getPaymentAdapter,
};
