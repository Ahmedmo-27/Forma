import { describe, expect, it } from "vitest";
import {
  assignChoices,
  buildCsv,
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
});
