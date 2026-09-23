const classTime = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const formatClassTime = (date: Date) => classTime.format(date);
export const formatDateTime = (date: Date) => date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
export const formatMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
