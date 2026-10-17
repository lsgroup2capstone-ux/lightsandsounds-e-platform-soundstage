export function normalizePhilippineMobile(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "")
  const phone = compact.startsWith("09") ? `+63${compact.slice(1)}` : compact.startsWith("639") ? `+${compact}` : compact
  if (!/^\+639\d{9}$/.test(phone)) throw new Error("Enter a Philippine mobile number, such as 09171234567 or +639171234567.")
  return phone
}
