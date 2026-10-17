import { getFilesBaseUrl, mutate } from "./app-store"

export type UploadKind = "provider-document" | "profile-image" | "service-image"
const MAX_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
// Mirrors KIND_RULES in lib/server/file-keys.ts (server-only); the server re-checks every upload.
const RULES: Record<UploadKind, { types: string[]; message: string }> = {
  "provider-document": { types: ["application/pdf", "image/jpeg", "image/png"], message: "Use a PDF, JPG or PNG up to 5 MB." },
  "profile-image": { types: IMAGE_TYPES, message: "Use a JPG, PNG or WebP image up to 5 MB." },
  "service-image": { types: IMAGE_TYPES, message: "Use a JPG, PNG or WebP image up to 5 MB." },
}
const FAILED = "Upload failed. Please try again."

export async function uploadFile(kind: UploadKind, file: File, serviceId?: string): Promise<string> {
  const rules = RULES[kind]
  if (!rules.types.includes(file.type) || file.size <= 0 || file.size > MAX_BYTES) throw new Error(rules.message)
  const { key, url, headers } = await mutate<{ key: string; url: string; headers: Record<string, string> }>("createUploadUrl", [kind, { type: file.type, size: file.size, ...(serviceId ? { serviceId } : {}) }])
  // Browsers set Content-Length from the body and refuse it as a request header.
  const sent = Object.fromEntries(Object.entries(headers || {}).filter(([name]) => name.toLowerCase() !== "content-length"))
  let response: Response
  try { response = await fetch(url, { method: "PUT", headers: sent, body: file }) } catch { throw new Error(FAILED) }
  if (!response.ok) throw new Error(FAILED)
  return key
}

// data: values pass through until the plan 4 migration removes them; root-relative
// paths are bundled catalog images such as /images/pkg-band.webp.
export function publicFileUrl(value: string | undefined | null) {
  if (!value) return ""
  if (value.startsWith("data:") || (value.startsWith("/") && !value.startsWith("//"))) return value
  const base = getFilesBaseUrl()
  return base && value.startsWith("public/") ? `${base}/${value}` : ""
}
