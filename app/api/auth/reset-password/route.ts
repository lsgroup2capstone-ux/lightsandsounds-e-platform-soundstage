import { NextResponse } from 'next/server'
export async function POST() {
  return NextResponse.json({ error: 'Use the login or Forgot password page to access your account.' }, { status: 410 })
}
