// app/api/send-email/route.ts
import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { draftEmail, DraftInput } from '@/lib/aiDrafter'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    const recipientEmail = formData.get('recipientEmail') as string
    const recipientName = formData.get('recipientName') as string
    const recipientTitle = formData.get('recipientTitle') as string
    const recipientCompany = formData.get('recipientCompany') as string
    const recipientAbout = formData.get('recipientAbout') as string
    const senderName = formData.get('senderName') as string
    const senderEmail = (formData.get('senderEmail') as string) || process.env.GMAIL_USER || ''
    const senderPassword = (formData.get('senderPassword') as string) || process.env.GMAIL_PASS || ''
    const senderBackground = formData.get('senderBackground') as string
    const jobRole = formData.get('jobRole') as string
    const aiApiKey = process.env.GROQ_API_KEY
    const customSubject = formData.get('customSubject') as string
    const customBody = formData.get('customBody') as string
    const cvFile = formData.get('cv') as File | null

    if (!recipientEmail || !senderEmail || !senderPassword) {
      return NextResponse.json({ error: 'Sender credentials missing. Please provide them in the UI or environment variables.' }, { status: 400 })
    }

    let subject = customSubject
    let body = customBody

    // Generate AI draft if no custom content
    if (!subject || !body) {
      const draftInput: DraftInput = {
        recipientName,
        recipientTitle,
        recipientCompany,
        recipientAbout,
        senderName,
        senderBackground,
        jobRole
      }
      const draft = await draftEmail(draftInput, aiApiKey)
      subject = subject || draft.subject
      body = body || draft.body
    }

    // Setup Gmail SMTP transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: senderPassword // Gmail App Password (not regular password)
      }
    })

    // Build email options
    const mailOptions: any = {
      from: `${senderName} <${senderEmail}>`,
      to: recipientEmail,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br/>')
    }

    // Attach CV if provided
    if (cvFile) {
      const buffer = Buffer.from(await cvFile.arrayBuffer())
      mailOptions.attachments = [{
        filename: cvFile.name,
        content: buffer,
        contentType: cvFile.type
      }]
    }

    await transporter.sendMail(mailOptions)

    return NextResponse.json({
      success: true,
      message: `Email sent successfully to ${recipientEmail}`,
      subject,
      preview: body.substring(0, 200)
    })

  } catch (error: any) {
    let message = error.message || 'Failed to send email'

    // Helpful error messages
    if (message.includes('Invalid login') || message.includes('Username and Password')) {
      message = 'Gmail authentication failed. Make sure you\'re using a Gmail App Password, not your regular password. Enable 2FA and create an App Password at myaccount.google.com/apppasswords'
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Also expose draft-only endpoint
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const recipientName = searchParams.get('recipientName') || ''
  const recipientTitle = searchParams.get('recipientTitle') || ''
  const recipientCompany = searchParams.get('recipientCompany') || ''
  const senderName = searchParams.get('senderName') || ''
  const senderBackground = searchParams.get('senderBackground') || ''
  const jobRole = searchParams.get('jobRole') || ''
  const aiApiKey = searchParams.get('aiApiKey') || ''

  const draft = await draftEmail({
    recipientName, recipientTitle, recipientCompany,
    recipientAbout: '', senderName, senderBackground, jobRole
  }, aiApiKey || undefined)

  return NextResponse.json({ success: true, draft })
}

