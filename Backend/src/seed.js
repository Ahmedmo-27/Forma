require("dotenv").config();
const mongoose = require("mongoose");
const connectMongo = require("./config/connectMongo");
const User = require("./models/User");
const Package = require("./models/Package");
const Member = require("./models/Member");
const ProfileView = require("./models/ProfileView");
const SalesRepRequest = require("./models/SalesRepRequest");
const { hashPassword } = require("./utils/passwordUtils");

const TEST_PASSWORD = "password123";

const USERS = [
  {
    name: "Sales Manager",
    email: "sales.manager@test.com",
    role: "Sales Manager",
  },
  {
    name: "Ahmed Sales",
    email: "sales1@test.com",
    role: "Sales",
  },
  {
    name: "Sara Sales",
    email: "sales2@test.com",
    role: "Sales",
  },
  {
    name: "Omar Sales",
    email: "sales3@test.com",
    role: "Sales",
    abilities: {
      canCommentOnMembers: true,
      canRequestAssignment: false,
      canRequestTakeover: false,
    },
  },
  {
    name: "Forma Accountant",
    email: "accountant@test.com",
    role: "Accountant",
  },
];

const SEED_USER_EMAILS = USERS.map((u) => u.email);

const SEED_MEMBER_PHONES = [
  "01012345678",
  "01098765432",
  "01122334455",
  "01233445566",
];

const SEED_MEMBER_IDS = [1, 2, 3, 4];
const SEED_SYSTEM_IDS = [100, 101, 102, 103];
const SEED_MEMBERSHIP_IDS = [100, 101, 102];

const SEED_PACKAGE_NAMES = ["Basic Monthly", "Premium Quarterly"];

function seedMemberFilter() {
  return {
    $or: [
      { phones: { $in: SEED_MEMBER_PHONES } },
      { memberId: { $in: SEED_MEMBER_IDS } },
      { systemId: { $in: SEED_SYSTEM_IDS } },
      { membershipId: { $in: SEED_MEMBERSHIP_IDS } },
    ],
  };
}

async function clearSeedData() {
  const seedUsers = await User.find({ email: { $in: SEED_USER_EMAILS } }).select("_id");
  const seedUserIds = seedUsers.map((u) => u._id);

  const seedMembers = await Member.find(seedMemberFilter()).select("_id");
  const seedMemberIds = seedMembers.map((m) => m._id);

  const [profileViews, requests, members, packages, users] = await Promise.all([
    ProfileView.deleteMany({ member: { $in: seedMemberIds } }),
    SalesRepRequest.deleteMany({
      $or: [
        { member: { $in: seedMemberIds } },
        { requestedBy: { $in: seedUserIds } },
      ],
    }),
    Member.deleteMany(seedMemberFilter()),
    Package.deleteMany({ name: { $in: SEED_PACKAGE_NAMES } }),
    User.deleteMany({ email: { $in: SEED_USER_EMAILS } }),
  ]);

  console.log("Removed existing seed data:");
  console.log(`  ProfileView: ${profileViews.deletedCount}`);
  console.log(`  SalesRepRequest: ${requests.deletedCount}`);
  console.log(`  Member: ${members.deletedCount}`);
  console.log(`  Package: ${packages.deletedCount}`);
  console.log(`  User: ${users.deletedCount}`);
}

function calcEndDate(startDate, duration) {
  const end = new Date(startDate);
  switch (duration) {
    case "1 month":  end.setMonth(end.getMonth() + 1); break;
    case "3 months": end.setMonth(end.getMonth() + 3); break;
    case "6 months": end.setMonth(end.getMonth() + 6); break;
    case "1 year":   end.setFullYear(end.getFullYear() + 1); break;
  }
  return end;
}

