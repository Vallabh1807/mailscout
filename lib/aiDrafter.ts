// lib/aiDrafter.ts
// Generates personalized cold emails using Google Gemini API or fallback template

export interface DraftInput {
  recipientName: string
  recipientTitle: string
  recipientCompany: string
  recipientAbout: string
  senderName: string
  senderBackground: string
  jobRole: string
  cvSummary?: string
}

export interface EmailDraft {
  subject: string
  body: string
}

export async function extractCvInfo(cvText: string, apiKey: string): Promise<any> {
  const prompt = `Extract key professional information from this CV text. 
Return JSON only:
{
  "name": "Full name if found",
  "skills": "List of top 5-7 skills",
  "experience": "Brief 1-2 sentence professional summary",
  "education": "Most recent/highest degree"
}

CV Text:
${cvText.substring(0, 4000)}`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      const errData = await response.json()
      throw new Error(errData.error?.message || 'Groq API Error')
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || '{}'
    return JSON.parse(content)
  } catch (e) {
    console.error('CV extraction failed:', e)
    throw e
  }
}

export async function draftEmail(input: DraftInput, aiApiKey?: string): Promise<EmailDraft> {
  if (aiApiKey) {
    try {
      return await draftWithGroq(input, aiApiKey)
    } catch (e) {
      console.error('Groq failed, using template:', e)
    }
  }
  return draftWithTemplate(input)
}

async function draftWithGroq(input: DraftInput, apiKey: string): Promise<EmailDraft> {
  const prompt = `You are an expert cold email writer for job seekers.

Recipient: ${input.recipientName}, ${input.recipientTitle} at ${input.recipientCompany}
Candidate CV summary: ${input.cvSummary || input.senderBackground}
Target role: ${input.jobRole}

Write a cold email that:
- Is under 150 words
- References 1-2 specific skills from their CV naturally
- Has a clear single ask (15 min call or referral)
- Sounds human, not AI
- Subject line under 8 words

Return JSON only: {"subject": "...", "body": "..."}`

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
    throw new Error(errData.error?.message || 'Groq API Error')
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || '{}'
  return JSON.parse(text)
}

function draftWithTemplate(input: DraftInput): EmailDraft {
  const subject = `${input.senderName} — Interested in ${input.jobRole} at ${input.recipientCompany}`

  const body = `Hi ${input.recipientName.split(' ')[0]},

I came across your profile and was impressed by your work at ${input.recipientCompany}.

I'm ${input.senderName}, ${input.senderBackground}. I'm actively exploring ${input.jobRole} opportunities and ${input.recipientCompany}'s work genuinely caught my attention.

Would you be open to a 15-minute call to share any insights about the team or potential openings? I'd really value your perspective.

${input.cvSummary ? `Quick background: ${input.cvSummary}\n\n` : ''}I've attached my CV for reference.

Thanks so much for your time,
${input.senderName}`

  return { subject, body }
}

