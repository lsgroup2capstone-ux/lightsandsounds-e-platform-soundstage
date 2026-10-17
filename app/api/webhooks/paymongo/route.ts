import { handleWebhook } from "@/lib/server/payments/webhook"

export const runtime = "nodejs"
export async function POST(request: Request) {
  return handleWebhook(await request.text(), request.headers.get("paymongo-signature"))
}
