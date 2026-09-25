import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { DataProvider } from '@/components/data-provider'
import { ClerkProvider } from '@clerk/nextjs'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SoundStage — Lights & Sounds Booking for Batangas Events',
  description:
    'Book verified lights and sounds service providers across Balayan, Nasugbu, and Lian. Browse packages, check availability, and pay securely in one platform.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#121212',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} bg-background`}>
      <body className="font-sans antialiased">
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
            <DataProvider>{children}</DataProvider>
          </ClerkProvider>
        ) : <DataProvider>{children}</DataProvider>}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