async function seed() {
  try {
    await connectMongo();
  } catch (error) {
    console.error("Seed failed:", error.message);
    if (error.message?.includes("whitelist") || error.message?.includes("timed out")) {
      console.error(
        "Tip: In MongoDB Atlas → Network Access, allow your current IP (or 0.0.0.0/0 for testing)."
      );
    }
    process.exit(1);
  }

  await clearSeedData();

  const passwordHash = await hashPassword(TEST_PASSWORD);

  const users = {};
  for (const user of USERS) {
    const doc = await User.create({
      name: user.name,
      email: user.email,
      role: user.role,
      password: passwordHash,
      ...(user.abilities ? { abilities: user.abilities } : {}),
    });
    users[user.email] = doc;
    console.log(`✓ ${user.role}: ${user.email}`);
  }

  const manager = users["sales.manager@test.com"];
  const sales1 = users["sales1@test.com"];
  const sales2 = users["sales2@test.com"];

  const packages = await Promise.all([
    Package.create({
      name: "Basic Monthly",
      activityType: "gym",
      duration: "1 month",
      price: 1500,
      isActive: true,
      createdBy: manager._id,
    }),
    Package.create({
      name: "Premium Quarterly",
      activityType: "gym",
      duration: "3 months",
      price: 4000,
      isActive: true,
      createdBy: manager._id,
    }),
  ]);

  const [basicPkg, premiumPkg] = packages;

  const memberSeeds = [
    {
      memberId: 1,
      systemId: 100,
      membershipId: 100,
      name: "Karim Hassan",
      phones: "01012345678",
      salesRep: sales1._id,
      source: "Walk in",
      status: "active",
      isMember: true,
      notes: [{ text: "Interested in morning sessions.", createdBy: sales1._id }],
      pkg: basicPkg,
    },
    {
      memberId: 2,
      systemId: 101,
      membershipId: 101,
      name: "Mona Ali",
      phones: "01098765432",
      salesRep: sales2._id,
      source: "Social media",
      status: "active",
      isMember: true,
      notes: [{ text: "Referred by existing member.", createdBy: sales2._id }],
      pkg: premiumPkg,
    },
    {
      memberId: 3,
      systemId: 102,
      name: "Youssef Ibrahim",
      phones: "01122334455",
      salesRep: null,
      source: "sales call",
      status: "guest",
      isMember: false,
      pkg: basicPkg,
    },
    {
      memberId: 4,
      systemId: 103,
      membershipId: 102,
      name: "Nour Mahmoud",
      phones: "01233445566",
      salesRep: sales2._id,
      source: "referral",
      status: "active",
      isMember: true,
      pkg: premiumPkg,
    },
  ];

  const members = {};
  for (const seed of memberSeeds) {
    const startDate = new Date();
    const { pkg, ...memberFields } = seed;
    const update = {
      ...memberFields,
      createdBy: manager._id,
    };

    if (seed.isMember) {
      update.subscriptions = [{
        subscriptionId: seed.membershipId,
        package: pkg._id,
        packageSnapshot: {
          name: pkg.name,
          activityType: pkg.activityType,
          duration: pkg.duration,
          price: pkg.price,
          freezeLimitDays: pkg.freezeLimitDays || 0,
          invitationLimit: pkg.invitationLimit || 0,
          renewalDiscountPercent: pkg.renewalDiscountPercent || 0,
          description: pkg.description ?? null,
          hasException: false,
          free_pt_sessions: pkg.free_pt_sessions || 0,
        },
        startDate,
        endDate: calcEndDate(startDate, pkg.duration),
        pricePaid: pkg.price,
        discountPercent: 0,
        isRenewal: false,
        createdBy: manager._id,
      }];
    }

    const doc = await Member.create(update);
    members[seed.name] = doc;
    console.log(`✓ Member: ${seed.name}`);
  }

  await SalesRepRequest.create({
    member: members["Nour Mahmoud"]._id,
    requestedBy: sales1._id,
    status: "pending",
  });
  console.log("✓ Pending request: sales1 → Nour Mahmoud (takeover from sales2)");

  console.log("\n--- Test accounts (password for all: password123) ---");
  console.log("Sales Manager : sales.manager@test.com");
  console.log("Sales Rep 1   : sales1@test.com  (Ahmed - has Karim assigned)");
  console.log("Sales Rep 2   : sales2@test.com  (Sara - has Mona & Nour assigned)");
  console.log("Sales Rep 3   : sales3@test.com  (Omar - request abilities disabled)");
  console.log("Accountant    : accountant@test.com");
  console.log("\nSample data:");
  console.log("- Youssef Ibrahim is unassigned (request assignment as any sales rep)");
  console.log("- Nour Mahmoud has a pending takeover request from sales1");
  console.log("---------------------------------------------------\n");

  await mongoose.disconnect();
  console.log("Seed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
