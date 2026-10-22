"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowUpDown, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type DataTableCellRenderer<TData extends Record<string, unknown>> =
  React.ComponentType<{
    row: TData
    value: unknown
  }>

export interface DataTableColumnConfig<
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  id?: string
  accessorKey?: string
  header?: string | React.ReactNode
  enableSorting?: boolean
  /** Custom cell UI (Badge, icons, formatted currency). Extract to `components/<entity>/cells/*.tsx`. */
  cell?: DataTableCellRenderer<TData>
  meta?: {
    headerClassName?: string
    cellClassName?: string
  }
}

export interface RowAction<TData> {
  id: string
  /** Visible label when no `icon`; also used as `aria-label` for icon-only actions. */
  label: string
  /** @deprecated Use `label`. Kept for backward compatibility. */
  header?: string
  onClick: (row: TData) => void
  /** Return true to leave this action out of a row (for example Delete on a row you may not delete). */
  hidden?: (row: TData) => boolean
  icon?: React.ReactNode
  variant?: "ghost" | "outline" | "destructive"
  size?: "default" | "sm" | "icon"
  className?: string
}

export interface DataTableProps<TData extends Record<string, unknown>> {
  columns: DataTableColumnConfig<TData>[]
  data: TData[]
  rowActions?: RowAction<TData>[]
  loading?: boolean
  pagination?: boolean
  globalSearch?: boolean
  pageSize?: number
  loadingMessage?: string
  emptyMessage?: string
}

function formatCellValue(value: unknown): React.ReactNode {
  if (value == null || value === "") return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return String(value)
}

export function DataTable<TData extends Record<string, unknown>>({
  columns,
  data,
  rowActions,
  loading,
  pagination = false,
  globalSearch = false,
  pageSize = 10,
  loadingMessage = "Loading…",
  emptyMessage = "No results.",
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")

  const columnDefs = React.useMemo<ColumnDef<TData>[]>(() => {
    const defs: ColumnDef<TData>[] = columns.map((col) => {
      const id = (col.id ?? col.accessorKey) as string
      const accessorKey = col.accessorKey ?? id
      const CellRenderer = col.cell

      return {
        id,
        accessorKey,
        header: ({ column }) => {
          if (typeof col.header === "string" && col.enableSorting !== false) {
            return (
              <Button
                variant="ghost"
                className="-ml-3 h-8"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
              >
                {col.header}
                <ArrowUpDown className="ml-2 size-4 opacity-50" />
              </Button>
            )
          }
          return col.header ?? id
        },
        cell: ({ row }) => {
          const value = row.getValue(accessorKey)
          if (CellRenderer) {
            return <CellRenderer row={row.original} value={value} />
          }
          return formatCellValue(value)
        },
        enableSorting: col.enableSorting !== false,
        meta: col.meta,
      }
    })

    if (rowActions?.length) {
      defs.push({
        id: "__actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {rowActions.map((action) => {
              if (action.hidden?.(row.original)) return null
              const actionLabel = action.label ?? action.header ?? action.id
              return (
                <Button
                  key={action.id}
                  variant={action.variant ?? "ghost"}
                  size={action.size ?? (action.icon ? "icon" : "sm")}
                  type="button"
                  className={action.className}
                  aria-label={action.icon ? actionLabel : undefined}
                  onClick={() => action.onClick(row.original)}
                >
                  {action.icon ?? actionLabel}
                </Button>
              )
            })}
          </div>
        ),
        enableSorting: false,
      })
    }

    return defs
  }, [columns, rowActions])

  const table = useReactTable({
    data: Array.isArray(data) ? data : [],
    columns: columnDefs,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    initialState: pagination
      ? { pagination: { pageSize } }
      : undefined,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? "").toLowerCase().trim()
      if (!q) return true
      return Object.values(row.original).some((v) =>
        String(v ?? "").toLowerCase().includes(q)
      )
    },
  })

  return (
    <div className="space-y-3">
      {globalSearch ? (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8"
          />
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta as
                    | DataTableColumnConfig<TData>["meta"]
                    | undefined
                  return (
                    <TableHead
                      key={h.id}
                      className={meta?.headerClassName}
                    >
                      {h.isPlaceholder
                        ? null
                        : flexRender(
                            h.column.columnDef.header,
                            h.getContext(),
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columnDefs.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {loadingMessage}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | DataTableColumnConfig<TData>["meta"]
                      | undefined
                    return (
                      <TableCell
                        key={cell.id}
                        className={meta?.cellClassName}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columnDefs.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && table.getPageCount() > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  )
}
