import { createHash } from "node:crypto"

export type FileKind = "provider-document" | "profile-image" | "service-image"
const MAX_BYTES = 5 * 1024 * 1024
// One place for D5 limits and the storage prefix of each upload kind.
export const KIND_RULES: Record<FileKind, { roles: string[]; types: string[]; maxBytes: number; prefix: string; message: string }> = {
  "provider-document": { roles: ["provider"], types: ["application/pdf", "image/jpeg", "image/png"], maxBytes: MAX_BYTES, prefix: "private/provider-docs", message: "Use a PDF, JPG or PNG up to 5 MB." },
  "profile-image": { roles: ["client", "provider"], types: ["image/jpeg", "image/png", "image/webp"], maxBytes: MAX_BYTES, prefix: "public/profile", message: "Use a JPG, PNG or WebP image up to 5 MB." },
  "service-image": { roles: ["provider"], types: ["image/jpeg", "image/png", "image/webp"], maxBytes: MAX_BYTES, prefix: "public/service", message: "Use a JPG, PNG or WebP image up to 5 MB." },
}
const EXTENSIONS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }

export const isFileKind = (kind: unknown): kind is FileKind => typeof kind === "string" && Object.hasOwn(KIND_RULES, kind)
export const isDataUrl = (value: unknown) => typeof value === "string" && value.trimStart().toLowerCase().startsWith("data:")
export function extFor(type: string) {
  const ext = EXTENSIONS[type]
  if (!ext) throw new Error("Unsupported file type.")
  return ext
}
// Hashed so public image URLs never contain an email address.
export const ownerSegment = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32)
export function buildKey(kind: FileKind, email: string, id: string, type: string) {
  if (!/^[a-f0-9-]{32,36}$/.test(id)) throw new Error("Invalid file id.")
  if (!KIND_RULES[kind].types.includes(type)) throw new Error(KIND_RULES[kind].message)
  return `${KIND_RULES[kind].prefix}/${ownerSegment(email)}/${id}.${extFor(type)}`
}
export function isOwnKey(kind: FileKind, email: string, key: unknown) {
  if (typeof key !== "string" || key.length > 200) return false
  const exts = [...new Set(KIND_RULES[kind].types.map(extFor))].join("|")
  return new RegExp(`^${KIND_RULES[kind].prefix}/${ownerSegment(email)}/[a-f0-9-]{32,36}\\.(${exts})$`).test(key)
}
