import { NextResponse } from "next/server"
import { execute } from "@/lib/server/data-service"
import { verifyWebhook } from "@/lib/server/payments/paymongo"

export const runtime = "nodejs"
export async function POST(request: Request) {
  try {
    const raw = await request.text()
    if (raw.length > 1000000) return new Response(null, { status: 413 })
    if (!verifyWebhook(raw, request.headers.get("paymongo-signature"))) return new Response(null, { status: 401 })
    const event = JSON.parse(raw).data?.attributes
    if (event?.type === "checkout_session.payment.paid") {
      const id = event.data?.id
      if (typeof id !== "string" || !id.startsWith("cs_")) return new Response(null, { status: 400 })
      await execute(null, undefined, [], undefined, id)
    }
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: "Payment notification could not be processed." }, { status: 503 })
  }
}
