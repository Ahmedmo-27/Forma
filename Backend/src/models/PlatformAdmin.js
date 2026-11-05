// Legacy compatibility wrapper: PlatformAdmin points to PlatformUser
const mongoose = require("mongoose");
const PlatformUser = require("./PlatformUser");

// Export PlatformUser model under PlatformAdmin name if not already registered
module.exports = mongoose.models.PlatformAdmin || mongoose.model("PlatformAdmin", PlatformUser.schema);
