const express = require("express");
const { getSiteConfig, listPublicPlans, publicSignup } = require("../controllers/publicController");
const publicSignupLimiter = require("../middleware/publicSignupLimiter");
const { cacheResponse } = require("../middleware/apiCache");
const validate = require("../middleware/validate");
const { publicSignupSchema } = require("../validation/schemas");

const router = express.Router();

router.get("/site-config", getSiteConfig);

router.get(
    "/plans",
    cacheResponse({ ttlSeconds: 300, scope: "public", tags: ["public:plans"] }),
    listPublicPlans
);

router.post("/signup", publicSignupLimiter, validate(publicSignupSchema), publicSignup);

module.exports = router;
