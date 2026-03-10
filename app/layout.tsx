import type { Metadata } from 'next'
import { JetBrains_Mono, Syne } from 'next/font/google'
import './globals.css'

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700', '800']
})

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800']
})

export const metadata: Metadata = {
  title: 'MailScout — Cold Outreach, Automated',
  description: 'Paste a LinkedIn URL. We find their email, write the email, send it with your CV.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${mono.variable} ${syne.variable}`}>
        {children}
      </body>
    </html>
  )
}
