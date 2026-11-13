const User = require("../models/User");
const { hashPassword, normalizeEmail, bumpTokenVersion } = require("../utils/passwordUtils");
const { runAsPlatform } = require("../context/tenantContext");
const passwordSetup = require("../services/passwordSetupService");
const mailer = require("../services/mailer");
const logger = require("../utils/logger");
const { invalidateAuthContext } = require("../middleware/authContextCache");

const GENERIC_RESET = "If an account exists for that email, a reset link has been sent.";

async function setupPassword(req, res) {
    let record = null;
    let passwordSaved = false;
    try {
        const { token, password } = req.body;
        record = await passwordSetup.consumeToken(token);
        if (!record) {
            return res.status(400).json({ message: "This link is invalid or has expired" });
        }

        const hashed = await hashPassword(password);
        const updated = await runAsPlatform(async () => {
            const user = await User.findById(record.userId);
            if (!user) return null;
            user.password = hashed;
            bumpTokenVersion(user);
            await user.save();
            return user;
        });

        if (!updated) {
            await passwordSetup.releaseToken(record);
            record = null;
            return res.status(400).json({ message: "This link is invalid or has expired" });
        }

        passwordSaved = true;
        invalidateAuthContext({
            userId: updated._id,
            tenantId: updated.tenantId,
        });
        await passwordSetup.revokeUnusedTokens(updated._id);

        res.json({ message: "Password set. You can sign in now." });
    } catch (error) {
        if (record && !passwordSaved) {
            await passwordSetup.releaseToken(record).catch((releaseError) => {
                logger.auth("error", "setupPassword token release failed", { error: releaseError.message });
            });
        }
        logger.auth("error", "setupPassword error", { error: error.message });
        res.status(500).json({ message: "Server error" });
    }
}

async function forgotPassword(req, res) {
    try {
        const email = normalizeEmail(req.body.email);
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const users = await runAsPlatform(async () => User.find({ email }));
        for (const user of users) {
            try {
                const issued = await passwordSetup.issueToken({
                    userId: user._id,
                    tenantId: user.tenantId,
                    email: user.email,
                    purpose: "reset",
                });
                await mailer.sendPasswordReset({
                    to: user.email,
                    name: user.name,
                    setupUrl: passwordSetup.absoluteUrl(issued.token, user.email),
                });
            } catch (err) {
                logger.warn("mail", "Password reset email failed", { error: err.message });
            }
        }

        res.json({ message: GENERIC_RESET });
    } catch (error) {
        logger.auth("error", "forgotPassword error", { error: error.message });
        res.json({ message: GENERIC_RESET });
    }
}

module.exports = {
    setupPassword,
    forgotPassword,
};
