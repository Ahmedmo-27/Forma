import { describe, expect, it } from "vitest";
import {
  assignChoices,
  buildCsv,
  canUserAssignTasks,
  canUserReceiveTasks,
  NON_RECEIVING_TASK_ROLES,
  filterAssignedHistoryAdvanced,
  filterCreatedTasks,
  filterMembersAdvanced,
  filterTaskHistory,
  formatTaskDateTime,
  columnsForExport,
  filterMembers,
  memberPhone,
  rowsForExport,
  salesName,
  salesmanName,
  smsUrl,
  taskPermissions,
  toggleId,
  toggleIds,
  toLocalDateString,
  parseDateBoundary,
  latestSubscription,
  SELECTION_TEMPLATES,
  applySelectionTemplate,
  invertSelection,
  TASK_PLAYER_TYPES,
  getTaskPlayerType,
} from "./taskMembers";

function member(extra) {
  return {
    _id: extra._id || "m1",
    name: extra.name || "Nour Ali",
    systemId: extra.systemId ?? 101,
    memberId: extra.memberId || "GYM-101",
    phones: extra.phones ?? "01011111111",
    status: extra.status || "active",
    source: extra.source || "Walk in",
    gender: extra.gender || "female",
    createdAt: extra.createdAt || "2026-04-01T10:00:00.000Z",
    assignedSales: extra.assignedSales ?? { name: "Rep One", role: "Sales" },
    current_couch: extra.current_couch ?? { name: "Coach Hana" },
    isBlocked: Boolean(extra.isBlocked),
    subscriptions: extra.subscriptions || [{
      package: { name: "Gold Month" },
      salesManager: { name: "Manager Sara", role: "Sales Manager" },
      startDate: "2026-04-01T10:00:00.000Z",
      endDate: "2026-05-01T10:00:00.000Z",
    }],
    ...extra,
  };
}

