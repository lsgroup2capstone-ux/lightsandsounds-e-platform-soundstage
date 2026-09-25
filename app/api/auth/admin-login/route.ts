import { NextResponse } from 'next/server'
export async function POST() {
  return NextResponse.json({ error: 'Use Supabase Auth to sign in or recover your password.' }, { status: 410 })
}
