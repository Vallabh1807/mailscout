// app/api/draft/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const {
            candidateName,
            targetRole,
            experience,
            skills,
            projects,
            recipientName,
            recipientCompany,
            userApiKey
        } = await req.json()

        const apiKey = userApiKey || process.env.GROQ_API_KEY

        if (!apiKey) {
            return NextResponse.json({ error: 'Missing API Key. Please provide one in the UI or check server environment variables.' }, { status: 400 })
        }

        const prompt = `You are an expert cold email writer. Write a human-sounding cold outreach email with professional paragraph spacing.
  
STYLE REFERENCE:
"Hi [Recipient Name],

I came across your profile and was impressed by your work at [Recipient Company].

I'm [Sender Name], working as [Current Role/Experience]. [Specific Achievements/Projects]. I'm actively exploring [Target Role] opportunities and [Recipient Company]'s work genuinely caught my attention.

Would you be open to a 15-minute call to share any insights about the team or potential openings? I'd really value your perspective.

I've attached my CV for reference.

Thanks so much for your time,
[Sender Name]"

RECIPIENT: ${recipientName} at ${recipientCompany}
TARGET ROLE: ${targetRole}

CANDIDATE PROFILE (Use these details):
Name: ${candidateName}
Work Info: ${experience || 'Not specified'}
Skills: ${skills || 'Not specified'}
Projects/Achievements: ${projects || 'Not specified'}

CRITICAL: Use multiple paragraphs and double newlines (\n\n) between sections exactly as shown in the style reference. Do NOT return as a single paragraph.

Return ONLY valid JSON: {"subject": "...", "body": "..."}`

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        })

        if (!response.ok) {
            const errData = await response.json()
            return NextResponse.json({ error: errData.error?.message || 'AI API Error' }, { status: response.status })
        }

        const data = await response.json()
        const content = JSON.parse(data.choices?.[0]?.message?.content || '{}')

        return NextResponse.json({
            success: true,
            subject: content.subject,
            body: content.body
        })

    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Draft generation failed' },
            { status: 500 }
        )
    }
}
