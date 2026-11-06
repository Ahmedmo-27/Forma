const connectMongo = require("./connectMongo");

const connectDB = async () => {
  try {
    await connectMongo();
    try {
      const Plan = require("../models/Plan");
      await Plan.updateMany(
        { allowedRoles: { $ne: "General Manager" } },
        { $addToSet: { allowedRoles: "General Manager" } }
      );
    } catch (error) {
      console.warn("Could not add General Manager to plans:", error.message);
    }
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    if (error.message?.includes("whitelist") || error.message?.includes("timed out")) {
      console.error(
        "Tip: In MongoDB Atlas → Network Access, allow your current IP (or 0.0.0.0/0 for testing)."
      );
    }
    process.exit(1);
  }
};

module.exports = connectDB;
