// app/api/find-email/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { generatePermutations, EmailResult } from '@/lib/emailEngine'
import dns from 'dns'
import { promisify } from 'util'
import net from 'net'

const resolveMx = promisify(dns.resolveMx)

async function getMxRecord(domain: string): Promise<string | null> {
  try {
    const records = await resolveMx(domain)
    if (!records || records.length === 0) return null
    records.sort((a, b) => a.priority - b.priority)
    return records[0].exchange
  } catch {
    return null
  }
}

async function smtpVerify(email: string, mxHost: string): Promise<'verified' | 'unverified' | 'catch-all'> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve('unverified'), 5000)

    try {
      const socket = net.createConnection(25, mxHost)
      let step = 0
      let response = ''
      let isCatchAll = false

      socket.setTimeout(5000)

      socket.on('timeout', () => {
        clearTimeout(timeout)
        socket.destroy()
        resolve('unverified')
      })

      socket.on('error', () => {
        clearTimeout(timeout)
        resolve('unverified')
      })

      socket.on('data', (data) => {
        response = data.toString()

        if (step === 0 && response.startsWith('220')) {
          socket.write(`EHLO mailscout.app\r\n`)
          step = 1
        } else if (step === 1 && (response.startsWith('250') || response.includes('250'))) {
          socket.write(`MAIL FROM:<scout@mailscout.app>\r\n`)
          step = 2
        } else if (step === 2 && response.startsWith('250')) {
          socket.write(`RCPT TO:<${email}>\r\n`)
          step = 3
        } else if (step === 3) {
          clearTimeout(timeout)
          socket.write('QUIT\r\n')
          socket.destroy()

          if (response.startsWith('250') || response.startsWith('251')) {
            resolve(isCatchAll ? 'catch-all' : 'verified')
          } else {
            resolve('unverified')
          }
        }
      })
    } catch {
      clearTimeout(timeout)
      resolve('unverified')
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const { firstName, middleName, lastName, domain, customDomain, personalEmailGuess, nameVariations } = await req.json()

    if (!firstName || !lastName || (!domain && !customDomain)) {
      return NextResponse.json({ error: 'Name and domain are required' }, { status: 400 })
    }

    const targetDomain = customDomain || domain

    // Generate all permutations using the new expanded engine
    const permutations = generatePermutations(
      firstName,
      lastName,
      targetDomain,
      middleName || '',
      personalEmailGuess || '',
      nameVariations || []
    )

    // Get MX record for SMTP verification
    const mxHost = await getMxRecord(targetDomain)

    let results: EmailResult[] = []

    if (mxHost) {
      // Verify top 8 emails via SMTP (increased from 6)
      const toVerify = permutations.slice(0, 8)
      const verifyPromises = toVerify.map(async (p) => {
        const status = await smtpVerify(p.email, mxHost)
        return {
          ...p,
          verified: status === 'verified',
          smtpStatus: status
        }
      })

      const verified = await Promise.all(verifyPromises)
      const remaining = permutations.slice(8)

      results = [
        ...verified,
        ...remaining
      ]
    } else {
      results = permutations
    }

    // Sort: verified first, then by confidence
    const confidenceOrder = { high: 0, medium: 1, low: 2 }
    results.sort((a, b) => {
      if (a.verified && !b.verified) return -1
      if (!a.verified && b.verified) return 1
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
    })

    return NextResponse.json({
      success: true,
      emails: results.slice(0, 25), // Return up to 25 results as requested
      mxFound: !!mxHost,
      domain: targetDomain
    })

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Email lookup failed' },
      { status: 500 }
    )
  }
}
