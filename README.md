# MailScout 🎯
> Enter target details. Generate verified emails. AI drafts the outreach. Send with your CV.

A powerful, self-hosted cold outreach automation tool for job seekers, optimized for speed and security.

## ⚠ Feature Notice
LinkedIn scraping is currently disabled as LinkedIn has hardened its security against automated extraction. The workflow has been updated to **Manual Input** to ensure 100% reliability and deliverability.

## Features
- 📧 **Enhanced Permutation Engine** — generates 25+ email patterns for maximum reach.
- ✅ **Real-Life SMTP Verification** — performs "handshake" checks and catch-all detection to prove a mailbox exists before you send.
- 🤖 **Fast AI Drafting** — personalized cold emails via Groq Llama-3 (near-instant generation).
- 📤 **Gmail Integration** — sends via your own Gmail SMTP.
- 📎 **CV Attachment** — automatically attaches your resume/CV to every outreach.
- 🔒 **Privacy First** — API keys and credentials are never stored.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Hosting**: Vercel (free)
- **Email**: Nodemailer + Gmail SMTP
- **AI Engine**: Groq (Llama-3 70B)
- **Cost**: $0 to run

## Setup

### 1. Clone and install
```bash
git clone https://github.com/Vallabh1807/mailscout.git
cd mailscout
npm install
```

### 2. Environment Variables
Create a `.env.local` file based on `.env.example`:
```bash
GROQ_API_KEY=your_key
GMAIL_USER=your_email@gmail.com
GMAIL_PASS=your_app_password
```

### 3. Run locally
```bash
npm run dev
```

---

## The Workflow

### Step 1 — Target Profile
Manually enter the **First Name, Last Name, and Company** of the person you want to reach.

### Step 2 — Email Discovery & Verification
The engine generates combinations and verifies them. 
- Click **"Verify"** on any email to get "real-life" proof.
- View server logs (e.g., "Verified! The server confirmed this mailbox exists").
- Select one or multiple verified addresses.

### Step 3 — Your Information
Provide your professional background:
- **Details**: Name, Target Role, Skills, Projects, Experience.
- **Upload**: Select your PDF/DOCX CV for attachment.

### Step 4 — AI Drafting & Sending
1. **Groq API Key**: Get it for free at [console.groq.com](https://console.groq.com) or [unsequreapi.com](https://unsequreapi.com).
2. **Gmail App Password**: Enter your Gmail and 16-digit App Password.
3. **Draft**: Click "Generate AI Email". The AI uses a professional multi-paragraph reference to write your message.
4. **Send**: One-click send.

---

## Gmail App Password Setup
1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Security → 2-Step Verification → Enable it.
3. Search for "App passwords" in the top search bar.
4. Create a new password named "MailScout".
5. Copy the 16-character code.

## Privacy & Security
- ✅ **No Data Storage**: Your Gmail password and API keys are processed only for the current session.
- ✅ **Server-Side API**: Sensitive API calls are handled via Next.js backend routes to prevent leakage.
- ✅ **GitHub Safe**: The `.gitignore` ensures your local secrets are never pushed to the public repo.

## License
MIT — build, fork, and scout away.
