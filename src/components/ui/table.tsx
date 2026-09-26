import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * A wide table must scroll inside its OWN container — the page body never
 * scrolls horizontally. `Table` therefore always ships its own
 * `overflow-x-auto` wrapper rather than relying on every call site to
 * remember one.
 *
 * Numeric cells take `numeric`, which both right-aligns them and applies
 * `.tabular` (tabular figures). That pairing is the whole point: a right-
 * aligned column of proportional digits still fails to line up, so the two
 * are one decision, not two.
 */
export function Table({ className = "", children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${className}`} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className = "", children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-surface-subtle ${className}`} {...rest}>
      {children}
    </thead>
  );
}

export function TableBody({ className = "", children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  );
}

export function TableRow({ className = "", children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`border-b border-default last:border-0 ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function TableHead({
  numeric,
  className = "",
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-semibold whitespace-nowrap text-secondary-foreground ${
        numeric ? "text-right" : "text-left"
      } ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TableCell({
  numeric,
  className = "",
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={`px-3 py-2 text-foreground ${numeric ? "tabular text-right" : "text-left"} ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
