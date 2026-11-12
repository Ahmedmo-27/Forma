import React from "react";
import ReactDOMServer from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import {
  toLocalDateString,
  parseDateBoundary,
  parsePageSizeOptionValue,
  PageSizeFilter,
  Pagination,
} from "./ui";

describe("ui date and filter helpers", () => {
  it("formats Date objects and strings to YYYY-MM-DD locally without timezone shift", () => {
    const d = new Date(2026, 4, 15); // May 15, 2026 local
    expect(toLocalDateString(d)).toBe("2026-05-15");

    const janFirst = new Date(2026, 0, 1);
    expect(toLocalDateString(janFirst)).toBe("2026-01-01");

    expect(toLocalDateString("invalid")).toBe("");
  });

  it("parses date boundaries correctly for start and end of day", () => {
    const start = parseDateBoundary("2026-05-10", false);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(4);
    expect(start.getDate()).toBe(10);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);

    const end = parseDateBoundary("2026-05-10", true);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(4);
    expect(end.getDate()).toBe(10);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);

    expect(parseDateBoundary(null)).toBeNull();
    expect(parseDateBoundary("")).toBeNull();
  });
});

describe("parsePageSizeOptionValue helper", () => {
  it("parses colon-delimited first and last option values", () => {
    expect(parsePageSizeOptionValue("first:10")).toEqual({
      size: 10,
      order: "first",
      isCustomPrompt: false,
    });
    expect(parsePageSizeOptionValue("first:20")).toEqual({
      size: 20,
      order: "first",
      isCustomPrompt: false,
    });
    expect(parsePageSizeOptionValue("last:30")).toEqual({
      size: 30,
      order: "last",
      isCustomPrompt: false,
    });
    expect(parsePageSizeOptionValue("last:50")).toEqual({
      size: 50,
      order: "last",
      isCustomPrompt: false,
    });
  });

  it("parses underscore-delimited values seamlessly", () => {
    expect(parsePageSizeOptionValue("first_10")).toEqual({
      size: 10,
      order: "first",
      isCustomPrompt: false,
    });
    expect(parsePageSizeOptionValue("last_50")).toEqual({
      size: 50,
      order: "last",
      isCustomPrompt: false,
    });
  });

  it("identifies custom prompt triggers across delimiter formats", () => {
    expect(parsePageSizeOptionValue("custom_prompt:first")).toEqual({
      size: 10,
      order: "first",
      isCustomPrompt: true,
    });
    expect(parsePageSizeOptionValue("custom_prompt:last", 25, "last")).toEqual({
      size: 25,
      order: "last",
      isCustomPrompt: true,
    });
    expect(parsePageSizeOptionValue("custom:first")).toEqual({
      size: 10,
      order: "first",
      isCustomPrompt: true,
    });
    expect(parsePageSizeOptionValue("custom:last", 50, "last")).toEqual({
      size: 50,
      order: "last",
      isCustomPrompt: true,
    });
    expect(parsePageSizeOptionValue("custom")).toEqual({
      size: 10,
      order: "first",
      isCustomPrompt: true,
    });
    expect(parsePageSizeOptionValue("custom_prompt")).toEqual({
      size: 10,
      order: "first",
      isCustomPrompt: true,
    });
  });

  it("handles fallback and numeric values gracefully", () => {
    expect(parsePageSizeOptionValue("30", 10, "first")).toEqual({
      size: 30,
      order: "first",
      isCustomPrompt: false,
    });
    expect(parsePageSizeOptionValue(25, 10, "last")).toEqual({
      size: 25,
      order: "last",
      isCustomPrompt: false,
    });
    expect(parsePageSizeOptionValue(null, 20, "last")).toEqual({
      size: 20,
      order: "last",
      isCustomPrompt: false,
    });
    expect(parsePageSizeOptionValue(undefined, 15, "first")).toEqual({
      size: 15,
      order: "first",
      isCustomPrompt: false,
    });
    expect(parsePageSizeOptionValue("", 10, "first")).toEqual({
      size: 10,
      order: "first",
      isCustomPrompt: false,
    });
    expect(parsePageSizeOptionValue("invalid", 10, "first")).toEqual({
      size: 10,
      order: "first",
      isCustomPrompt: false,
    });
  });
});

