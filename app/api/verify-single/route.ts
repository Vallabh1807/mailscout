// app/api/verify-single/route.ts
import { NextRequest, NextResponse } from 'next/server'
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

async function smtpVerify(email: string, mxHost: string): Promise<{ status: 'verified' | 'unverified' | 'catch-all' | 'unknown', message: string }> {
    const domain = email.split('@')[1]
    const randomEmail = `verify_${Math.random().toString(36).substring(7)}@${domain}`

    const check = async (addr: string): Promise<{ code: string, raw: string }> => {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve({ code: 'timeout', raw: 'Connection timed out' }), 7000)
            try {
                const socket = net.createConnection(25, mxHost)
                let step = 0
                let lastResponse = ''
                socket.setTimeout(7000)

                socket.on('data', (data) => {
                    const response = data.toString()
                    lastResponse = response
                    if (step === 0 && response.startsWith('220')) {
                        socket.write(`EHLO mailscout.app\r\n`)
                        step = 1
                    } else if (step === 1 && (response.startsWith('250') || response.includes('250'))) {
                        socket.write(`MAIL FROM:<scout@mailscout.app>\r\n`)
                        step = 2
                    } else if (step === 2 && response.startsWith('250')) {
                        socket.write(`RCPT TO:<${addr}>\r\n`)
                        step = 3
                    } else if (step === 3) {
                        clearTimeout(timeout)
                        socket.write('QUIT\r\n')
                        socket.destroy()
                        resolve({ code: response.substring(0, 3), raw: response.trim() })
                    }
                })
                socket.on('error', (e) => { clearTimeout(timeout); resolve({ code: 'error', raw: e.message }) })
                socket.on('timeout', () => { clearTimeout(timeout); socket.destroy(); resolve({ code: 'timeout', raw: 'Timeout' }) })
            } catch (e: any) { clearTimeout(timeout); resolve({ code: 'error', raw: e.message }) }
        })
    }

    // 1. Check a random email to see if it's a catch-all domain
    const catchAllCheck = await check(randomEmail)
    const isCatchAll = catchAllCheck.code === '250' || catchAllCheck.code === '251'

    // 2. Check the actual email
    const realCheck = await check(email)

    if (realCheck.code === '250' || realCheck.code === '251') {
        if (isCatchAll) {
            return { status: 'catch-all', message: `Server accepts all emails (Catch-all). existence is probable but not guaranteed.` }
        }
        return { status: 'verified', message: `Verified! The server explicitly confirmed this mailbox exists.` }
    } else if (realCheck.code === '550' || realCheck.code === '551') {
        return { status: 'unverified', message: `The server explicitly rejected this email: "User Unknown".` }
    } else {
        return { status: 'unknown', message: `Server responded with: ${realCheck.raw}` }
    }
}

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json()

        if (!email || !email.includes('@')) {
            return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
        }

        const domain = email.split('@')[1]
        const mxHost = await getMxRecord(domain)

        if (!mxHost) {
            return NextResponse.json({
                success: false,
                status: 'unverified',
                message: 'No mail server (MX) found for this domain. Email likely invalid.'
            })
        }

        const result = await smtpVerify(email, mxHost)

        return NextResponse.json({
            success: true,
            email,
            ...result,
            verified: result.status === 'verified'
        })

    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Verification failed' },
            { status: 500 }
        )
    }
}
