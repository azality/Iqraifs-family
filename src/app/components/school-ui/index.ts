// Public surface for the school-ui primitives. Consumers should import from
// this barrel:
//
//   import { HeroCard, KpiTile, AlertCard, StatusPill, DataTable,
//            severityClasses, statusClasses } from "../components/school-ui";

export { HeroCard } from "./HeroCard";
export type { HeroCardProps } from "./HeroCard";

export { KpiTile } from "./KpiTile";
export type { KpiTileProps } from "./KpiTile";

export { AlertCard } from "./AlertCard";
export type { AlertCardProps } from "./AlertCard";

export { StatusPill } from "./StatusPill";
export type { StatusPillProps } from "./StatusPill";

export { DataTable } from "./DataTable";
export type { DataTableProps, DataTableColumn } from "./DataTable";

export {
  severityClasses,
  statusClasses,
  heroGradient,
  heroBorder,
  cardBase,
  cardElev,
  accentBg,
  accentText,
  accentBorder,
  pageTitleClasses,
  sectionTitleClasses,
  mutedClasses,
} from "./tokens";
export type {
  Severity,
  Status,
  SeverityClassSet,
} from "./tokens";
