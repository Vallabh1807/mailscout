'use client'
import { useState, useRef, useEffect } from 'react'
import { inferDomain, parseBulkInput, generateEmailsForBulk } from '@/lib/emailEngine'
import { extractCvInfo, draftEmail } from '@/lib/aiDrafter'

interface Profile {
  firstName: string
  middleName: string
  lastName: string
  fullName: string
  nameVariations: string
  company: string
  headline: string
  personalEmailGuess: string
  inferredDomain: string
  about: string
}

interface EmailResult {
  email: string
  confidence: 'high' | 'medium' | 'low'
  verified: boolean
  pattern: string
}

interface BulkTarget {
  firstName: string
  middleName: string
  lastName: string
  company: string
  designation: string
  emails: EmailResult[]
  selectedEmail: string
}

type Step = 1 | 2 | 3 | 4
type Mode = 'single' | 'bulk'

export default function Home() {
  const [mode, setMode] = useState<Mode>('single')
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [emailCount, setEmailCount] = useState(0)
  const [emailLimit, setEmailLimit] = useState(500)

  // Bulk mode state
  const [bulkInput, setBulkInput] = useState('')
  const [bulkTargets, setBulkTargets] = useState<BulkTarget[]>([])
  const [bulkEditing, setBulkEditing] = useState<Record<number, string>>({})
  const [bulkStep, setBulkStep] = useState<'input' | 'generate' | 'send'>('input')
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkProgress, setBulkProgress] = useState('')

  // Load email count from localStorage on mount
  useEffect(() => {
    const today = new Date().toDateString()
    const stored = JSON.parse(localStorage.getItem('mailscout_count') || '{}')
    const count = stored.date === today ? stored.count : 0
    setEmailCount(count)
  }, [])

  // Step 1: Target Profile
  const [profile, setProfile] = useState<Profile>({
    firstName: '',
    middleName: '',
    lastName: '',
    fullName: '',
    nameVariations: '',
    company: '',
    headline: '',
    personalEmailGuess: '',
    inferredDomain: '',
    about: ''
  })

  // Step 2: Email Discovery
  const [emails, setEmails] = useState<EmailResult[]>([])
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [customDomain, setCustomDomain] = useState('')
  const [verificationMessages, setVerificationMessages] = useState<Record<string, string>>({})

  // Step 3: Draft
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvText, setCvText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [draftMode, setDraftMode] = useState<'upload' | 'choose' | 'extractor' | 'manual' | 'generated'>('upload')
  const [extractedCVData, setExtractedCVData] = useState<any>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    education: true,
    experience: true,
    skills: true,
    projects: true
  })

  // Manual draft fields
  const [cvInfo, setCvInfo] = useState({
    name: '',
    skills: '',
    experience: '',
    projects: '',
    education: ''
  })

  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [draftLoading, setDraftLoading] = useState(false)
  const [jobRole, setJobRole] = useState('')
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  // Step 4: Send
  const [senderEmail, setSenderEmail] = useState(process.env.NEXT_PUBLIC_GMAIL || '')
  const [senderPassword, setSenderPassword] = useState(process.env.NEXT_PUBLIC_GMAIL_PASSWORD || '')
  const [showGuide, setShowGuide] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const err = (msg: string) => { setError(msg); setLoading(false) }

  // ── BULK MODE: Parse Input ────────────────────────────────────────────────
  function parseBulk() {
    setError('')
    const parsed = parseBulkInput(bulkInput)
    if (parsed.length === 0) {
      return err('No valid entries found. Format: FirstName, MiddleName, LastName, Company, Designation (one per line)')
    }
    const targets = parsed.map(p => ({ ...p, emails: [] as EmailResult[], selectedEmail: '' }))
    setBulkTargets(targets)
    setBulkStep('generate')

    // Auto-generate emails
    setTimeout(() => {
      generateBulkEmailsForTargets(targets)
    }, 100)
  }

  // ── BULK MODE: Generate Emails for each target ────────────────────────────
  async function generateBulkEmailsForTargets(targets: BulkTarget[]) {
    setLoading(true); setError('')
    try {
      const updated: BulkTarget[] = []
      for (const target of targets) {
        const domain = inferDomain(target.company)
        const emails = generateEmailsForBulk(target.firstName, target.lastName, domain, target.middleName)
        updated.push({ ...target, emails, selectedEmail: emails[0]?.email || '' })
      }
      setBulkTargets(updated)
      setLoading(false)
    } catch (e) {
      err('Failed to generate emails')
    }
  }

  // ── BULK MODE: Send All with delays ───────────────────────────────────────
  async function sendBulkEmails() {
    if (!senderEmail || !senderPassword) {
      return err('Fill in your Gmail and App Password')
    }

    if (emailCount >= emailLimit) {
      return err('❌ Daily email limit reached. Returns at midnight.')
    }

    setBulkSending(true); setError(''); setSuccess('')
    let sent = 0

    for (let i = 0; i < bulkTargets.length; i++) {
      if (emailCount + sent >= emailLimit) {
        setSuccess(`⚠️ Stopped at daily limit. Sent ${sent}/${bulkTargets.length}`)
        break
      }

      const target = bulkTargets[i]
      const email = bulkEditing[i] || target.selectedEmail

      setBulkProgress(`Sending ${i + 1}/${bulkTargets.length}...`)

      const fullName = `${target.firstName} ${target.middleName ? target.middleName + ' ' : ''}${target.lastName}`.trim()
      const fd = new FormData()
      fd.append('recipientEmail', email)
      fd.append('recipientName', fullName)
      fd.append('recipientTitle', target.designation)
      fd.append('recipientCompany', target.company)
      fd.append('senderName', cvInfo.name)
      fd.append('senderEmail', senderEmail)
      fd.append('senderPassword', senderPassword)
      fd.append('senderBackground', getSenderBackground())
      fd.append('jobRole', jobRole)
      fd.append('aiApiKey', groqKey)
      fd.append('customSubject', emailSubject)
      fd.append('customBody', emailBody)
      if (cvFile) fd.append('cv', cvFile)

      const res = await fetch('/api/send-email', { method: 'POST', body: fd })
      if (res.ok) {
        sent++
        // Update localStorage counter
        const today = new Date().toDateString()
        const newCount = emailCount + sent
        localStorage.setItem('mailscout_count', JSON.stringify({ date: today, count: newCount }))
        setEmailCount(newCount)
        setBulkProgress(`Sending ${i + 1}/${bulkTargets.length}... ✓`)
      }

      // 10 second delay between emails (except last one)
      if (i < bulkTargets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 10000))
      }
    }

    setBulkSending(false)
    setBulkProgress('')
    setSuccess(`✓ Sent ${sent}/${bulkTargets.length} emails`)
  }

  // ── STEP 1: Process Manual Profile ──────────────────────────────────────
  function proceedToDiscovery() {
    if (!profile.firstName || !profile.lastName || !profile.company) {
      return err('Please fill in First Name, Last Name, and Company.')
    }

    // Auto-infer domain if not set
    const domain = inferDomain(profile.company)
    setCustomDomain(domain)

    // Update composite full name
    const full = `${profile.firstName} ${profile.middleName ? profile.middleName + ' ' : ''}${profile.lastName}`.trim()
    setProfile(prev => ({ ...prev, fullName: full, inferredDomain: domain }))

    setError('')
    setStep(2)
  }

  const [verifyingEmail, setVerifyingEmail] = useState<string | null>(null)

  // ── STEP 2: Find Emails ──────────────────────────────────────────────────
  async function findEmails() {
    setLoading(true); setError('')

    try {
      const res = await fetch('/api/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile.firstName,
          middleName: profile.middleName,
          lastName: profile.lastName,
          personalEmailGuess: profile.personalEmailGuess,
          nameVariations: profile.nameVariations ? profile.nameVariations.split(',').map(s => s.trim()).filter(Boolean) : [],
          domain: profile.inferredDomain,
          customDomain: customDomain.trim()
        })
      })
      const data = await res.json()

      if (!res.ok) return err(data.error)
      setEmails(data.emails)

      // Select the first verified or high confidence email by default
      const firstValid = data.emails.find((e: any) => e.verified || e.confidence === 'high') || data.emails[0]
      if (firstValid) setSelectedEmails([firstValid.email])

      setLoading(false)
      // Stay on step 2 so user can verify if they want, or click continue
    } catch (e) {
      err('Failed to connect to finding engine.')
    }
  }

  // ── Helper: Verify a single email manually ────────────────────────────────
  async function verifySingleEmail(email: string) {
    if (verifyingEmail) return
    setVerifyingEmail(email)

    try {
      const res = await fetch('/api/verify-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()

      if (data.success) {
        setVerificationMessages(prev => ({ ...prev, [email]: data.message }))
        setEmails(prev => prev.map(e =>
          e.email === email ? {
            ...e,
            verified: data.verified,
            confidence: data.verified ? 'high' : (data.status === 'unverified' ? 'low' : e.confidence)
          } : e
        ))
      } else {
        setVerificationMessages(prev => ({ ...prev, [email]: data.message || 'Verification failed' }))
      }
    } catch (e) {
      setVerificationMessages(prev => ({ ...prev, [email]: 'Could not connect to verification server.' }))
    } finally {
      setVerifyingEmail(null)
    }
  }

  // ── Helper: Generate manual summary for backend ──────────────────────────
  const getSenderBackground = () => {
    return `Experience: ${cvInfo.experience}. Skills: ${cvInfo.skills}. Projects: ${cvInfo.projects}. Education: ${cvInfo.education}.`
  }

  // ── Helper: Generate email using Groq (FAST) ──────────────────────────
  const generateManualDraft = async () => {
    if (!cvInfo.name || !jobRole) return err('Fill in your name and target role')

    setDraftLoading(true); setError('')

    try {
      const response = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateName: cvInfo.name,
          targetRole: jobRole,
          experience: cvInfo.experience,
          skills: cvInfo.skills,
          projects: cvInfo.projects,
          recipientName: profile.fullName,
          recipientCompany: profile.company,
          userApiKey: groqKey // Pass the key if user provided one
        })
      })

      if (!response.ok) {
        const errJson = await response.json()
        throw new Error(errJson.error || 'Draft generation failed')
      }

      const data = await response.json()
      setEmailSubject(data.subject || '')
      setEmailBody(data.body || '')
      setDraftLoading(false)
    } catch (e: any) {
      console.error('Draft generation error:', e)
      err(e.message)
      setDraftLoading(false)
    }
  }

  // ── STEP 4: Send Email ───────────────────────────────────────────────────
  async function sendEmail() {
    if (selectedEmails.length === 0 || !senderEmail || !senderPassword) {
      return err('Fill in recipients, your Gmail and App Password')
    }

    if (emailCount >= emailLimit) {
      return err('❌ Daily email limit reached. Returns at midnight.')
    }

    setLoading(true); setError(''); setSuccess('')

    let sentCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < selectedEmails.length; i++) {
      const email = selectedEmails[i];
      setBulkProgress(`Sending to ${email} (${i + 1}/${selectedEmails.length})...`)

      const fd = new FormData()
      fd.append('recipientEmail', email)
      fd.append('recipientName', profile?.fullName || '')
      fd.append('recipientTitle', profile?.headline || '')
      fd.append('recipientCompany', profile?.company || '')
      fd.append('recipientAbout', profile?.about || '')
      fd.append('senderName', cvInfo.name)
      fd.append('senderEmail', senderEmail)
      fd.append('senderPassword', senderPassword)
      fd.append('senderBackground', getSenderBackground())
      fd.append('jobRole', jobRole)
      fd.append('customSubject', emailSubject)
      fd.append('customBody', emailBody)
      if (cvFile) fd.append('cv', cvFile)

      try {
        const res = await fetch('/api/send-email', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) {
          errors.push(`${email}: ${data.error} `)
        } else {
          sentCount++
        }
      } catch (e: any) {
        errors.push(`${email}: ${e.message} `)
      }

      // Add 2 second pause between emails to bypass spam filters
      if (i < selectedEmails.length - 1) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    // Update localStorage counter
    if (sentCount > 0) {
      const today = new Date().toDateString()
      const newCount = emailCount + sentCount
      localStorage.setItem('mailscout_count', JSON.stringify({ date: today, count: newCount }))
      setEmailCount(newCount)
    }

    if (errors.length > 0) {
      err(`Sent ${sentCount}/${selectedEmails.length}. Errors: ${errors.join('; ')}`)
    } else {
      setSuccess(`✓ Successfully sent ${sentCount} email${sentCount !== 1 ? 's' : ''}`)
      setShowSuccessModal(true)
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent)'
          }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
            mailscout
            <span style={{ color: 'var(--accent)' }}>.app</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {/* Email Counter */}
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: emailCount >= emailLimit ? 'var(--red)' : emailCount >= 450 ? '#ffb800' : 'var(--text2)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span style={{ fontSize: 14 }}>📧</span>
            <span>{emailCount} / {emailLimit} sent today</span>
            {emailCount >= emailLimit && <span style={{ fontSize: 11, marginLeft: 4 }}>⚠️</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4].map(s => (
              <div key={s} style={{
                width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: step === s ? 'var(--accent)' : step > s ? 'var(--accent-dim)' : 'var(--bg3)',
                color: step === s ? '#000' : step > s ? 'var(--accent)' : 'var(--text3)',
                border: `1px solid ${step >= s ? 'var(--accent)' : 'var(--border)'}`,
                cursor: step > s ? 'pointer' : 'default',
                transition: 'all 0.2s'
              }} onClick={() => step > s && setStep(s as Step)}>
                {step > s ? '✓' : s}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px' }}>

        {/* Mode Toggle */}
        <div style={{ marginBottom: 32, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={() => { setMode('single'); setStep(1); setBulkStep('input'); setBulkTargets([]); setBulkInput(''); }}
            style={{
              padding: '10px 20px',
              border: `2px solid ${mode === 'single' ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === 'single' ? 'var(--accent-dim)' : 'var(--bg2)',
              color: mode === 'single' ? 'var(--accent)' : 'var(--text2)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderRadius: '4px'
            }}
          >
            Single
          </button>
          {/* <button
            onClick={() => { setMode('bulk'); setStep(1); setBulkStep('input'); }}
            style={{
              padding: '10px 20px',
              border: `2px solid ${mode === 'bulk' ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === 'bulk' ? 'var(--accent-dim)' : 'var(--bg2)',
              color: mode === 'bulk' ? 'var(--accent)' : 'var(--text2)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderRadius: '4px'
            }}
          >
            Bulk
          </button> */}
        </div>

        {/* Hero */}
        <div style={{ marginBottom: 56, textAlign: 'center' }}>
          <div className="step-number" style={{ display: 'inline-block', marginBottom: 16 }}>
            COLD OUTREACH AUTOMATION
          </div>
          <h1 style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            marginBottom: 16
          }}>
            Reach Anyone.
            <span style={{ color: 'var(--accent)' }}>Smart & Simplified.</span>
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 15, lineHeight: 1.7 }}>
            Enter details → AI generates emails → One-click send
          </p>
        </div>

        {/* Limit Warning */}
        {emailCount >= emailLimit && (
          <div style={{
            padding: '14px 16px',
            background: 'rgba(255,68,68,0.1)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            fontSize: 12,
            marginBottom: 24,
            borderRadius: '4px',
            textAlign: 'center',
            fontWeight: 600
          }}>
            ❌ Daily limit reached ({emailLimit}/500). Resets at midnight.
          </div>
        )}

        {emailCount >= 450 && emailCount < emailLimit && (
          <div style={{
            padding: '14px 16px',
            background: 'rgba(255,184,0,0.1)',
            border: '1px solid #ffb800',
            color: '#ffb800',
            fontSize: 12,
            marginBottom: 24,
            borderRadius: '4px',
            textAlign: 'center',
            fontWeight: 600
          }}>
            ⚠️ Approaching daily limit ({emailCount}/500)
          </div>
        )}

        {/* STEP 1: Target Profile (SINGLE MODE) */}
        {mode === 'single' && (
          <Section
            num="01"
            title="Target Profile"
            subtitle="Enter the details of the person you want to contact"
            active={step === 1}
            done={step > 1}
          >
            <div className="slide-in" style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.6fr 1fr', gap: 12 }}>
                <Field
                  label="First Name"
                  value={profile.firstName}
                  onChange={(v) => setProfile({ ...profile, firstName: v })}
                  placeholder="John"
                />
                <div>
                  <Field
                    label="Middle (Opt)"
                    value={profile.middleName}
                    onChange={(v) => setProfile({ ...profile, middleName: v })}
                    placeholder="Q."
                  />
                </div>
                <Field
                  label="Last Name"
                  value={profile.lastName}
                  onChange={(v) => setProfile({ ...profile, lastName: v })}
                  placeholder="Doe"
                />
              </div>

              {profile.middleName === '' && (
                <div style={{
                  fontSize: 11,
                  color: 'var(--text3)',
                  marginTop: -8,
                  padding: '0 4px',
                  lineHeight: 1.5
                }}>
                  <span style={{ color: 'var(--accent)' }}>⚠</span> Don't know their middle name? Add it if you find it on their company website,
                  email signature, or name badge. Middle name dramatically increases match accuracy.
                </div>
              )}

              <Field
                label="Name variations (nicknames, alternate spellings)"
                value={profile.nameVariations}
                onChange={(v) => setProfile({ ...profile, nameVariations: v })}
                placeholder="Jon, Johnathan, J."
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field
                  label="Company Name"
                  value={profile.company}
                  onChange={(v) => setProfile({ ...profile, company: v })}
                  placeholder="Google"
                />
                <Field
                  label="Designation / Title"
                  value={profile.headline}
                  onChange={(v) => setProfile({ ...profile, headline: v })}
                  placeholder="Software Engineer"
                />
              </div>

              <Field
                label="Personal Email Guess (Optional)"
                value={profile.personalEmailGuess}
                onChange={(v) => setProfile({ ...profile, personalEmailGuess: v })}
                placeholder="john.doe@gmail.com"
              />

              {step === 1 && (
                <button
                  className="btn-primary"
                  onClick={proceedToDiscovery}
                  style={{ marginTop: 8, width: '100%' }}
                >
                  Scan for Emails →
                </button>
              )}

              {step > 1 && (
                <ProfileCard profile={profile} />
              )}
            </div>
          </Section>
        )}

        {/* BULK MODE INPUT */}
        {/* BULK MODE UI COMMENTED OUT
        {mode === 'bulk' && bulkStep === 'input' && (
          ...
        )}
        ...
        */}

        {/* STEP 2: Email Discovery (SINGLE MODE) */}
        {mode === 'single' && (
          <Section
            num="02"
            title="Email Discovery"
            subtitle="We generate permutations and verify via SMTP handshake"
            active={step === 2}
            done={step > 2}
          >
            <div style={{ marginBottom: 12 }}>
              <Label>Target domain</Label>
              <div className="terminal-border" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text3)', fontSize: 13 }}>@</span>
                <input
                  value={customDomain}
                  onChange={e => setCustomDomain(e.target.value)}
                  placeholder="company.com"
                  style={{ fontSize: 14 }}
                />
              </div>
            </div>

            {emails.length === 0 && step === 2 && (
              <button className="btn-primary" onClick={findEmails} disabled={loading} style={{ width: '100%' }}>
                {loading ? 'Running Discovery Engine...' : 'Generate & Verify Emails →'}
              </button>
            )}

            {emails.length > 0 && (
              <div className="slide-in">
                <Label>Select email recipients ({selectedEmails.length} selected)</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
                  {emails.map((e, i) => {
                    const isSelected = selectedEmails.includes(e.email);
                    return (
                      <div
                        key={e.email}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedEmails(selectedEmails.filter(x => x !== e.email))
                          } else {
                            setSelectedEmails([...selectedEmails, e.email])
                          }
                        }}
                        style={{
                          padding: '12px 14px',
                          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                          background: isSelected ? 'var(--accent-dim2)' : 'var(--bg2)',
                          cursor: 'pointer',
                          display: 'grid',
                          gap: 8,
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              style={{ cursor: 'pointer', width: 14, height: 14 }}
                            />
                            <span className={`status-dot ${e.verified ? 'verified' : e.confidence === 'high' ? 'probable' : 'unverified'}`} />
                            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{e.email}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {!e.verified && (
                              <button
                                onClick={(e_stop) => {
                                  e_stop.stopPropagation();
                                  verifySingleEmail(e.email);
                                }}
                                disabled={verifyingEmail === e.email}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '10px',
                                  background: 'transparent',
                                  border: '1px solid var(--accent)',
                                  color: 'var(--accent)',
                                  cursor: 'pointer',
                                  borderRadius: '2px',
                                  opacity: verifyingEmail === e.email ? 0.5 : 1
                                }}
                              >
                                {verifyingEmail === e.email ? '...' : 'Verify'}
                              </button>
                            )}
                            <span className={`tag tag-${e.confidence}`}>{e.confidence}</span>
                            {e.verified && <span className="tag tag-high">verified</span>}
                          </div>
                        </div>

                        {verificationMessages[e.email] && (
                          <div style={{
                            fontSize: 10,
                            color: e.verified ? 'var(--accent)' : 'var(--text3)',
                            padding: '4px 8px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '2px',
                            borderLeft: `2px solid ${e.verified ? 'var(--accent)' : 'var(--border)'}`
                          }}>
                            {e.verified ? '✅ ' : 'ℹ️ '} {verificationMessages[e.email]}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {step === 2 && (
                  <button
                    className="btn-primary"
                    onClick={() => setStep(3)}
                    disabled={selectedEmails.length === 0}
                    style={{ marginTop: 16, width: '100%' }}
                  >
                    Continue with {selectedEmails.length} recipient{selectedEmails.length !== 1 ? 's' : ''} →
                  </button>
                )}
              </div>
            )}
          </Section>
        )}

        {/* STEP 3: Your Information & CV */}
        {mode === 'single' && step >= 3 && (
          <Section
            num="03"
            title="Your Information"
            subtitle="Enter your details and upload your CV for the AI analyzer."
            active={step === 3}
            done={step > 3}
          >
            <div className="slide-in" style={{ display: 'grid', gap: 16 }}>
              <Field
                label="Full Name"
                value={cvInfo.name}
                onChange={v => setCvInfo({ ...cvInfo, name: v })}
                placeholder="John Doe"
              />

              <Field
                label="Target Job Role"
                value={jobRole}
                onChange={setJobRole}
                placeholder="e.g. Senior Frontend Engineer"
              />

              <Field
                label="Key Skills"
                value={cvInfo.skills}
                onChange={v => setCvInfo({ ...cvInfo, skills: v })}
                placeholder="React, Next.js, TypeScript, Backend logic..."
                multiline
              />

              <Field
                label="Work Experience"
                value={cvInfo.experience}
                onChange={v => setCvInfo({ ...cvInfo, experience: v })}
                placeholder="Brief summary of your internships or past jobs..."
                multiline
              />

              <Field
                label="Key Projects"
                value={cvInfo.projects}
                onChange={v => setCvInfo({ ...cvInfo, projects: v })}
                placeholder="List 2-3 major projects you've worked on..."
                multiline
              />

              <div style={{ marginBottom: 14 }}>
                <Label>Upload CV (for attachment)</Label>
                <div
                  className="terminal-border"
                  onClick={() => fileRef.current?.click()}
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    borderStyle: 'dashed',
                    background: cvFile ? 'var(--accent-dim)' : 'var(--bg2)',
                    transition: 'all 0.2s',
                    borderRadius: '4px'
                  }}
                >
                  <span style={{ color: 'var(--accent)', fontSize: 20, display: 'block', marginBottom: 4 }}>
                    {cvFile ? '✅' : '📄'}
                  </span>
                  <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, display: 'block' }}>
                    {cvFile ? cvFile.name : 'Click to upload CV'}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.doc"
                    style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && setCvFile(e.target.files[0])}
                  />
                </div>
              </div>

              <button
                className="btn-primary"
                onClick={() => {
                  if (!cvInfo.name || !jobRole) return err('Name and Target Role are required')
                  setStep(4)
                }}
                disabled={!cvInfo.name || !jobRole}
                style={{ width: '100%' }}
              >
                Continue to Send →
              </button>
            </div>
          </Section>
        )}


        {/* STEP 4: Send (SINGLE MODE) */}
        {mode === 'single' && step >= 4 && (
          <Section
            num="04"
            title="Send Email"
            subtitle="Connect your Gmail to send. Your credentials are never stored."
            active={step === 4}
            done={!!success}
          >
            {!emailBody ? (
              <div className="slide-in" style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Your Gmail" value={senderEmail} onChange={setSenderEmail} placeholder="you@gmail.com" type="email" />
                  <div>
                    <Label>Gmail App Password</Label>
                    <div className="terminal-border" style={{ padding: '10px 14px' }}>
                      <input type="password" value={senderPassword} onChange={e => setSenderPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" style={{ fontSize: 13 }} />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Groq API Key (Lightning Fast)</Label>
                  <div className="terminal-border" style={{ padding: '10px 14px' }}>
                    <input type="password" value={groqKey} onChange={e => setGroqKey(e.target.value)} placeholder="gsk_..." style={{ fontSize: 13 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Using Groq Llama-3 for near-instant generation.</span>
                    <span style={{ color: 'var(--text2)' }}>
                      Note: You can get a free key from <a href="https://unsecuredapikeys.com" target="_blank" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>unsecuredapikeys.com</a> or <a href="https://console.groq.com" target="_blank" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>console.groq.com</a>
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  <span onClick={() => setShowGuide(!showGuide)} style={{ color: 'var(--accent)', cursor: 'pointer' }}>
                    Help: How to get a Gmail App Password?
                  </span>
                </div>

                {showGuide && (
                  <div className="slide-in" style={{
                    padding: '12px', background: 'var(--bg3)', border: '1px solid var(--border)',
                    fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, borderRadius: '4px'
                  }}>
                    <strong style={{ color: 'var(--text)' }}>Step-by-Step Guide:</strong>
                    <ol style={{ paddingLeft: '16px', marginTop: '6px' }}>
                      <li>Open <a href="https://myaccount.google.com/security" target="_blank" style={{ color: 'var(--accent)' }}>Google Security Settings</a></li>
                      <li>Enable <strong style={{ color: 'var(--text)' }}>2-Step Verification</strong></li>
                      <li>Search for "App passwords" in the top bar</li>
                      <li>Create a new password named "MailScout" and copy the 16-character code</li>
                    </ol>
                  </div>
                )}

                <button
                  className="btn-primary"
                  onClick={generateManualDraft}
                  disabled={!senderPassword || draftLoading}
                  style={{ width: '100%' }}
                >
                  {draftLoading ? '✨ Analyzing & Drafting...' : '✨ Generate AI Email'}
                </button>
              </div>
            ) : (
              <div className="slide-in" style={{ display: 'grid', gap: 16 }}>
                <Label>AI Draft Generated ✓</Label>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div className="terminal-border" style={{ padding: '10px 14px', borderRadius: '4px' }}>
                    <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={{ fontSize: 13, fontWeight: 600 }} />
                  </div>
                  <div className="terminal-border" style={{ padding: '12px 14px', borderRadius: '4px' }}>
                    <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={10} style={{ fontSize: 13, lineHeight: 1.6 }} />
                  </div>
                </div>

                <div style={{
                  padding: '12px', background: 'var(--bg3)', border: '1px solid var(--border)',
                  fontSize: 12, color: 'var(--text2)', borderRadius: '4px'
                }}>
                  <div><strong style={{ color: 'var(--text)' }}>Recipients:</strong> {selectedEmails.length} addresses selected</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, maxHeight: '60px', overflowY: 'auto' }}>
                    {selectedEmails.join(', ')}
                  </div>
                  <div style={{ marginTop: 8 }}><strong style={{ color: 'var(--text)' }}>With:</strong> {cvFile?.name || 'Attached CV'}</div>
                </div>

                <button className="btn-primary" onClick={sendEmail} disabled={loading} style={{ width: '100%' }}>
                  {loading ? 'Sending...' : `🚀 Send Out Now`}
                </button>

                <button className="btn-ghost" onClick={() => setEmailBody('')} style={{ width: '100%', fontSize: 11 }}>
                  🔄 Rewrite / Change Details
                </button>
              </div>
            )}

            {success && (
              <button className="btn-ghost" onClick={() => {
                setStep(1);
                setProfile({
                  firstName: '', middleName: '', lastName: '', fullName: '',
                  nameVariations: '',
                  company: '', headline: '', personalEmailGuess: '', inferredDomain: '', about: ''
                });
                setEmails([])
                setSelectedEmails([]); setEmailSubject(''); setEmailBody('')
                setSuccess(''); setCvFile(null);
              }} style={{ width: '100%', marginTop: 8 }}>
                Scout Another Target →
              </button>
            )}
          </Section>
        )}

        {error && step !== 4 && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(255,68,68,0.05)',
            border: '1px solid rgba(255,68,68,0.2)',
            color: 'var(--red)',
            fontSize: 12,
            marginTop: 16
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Success Modal */}
        {showSuccessModal && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}>
            <div className="slide-in" style={{
              background: 'var(--bg2)',
              border: '1px solid var(--accent)',
              padding: '40px',
              maxWidth: '400px',
              width: '100%',
              textAlign: 'center',
              borderRadius: '8px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚀</div>
              <h2 style={{ fontSize: '24px', color: 'var(--text)', marginBottom: '12px' }}>Emails Sent!</h2>
              <p style={{ color: 'var(--text3)', fontSize: '14px', marginBottom: '30px', lineHeight: 1.6 }}>
                Your outreach has been launched successfully. High-five! 🖐️
              </p>
              <button
                className="btn-primary"
                onClick={() => {
                  setShowSuccessModal(false);
                  setStep(1);
                  setProfile({
                    firstName: '', middleName: '', lastName: '', fullName: '',
                    nameVariations: '',
                    company: '', headline: '', personalEmailGuess: '', inferredDomain: '', about: ''
                  });
                  setEmails([])
                  setSelectedEmails([]); setEmailSubject(''); setEmailBody('')
                  setSuccess(''); setCvFile(null);
                }}
                style={{ width: '100%' }}
              >
                Scout Another Target →
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer style={{ marginTop: 80, paddingTop: 24, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ color: 'var(--text3)', fontSize: 11, letterSpacing: '0.1em' }}>
            MAILSCOUT.APP — YOUR CREDENTIALS ARE NEVER STORED
          </p>
        </footer>
      </main>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExtractedSection({ title, expanded, onToggle, content }: {
  title: string
  expanded: boolean
  onToggle: () => void
  content: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--text)',
          fontWeight: 600,
          fontSize: 13,
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg3)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <span>{title}</span>
        <span style={{ fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 14px 16px' }}>
          {content}
        </div>
      )}
    </div>
  )
}

function Section({ num, title, subtitle, active, done, children }: {
  num: string, title: string, subtitle: string,
  active: boolean, done: boolean, children: React.ReactNode
}) {
  return (
    <div style={{
      marginBottom: 32,
      opacity: active || done ? 1 : 0.4,
      transition: 'opacity 0.3s'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
        <div style={{
          minWidth: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--border)'}`,
          background: done ? 'var(--accent)' : active ? 'var(--accent-dim)' : 'transparent',
          fontSize: 11, fontWeight: 700,
          color: done ? '#000' : active ? 'var(--accent)' : 'var(--text3)'
        }}>
          {done ? '✓' : num}
        </div>
        <div>
          <h2 style={{
            fontFamily: 'var(--font-sans)', fontWeight: 700,
            fontSize: 18, letterSpacing: '-0.02em', marginBottom: 4
          }}>{title}</h2>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>{subtitle}</p>
        </div>
      </div>
      <div style={{ paddingLeft: 52 }}>
        {children}
      </div>
    </div>
  )
}

function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <div className="slide-in" style={{
      marginTop: 12,
      padding: '14px 16px',
      background: 'var(--bg2)',
      border: '1px solid var(--accent)',
      display: 'flex', gap: 12, alignItems: 'flex-start'
    }}>
      <div style={{
        width: 40, height: 40, background: 'var(--accent-dim)',
        border: '1px solid var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 700, color: 'var(--accent)',
        flexShrink: 0
      }}>
        {profile.firstName?.[0]}{profile.lastName?.[0]}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-sans)' }}>{profile.fullName}</div>
        <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 2 }}>{profile.headline}</div>
        {profile.company && (
          <div style={{ color: 'var(--accent)', fontSize: 11, marginTop: 4 }}>
            @ {profile.company}
          </div>
        )}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, multiline, type }: {
  label: string, value: string, onChange: (v: string) => void,
  placeholder?: string, multiline?: boolean, type?: string
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <Label>{label}</Label>
      <div className="terminal-border" style={{ padding: '10px 14px' }}>
        {multiline ? (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={2}
            style={{ fontSize: 13, resize: 'none', lineHeight: 1.6 }}
          />
        ) : (
          <input
            type={type || 'text'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ fontSize: 13 }}
          />
        )}
      </div>
    </div>
  )
}
