import {
  Children,
  forwardRef,
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { cn } from '../../utils/cn';

/**
 * Table primitives.
 *
 * Every wrapper here re-emits `children` into a host element. That round trip
 * silently breaks a React optimisation:
 *
 *   <TableRow><TableHead>A</TableHead><TableHead>B</TableHead></TableRow>
 *
 * compiles to `jsxs(...)`, the "static children" form, which tells React to
 * skip key validation. Re-emitting the same array from inside `TableRow` goes
 * through plain `jsx(...)`, which *does* validate -- so React logs
 *
 *   Each child in a list should have a unique "key" prop
 *
 * for every table in the app, even though the JSX was written by hand and is
 * perfectly correct.
 *
 * `Children.toArray` is the fix: it walks the array and assigns each element a
 * stable derived key, so validation passes without every call site having to
 * hand-write keys on static markup.
 */

const keyed = (children: React.ReactNode) => Children.toArray(children);

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
      <table className={cn('ledger-table', className)} {...props}>
        {keyed(children)}
      </table>
    </div>
  );
}

export function TableHeader({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn(className)} {...props}>
      {keyed(children)}
    </thead>
  );
}

export function TableBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn(className)} {...props}>
      {keyed(children)}
    </tbody>
  );
}

export function TableRow({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn(className)} {...props}>
      {keyed(children)}
    </tr>
  );
}

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  function TableHead({ className, children, ...props }, ref) {
    return (
      <th ref={ref} scope="col" className={cn(className)} {...props}>
        {keyed(children)}
      </th>
    );
  }
);

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, children, ...props }, ref) {
    return (
      <td ref={ref} className={cn(className)} {...props}>
        {keyed(children)}
      </td>
    );
  }
);

/** Key/value row used on detail panels. */
