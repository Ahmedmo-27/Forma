const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { enforceSubscriptionStatus } = require("../middleware/tenantStatus");
const { requireFeature } = require("../middleware/featureGating");
const { allowRoles, allowAnyFeature } = require("../middleware/accessMiddleware");
const { locationScopeOptional } = require("../middleware/locationScope");
const validate = require("../middleware/validate");
const {
    createVendorSchema,
    updateVendorSchema,
    createProductCategorySchema,
    updateProductCategorySchema,
    createProductSchema,
    updateProductSchema,
    stockChangeSchema,
    createSaleSchema,
    refundSaleSchema,
    createVendorPayoutSchema,
} = require("../validation/schemas");
const catalog = require("../controllers/retailController");
const sales = require("../controllers/retailSalesController");
const reports = require("../controllers/retailReportController");

// Any of the three retail features may read the catalog and sales.
const anyRetail = () =>
    allowAnyFeature(
        ["retail_pos", "retail_manage", "retail_reports"],
        "Receptionist",
        "Accountant",
        "Owner",
        "General Manager",
        "Retail"
    );

router.use(protect);
router.use(enforceSubscriptionStatus);
router.use(requireFeature("retail"));
router.use(locationScopeOptional);

// POS bootstrap
router.get("/catalog", allowAnyFeature(["retail_pos", "retail_manage"], "Receptionist", "Owner", "General Manager", "Retail"), catalog.getPosCatalog);

// Vendors
router.get("/vendors", anyRetail(), catalog.listVendors);
router.post("/vendors", allowRoles("retail_manage", "Owner", "General Manager"), validate(createVendorSchema), catalog.createVendor);
router.patch("/vendors/:id", allowRoles("retail_manage", "Owner", "General Manager"), validate(updateVendorSchema), catalog.updateVendor);
router.delete("/vendors/:id", allowRoles("retail_manage", "Owner", "General Manager"), catalog.deleteVendor);

// Categories
router.get("/categories", anyRetail(), catalog.listCategories);
router.post("/categories", allowRoles("retail_manage", "Owner", "General Manager"), validate(createProductCategorySchema), catalog.createCategory);
router.patch("/categories/:id", allowRoles("retail_manage", "Owner", "General Manager"), validate(updateProductCategorySchema), catalog.updateCategory);

// Products and stock
router.get("/products", anyRetail(), catalog.listProducts);
router.post("/products", allowRoles("retail_manage", "Owner", "General Manager"), validate(createProductSchema), catalog.createProduct);
router.patch("/products/:id", allowRoles("retail_manage", "Owner", "General Manager"), validate(updateProductSchema), catalog.updateProduct);
router.delete("/products/:id", allowRoles("retail_manage", "Owner", "General Manager"), catalog.deleteProduct);
router.post("/products/:id/stock", allowRoles("retail_manage", "Owner", "General Manager"), validate(stockChangeSchema), catalog.changeStock);
router.get("/products/:id/movements", allowRoles("retail_manage", "Owner", "General Manager"), catalog.getProductMovements);
router.get("/products/:id/usage", allowRoles("retail_manage", "Owner", "General Manager"), catalog.getProductUsage);

// Sales
router.post("/sales", allowRoles("retail_pos", "Receptionist", "Owner", "General Manager", "Retail"), validate(createSaleSchema), sales.createSale);
router.get("/sales", anyRetail(), sales.listSales);
router.get("/sales/:id", anyRetail(), sales.getSale);
router.post("/sales/:id/refund", allowRoles("retail_manage", "Owner", "General Manager"), validate(refundSaleSchema), sales.refundSale);

// Revenue and vendor payouts
router.get("/reports/summary", allowRoles("retail_reports", "Accountant", "Owner", "General Manager"), reports.getSummary);
router.get("/payouts", allowRoles("retail_reports", "Accountant", "Owner", "General Manager"), reports.getPayoutOverview);
router.post("/payouts", allowRoles("retail_reports", "Accountant", "Owner", "General Manager"), validate(createVendorPayoutSchema), reports.createPayout);
router.post("/payouts/:id/settle", allowRoles("retail_reports", "Accountant", "Owner", "General Manager"), reports.settlePayout);
router.delete("/payouts/:id", allowRoles("retail_reports", "Accountant", "Owner", "General Manager"), reports.deletePayout);

module.exports = router;