describe("PageSizeFilter dropdown component", () => {
  const DEFAULT_OPTIONS = [10, 20, 30, 50];

  it("renders a dropdown <select> instead of pill buttons", () => {
    const vdom = PageSizeFilter({
      pageSize: 10,
      order: "first",
      options: DEFAULT_OPTIONS,
      onChange: vi.fn(),
    });

    expect(vdom.type).toBe("div");
    const children = React.Children.toArray(vdom.props.children);
    const select = children.find((c) => c && c.type === "select");
    expect(select).toBeDefined();

    // Verify no button pills are rendered
    const buttons = children.filter((c) => c && c.type === "button");
    expect(buttons).toHaveLength(0);
  });

  it("matches Pagination dropdown styling identically", () => {
    const filterVdom = PageSizeFilter({
      pageSize: 10,
      order: "first",
      options: DEFAULT_OPTIONS,
      onChange: vi.fn(),
    });
    const filterSelect = React.Children.toArray(filterVdom.props.children).find(
      (c) => c && c.type === "select"
    );

    const paginationVdom = Pagination({
      page: 1,
      totalPages: 5,
      total: 50,
      pageSize: 10,
      pageSizeOptions: DEFAULT_OPTIONS,
      onPageChange: vi.fn(),
      onPageSizeChange: vi.fn(),
    });
    // Find the select inside Pagination
    const pagBarChildren = React.Children.toArray(paginationVdom.props.children);
    const leftCluster = pagBarChildren[0];
    const leftChildren = React.Children.toArray(leftCluster.props.children);
    const perPageCluster = leftChildren.find(
      (c) => c && c.props && c.props.children && React.Children.toArray(c.props.children).some((ch) => ch && ch.type === "select")
    );
    const pagSelect = React.Children.toArray(perPageCluster.props.children).find((c) => c && c.type === "select");

    expect(filterSelect.props.style).toEqual(pagSelect.props.style);
    expect(filterSelect.props.style).toEqual({
      fontSize: 12,
      padding: "2px 8px",
      borderRadius: 6,
      border: "1px solid var(--border)",
      background: "var(--card)",
      color: "var(--t1)",
      cursor: "pointer",
      fontFamily: "inherit",
    });
  });

  it("renders serialized HTML with First and Last optgroups and correct options", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PageSizeFilter, {
        pageSize: 20,
        order: "last",
        options: DEFAULT_OPTIONS,
        onChange: vi.fn(),
      })
    );

    expect(html).toContain("<select");
    expect(html).toContain('<optgroup label="First">');
    expect(html).toContain('<optgroup label="Last">');

    // First options
    expect(html).toContain('<option value="first:10">First 10</option>');
    expect(html).toContain('<option value="first:20">First 20</option>');
    expect(html).toContain('<option value="first:30">First 30</option>');
    expect(html).toContain('<option value="first:50">First 50</option>');
    expect(html).toContain('<option value="custom_prompt:first">Custom First…</option>');

    // Last options
    expect(html).toContain('<option value="last:10">Last 10</option>');
    expect(html).toContain('<option value="last:20" selected="">Last 20</option>');
    expect(html).toContain('<option value="last:30">Last 30</option>');
    expect(html).toContain('<option value="last:50">Last 50</option>');
    expect(html).toContain('<option value="custom_prompt:last">Custom Last…</option>');
  });

  it("binds select value correctly based on order and pageSize props", () => {
    const vdomFirst = PageSizeFilter({ pageSize: 30, order: "first", onChange: vi.fn() });
    const selectFirst = React.Children.toArray(vdomFirst.props.children).find((c) => c.type === "select");
    expect(selectFirst.props.value).toBe("first:30");

    const vdomLast = PageSizeFilter({ pageSize: 50, order: "last", onChange: vi.fn() });
    const selectLast = React.Children.toArray(vdomLast.props.children).find((c) => c.type === "select");
    expect(selectLast.props.value).toBe("last:50");
  });

  it("invokes callback with (size, 'first', meta) when selecting First options", () => {
    const onChange = vi.fn();
    const vdom = PageSizeFilter({ pageSize: 10, order: "first", onChange });
    const select = React.Children.toArray(vdom.props.children).find((c) => c.type === "select");

    select.props.onChange({ target: { value: "first:20" } });
    expect(onChange).toHaveBeenCalledWith(20, "first", { pageSize: 20, order: "first" });

    select.props.onChange({ target: { value: "first:50" } });
    expect(onChange).toHaveBeenCalledWith(50, "first", { pageSize: 50, order: "first" });
  });

  it("invokes callback with (size, 'last', meta) when selecting Last options", () => {
    const onChange = vi.fn();
    const vdom = PageSizeFilter({ pageSize: 10, order: "first", onChange });
    const select = React.Children.toArray(vdom.props.children).find((c) => c.type === "select");

    select.props.onChange({ target: { value: "last:10" } });
    expect(onChange).toHaveBeenCalledWith(10, "last", { pageSize: 10, order: "last" });

    select.props.onChange({ target: { value: "last:30" } });
    expect(onChange).toHaveBeenCalledWith(30, "last", { pageSize: 30, order: "last" });
  });

  it("supports onPageSizeChange alias prop interchangeably with onChange", () => {
    const onPageSizeChange = vi.fn();
    const vdom = PageSizeFilter({ pageSize: 10, order: "first", onPageSizeChange });
    const select = React.Children.toArray(vdom.props.children).find((c) => c.type === "select");

    select.props.onChange({ target: { value: "first:30" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(30, "first", { pageSize: 30, order: "first" });
  });

  it("supports pageSizeOptions alias prop interchangeably with options", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PageSizeFilter, {
        pageSize: 15,
        order: "first",
        pageSizeOptions: [15, 45, 90],
        onChange: vi.fn(),
      })
    );
    expect(html).toContain('<option value="first:15" selected="">First 15</option>');
    expect(html).toContain('<option value="first:45">First 45</option>');
    expect(html).toContain('<option value="first:90">First 90</option>');
    expect(html).toContain('<option value="last:15">Last 15</option>');
  });

  it("handles custom size selection via prompt, clamping between 1 and 500", () => {
    const onChange = vi.fn();
    const vdom = PageSizeFilter({ pageSize: 10, order: "first", onChange });
    const select = React.Children.toArray(vdom.props.children).find((c) => c.type === "select");

    const originalPrompt = global.window?.prompt;
    try {
      global.window = global.window || {};

      // Standard custom input: 45
      global.window.prompt = vi.fn(() => "45");
      select.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).toHaveBeenCalledWith(45, "first", { pageSize: 45, order: "first" });

      // Clamped high input: 999 -> 500
      global.window.prompt = vi.fn(() => "999");
      select.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).toHaveBeenCalledWith(500, "first", { pageSize: 500, order: "first" });

      // Clamped low input: 0 -> 1
      global.window.prompt = vi.fn(() => "0");
      select.props.onChange({ target: { value: "custom_prompt:last" } });
      expect(onChange).toHaveBeenCalledWith(1, "last", { pageSize: 1, order: "last" });

      // Cancel prompt: null -> callback not called
      onChange.mockClear();
      global.window.prompt = vi.fn(() => null);
      select.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).not.toHaveBeenCalled();

      // Non-numeric prompt: "abc" -> callback not called
      onChange.mockClear();
      global.window.prompt = vi.fn(() => "abc");
      select.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      if (originalPrompt) global.window.prompt = originalPrompt;
      else delete global.window?.prompt;
    }
  });

  it("displays Custom (X) option when pageSize is not in options list", () => {
    const vdomFirst = PageSizeFilter({ pageSize: 25, order: "first", options: DEFAULT_OPTIONS, onChange: vi.fn() });
    const selectFirst = React.Children.toArray(vdomFirst.props.children).find((c) => c.type === "select");
    expect(selectFirst.props.value).toBe("custom:first");

    const htmlFirst = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PageSizeFilter, { pageSize: 25, order: "first", options: DEFAULT_OPTIONS, onChange: vi.fn() })
    );
    expect(htmlFirst).toContain('<option value="custom:first" selected="">First 25 (Custom)</option>');

    const htmlLast = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PageSizeFilter, { pageSize: 42, order: "last", options: DEFAULT_OPTIONS, onChange: vi.fn() })
    );
    expect(htmlLast).toContain('<option value="custom:last" selected="">Last 42 (Custom)</option>');
  });

  it("renders custom label when provided or hides label when null", () => {
    const vdomWithLabel = PageSizeFilter({ label: "Items per view:", onChange: vi.fn() });
    const labelSpan = React.Children.toArray(vdomWithLabel.props.children).find((c) => c && c.type === "span");
    expect(labelSpan).toBeDefined();
    expect(labelSpan.props.children).toBe("Items per view:");

    const vdomNoLabel = PageSizeFilter({ label: null, onChange: vi.fn() });
    const noLabelSpan = React.Children.toArray(vdomNoLabel.props.children).find((c) => c && c.type === "span");
    expect(noLabelSpan).toBeUndefined();
  });

  it("supports single-order mode when showOrderOptions is false", () => {
    const onChange = vi.fn();
    const vdom = PageSizeFilter({
      pageSize: 20,
      showOrderOptions: false,
      options: DEFAULT_OPTIONS,
      onChange,
    });
    const select = React.Children.toArray(vdom.props.children).find((c) => c.type === "select");
    expect(select.props.value).toBe(20);

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PageSizeFilter, {
        pageSize: 20,
        showOrderOptions: false,
        options: DEFAULT_OPTIONS,
        onChange,
      })
    );
    expect(html).not.toContain("<optgroup");
    expect(html).toContain('<option value="20" selected="">20</option>');

    select.props.onChange({ target: { value: "30" } });
    expect(onChange).toHaveBeenCalledWith(30, "first", { pageSize: 30, order: "first" });
  });
});

