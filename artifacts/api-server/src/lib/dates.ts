function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayString(): string {
  return toDateString(new Date());
}

// Week runs Sunday (0) to Saturday (6)
export function weekRange(ref: Date): { start: string; end: string } {
  const day = ref.getDay();
  const start = new Date(ref);
  start.setDate(ref.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toDateString(start), end: toDateString(end) };
}
