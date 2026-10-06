import type { ArchiveEntry } from "../types.ts";

/** 压缩包目录树的一个节点；path 相对压缩包根 */
export interface ArchiveNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  date?: string;
  link?: string;
  children: ArchiveNode[];
}

/** 目录树里可见的一行；depth 是缩进层级 */
export interface ArchiveRow {
  node: ArchiveNode;
  depth: number;
}

/** 整棵树的统计，不受展开状态影响 */
export interface ArchiveStats {
  files: number;
  dirs: number;
  /** 全部非目录条目解压后的大小之和，字节 */
  size: number;
}

const byName = (a: ArchiveNode, b: ArchiveNode) =>
  a.isDir === b.isDir
    ? a.name.localeCompare(b.name, "zh-CN", { numeric: true, sensitivity: "base" })
    : a.isDir
      ? -1
      : 1;

/** 把扁平的条目列表建成目录树；压缩包没有单独列出的中间目录会补上，每一层文件夹在前、按名称自然排序 */
export function archiveTree(entries: ArchiveEntry[]): ArchiveNode[] {
  const roots: ArchiveNode[] = [];
  const nodes = new Map<string, ArchiveNode>();

  /** 取路径对应的节点，不存在时按目录补建并挂到父级 */
  const ensure = (path: string): ArchiveNode => {
    const found = nodes.get(path);
    if (found) return found;
    const at = path.lastIndexOf("/");
    const node: ArchiveNode = { name: path.slice(at + 1), path, isDir: true, size: 0, children: [] };
    nodes.set(path, node);
    if (at < 0) roots.push(node);
    else {
      const parent = ensure(path.slice(0, at));
      // 有子项的一定是目录，即使压缩包把它记成了文件
      parent.isDir = true;
      parent.children.push(node);
    }
    return node;
  };

  for (const e of entries) {
    const node = ensure(e.path);
    node.isDir = e.isDir || node.children.length > 0;
    node.size = e.size;
    node.date = e.date;
    node.link = e.link;
  }

  const sort = (list: ArchiveNode[]) => {
    list.sort(byName);
    for (const n of list) sort(n.children);
  };
  sort(roots);
  return roots;
}

/** 整棵树的文件数、文件夹数和总大小 */
export function treeStats(tree: ArchiveNode[]): ArchiveStats {
  const stats: ArchiveStats = { files: 0, dirs: 0, size: 0 };
  const walk = (list: ArchiveNode[]) => {
    for (const n of list) {
      if (n.isDir) stats.dirs++;
      else {
        stats.files++;
        stats.size += n.size;
      }
      walk(n.children);
    }
  };
  walk(tree);
  return stats;
}

/** 按展开状态输出可见的行（前序），expanded 里是展开的文件夹路径 */
export function flattenTree(tree: ArchiveNode[], expanded: Set<string>): ArchiveRow[] {
  const rows: ArchiveRow[] = [];
  const walk = (list: ArchiveNode[], depth: number) => {
    for (const node of list) {
      rows.push({ node, depth });
      if (node.isDir && expanded.has(node.path)) walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return rows;
}
