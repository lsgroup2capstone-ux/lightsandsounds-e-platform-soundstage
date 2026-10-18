import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { DataProvider } from '@/components/state/data-provider'
import { ClerkProvider } from '@clerk/nextjs'
import { IdleLogout } from '@/components/state/idle-logout'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SoundStage — Lights & Sounds Booking for Batangas Events',
  description:
    'Book verified lights and sounds service providers across Balayan, Nasugbu, and Lian. Browse packages, check availability, and pay securely in one platform.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5f5f7',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} bg-background`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint; light is the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('soundstage-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <IdleLogout />
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
