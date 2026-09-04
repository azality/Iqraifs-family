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
  /** Below `sm`, render rows as stacked label/value cards instead of a
   *  sideways-scrolling table (design standard rule 6). Default on. */
  mobileCards?: boolean;
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
  mobileCards = true,
}: DataTableProps<T>) {
  const clickable = Boolean(onRowClick);
  const totalCols = columns.length + (rankColumn ? 1 : 0) + (clickable ? 1 : 0);

  // Phone layout: a multi-column table on a 390px screen shows ~2 columns
  // and hides the actions behind a horizontal scroll nobody discovers.
  // Stack each row into a card instead: first column is the title, the
  // rest become label/value lines (empty values skipped).
  const cardList = mobileCards ? (
    <div className="sm:hidden">
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        rows.map((row, idx) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={
              "space-y-1.5 border-b border-slate-100 px-4 py-3 " +
              (clickable ? "cursor-pointer active:bg-indigo-50/40" : "")
            }
          >
            {columns.map((c, i) => {
              const content = c.cell
                ? c.cell(row)
                : (row as Record<string, ReactNode>)[String(c.key)];
              if (content === null || content === undefined || content === "") return null;
              if (i === 0) {
                return (
                  <div key={String(c.key) + ":" + i} className="text-sm font-medium text-slate-900">
                    {rankColumn && (
                      <span className="mr-2 text-xs text-slate-400 tabular-nums">{idx + 1}</span>
                    )}
                    {content}
                  </div>
                );
              }
              return (
                <div key={String(c.key) + ":" + i} className="flex items-start justify-between gap-3 text-sm">
                  <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {c.header}
                  </span>
                  <div className="min-w-0 text-right text-slate-700">{content}</div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  ) : null;

  const table = (
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

  if (!mobileCards) return table;
  return (
    <>
      {cardList}
      <div className="hidden sm:block">{table}</div>
    </>
  );
}
