// Dense data-grid wrapper. Composes the shadcn `Table` primitive but applies
// the franchise look (compact rows, subtle borders, header uppercase tracking,
// hover state, optional sticky header & rank column).

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "../ui/table";

export interface DataTableColumn<T> {
  key: keyof T | string;
  header: ReactNode;
  /** Tailwind width class or inline px width (e.g. "w-32" or "120px"). */
  width?: string;
  align?: "left" | "right" | "center";
  cell?: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  stickyHeader?: boolean;
  /** Adds a leading # column with row index. */
  rankColumn?: boolean;
  caption?: string;
  className?: string;
}

function alignCls(a?: "left" | "right" | "center"): string {
  if (a === "right") return "text-right";
  if (a === "center") return "text-center";
  return "text-left";
}

function widthStyle(width?: string): { style?: React.CSSProperties; cls?: string } {
  if (!width) return {};
  // Tailwind class heuristic: starts with w- / min-w- / max-w-
  if (/^(w-|min-w-|max-w-)/.test(width)) {
    return { cls: width };
  }
  return { style: { width } };
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = "No data.",
  stickyHeader,
  rankColumn,
  caption,
  className,
}: DataTableProps<T>) {
  const clickable = Boolean(onRowClick);
  const totalCols = columns.length + (rankColumn ? 1 : 0) + (clickable ? 1 : 0);

  return (
    <Table className={className}>
      {caption && <TableCaption>{caption}</TableCaption>}
      <TableHeader
        className={
          stickyHeader ? "sticky top-0 z-10 bg-slate-50" : "bg-slate-50"
        }
      >
        <TableRow className="border-b border-slate-200 hover:bg-slate-50">
          {rankColumn && (
            <TableHead className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 w-10">
              #
            </TableHead>
          )}
          {columns.map((c, i) => {
            const { style, cls } = widthStyle(c.width);
            return (
              <TableHead
                key={String(c.key) + ":" + i}
                style={style}
                className={
                  "px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 " +
                  alignCls(c.align) +
                  (cls ? " " + cls : "")
                }
              >
                {c.header}
              </TableHead>
            );
          })}
          {clickable && <TableHead className="w-8 px-3 py-2" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={totalCols}
              className="px-3 py-8 text-center text-sm text-slate-500"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, idx) => (
            <TableRow
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={
                "group border-b border-slate-100 transition " +
                (clickable
                  ? "cursor-pointer hover:bg-slate-50"
                  : "hover:bg-slate-50")
              }
            >
              {rankColumn && (
                <TableCell className="px-3 py-2.5 text-xs text-slate-500 tabular-nums">
                  {idx + 1}
                </TableCell>
              )}
              {columns.map((c, i) => {
                const { style, cls } = widthStyle(c.width);
                const content = c.cell
                  ? c.cell(row)
                  : (row as Record<string, ReactNode>)[String(c.key)];
                return (
                  <TableCell
                    key={String(c.key) + ":" + i}
                    style={style}
                    className={
                      "px-3 py-2.5 text-sm text-slate-700 " +
                      alignCls(c.align) +
                      (cls ? " " + cls : "")
                    }
                  >
                    {content}
                  </TableCell>
                );
              })}
              {clickable && (
                <TableCell className="px-3 py-2.5 text-right">
                  <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
