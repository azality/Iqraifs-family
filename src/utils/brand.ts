// The platform's name - the company - which is never the same thing as a
// school's own name. Schools keep their names; the platform is credited.
export const PLATFORM_NAME = "ILM Network";

export function schoolTabTitle(schoolName: string): string {
  return `${schoolName} · ${PLATFORM_NAME}`;
}
