import React from "react";
import ReactDOMServer from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import {
  toLocalDateString,
  parseDateBoundary,
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

  it("renders a MenuSelect instead of pill buttons or native select", () => {
    const vdom = PageSizeFilter({
      pageSize: 10,
      order: "first",
      options: DEFAULT_OPTIONS,
      onChange: vi.fn(),
    });

    expect(vdom.type).toBe("div");
    const menu = findMenuSelect(vdom);
    expect(menu).toBeDefined();
    expect(menu.props.size).toBe("sm");

    const children = React.Children.toArray(vdom.props.children);
    const nativeSelect = children.find((c) => c && c.type === "select");
    expect(nativeSelect).toBeUndefined();
    const buttons = children.filter((c) => c && c.type === "button");
    expect(buttons).toHaveLength(0);
  });

  it("matches Pagination MenuSelect size and compact styling", () => {
    const filterMenu = findMenuSelect(
      PageSizeFilter({
        pageSize: 10,
        order: "first",
        options: DEFAULT_OPTIONS,
        onChange: vi.fn(),
      })
    );

    const paginationMenu = findMenuSelect(
      Pagination({
        page: 1,
        totalPages: 5,
        total: 50,
        pageSize: 10,
        pageSizeOptions: DEFAULT_OPTIONS,
        onPageChange: vi.fn(),
        onPageSizeChange: vi.fn(),
      })
    );

    expect(filterMenu.props.size).toBe(paginationMenu.props.size);
    expect(filterMenu.props.size).toBe("sm");
    expect(filterMenu.props.style).toEqual(expect.objectContaining({ width: "auto" }));
    expect(paginationMenu.props.style).toEqual(expect.objectContaining({ width: "auto" }));
  });

  it("exposes First and Last grouped options on MenuSelect", () => {
    const menu = findMenuSelect(
      PageSizeFilter({
        pageSize: 20,
        order: "last",
        options: DEFAULT_OPTIONS,
        onChange: vi.fn(),
      })
    );

    expect(menu.props.value).toBe("last:20");
    const opts = menu.props.options;
    expect(opts.find((o) => o.value === "first:10")).toEqual(
      expect.objectContaining({ label: "First 10", group: "First" })
    );
    expect(opts.find((o) => o.value === "first:50")).toEqual(
      expect.objectContaining({ label: "First 50", group: "First" })
    );
    expect(opts.find((o) => o.value === "custom_prompt:first")).toEqual(
      expect.objectContaining({ label: "Custom First…", group: "First" })
    );
    expect(opts.find((o) => o.value === "last:20")).toEqual(
      expect.objectContaining({ label: "Last 20", group: "Last" })
    );
    expect(opts.find((o) => o.value === "custom_prompt:last")).toEqual(
      expect.objectContaining({ label: "Custom Last…", group: "Last" })
    );

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PageSizeFilter, {
        pageSize: 20,
        order: "last",
        options: DEFAULT_OPTIONS,
        onChange: vi.fn(),
      })
    );
    expect(html).toContain('class="page-size-filter"');
    expect(html).toContain("Last 20");
    expect(html).not.toContain("<select");
  });

  it("binds select value correctly based on order and pageSize props", () => {
    const menuFirst = findMenuSelect(PageSizeFilter({ pageSize: 30, order: "first", onChange: vi.fn() }));
    expect(menuFirst.props.value).toBe("first:30");

    const menuLast = findMenuSelect(PageSizeFilter({ pageSize: 50, order: "last", onChange: vi.fn() }));
    expect(menuLast.props.value).toBe("last:50");
  });

  it("invokes callback with (size, 'first', meta) when selecting First options", () => {
    const onChange = vi.fn();
    const menu = findMenuSelect(PageSizeFilter({ pageSize: 10, order: "first", onChange }));

    menu.props.onChange({ target: { value: "first:20" } });
    expect(onChange).toHaveBeenCalledWith(20, "first", { pageSize: 20, order: "first" });

    menu.props.onChange({ target: { value: "first:50" } });
    expect(onChange).toHaveBeenCalledWith(50, "first", { pageSize: 50, order: "first" });
  });

  it("invokes callback with (size, 'last', meta) when selecting Last options", () => {
    const onChange = vi.fn();
    const menu = findMenuSelect(PageSizeFilter({ pageSize: 10, order: "first", onChange }));

    menu.props.onChange({ target: { value: "last:10" } });
    expect(onChange).toHaveBeenCalledWith(10, "last", { pageSize: 10, order: "last" });

    menu.props.onChange({ target: { value: "last:30" } });
    expect(onChange).toHaveBeenCalledWith(30, "last", { pageSize: 30, order: "last" });
  });

  it("supports onPageSizeChange alias prop interchangeably with onChange", () => {
    const onPageSizeChange = vi.fn();
    const menu = findMenuSelect(PageSizeFilter({ pageSize: 10, order: "first", onPageSizeChange }));

    menu.props.onChange({ target: { value: "first:30" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(30, "first", { pageSize: 30, order: "first" });
  });

  it("supports pageSizeOptions alias prop interchangeably with options", () => {
    const menu = findMenuSelect(
      PageSizeFilter({
        pageSize: 15,
        order: "first",
        pageSizeOptions: [15, 45, 90],
        onChange: vi.fn(),
      })
    );
    expect(menu.props.value).toBe("first:15");
    expect(menu.props.options.find((o) => o.value === "first:15")?.label).toBe("First 15");
    expect(menu.props.options.find((o) => o.value === "first:45")?.label).toBe("First 45");
    expect(menu.props.options.find((o) => o.value === "first:90")?.label).toBe("First 90");
    expect(menu.props.options.find((o) => o.value === "last:15")?.label).toBe("Last 15");
  });

  it("handles custom size selection via prompt, clamping between 1 and 500", () => {
    const onChange = vi.fn();
    const menu = findMenuSelect(PageSizeFilter({ pageSize: 10, order: "first", onChange }));

    const originalPrompt = global.window?.prompt;
    try {
      global.window = global.window || {};

      global.window.prompt = vi.fn(() => "45");
      menu.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).toHaveBeenCalledWith(45, "first", { pageSize: 45, order: "first" });

      global.window.prompt = vi.fn(() => "999");
      menu.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).toHaveBeenCalledWith(500, "first", { pageSize: 500, order: "first" });

      global.window.prompt = vi.fn(() => "0");
      menu.props.onChange({ target: { value: "custom_prompt:last" } });
      expect(onChange).toHaveBeenCalledWith(1, "last", { pageSize: 1, order: "last" });

      onChange.mockClear();
      global.window.prompt = vi.fn(() => null);
      menu.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).not.toHaveBeenCalled();

      onChange.mockClear();
      global.window.prompt = vi.fn(() => "abc");
      menu.props.onChange({ target: { value: "custom_prompt:first" } });
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      if (originalPrompt) global.window.prompt = originalPrompt;
      else delete global.window?.prompt;
    }
  });

  it("displays Custom (X) option when pageSize is not in options list", () => {
    const menuFirst = findMenuSelect(
      PageSizeFilter({ pageSize: 25, order: "first", options: DEFAULT_OPTIONS, onChange: vi.fn() })
    );
    expect(menuFirst.props.value).toBe("custom:first");
    expect(menuFirst.props.options.find((o) => o.value === "custom:first")?.label).toBe(
      "First 25 (Custom)"
    );

    const menuLast = findMenuSelect(
      PageSizeFilter({ pageSize: 42, order: "last", options: DEFAULT_OPTIONS, onChange: vi.fn() })
    );
    expect(menuLast.props.value).toBe("custom:last");
    expect(menuLast.props.options.find((o) => o.value === "custom:last")?.label).toBe(
      "Last 42 (Custom)"
    );
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
    const menu = findMenuSelect(
      PageSizeFilter({
        pageSize: 20,
        showOrderOptions: false,
        options: DEFAULT_OPTIONS,
        onChange,
      })
    );
    expect(menu.props.value).toBe("20");
    expect(menu.props.options.every((o) => !o.group)).toBe(true);
    expect(menu.props.options.find((o) => o.value === "20")?.label).toBe("20");

    menu.props.onChange({ target: { value: "30" } });
    expect(onChange).toHaveBeenCalledWith(30, "first", { pageSize: 30, order: "first" });
  });
});

describe("Pagination component dropdown integration", () => {
  it("renders page info and per-page MenuSelect", () => {
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
    const menu = findMenuSelect(vdom);
    expect(menu).toBeDefined();
    expect(menu.props.value).toBe("10");

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
    expect(html).not.toContain("<select");
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

    const menu = findMenuSelect(vdom);

    const originalPrompt = global.window?.prompt;
    try {
      global.window = global.window || {};

      global.window.prompt = vi.fn(() => "75");
      menu.props.onChange({ target: { value: "custom" } });
      expect(onPageSizeChange).toHaveBeenCalledWith(75);

      global.window.prompt = vi.fn(() => "800");
      menu.props.onChange({ target: { value: "custom" } });
      expect(onPageSizeChange).toHaveBeenCalledWith(500);

      global.window.prompt = vi.fn(() => "0");
      menu.props.onChange({ target: { value: "custom" } });
      expect(onPageSizeChange).toHaveBeenCalledWith(1);

      onPageSizeChange.mockClear();
      global.window.prompt = vi.fn(() => null);
      menu.props.onChange({ target: { value: "custom" } });
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
