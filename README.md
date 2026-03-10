# MailScout 🎯
> Paste a LinkedIn URL. Find their email. AI writes it. Sends with your CV.

A free, self-hosted cold outreach automation tool for job seekers.

## Features
- 🔍 **LinkedIn Profile Scraper** — extracts name, company, role from public profiles
- 📧 **Email Permutation Engine** — generates 12+ email patterns
- ✅ **SMTP Verification** — verifies emails via handshake (no email sent, no API needed)
- 🤖 **AI Email Drafting** — personalized cold emails via Groq (free tier)
- 📤 **Gmail Sender** — sends via your own Gmail SMTP (500/day free)
- 📎 **CV Attachment** — attach your PDF/DOC with one click

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Hosting**: Vercel (free)
- **Email**: Nodemailer + Gmail SMTP
- **AI**: Groq API (free tier — llama3-8b)
- **Cost**: $0 to run

## Setup

### 1. Clone and install
```bash
git clone https://github.com/yourusername/mailscout
cd mailscout
npm install
```

### 2. Environment variables
```bash
cp .env.example .env.local
# No required env vars — everything is entered in the UI
```

### 3. Run locally
```bash
npm run dev
# Open http://localhost:3000
```

### 4. Deploy to Vercel (free)
```bash
npm install -g vercel
vercel
```

## How to Use

### Step 1 — Paste LinkedIn URL
```
https://linkedin.com/in/someones-profile
```

### Step 2 — Email Discovery
- Auto-detects company domain
- Generates email permutations
- SMTP-verifies the top candidates
- Shows confidence scores

### Step 3 — Draft Email
- Enter your name + target role
- Optionally add Groq API key for AI draft (free at console.groq.com)
- Edit the generated email freely

### Step 4 — Send
- Enter your Gmail address
- Enter Gmail App Password (NOT your regular password)
  - Enable 2FA first: myaccount.google.com/security
  - Create App Password: myaccount.google.com/apppasswords
- Attach your CV
- Hit Send

## Gmail App Password Setup
1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Security → 2-Step Verification → Enable it
3. Security → App passwords
4. Select "Mail" and your device
5. Copy the 16-character password
6. Use this in MailScout (not your Gmail login password)

## Get Groq API Key (Free AI)
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up (free)
3. API Keys → Create new key
4. Paste in MailScout Step 3

## Privacy & Security
- ✅ LinkedIn scraping uses public profiles only (no login)
- ✅ Gmail credentials are NEVER stored — used only for the current send
- ✅ No database required for MVP
- ✅ All processing happens on your own server

## Limitations
- LinkedIn may block scraping for some profiles (they rate-limit)
- Some mail servers use "catch-all" — all emails appear valid
- Gmail free tier: 500 emails/day
- SMTP verification may fail on ports blocked by hosting providers

## Roadmap
- [ ] Chrome extension (button on LinkedIn profiles)
- [ ] Bulk CSV mode (upload 50 LinkedIn URLs)
- [ ] Follow-up sequences
- [ ] Email open tracking
- [ ] Dashboard with reply rates

## License
MIT — use it, sell it, do what you want.
