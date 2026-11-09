import { describe, expect, it } from "vitest";
import {
  assignChoices,
  buildCsv,
  canUserAssignTasks,
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
    subscriptions: extra.subscriptions || [{
      package: { name: "Gold Month" },
      salesManager: { name: "Manager Sara", role: "Sales Manager" },
      startDate: "2026-04-01T10:00:00.000Z",
      endDate: "2026-05-01T10:00:00.000Z",
    }],
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
      { role: "Coach Manager", access: ["coach_transfer"] },
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
    expect(canUserAssignTasks({ role: "Coach Manager" })).toBe(true);
    expect(canUserAssignTasks({ role: "General Manager" })).toBe(true);
    expect(canUserAssignTasks({ role: "Sales", access: ["transfer"] })).toBe(true);
    expect(canUserAssignTasks({ role: "Sales", access: [] })).toBe(false);
    expect(canUserAssignTasks({ role: "Coach", access: [] })).toBe(false);
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
});
