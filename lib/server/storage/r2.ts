import "server-only"
import { AwsClient } from "aws4fetch"
import { RequestError } from "../request-error"

const VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const
// Credentials are read on the server only; never add a NEXT_PUBLIC_ variant.
export function r2Config() {
  if (VARS.some(name => !process.env[name]?.trim())) throw new RequestError("File storage is not configured.", 503)
  const accountId = process.env.R2_ACCOUNT_ID!.trim(), bucket = process.env.R2_BUCKET!.trim()
  return {
    client: new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(), secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(), service: "s3", region: "auto", retries: 2 }),
    objectUrl: (key: string) => `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
  }
}
export function publicBaseUrl() {
  const value = process.env.R2_PUBLIC_URL?.trim()
  return value ? value.replace(/\/+$/, "") : null
}
async function presign(method: "PUT" | "GET", key: string, seconds: number, headers: Record<string, string> = {}, query = "") {
  const { client, objectUrl } = r2Config()
  const url = new URL(objectUrl(key) + query)
  url.searchParams.set("X-Amz-Expires", String(seconds))
  // allHeaders makes R2 reject a PUT whose Content-Type or Content-Length differs from the declared values.
  const signed = await client.sign(url.toString(), { method, headers, aws: { signQuery: true, allHeaders: true } })
  return { url: signed.url, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() }
}
export async function presignPut(key: string, type: string, size: number, seconds = 600) {
  const headers = { "Content-Type": type, "Content-Length": String(size) }
  return { ...(await presign("PUT", key, Math.min(seconds, 600), headers)), headers }
}
export function presignGet(key: string, seconds = 300, downloadName?: string) {
  const query = downloadName ? `?response-content-disposition=${encodeURIComponent(`inline; filename="${downloadName.replace(/["\\\r\n]/g, "_")}"`)}` : ""
  return presign("GET", key, Math.min(seconds, 300), {}, query)
}
export async function headObject(key: string) {
  const { client, objectUrl } = r2Config()
  const response = await client.fetch(objectUrl(key), { method: "HEAD" })
  if (response.status === 404) return null
  if (!response.ok) throw new Error("File storage check failed.")
  return { size: Number(response.headers.get("content-length") || 0), type: response.headers.get("content-type") || "" }
}
export async function deleteObject(key: string) {
  const { client, objectUrl } = r2Config()
  const response = await client.fetch(objectUrl(key), { method: "DELETE" })
  if (!response.ok && response.status !== 404) throw new Error(`R2 delete returned ${response.status}`)
}
