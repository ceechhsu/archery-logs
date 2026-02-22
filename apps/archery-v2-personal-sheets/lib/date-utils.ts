const SF_TIME_ZONE = "America/Los_Angeles";

export function dateIsoInSf(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SF_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

export function sfMonthLabel(year: number, monthZeroBased: number): string {
  // Use the 15th of the month safely in UTC so timezone offset shifts don't change the month
  const utcDate = new Date(Date.UTC(year, monthZeroBased, 15));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SF_TIME_ZONE,
    month: "long",
    year: "numeric"
  }).format(utcDate);
}
