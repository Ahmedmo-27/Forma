const Tenant = require("../models/Tenant");
const { runAsPlatform } = require("../context/tenantContext");

async function setPackageTransferFee(tenantId, amount) {
    const fee = Number(amount);
    if (!Number.isFinite(fee) || fee < 0) {
        const error = new Error("Enter a valid transfer fee");
        error.statusCode = 400;
        throw error;
    }
    if (!tenantId) {
        const error = new Error("Gym not found");
        error.statusCode = 404;
        throw error;
    }

    const tenant = await runAsPlatform(async () => Tenant.findById(tenantId));
    if (!tenant) {
        const error = new Error("Gym not found");
        error.statusCode = 404;
        throw error;
    }
    if (!tenant.settings) tenant.settings = {};
    tenant.settings.packageTransferFee = fee;
    if (typeof tenant.markModified === "function") tenant.markModified("settings");
    await runAsPlatform(async () => tenant.save());
    return fee;
}

module.exports = { setPackageTransferFee };
