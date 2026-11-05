const mongoose = require("mongoose");
const tenantPlugin = require("../plugins/tenantPlugin");

const noteSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

const alertSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true
    },
    active: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

const logSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ["check-in", "pt-session", "note", "renewal", "freeze", "assign", "other"],
        default: "other"
    },
    text: {
        type: String,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

const freezeSchema = new mongoose.Schema({
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    note: {
        type: String,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    endedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    }
}, { timestamps: true });

const invitationSchema = new mongoose.Schema({
    invitedName: {
        type: String,
        required: true
    },
    invitedPhone: {
        type: String,
        default: null
    },
    idFile: {
        type: String,   // stored file path / URL
        default: null
    },
    usedAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

// Frozen package terms at purchase time — catalog Package edits must not rewrite these
const packageSnapshotSchema = new mongoose.Schema({
    name: { type: String, required: true },
    activityType: {
        type: String,
        default: "gym"
    },
    duration: {
        type: String,
        enum: ["1 month", "3 months", "6 months", "1 year"],
        required: true
    },
    price: { type: Number, required: true },
    freezeLimitDays: { type: Number, default: 0 },
    invitationLimit: { type: Number, default: 0 },
    renewalDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    description: { type: String, default: null },
    hasException: { type: Boolean, default: false },
    free_pt_sessions: { type: Number, default: 0 }
}, { _id: false });

const subscriptionSchema = new mongoose.Schema({
    subscriptionId: {
        type: Number
        // auto-generated starting from 100, increments globally
    },
    package: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Package",
        required: true
    },
    // Immutable copy of package characteristics at the moment of purchase/payment
    packageSnapshot: {
        type: packageSnapshotSchema,
        default: null
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    // Immutable amount collected for this subscription (payment record)
    pricePaid: {
        type: Number,
        required: true
    },
    discountPercent: {
        type: Number,
        default: 0
    },
    isRenewal: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    salesManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    // Refund — stored here so subscriptionSalePrice() deducts it automatically from all revenue calculations
    refundAmount: {
        type: Number,
        default: 0
    },
    refundReason: {
        type: String,
        default: null
    },
    refundedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    refundedAt: {
        type: Date,
        default: null
    },
    refunded: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const memberSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        trim: true
    },

    // Given to everyone added to the system (guests + members). Used for search.
    systemId: {
        type: Number,
        sparse: true
    },

    // Given only when a person subscribes. Used for check-in and search.
    memberId: {
        type: Number,
        sparse: true,
    },

    // Barcode string for card/keytag scanning. Generated from memberId.
    barcode: {
        type: String,
        sparse: true,
        index: true,
    },

    // true = has an active or past subscription, false = guest only
    isMember: {
        type: Boolean,
        default: false
    },

    phones: {
        type: String,
        required: true
    },

    nationalId: {
        type: String,   
        default: null
    },

    photo: {
        type: String,
        default: null
    },

    gender: {
        type: String,
        enum: ["male", "female"],
        default: null
    },

    birthdate: {
        type: Date,
        default: null
    },

    // guest = not subscribed yet, active/frozen/expired = member
    status: {
        type: String,
        enum: ["guest", "active", "frozen", "expired"],
        default: "guest"
    },

    source: {
        type: String,
        enum: ["Social media", "Walk in", "Word of mouth", "referral", "sales call", "data entry", "others"],
        default: null
    },

    assignedSales: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    // Current active package is read from subscriptions[last].package — not stored separately

    // Full subscription history (each renewal creates a new entry)
    subscriptions: [subscriptionSchema],

    // Freeze days consumed in current subscription
    freezeDaysUsed: {
        type: Number,
        default: 0
    },

    // Invitations consumed in current subscription
    invitationsUsed: {
        type: Number,
        default: 0
    },

    isBlocked: {
    type: Boolean,
    default: false
},
blockedReason: {
    type: String,
    default: null
},
blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
},
blockedAt: {
    type: Date,
    default: null
},


    // Current couch assigned to the member
    current_couch:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    // Couch subscription status
    couch_subscription_status: {
        type: String,
        enum: ["active", "transferred", "expired","interested","not interested"],
        default: null
    },
    
    PT_sessions:{
        type: Number,
        default:0
    },

    used_PT_sessions:{
        type: Number,
        default:0
    },

    PT_sessions_expDate:{
        type: Date,
    },

    PT_sessions_startDate:{
        type: Date,
    },

    pt_subscriptions: [{
        sessions: { type: Number, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        durationMonths: { type: Number, required: true },
        pricePaid: { type: Number, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
        refundAmount: {
            type: Number,
            default: 0
        },
        refundReason: {
            type: String,
            default: null
        },
        refundedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        refundedAt: {
            type: Date,
            default: null
        },
        refunded: {
            type: Boolean,
            default: false
        }
    }],

    notes:       [noteSchema],
    alert:       [alertSchema],
    couch_notes: [noteSchema],
    freeze:      [freezeSchema],
    invitations: [invitationSchema],
    userlog:     [logSchema]

}, { timestamps: true });

memberSchema.plugin(tenantPlugin);

// ── Compound Indexes for Multi-Tenant Performance & Isolation ────────────────
memberSchema.index(
    { tenantId: 1, systemId: 1 },
    { unique: true, partialFilterExpression: { systemId: { $type: "number" } } }
);
memberSchema.index(
    { tenantId: 1, memberId: 1 },
    { unique: true, partialFilterExpression: { memberId: { $type: "number" } } }
);
memberSchema.index(
    { tenantId: 1, barcode: 1 },
    { unique: true, partialFilterExpression: { barcode: { $type: "string" } } }
);

memberSchema.index({ tenantId: 1, status: 1, systemId: 1 });
memberSchema.index({ tenantId: 1, assignedSales: 1, status: 1 });
memberSchema.index({ tenantId: 1, assignedSales: 1, systemId: 1 });
memberSchema.index({ tenantId: 1, "subscriptions.startDate": 1 });
memberSchema.index({ tenantId: 1, current_couch: 1 });
memberSchema.index({ tenantId: 1, isBlocked: 1 });
memberSchema.index({ tenantId: 1, name: 1 });
memberSchema.index({ tenantId: 1, phones: 1 });

module.exports = mongoose.model("Member", memberSchema);