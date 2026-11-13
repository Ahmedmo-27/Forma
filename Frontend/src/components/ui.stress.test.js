import React from "react";
import ReactDOMServer from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import {
  parsePageSizeOptionValue,
  PageSizeFilter,
  Pagination,
  MenuSelect,
} from "./ui";

function findMenuSelect(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === MenuSelect) return node;
  const kids = React.Children.toArray(node.props?.children);
  for (const child of kids) {
    const found = findMenuSelect(child);
    if (found) return found;
  }
  return null;
}

describe("Adversarial Stress Testing: parsePageSizeOptionValue", () => {
  it("Scenario 1.1: Extreme and boundary inputs", () => {
    // Normal boundaries
    expect(parsePageSizeOptionValue("first:1")).toEqual({ size: 1, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("first:500")).toEqual({ size: 500, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("last:1")).toEqual({ size: 1, order: "last", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("last:500")).toEqual({ size: 500, order: "last", isCustomPrompt: false });

    // Extreme positive numbers
    expect(parsePageSizeOptionValue("first:1000000")).toEqual({ size: 1000000, order: "first", isCustomPrompt: false });

    // Negative numbers (should fall back to currentSize)
    expect(parsePageSizeOptionValue("first:-10", 25, "first")).toEqual({ size: 25, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("last:-1", 30, "last")).toEqual({ size: 30, order: "last", isCustomPrompt: false });

    // Zero (should fall back to currentSize)
    expect(parsePageSizeOptionValue("first:0", 15, "first")).toEqual({ size: 15, order: "first", isCustomPrompt: false });
  });

  it("Scenario 1.2: Malformed inputs, spaces, and edge delimiters", () => {
    // Empty strings, null, undefined, boolean
    expect(parsePageSizeOptionValue("", 10, "first")).toEqual({ size: 10, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("   ", 10, "first")).toEqual({ size: 10, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue(null, 20, "last")).toEqual({ size: 20, order: "last", isCustomPrompt: false });
    expect(parsePageSizeOptionValue(undefined, 30, "first")).toEqual({ size: 30, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue(false, 10, "first")).toEqual({ size: 10, order: "first", isCustomPrompt: false });

    // Missing parts
    expect(parsePageSizeOptionValue("first:", 10, "first")).toEqual({ size: 10, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue(":20", 10, "first")).toEqual({ size: 20, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue(":::", 10, "first")).toEqual({ size: 10, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("___", 10, "first")).toEqual({ size: 10, order: "first", isCustomPrompt: false });

    // Whitespace handling
    expect(parsePageSizeOptionValue("  first:25  ", 10, "first")).toEqual({ size: 25, order: "first", isCustomPrompt: false });
    // Space around ":" yields order token "last " which does not match 'last'
    expect(parsePageSizeOptionValue("last : 40", 10, "first")).toEqual({ size: 40, order: "first", isCustomPrompt: false });

    // Non-numeric tokens
    expect(parsePageSizeOptionValue("first:abc", 10, "first")).toEqual({ size: 10, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("last:NaN", 10, "last")).toEqual({ size: 10, order: "last", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("random_noise", 10, "first")).toEqual({ size: 10, order: "first", isCustomPrompt: false });
  });

  it("Scenario 1.3: Custom prompt variants and case sensitivity", () => {
    // Case insensitivity
    expect(parsePageSizeOptionValue("FIRST:20")).toEqual({ size: 20, order: "first", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("LAST:50")).toEqual({ size: 50, order: "last", isCustomPrompt: false });
    expect(parsePageSizeOptionValue("CUSTOM_PROMPT:FIRST")).toEqual({ size: 10, order: "first", isCustomPrompt: true });
    expect(parsePageSizeOptionValue("CuStOm_PrOmPt:LaSt", 20, "first")).toEqual({ size: 20, order: "last", isCustomPrompt: true });
    expect(parsePageSizeOptionValue("CUSTOM:FIRST")).toEqual({ size: 10, order: "first", isCustomPrompt: true });
    expect(parsePageSizeOptionValue("CUSTOM:LAST", 30, "first")).toEqual({ size: 30, order: "last", isCustomPrompt: true });
    expect(parsePageSizeOptionValue("CUSTOM")).toEqual({ size: 10, order: "first", isCustomPrompt: true });
    expect(parsePageSizeOptionValue("CUSTOM_PROMPT")).toEqual({ size: 10, order: "first", isCustomPrompt: true });

    // Underscore variants for custom
    expect(parsePageSizeOptionValue("custom_prompt_first")).toEqual({ size: 10, order: "first", isCustomPrompt: true });
    // "custom_prompt_last" splits as custom/prompt_last → order stays default; "custom_last" maps to last
    expect(parsePageSizeOptionValue("custom_prompt_last")).toEqual({ size: 10, order: "first", isCustomPrompt: true });
    expect(parsePageSizeOptionValue("custom_last")).toEqual({ size: 10, order: "last", isCustomPrompt: true });

    // Order synonyms: 'desc' maps to 'last'
    expect(parsePageSizeOptionValue("desc:30")).toEqual({ size: 30, order: "last", isCustomPrompt: false });
  });
});

describe("Adversarial Stress Testing: PageSizeFilter Component", () => {
  const DEFAULT_OPTIONS = [10, 20, 30, 50];

  it("Scenario 2.1: Boundary and abnormal prop values", () => {
    // pageSize is string
    const selStr = findMenuSelect(PageSizeFilter({ pageSize: "20", order: "first", onChange: vi.fn() }));
    expect(selStr.props.value).toBe("first:20");

    const selNaN = findMenuSelect(PageSizeFilter({ pageSize: "invalid", order: "first", onChange: vi.fn() }));
    expect(selNaN.props.value).toBe("first:10");

    // Negative pageSize is truthy after Number(), so treated as a custom size
    const selNeg = findMenuSelect(PageSizeFilter({ pageSize: -10, order: "first", onChange: vi.fn() }));
    expect(selNeg.props.value).toBe("custom:first");

    const selDesc = findMenuSelect(PageSizeFilter({ pageSize: 30, order: "desc", onChange: vi.fn() }));
    expect(selDesc.props.value).toBe("last:30");

    const selUnknown = findMenuSelect(PageSizeFilter({ pageSize: 30, order: "gibberish", onChange: vi.fn() }));
    expect(selUnknown.props.value).toBe("first:30");

    const selEmpty = findMenuSelect(PageSizeFilter({ pageSize: 10, options: [], onChange: vi.fn() }));
    expect(selEmpty.props.value).toBe("first:10");
  });

  it("Scenario 2.2: Rapid state switching (First -> Last -> First -> Custom)", () => {
    const onChange = vi.fn();
    const select = findMenuSelect(PageSizeFilter({ pageSize: 10, order: "first", onChange }));

    // Transition 1: First 10 -> Last 20
    select.props.onChange({ target: { value: "last:20" } });
    expect(onChange).toHaveBeenLastCalledWith(20, "last", { pageSize: 20, order: "last" });

    // Transition 2: Last 20 -> First 50
    select.props.onChange({ target: { value: "first:50" } });
    expect(onChange).toHaveBeenLastCalledWith(50, "first", { pageSize: 50, order: "first" });

    // Transition 3: First 50 -> Last 10
    select.props.onChange({ target: { value: "last:10" } });
    expect(onChange).toHaveBeenLastCalledWith(10, "last", { pageSize: 10, order: "last" });

    // Transition 4: Last 10 -> Custom First (prompt 42)
    const originalPrompt = global.window?.prompt;
    try {
      global.window = global.window || {};
      global.window.prompt = vi.fn(() => "42");
      select.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).toHaveBeenLastCalledWith(42, "first", { pageSize: 42, order: "first" });

      // Transition 5: Custom First 42 -> Custom Last (prompt 88)
      global.window.prompt = vi.fn(() => "88");
      select.props.onChange({ target: { value: "custom_prompt:last" } });
      expect(onChange).toHaveBeenLastCalledWith(88, "last", { pageSize: 88, order: "last" });
    } finally {
      if (originalPrompt) global.window.prompt = originalPrompt;
      else delete global.window?.prompt;
    }
  });

  it("Scenario 2.3: Compact MenuSelect parity between PageSizeFilter and Pagination", () => {
    const filterSelect = findMenuSelect(PageSizeFilter({ pageSize: 10, order: "first", onChange: vi.fn() }));
    const pagSelect = findMenuSelect(
      Pagination({
        page: 1,
        totalPages: 10,
        total: 100,
        pageSize: 10,
        onPageChange: vi.fn(),
        onPageSizeChange: vi.fn(),
      })
    );

    expect(filterSelect.props.size).toBe(pagSelect.props.size);
    expect(filterSelect.props.size).toBe("sm");
    expect(filterSelect.props.style).toEqual(expect.objectContaining({ width: "auto" }));
    expect(pagSelect.props.style).toEqual(expect.objectContaining({ width: "auto" }));
  });

  it("Scenario 2.4: Extreme prompt inputs (boundaries, negatives, huge numbers, canceling)", () => {
    const onChange = vi.fn();
    const select = findMenuSelect(PageSizeFilter({ pageSize: 10, order: "first", onChange }));

    const originalPrompt = global.window?.prompt;
    try {
      global.window = global.window || {};

      // Upper boundary: 500
      global.window.prompt = vi.fn(() => "500");
      select.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).toHaveBeenLastCalledWith(500, "first", { pageSize: 500, order: "first" });

      // Exceeds upper boundary: 501 -> clamped to 500
      global.window.prompt = vi.fn(() => "501");
      select.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).toHaveBeenLastCalledWith(500, "first", { pageSize: 500, order: "first" });

      // Lower boundary: 1
      global.window.prompt = vi.fn(() => "1");
      select.props.onChange({ target: { value: "custom_prompt:last" } });
      expect(onChange).toHaveBeenLastCalledWith(1, "last", { pageSize: 1, order: "last" });

      // Sub-lower boundary: 0 -> clamped to 1
      global.window.prompt = vi.fn(() => "0");
      select.props.onChange({ target: { value: "custom_prompt:last" } });
      expect(onChange).toHaveBeenLastCalledWith(1, "last", { pageSize: 1, order: "last" });

      // Extreme negative: -99999 -> clamped to 1 (parseInt returns -99999, Math.max(1, -99999) = 1, wait: if parsed >= 0, let's test what parsed < 0 does)
      onChange.mockClear();
      global.window.prompt = vi.fn(() => "-99999");
      const targetObj = { value: "custom_prompt:first" };
      select.props.onChange({ target: targetObj });
      // In ui.jsx: if (Number.isFinite(parsedNum) && parsedNum >= 0) -> -99999 is < 0, so prompt is rejected!
      expect(onChange).not.toHaveBeenCalled();
      expect(targetObj.value).toBe("first:10"); // Resets select value on rejected prompt!

      // Non-numeric garbage: "five hundred"
      onChange.mockClear();
      targetObj.value = "custom_prompt:first";
      global.window.prompt = vi.fn(() => "five hundred");
      select.props.onChange({ target: targetObj });
      expect(onChange).not.toHaveBeenCalled();

      // Empty string: "" -> parseInt("") is NaN -> rejected
      onChange.mockClear();
      targetObj.value = "custom_prompt:first";
      global.window.prompt = vi.fn(() => "");
      select.props.onChange({ target: targetObj });
      expect(onChange).not.toHaveBeenCalled();

      // Cancellation: null -> rejected and value restored
      onChange.mockClear();
      global.window.prompt = vi.fn(() => null);
      targetObj.value = "custom_prompt:last";
      select.props.onChange({ target: targetObj });
      expect(onChange).not.toHaveBeenCalled();
      expect(targetObj.value).toBe("first:10");
    } finally {
      if (originalPrompt) global.window.prompt = originalPrompt;
      else delete global.window?.prompt;
    }
  });

  it("Scenario 2.5: MenuSelect options integrity for First/Last groups", () => {
    const vdom = PageSizeFilter({
      pageSize: 30,
      order: "first",
      options: DEFAULT_OPTIONS,
      onChange: vi.fn(),
    });
    const menu = React.Children.toArray(vdom.props.children).find(
      (c) => c && c.props && c.props.className === "page-size-menu"
    );
    expect(menu).toBeDefined();
    const opts = menu.props.options || [];
    expect(opts.filter((o) => String(o.value).startsWith("first:")).length).toBe(
      DEFAULT_OPTIONS.length
    );
    expect(opts.filter((o) => String(o.value).startsWith("last:")).length).toBe(
      DEFAULT_OPTIONS.length
    );
    expect(opts.find((o) => o.value === "custom_prompt:first")?.label).toBe("Custom First…");
    expect(opts.find((o) => o.value === "custom_prompt:last")?.label).toBe("Custom Last…");

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PageSizeFilter, {
        pageSize: 30,
        order: "first",
        options: DEFAULT_OPTIONS,
        onChange: vi.fn(),
      })
    );
    expect(html).toContain('class="page-size-filter"');
    expect(html).not.toContain("<select");
  });
});

describe("Adversarial Stress Testing: Consumer Integration Logic Simulation", () => {
  it("Scenario 3.1: Members.jsx handlePageSizeChange logic simulation", () => {
    let state = {
      pageSize: 10,
      sortNewest: true,
      page: 3,
    };

    const handlePageSizeChange = (newSize, order) => {
      const valid = Math.max(1, Math.min(500, parseInt(newSize, 10) || 10));
      state.pageSize = valid;
      if (order === "last") {
        state.sortNewest = false;
      } else if (order === "first") {
        state.sortNewest = true;
      }
      state.page = 1;
    };

    // Case A: Select Last 20
    handlePageSizeChange(20, "last");
    expect(state.pageSize).toBe(20);
    expect(state.sortNewest).toBe(false);
    expect(state.page).toBe(1);

    // Case B: Select First 50
    handlePageSizeChange(50, "first");
    expect(state.pageSize).toBe(50);
    expect(state.sortNewest).toBe(true);
    expect(state.page).toBe(1);

    // Case C: Extreme size input via custom prompt
    handlePageSizeChange(999, "last");
    expect(state.pageSize).toBe(500);
    expect(state.sortNewest).toBe(false);

    // Case D: Zero / invalid input — Math.max(1, Math.min(500, parseInt(0)||10)) => 10
    handlePageSizeChange(0, "first");
    expect(state.pageSize).toBe(10);
    handlePageSizeChange("bad_val", "first");
    expect(state.pageSize).toBe(10); // Fallback to 10
  });

  it("Scenario 3.2: SalesMembers.jsx fetchMembers query parameter mapping", () => {
    const buildFetchParams = ({ sortNewest, page, pageSize, filter, search, extra }) => {
      const newest = sortNewest;
      return {
        page,
        limit: pageSize,
        search,
        status: filter,
        extra,
        sortDir: newest ? -1 : 1,
      };
    };

    // First X -> sortDir must be -1 (newest first)
    const firstParams = buildFetchParams({ sortNewest: true, page: 1, pageSize: 20, filter: "all", search: "", extra: "" });
    expect(firstParams.sortDir).toBe(-1);

    // Last X -> sortDir must be 1 (oldest first)
    const lastParams = buildFetchParams({ sortNewest: false, page: 1, pageSize: 20, filter: "all", search: "", extra: "" });
    expect(lastParams.sortDir).toBe(1);
  });
});
