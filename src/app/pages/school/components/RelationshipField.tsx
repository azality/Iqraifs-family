// RelationshipField — constrained relationship picker (pilot feedback:
// free text produced "fathr / fathre / fether"; bad data for a field
// that drives grouping and portal display). Fixed list + an "Other"
// escape hatch that reveals free text only when chosen. An existing
// value outside the list (legacy rows) renders as Other + that text.

import { useMemo } from "react";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

export const RELATIONSHIPS = [
  "Father",
  "Mother",
  "Guardian",
  "Grandfather",
  "Grandmother",
  "Uncle",
  "Aunt",
  "Brother",
  "Sister",
] as const;

const OTHER = "__other__";

export function RelationshipField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // Case-insensitive match so legacy "father" selects "Father".
  const canonical = useMemo(
    () => RELATIONSHIPS.find((r) => r.toLowerCase() === value.trim().toLowerCase()),
    [value],
  );
  const isOther = !!value.trim() && !canonical;

  return (
    <div className="space-y-1.5">
      <Select
        value={canonical ?? (isOther ? OTHER : "")}
        onValueChange={(v) => onChange(v === OTHER ? " " : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select relationship…" />
        </SelectTrigger>
        <SelectContent>
          {RELATIONSHIPS.map((r) => (
            <SelectItem key={r} value={r}>{r}</SelectItem>
          ))}
          <SelectItem value={OTHER}>Other…</SelectItem>
        </SelectContent>
      </Select>
      {isOther && (
        <Input
          autoFocus
          placeholder="Type the relationship (e.g. Stepfather)"
          value={value.trim() === "" ? "" : value === " " ? "" : value}
          onChange={(e) => onChange(e.target.value || " ")}
        />
      )}
    </div>
  );
}
