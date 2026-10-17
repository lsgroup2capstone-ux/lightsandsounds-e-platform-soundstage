import { currentTx } from "../runtime"
import { registerPaidTotal } from "../bookings/core"

// Verified money on a booking; refunded payments stop counting once fully refunded.
export async function paidTotal(bookingId: string) {
  const [row] = await currentTx()<{ total: string | null }[]>`select coalesce(sum(amount), 0) as total from soundstage.payments
    where target_kind = 'booking' and target_id = ${bookingId} and status in ('paid', 'partially_refunded')`
  return Number(row?.total || 0)
}

registerPaidTotal(paidTotal)