describe("Pagination component dropdown integration", () => {
  it("renders page info and per-page dropdown matching PageSizeFilter styling", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const vdom = Pagination({
      page: 1,
      totalPages: 10,
      total: 100,
      pageSize: 10,
      pageSizeOptions: [10, 20, 30, 50],
      onPageChange,
      onPageSizeChange,
    });

    expect(vdom).not.toBeNull();
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(Pagination, {
        page: 1,
        totalPages: 10,
        total: 100,
        pageSize: 10,
        pageSizeOptions: [10, 20, 30, 50],
        onPageChange,
        onPageSizeChange,
      })
    );
    expect(html).toContain("1–10 of 100");
    expect(html).toContain("Per page:");
    expect(html).toContain('<option value="10" selected="">10</option>');
  });

  it("handles custom size selection in Pagination prompt clamped to 1-500", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const vdom = Pagination({
      page: 1,
      totalPages: 10,
      total: 100,
      pageSize: 10,
      pageSizeOptions: [10, 20, 30, 50],
      onPageChange,
      onPageSizeChange,
    });

    const pagBarChildren = React.Children.toArray(vdom.props.children);
    const leftChildren = React.Children.toArray(pagBarChildren[0].props.children);
    const perPageCluster = leftChildren.find(
      (c) => c && c.props && c.props.children && React.Children.toArray(c.props.children).some((ch) => ch && ch.type === "select")
    );
    const select = React.Children.toArray(perPageCluster.props.children).find((c) => c && c.type === "select");

    const originalPrompt = global.window?.prompt;
    try {
      global.window = global.window || {};

      // Standard custom input: 75
      global.window.prompt = vi.fn(() => "75");
      select.props.onChange({ target: { value: "custom" } });
      expect(onPageSizeChange).toHaveBeenCalledWith(75);

      // High clamping: 800 -> 500
      global.window.prompt = vi.fn(() => "800");
      select.props.onChange({ target: { value: "custom" } });
      expect(onPageSizeChange).toHaveBeenCalledWith(500);

      // Low clamping: 0 -> 1
      global.window.prompt = vi.fn(() => "0");
      select.props.onChange({ target: { value: "custom" } });
      expect(onPageSizeChange).toHaveBeenCalledWith(1);

      // Cancel: null
      onPageSizeChange.mockClear();
      global.window.prompt = vi.fn(() => null);
      select.props.onChange({ target: { value: "custom" } });
      expect(onPageSizeChange).not.toHaveBeenCalled();
    } finally {
      if (originalPrompt) global.window.prompt = originalPrompt;
      else delete global.window?.prompt;
    }
  });

  it("normalizes legacy label 'Show first:' to 'Show:' in PageSizeFilter", () => {
    const vdom = PageSizeFilter({
      pageSize: 10,
      label: "Show first:",
      showOrderOptions: true,
      onChange: vi.fn(),
    });
    const labelSpan = React.Children.toArray(vdom.props.children).find((c) => c && c.type === "span");
    expect(labelSpan.props.children).toBe("Show:");
  });
});
