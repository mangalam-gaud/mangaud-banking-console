/*
 * The UI kit.
 *
 * Everything exported here has at least one caller. Several components that used
 * to be re-exported were removed because nothing rendered them -- `Drawer` (the
 * sidebar's drawer is hand-rolled in Sidebar.tsx, which needs different
 * behaviour: sticky on desktop, overlay below), `DataRow`, `TabsGroup`, and the
 * seven composite `Skeleton*` variants, which every page replaced with the base
 * `Skeleton` and explicit layout. A second `Select` also existed in its own
 * file, styled against pre-token Tailwind colours; the one in `Input.tsx` is the
 * live component.
 */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export {
  Input,
  Select,
  Textarea,
  Checkbox,
  type InputProps,
  type SelectProps,
} from './Input';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  StatTile,
  EmptyState,
} from './Card';
export { Badge, StatusBadge, type BadgeVariant, type BadgeSize } from './Badge';
export { Modal, type ModalProps } from './Modal';
export { Switch } from './Switch';
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './Table';
export { Skeleton } from './Skeleton';
export { Tabs, type TabItem } from './Tabs';
export { PageHeader } from './PageHeader';