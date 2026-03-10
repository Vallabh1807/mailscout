// lib/emailEngine.ts
// Core email permutation + verification engine

export interface EmailResult {
  email: string
  confidence: 'high' | 'medium' | 'low'
  verified: boolean
  pattern: string
}

export function generatePermutations(
  first: string,
  last: string,
  domain: string,
  middle: string = '',
  personalGuess: string = '',
  nameVariations: string[] = []
): EmailResult[] {
  const allFirstNames = [first, ...nameVariations].map(n => n.toLowerCase().trim()).filter(Boolean)
  const l = last.toLowerCase().trim()
  const m = middle.toLowerCase().trim()
  const results: EmailResult[] = []

  // Helper to add results
  const addResult = (email: string, pattern: string, confidence: 'high' | 'medium' | 'low') => {
    results.push({ email, pattern, confidence, verified: false })
  }

  for (const f of allFirstNames) {
    const fi = f[0] || ''
    const mi = m[0] || ''
    const li = l[0] || ''

    // --- High Confidence (With Middle Name) ---
    if (m) {
      addResult(`${f}.${m}.${l}@${domain}`, 'firstname.middlename.lastname', 'high')
      addResult(`${f}.${m}-${l}@${domain}`, 'firstname.middlename-lastname', 'high')
      addResult(`${f}-${m}.${l}@${domain}`, 'firstname-middlename.lastname', 'high')
      addResult(`${fi}.${m}.${l}@${domain}`, 'f.middlename.lastname', 'high')
      addResult(`${f}.${mi}.${l}@${domain}`, 'firstname.m.lastname', 'high')
      addResult(`${f}.${mi}${l}@${domain}`, 'firstname.ml', 'high')
      addResult(`${f}${mi}.${l}@${domain}`, 'fm.lastname', 'high')
      addResult(`${fi}${mi}${l}@${domain}`, 'fml', 'high')
      addResult(`${f}.${m}_${l}@${domain}`, 'firstname.middlename_lastname', 'high')
    }

    // --- Medium Confidence (Standard Corporate) ---
    addResult(`${f}.${l}@${domain}`, 'firstname.lastname', 'medium')
    addResult(`${f}-${l}@${domain}`, 'firstname-lastname', 'medium')
    addResult(`${f}_${l}@${domain}`, 'firstname_lastname', 'medium')
    addResult(`${fi}.${l}@${domain}`, 'f.lastname', 'medium')
    addResult(`${fi}${l}@${domain}`, 'flastname', 'medium')
    addResult(`${f}${li}@${domain}`, 'firstnamel', 'medium')
    addResult(`${f}@${domain}`, 'firstname', 'medium')
    addResult(`${l}.${f}@${domain}`, 'lastname.firstname', 'medium')
    addResult(`${l}-${f}@${domain}`, 'lastname-firstname', 'medium')
    addResult(`${l}_${f}@${domain}`, 'lastname_firstname', 'medium')
    addResult(`${l}${f[0]}@${domain}`, 'lastnamef', 'medium')
    addResult(`${fi}.${li}@${domain}`, 'f.l', 'medium')
    addResult(`${f}${l}@${domain}`, 'firstnamelastname', 'medium')
    addResult(`${fi}${li}@${domain}`, 'fl', 'medium')

    // --- Low Confidence (Personal Patterns) ---
    const years = ['80', '85', '90', '95', '99', '00']
    const commonDomains = ['gmail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'live.com', 'rediffmail.com']

    // GMAIL specific
    const gmailOnly = (p: string) => addResult(`${p}@gmail.com`, 'personal (gmail)', 'low')
    gmailOnly(`${f}.${l}`)
    gmailOnly(`${f}${l}`)
    years.forEach(y => gmailOnly(`${f}.${l}${y}`))
    gmailOnly(`${fi}${l}`)
    gmailOnly(`${f}${li}`)
    gmailOnly(`${l}.${f}`)
    gmailOnly(`${f}`)
    gmailOnly(`${fi}.${l}`)
    if (m) gmailOnly(`${f}.${m}`)
    gmailOnly(`iam${f}`)
    gmailOnly(`its${f}`)
    gmailOnly(`official${f}`)
    gmailOnly(`${f}.${l}.official`)
    gmailOnly(`reach${f}`)
    gmailOnly(`hi${f}`)
    gmailOnly(`${l}${f}`)
    gmailOnly(`${f}1234`)

    // YAHOO specific
    addResult(`${f}.${l}@yahoo.com`, 'personal (yahoo)', 'low')
    addResult(`${f}${l}@yahoo.in`, 'personal (yahoo)', 'low')
    addResult(`${f}.${l}@yahoo.in`, 'personal (yahoo)', 'low')
    addResult(`${fi}${l}@yahoo.com`, 'personal (yahoo)', 'low')

    // OUTLOOK / HOTMAIL
    addResult(`${f}.${l}@outlook.com`, 'personal (outlook)', 'low')
    addResult(`${f}${l}@hotmail.com`, 'personal (hotmail)', 'low')
    addResult(`${f}.${l}@hotmail.com`, 'personal (hotmail)', 'low')
    addResult(`${f}@live.com`, 'personal (live)', 'low')

    // REDIFFMAIL
    addResult(`${f}.${l}@rediffmail.com`, 'personal (rediff)', 'low')
    addResult(`${f}${l}@rediffmail.com`, 'personal (rediff)', 'low')
  }

  if (personalGuess && personalGuess.includes('@')) {
    results.unshift({ email: personalGuess.toLowerCase().trim(), pattern: 'manual guess', confidence: 'low', verified: false })
  }

  // Deduplicate and filter empty/invalid
  const seen = new Set<string>()
  return results
    .filter(res => {
      const email = res.email.split('@')[0]
      if (!email || email.includes('undefined') || seen.has(res.email)) return false
      seen.add(res.email)
      return true
    })
    .slice(0, 100) // Increase slice limit for name variations, search API will still limit to 25
}

export function inferDomain(companyName: string): string {
  const name = companyName.toLowerCase().trim()
  const knownDomains: Record<string, string> = {
    'google': 'google.com',
    'microsoft': 'microsoft.com',
    'apple': 'apple.com',
    'amazon': 'amazon.com',
    'meta': 'meta.com',
    'netflix': 'netflix.com',
    'tesla': 'tesla.com',
    'uber': 'uber.com',
    'airbnb': 'airbnb.com',
    'stripe': 'stripe.com',
    'shopify': 'shopify.com',
    'spotify': 'spotify.com',
    'slack': 'slack.com',
    'notion': 'notion.so',
    'figma': 'figma.com',
    'vercel': 'vercel.com',
    'anthropic': 'anthropic.com',
    'openai': 'openai.com',
  }

  for (const [key, domain] of Object.entries(knownDomains)) {
    if (name.includes(key)) return domain
  }

  const cleaned = name
    .replace(/\b(inc|llc|ltd|corp|co|company|group|pvt|private|limited)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()

  return cleaned ? `${cleaned}.com` : ''
}

// Bulk Mode: Parse CSV input
export function parseBulkInput(input: string): Array<{
  firstName: string
  middleName: string
  lastName: string
  company: string
  designation: string
}> {
  const lines = input.trim().split('\n')
  const results: Array<{
    firstName: string
    middleName: string
    lastName: string
    company: string
    designation: string
  }> = []

  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim())
    if (parts.length < 5) continue

    const [firstName, middleName, lastName, company, designation] = parts
    if (!firstName || !lastName || !company || !designation) continue

    results.push({
      firstName: firstName.trim(),
      middleName: middleName.trim() || '',
      lastName: lastName.trim(),
      company: company.trim(),
      designation: designation.trim()
    })
  }

  return results
}

// Bulk Mode: Generate top 3 emails per person
export function generateEmailsForBulk(
  first: string,
  last: string,
  domain: string,
  middle: string = ''
): EmailResult[] {
  const allPresets = generatePermutations(first, last, domain, middle)
  return allPresets.slice(0, 3)
}
