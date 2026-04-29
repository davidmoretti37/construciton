type ClassValue = string | number | false | null | undefined | ClassValue[];

export function cn(...args: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue): void => {
    if (!v && v !== 0) return;
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    out.push(String(v));
  };
  for (const arg of args) walk(arg);
  return out.join(" ");
}
