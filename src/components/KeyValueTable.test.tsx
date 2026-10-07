import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { providers, tz } from "../test/utils.tsx";
import { type KeyValueRow, KeyValueTable } from "./KeyValueTable.tsx";

const ROWS: KeyValueRow[] = [
  { key: "persist.a", value: "1" },
  { key: "ro.b", value: "two\nlines" },
  { key: "sys.c", value: "" },
];

function show(patch: Partial<Parameters<typeof KeyValueTable<KeyValueRow>>[0]> = {}) {
  const props = {
    rows: ROWS,
    loading: false,
    loadingText: "加载中",
    error: null,
    emptyText: "没有结果",
    canEdit: (r: KeyValueRow) => !r.key.startsWith("ro."),
    onEdit: vi.fn(),
    ...patch,
  };
  render(<KeyValueTable {...props} />, { wrapper: providers() });
  return props;
}

const row = (key: string) => within(screen.getByText(key).closest("li") as HTMLElement);

describe("KeyValueTable", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("每行显示键名和值，值为空时显示空值提示", () => {
    show();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(row("persist.a").getByText("1")).toBeTruthy();
    expect(row("ro.b").getByText(/two\s+lines/)).toBeTruthy();
    expect(row("sys.c").getByText(tz("kv.emptyValue"))).toBeTruthy();
  });

  it("canEdit 为 false 的行没有修改按钮，点击修改传入该行", () => {
    const props = show();
    expect(row("ro.b").queryByRole("button", { name: tz("kv.edit", { key: "ro.b" }) })).toBeNull();
    fireEvent.click(row("persist.a").getByRole("button", { name: tz("kv.edit", { key: "persist.a" }) }));
    expect(props.onEdit).toHaveBeenCalledWith(ROWS[0]);
  });

  it("没有 onDelete 时不显示删除按钮，有时每行都显示", () => {
    const { unmount } = render(
      <KeyValueTable
        rows={ROWS}
        loading={false}
        loadingText=""
        error={null}
        emptyText=""
        canEdit={() => false}
        onEdit={() => {}}
      />,
      { wrapper: providers() },
    );
    expect(screen.queryByRole("button", { name: /^删除/ })).toBeNull();
    unmount();

    const onDelete = vi.fn();
    show({ onDelete });
    expect(screen.getAllByRole("button", { name: /^删除/ })).toHaveLength(3);
    fireEvent.click(row("sys.c").getByRole("button", { name: tz("kv.delete", { key: "sys.c" }) }));
    expect(onDelete).toHaveBeenCalledWith(ROWS[2]);
  });

  it("badge 显示在对应行", () => {
    show({ badge: (r) => (r.key.startsWith("ro.") ? <span>只读</span> : null) });
    expect(row("ro.b").getByText("只读")).toBeTruthy();
    expect(row("persist.a").queryByText("只读")).toBeNull();
  });

  it("拷贝键名和值，拷贝后短暂显示已拷贝", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    show();
    await act(async () =>
      fireEvent.click(row("ro.b").getByRole("button", { name: tz("kv.copyValue", { key: "ro.b" }) })),
    );
    expect(writeText).toHaveBeenCalledWith("two\nlines");
    expect(row("ro.b").getByRole("button", { name: tz("kv.copied") })).toBeTruthy();

    await act(async () => fireEvent.click(row("persist.a").getByRole("button", { name: tz("kv.copyKey") })));
    expect(writeText).toHaveBeenLastCalledWith("persist.a");
  });

  it("加载中、出错和空结果分别显示对应状态，不显示列表", () => {
    const { unmount } = render(
      <KeyValueTable
        rows={[]}
        loading
        loadingText="加载中"
        error={null}
        emptyText="没有结果"
        canEdit={() => true}
        onEdit={() => {}}
      />,
      { wrapper: providers() },
    );
    expect(screen.getByRole("status").textContent).toBe("加载中");
    unmount();

    show({ rows: [], error: "读取失败" });
    expect(screen.getByText("读取失败")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("没有数据时显示空结果提示", () => {
    show({ rows: [] });
    expect(screen.getByText("没有结果")).toBeTruthy();
  });
});