describe("tasks member groups", () => {
  const rows = [
    member({ _id: "a", name: "Nour Ali", phones: "01011111111" }),
    member({
      _id: "b",
      name: "Omar",
      phones: "hidden",
      systemId: 202,
      assignedSales: { name: "Manager Sara", role: "Sales Manager" },
      current_couch: { name: "Coach Hana" },
    }),
    member({
      _id: "c",
      name: "Lina",
      phones: "01033333333",
      systemId: 303,
      assignedSales: null,
      subscriptions: [{ package: { name: "Day Pass" }, startDate: "2026-04-01T10:00:00.000Z" }],
    }),
  ];

  it("searches name, visible phone, id, salesman, sales, and coach", () => {
    expect(filterMembers(rows, "nour").map((row) => row._id)).toEqual(["a"]);
    expect(filterMembers(rows, "010111").map((row) => row._id)).toEqual(["a"]);
    expect(filterMembers(rows, "hidden")).toEqual([]);
    expect(filterMembers(rows, "202").map((row) => row._id)).toEqual(["b"]);
    expect(filterMembers(rows, "manager sara").map((row) => row._id)).toEqual(["a", "b"]);
    expect(filterMembers(rows, "coach hana").map((row) => row._id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a sales manager out of the salesman column", () => {
    const managed = rows[1];
    expect(salesmanName(managed)).toBe("");
    expect(salesName(managed)).toBe("Manager Sara");
    expect(memberPhone(managed)).toBe("");
    expect(salesName(rows[0])).toBe("Manager Sara");
    expect(salesmanName(rows[0])).toBe("Rep One");
  });

  it("exports the chosen columns and quotes commas", () => {
    const columns = columnsForExport(["name", "phone", "salesman"]);
    const csv = buildCsv(columns, [member({ name: 'Ali, "Sam"' })]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Name,Phone,Salesman");
    expect(csv).toContain('"Ali, ""Sam"""');
    expect(csv).toContain("01011111111");
    expect(csv).not.toContain("Gold Month");
  });

  it("exports the selection when any row is checked, otherwise the filtered list", () => {
    const selected = [rows[0]];
    expect(rowsForExport(selected, rows)).toEqual(selected);
    expect(rowsForExport([], rows)).toEqual(rows);
  });

  it("builds an sms link from visible numbers only", () => {
    expect(smsUrl(["01011111111", "", "01022222222"], "Hello, gym")).toBe(
      "sms:01011111111,01022222222?&body=Hello%2C%20gym",
    );
    expect(smsUrl(rows.map(memberPhone), "Hi")).toBe("sms:01011111111,01033333333?&body=Hi");
    expect(smsUrl(["", ""], "Hi")).toBeNull();
  });

  it("selects one row, a page, or the whole filtered list", () => {
    const one = toggleId(new Set(), "a");
    expect([...toggleId(one, "a")]).toEqual([]);
    const page = toggleIds(new Set(["z"]), ["a", "b"]);
    expect([...page].sort()).toEqual(["a", "b", "z"]);
    expect([...toggleIds(page, ["a", "b"])]).toEqual(["z"]);
  });

  it("gates bulk actions by access, role, and the whatsapp feature", () => {
    const salesManager = taskPermissions(
      { role: "Sales Manager", access: ["transfer"] },
      (feature) => feature === "whatsapp",
    );
    expect(salesManager).toEqual({
      canSalesman: true,
      canCoach: false,
      canSales: true,
      canWhatsApp: true,
    });

    const accountant = taskPermissions({ role: "Accountant", access: [] }, () => false);
    expect(accountant.canSalesman).toBe(false);
    expect(accountant.canSales).toBe(true);
    expect(accountant.canWhatsApp).toBe(false);

    const coachManager = taskPermissions(
      { role: "Head Coach", access: ["coach_transfer"] },
      () => false,
    );
    expect(coachManager.canCoach).toBe(true);
    expect(coachManager.canSales).toBe(false);
  });

  it("offers sales reps, sales managers, or coaches for the chosen transfer", () => {
    const people = [
      { _id: "r", name: "Rep", role: "Sales" },
      { _id: "s", name: "Sara", role: "Sales Manager" },
    ];
    expect(assignChoices("salesman", { salesUsers: people, selectedCount: 2 }).options).toEqual([people[0]]);
    expect(assignChoices("sales", { salesUsers: people, selectedCount: 2 }).options).toEqual([people[1]]);
    expect(assignChoices("sales", { salesUsers: [people[0]], selectedCount: 1 }).options).toEqual([people[0]]);
    expect(assignChoices("coach", { coaches: [{ _id: "c", name: "Hana" }], selectedCount: 4 }).hint).toContain("4");
  });

  it("formats task date time cleanly", () => {
    expect(formatTaskDateTime(null)).toBe("—");
    expect(formatTaskDateTime("invalid")).toBe("—");
    const d = new Date("2026-11-09T10:30:00Z");
    expect(formatTaskDateTime(d)).toBeTruthy();
  });

  it("checks if a user has permission to assign tasks", () => {
    expect(canUserAssignTasks({ role: "Owner" })).toBe(true);
    expect(canUserAssignTasks({ role: "Sales Manager" })).toBe(true);
    expect(canUserAssignTasks({ role: "Head Coach" })).toBe(true);
    expect(canUserAssignTasks({ role: "General Manager" })).toBe(true);
    expect(canUserAssignTasks({ role: "Sales", access: ["transfer"] })).toBe(true);
    expect(canUserAssignTasks({ role: "Sales", access: [] })).toBe(false);
    expect(canUserAssignTasks({ role: "Coach", access: [] })).toBe(false);
  });

  it("checks that Owner, General Manager, and Sales Manager never receive assigned tasks", () => {
    expect(NON_RECEIVING_TASK_ROLES).toEqual(["Owner", "General Manager", "Sales Manager"]);
    expect(canUserReceiveTasks({ role: "Owner" })).toBe(false);
    expect(canUserReceiveTasks({ role: "General Manager" })).toBe(false);
    expect(canUserReceiveTasks({ role: "Sales Manager" })).toBe(false);
    expect(canUserReceiveTasks({ role: "Accountant" })).toBe(false);
    expect(canUserReceiveTasks({ role: "Receptionist" })).toBe(false);
    expect(canUserReceiveTasks({ role: "Sales" })).toBe(true);
    expect(canUserReceiveTasks({ role: "Coach" })).toBe(true);
    expect(canUserReceiveTasks({ role: "Head Coach" })).toBe(true);
    expect(canUserReceiveTasks(null)).toBe(false);
  });

  it("filters task history by query and completion status", () => {
    const history = [
      {
        _id: "1",
        status: "pending",
        member: { name: "Ahmed", phone: "01001", systemId: 101 },
        assignedBy: { name: "Manager Sara" },
      },
      {
        _id: "2",
        status: "completed",
        member: { name: "Nour", phone: "01002", systemId: 102 },
        assignedBy: { name: "Owner Bob" },
      },
    ];

    expect(filterTaskHistory(history, "", "all")).toHaveLength(2);
    expect(filterTaskHistory(history, "", "completed")).toHaveLength(1);
    expect(filterTaskHistory(history, "", "completed")[0].member.name).toBe("Nour");
    expect(filterTaskHistory(history, "01001", "all")).toHaveLength(1);
    expect(filterTaskHistory(history, "Sara", "all")).toHaveLength(1);
  });

  it("filters members by date period from and to", () => {
    const list = [
      {
        _id: "m1",
        name: "May Expiring",
        subscriptions: [{ endDate: "2026-05-15T00:00:00.000Z" }],
      },
      {
        _id: "m2",
        name: "July Expiring",
        subscriptions: [{ endDate: "2026-07-20T00:00:00.000Z" }],
      },
    ];

    const mayOnly = filterMembersAdvanced(list, {
      dateField: "endDate",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    });
    expect(mayOnly.map((m) => m._id)).toEqual(["m1"]);
  });

  it("filters members by transfer history (transferred, never, bulk)", () => {
    const list = [
      {
        _id: "m1",
        name: "Transferred Bulk",
        userlog: [{ type: "assign", text: "Bulk transferred to Rep Sara", createdAt: "2026-04-10" }],
      },
      {
        _id: "m2",
        name: "Never Transferred",
        userlog: [],
      },
      {
        _id: "m3",
        name: "Coach Transferred",
        userlog: [{ type: "assign", text: "Transferred to Coach Ali", createdAt: "2026-04-12" }],
      },
    ];

    expect(filterMembersAdvanced(list, { transferType: "transferred" })).toHaveLength(2);
    expect(filterMembersAdvanced(list, { transferType: "never" })).toHaveLength(1);
    expect(filterMembersAdvanced(list, { transferType: "never" })[0]._id).toBe("m2");
    expect(filterMembersAdvanced(list, { transferType: "bulk" })).toHaveLength(1);
    expect(filterMembersAdvanced(list, { transferType: "bulk" })[0]._id).toBe("m1");
    expect(filterMembersAdvanced(list, { transferType: "coach" })).toHaveLength(1);
    expect(filterMembersAdvanced(list, { transferType: "coach" })[0]._id).toBe("m3");
  });

  it("filters members by unassigned sales and unassigned coach", () => {
    const list = [
      { _id: "m1", name: "Has Both", assignedSales: "rep1", current_couch: "coach1" },
      { _id: "m2", name: "No Sales", assignedSales: null, current_couch: "coach1" },
      { _id: "m3", name: "No Coach", assignedSales: "rep1", current_couch: null },
    ];

    expect(filterMembersAdvanced(list, { kind: "unassigned_sales" }).map((m) => m._id)).toEqual(["m2"]);
    expect(filterMembersAdvanced(list, { kind: "unassigned_coach" }).map((m) => m._id)).toEqual(["m3"]);
  });

  it("filters created tasks for assigners by role, person, member and period", () => {
    const tasks = [
      {
        _id: "t1",
        targetRole: "Sales",
        assignedTo: { _id: "s1", name: "Sara Rep", role: "Sales" },
        status: "pending",
        transferType: "bulk",
        createdAt: "2026-05-10T10:00:00Z",
        members: [
          { name: "Member Alpha", systemId: 101, phone: "0101111" },
        ],
      },
      {
        _id: "t2",
        targetRole: "Coach",
        assignedTo: { _id: "c1", name: "Coach Ali", role: "Coach" },
        status: "completed",
        transferType: "quick",
        createdAt: "2026-06-15T10:00:00Z",
        members: [
          { name: "Member Beta", systemId: 102, phone: "0102222" },
        ],
      },
    ];

    expect(filterCreatedTasks(tasks, { role: "Sales" })).toHaveLength(1);
    expect(filterCreatedTasks(tasks, { role: "Coach" })).toHaveLength(1);
    expect(filterCreatedTasks(tasks, { personId: "s1" })).toHaveLength(1);
    expect(filterCreatedTasks(tasks, { memberSearch: "Alpha" })).toHaveLength(1);
    expect(filterCreatedTasks(tasks, { memberSearch: "102" })).toHaveLength(1);
    expect(filterCreatedTasks(tasks, { dateFrom: "2026-06-01", dateTo: "2026-06-30" })).toHaveLength(1);
    expect(filterCreatedTasks(tasks, { dateFrom: "2026-06-01", dateTo: "2026-06-30" })[0]._id).toBe("t2");
  });

  it("filters assigned history for assignees by assignedBy, package, and period", () => {
    const history = [
      {
        _id: "h1",
        assignedBy: { _id: "mgr1", name: "Manager Sara" },
        status: "completed",
        assignedAt: "2026-05-01T10:00:00Z",
        completedAt: "2026-05-03T10:00:00Z",
        member: { name: "Member One", package: "Gold Month", packageId: "pkg-1", systemId: 201 },
      },
      {
        _id: "h2",
        assignedBy: { _id: "mgr2", name: "Owner Bob" },
        status: "pending",
        assignedAt: "2026-06-01T10:00:00Z",
        completedAt: null,
        member: { name: "Member Two", package: "Silver", packageId: "pkg-2", systemId: 202 },
      },
    ];

    expect(filterAssignedHistoryAdvanced(history, { assignedBy: "mgr1" })).toHaveLength(1);
    expect(filterAssignedHistoryAdvanced(history, { packageId: "pkg-2" })).toHaveLength(1);
    expect(filterAssignedHistoryAdvanced(history, { dateField: "completedAt", dateFrom: "2026-05-01", dateTo: "2026-05-10" })).toHaveLength(1);
    expect(filterAssignedHistoryAdvanced(history, { dateField: "completedAt", dateFrom: "2026-05-01", dateTo: "2026-05-10" })[0]._id).toBe("h1");
  });

  it("filters members by status correctly and never returns all users when filtering by specific status", () => {
    const list = [
      member({ _id: "m_active", name: "Active User", status: "active" }),
      member({ _id: "m_expired", name: "Expired User", status: "expired" }),
      member({ _id: "m_frozen", name: "Frozen User", status: "frozen" }),
      member({ _id: "m_guest", name: "Guest User", status: "guest" }),
      member({ _id: "m_blocked", name: "Blocked User", status: "active", isBlocked: true }),
      member({ _id: "m_capital", name: "Capitalized User", status: "Active" }),
    ];

    // Filter by active - must include active and capitalized Active, exclude expired/frozen/guest
    const activeResult = filterMembersAdvanced(list, { status: "active" });
    expect(activeResult.map((m) => m._id)).toEqual(["m_active", "m_blocked", "m_capital"]);

    // Filter by expired - must only return expired
    const expiredResult = filterMembersAdvanced(list, { status: "expired" });
    expect(expiredResult.map((m) => m._id)).toEqual(["m_expired"]);

    // Filter by frozen - must only return frozen
    const frozenResult = filterMembersAdvanced(list, { status: "frozen" });
    expect(frozenResult.map((m) => m._id)).toEqual(["m_frozen"]);

    // Filter by guest - must only return guest
    const guestResult = filterMembersAdvanced(list, { status: "guest" });
    expect(guestResult.map((m) => m._id)).toEqual(["m_guest"]);

    // Filter by blocked - must only return members with isBlocked === true
    const blockedResult = filterMembersAdvanced(list, { status: "blocked" });
    expect(blockedResult.map((m) => m._id)).toEqual(["m_blocked"]);

    // Filter by all - returns all members
    const allResult = filterMembersAdvanced(list, { status: "all" });
    expect(allResult).toHaveLength(6);

    // If status is undefined or null, fallback gracefully to all
    expect(filterMembersAdvanced(list, { status: undefined })).toHaveLength(6);
  });

  it("formats local dates and parses date boundaries without timezone shifts", () => {
    const d = new Date(2026, 4, 15); // May 15, 2026 local
    expect(toLocalDateString(d)).toBe("2026-05-15");
    expect(toLocalDateString(null)).toBe("");

    const startTs = parseDateBoundary("2026-05-15", false);
    const endTs = parseDateBoundary("2026-05-15", true);
    expect(startTs).toBeLessThan(endTs);

    const startDate = new Date(startTs);
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);

    const endDate = new Date(endTs);
    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
    expect(endDate.getSeconds()).toBe(59);
  });

  it("filters created tasks history by task status, member status, and package in modal", () => {
    const tasks = [
      {
        _id: "t_pending",
        status: "pending",
        totalCount: 2,
        completedCount: 0,
        transferType: "bulk",
        targetRole: "Sales",
        assignedTo: { _id: "s1", name: "Sara Rep", role: "Sales" },
        createdAt: "2026-05-10T10:00:00Z",
        members: [
          {
            _id: "tm1",
            status: "pending",
            member: { _id: "mem1", name: "John Doe", status: "active", subscriptions: [{ package: { _id: "pkg1", name: "Gold" } }] },
          },
          {
            _id: "tm2",
            status: "pending",
            member: { _id: "mem2", name: "Jane Smith", status: "expired", subscriptions: [{ package: { _id: "pkg2", name: "Silver" } }] },
          },
        ],
      },
      {
        _id: "t_in_progress",
        status: "in_progress",
        totalCount: 2,
        completedCount: 1,
        transferType: "bulk",
        targetRole: "Sales Manager",
        assignedTo: { _id: "sm1", name: "Manager Ali", role: "Sales Manager" },
        createdAt: "2026-05-12T10:00:00Z",
        members: [
          {
            _id: "tm3",
            status: "completed",
            completedAt: "2026-05-13T12:00:00Z",
            member: { _id: "mem3", name: "Bob Martin", status: "frozen", subscriptions: [{ package: { _id: "pkg1", name: "Gold" } }] },
          },
          {
            _id: "tm4",
            status: "pending",
            member: { _id: "mem4", name: "Alice Brown", status: "active", subscriptions: [{ package: { _id: "pkg3", name: "Bronze" } }] },
          },
        ],
      },
      {
        _id: "t_completed",
        status: "completed",
        totalCount: 1,
        completedCount: 1,
        transferType: "quick",
        targetRole: "Coach",
        assignedTo: { _id: "c1", name: "Coach Mike", role: "Coach" },
        createdAt: "2026-05-14T10:00:00Z",
        members: [
          {
            _id: "tm5",
            status: "completed",
            completedAt: "2026-05-15T12:00:00Z",
            member: { _id: "mem5", name: "Charlie Blocked", status: "active", isBlocked: true, subscriptions: [{ package: { _id: "pkg1", name: "Gold" } }] },
          },
        ],
      },
    ];

    // Filter by task status: pending
    expect(filterCreatedTasks(tasks, { status: "pending" }).map((t) => t._id)).toEqual(["t_pending"]);

    // Filter by task status: in_progress
    expect(filterCreatedTasks(tasks, { status: "in_progress" }).map((t) => t._id)).toEqual(["t_in_progress"]);

    // Filter by task status: completed
    expect(filterCreatedTasks(tasks, { status: "completed" }).map((t) => t._id)).toEqual(["t_completed"]);

    // Filter by member status: expired (only t_pending has an expired member)
    expect(filterCreatedTasks(tasks, { memberStatus: "expired" }).map((t) => t._id)).toEqual(["t_pending"]);

    // Filter by member status: frozen (only t_in_progress has a frozen member)
    expect(filterCreatedTasks(tasks, { memberStatus: "frozen" }).map((t) => t._id)).toEqual(["t_in_progress"]);

    // Filter by member status: blocked (only t_completed has a blocked member)
    expect(filterCreatedTasks(tasks, { memberStatus: "blocked" }).map((t) => t._id)).toEqual(["t_completed"]);

    // Filter by package: pkg1 (present in t_pending, t_in_progress, t_completed)
    expect(filterCreatedTasks(tasks, { packageId: "pkg1" }).map((t) => t._id)).toEqual(["t_pending", "t_in_progress", "t_completed"]);

    // Filter by package: pkg2 (only in t_pending)
    expect(filterCreatedTasks(tasks, { packageId: "pkg2" }).map((t) => t._id)).toEqual(["t_pending"]);

    // Filter by completion date
    expect(filterCreatedTasks(tasks, { dateField: "completedAt", dateFrom: "2026-05-15", dateTo: "2026-05-15" }).map((t) => t._id)).toEqual(["t_completed"]);

    // Filter by role: Sales (should include both Sales and Sales Manager)
    expect(filterCreatedTasks(tasks, { role: "Sales" }).map((t) => t._id)).toEqual(["t_pending", "t_in_progress"]);

    // Filter by role: Coach
    expect(filterCreatedTasks(tasks, { role: "Coach" }).map((t) => t._id)).toEqual(["t_completed"]);
  });

  it("filters assigned history with status and member status tabs", () => {
    const history = [
      {
        _id: "h1",
        status: "pending",
        member: { _id: "m1", name: "Ahmed", status: "active", package: "Gold", packageId: "p1" },
        assignedBy: { _id: "u1", name: "Boss" },
      },
      {
        _id: "h2",
        status: "completed",
        member: { _id: "m2", name: "Sara", status: "expired", package: "Silver", packageId: "p2" },
        assignedBy: { _id: "u1", name: "Boss" },
      },
      {
        _id: "h3",
        status: "completed",
        member: { _id: "m3", name: "Kareem", status: "active", isBlocked: true, package: "Gold", packageId: "p1" },
        assignedBy: { _id: "u2", name: "Lead" },
      },
    ];

    expect(filterAssignedHistoryAdvanced(history, { status: "pending" })).toHaveLength(1);
    expect(filterAssignedHistoryAdvanced(history, { status: "pending" })[0]._id).toBe("h1");

    expect(filterAssignedHistoryAdvanced(history, { status: "completed" })).toHaveLength(2);

    expect(filterAssignedHistoryAdvanced(history, { memberStatus: "expired" })).toHaveLength(1);
    expect(filterAssignedHistoryAdvanced(history, { memberStatus: "expired" })[0]._id).toBe("h2");

    expect(filterAssignedHistoryAdvanced(history, { memberStatus: "blocked" })).toHaveLength(1);
    expect(filterAssignedHistoryAdvanced(history, { memberStatus: "blocked" })[0]._id).toBe("h3");
  });

  describe("selection templates for bulk transfer", () => {
    const generateMembers = (count) => {
      return Array.from({ length: count }, (_, i) =>
        member({
          _id: `id_${i + 1}`,
          name: `Member ${i + 1}`,
          systemId: 1000 + i + 1,
          status: i % 4 === 0 ? "active" : i % 4 === 1 ? "expired" : i % 4 === 2 ? "frozen" : "guest",
          assignedSales: i % 2 === 0 ? { _id: "s1", name: "Rep 1", role: "Sales" } : null,
          current_couch: i % 3 === 0 ? { _id: "c1", name: "Coach 1" } : null,
          userlog: i % 5 === 0 ? [{ type: "assign", text: "Transferred to Coach" }] : [],
        })
      );
    };

    const membersList = generateMembers(45);

    it("has required template definitions including first/last 10, 20, 30", () => {
      const ids = SELECTION_TEMPLATES.map((t) => t.id);
      expect(ids).toContain("first_10");
      expect(ids).toContain("first_20");
      expect(ids).toContain("first_30");
      expect(ids).toContain("last_10");
      expect(ids).toContain("last_20");
      expect(ids).toContain("last_30");
      expect(ids).toContain("status_active");
      expect(ids).toContain("status_expired");
      expect(ids).toContain("unassigned_sales");
      expect(ids).toContain("unassigned_coach");
      expect(ids).toContain("never_transferred");
    });

    it("selects first 10, 20, 30 members accurately", () => {
      const first10 = applySelectionTemplate(membersList, "first_10");
      expect(first10).toHaveLength(10);
      expect(first10[0]).toBe("id_1");
      expect(first10[9]).toBe("id_10");

      const first20 = applySelectionTemplate(membersList, "first_20");
      expect(first20).toHaveLength(20);
      expect(first20[0]).toBe("id_1");
      expect(first20[19]).toBe("id_20");

      const first30 = applySelectionTemplate(membersList, "first_30");
      expect(first30).toHaveLength(30);
      expect(first30[0]).toBe("id_1");
      expect(first30[29]).toBe("id_30");
    });

    it("selects last 10, 20, 30 members accurately", () => {
      const last10 = applySelectionTemplate(membersList, "last_10");
      expect(last10).toHaveLength(10);
      expect(last10[0]).toBe("id_36");
      expect(last10[9]).toBe("id_45");

      const last20 = applySelectionTemplate(membersList, "last_20");
      expect(last20).toHaveLength(20);
      expect(last20[0]).toBe("id_26");
      expect(last20[19]).toBe("id_45");

      const last30 = applySelectionTemplate(membersList, "last_30");
      expect(last30).toHaveLength(30);
      expect(last30[0]).toBe("id_16");
      expect(last30[29]).toBe("id_45");
    });

    it("supports custom count templates", () => {
      const custom15 = applySelectionTemplate(membersList, "custom_first", { count: 15 });
      expect(custom15).toHaveLength(15);
      expect(custom15[0]).toBe("id_1");
      expect(custom15[14]).toBe("id_15");

      const customLast5 = applySelectionTemplate(membersList, "custom_last", { count: 5 });
      expect(customLast5).toHaveLength(5);
      expect(customLast5[0]).toBe("id_41");
      expect(customLast5[4]).toBe("id_45");
    });

    it("selects members by status templates (active, expired, frozen, guest)", () => {
      const activeIds = applySelectionTemplate(membersList, "status_active");
      expect(activeIds.length).toBeGreaterThan(0);
      activeIds.forEach((id) => {
        const found = membersList.find((m) => m._id === id);
        expect(found.status).toBe("active");
      });

      const expiredIds = applySelectionTemplate(membersList, "status_expired");
      expect(expiredIds.length).toBeGreaterThan(0);
      expiredIds.forEach((id) => {
        const found = membersList.find((m) => m._id === id);
        expect(found.status).toBe("expired");
      });
    });

    it("selects members by assignment templates (unassigned sales and coach)", () => {
      const unassignedSales = applySelectionTemplate(membersList, "unassigned_sales");
      expect(unassignedSales.length).toBeGreaterThan(0);
      unassignedSales.forEach((id) => {
        const found = membersList.find((m) => m._id === id);
        expect(found.assignedSales).toBeNull();
      });

      const unassignedCoach = applySelectionTemplate(membersList, "unassigned_coach");
      expect(unassignedCoach.length).toBeGreaterThan(0);
      unassignedCoach.forEach((id) => {
        const found = membersList.find((m) => m._id === id);
        expect(found.current_couch).toBeNull();
      });
    });

    it("selects members by transfer history templates", () => {
      const neverTransferred = applySelectionTemplate(membersList, "never_transferred");
      expect(neverTransferred.length).toBeGreaterThan(0);
      neverTransferred.forEach((id) => {
        const found = membersList.find((m) => m._id === id);
        expect(found.userlog).toHaveLength(0);
      });
    });

    it("inverts selection properly", () => {
      const currentSelected = new Set(["id_1", "id_2"]);
      const inverted = invertSelection(membersList.slice(0, 5), currentSelected);
      expect(inverted).toEqual(["id_3", "id_4", "id_5"]);
    });

    it("handles random template selections without duplicates", () => {
      const random10 = applySelectionTemplate(membersList, "random_10");
      expect(random10).toHaveLength(10);
      const unique = new Set(random10);
      expect(unique.size).toBe(10);
    });

    it("gracefully handles lists smaller than requested count", () => {
      const shortList = membersList.slice(0, 4);
      expect(applySelectionTemplate(shortList, "first_10")).toHaveLength(4);
      expect(applySelectionTemplate(shortList, "last_10")).toHaveLength(4);
      expect(applySelectionTemplate([], "first_10")).toEqual([]);
    });
  });

  describe("task player types (assigning vs assigned)", () => {
    it("identifies Sales Manager as assigning player type", () => {
      const user = { role: "Sales Manager", access: ["transfer", "members"] };
      expect(canUserAssignTasks(user)).toBe(true);
      expect(getTaskPlayerType(user)).toBe(TASK_PLAYER_TYPES.ASSIGNING);
    });

    it("identifies Head Coach, Owner, and General Manager as assigning player type", () => {
      expect(getTaskPlayerType({ role: "Head Coach" })).toBe(TASK_PLAYER_TYPES.ASSIGNING);
      expect(getTaskPlayerType({ role: "Owner" })).toBe(TASK_PLAYER_TYPES.ASSIGNING);
      expect(getTaskPlayerType({ role: "General Manager" })).toBe(TASK_PLAYER_TYPES.ASSIGNING);
    });

    it("identifies regular Sales and Coaches as assigned player type", () => {
      const salesUser = { role: "Sales", access: ["sales_dashboard", "sales_members"] };
      expect(canUserAssignTasks(salesUser)).toBe(false);
      expect(getTaskPlayerType(salesUser)).toBe(TASK_PLAYER_TYPES.ASSIGNED);

      const coachUser = { role: "Coach", access: ["coach_dashboard", "coach_members"] };
      expect(canUserAssignTasks(coachUser)).toBe(false);
      expect(getTaskPlayerType(coachUser)).toBe(TASK_PLAYER_TYPES.ASSIGNED);
    });

    it("identifies users with explicit transfer grant as assigning player type", () => {
      const userWithGrant = { role: "Accountant", access: ["transfer"] };
      expect(canUserAssignTasks(userWithGrant)).toBe(true);
      expect(getTaskPlayerType(userWithGrant)).toBe(TASK_PLAYER_TYPES.ASSIGNING);
    });
  });
});
