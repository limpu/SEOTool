# 🚀 SEOTool — Open-Source AI-Powered SEO Intelligence & Audit Platform

<div align="center">

![SEOTool Banner](docs/images/banner.svg)

<p align="center">
  <strong>Production-Grade, 100% Self-Hosted, Zero-Paid-API Autonomous SEO Crawler, AI Engine Optimization (AEO), Core Web Vitals, and Deep Technical Auditing Platform.</strong>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.2-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?style=for-the-badge&logo=drizzle)](https://orm.drizzle.team/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Local AI](https://img.shields.io/badge/Ollama-Local_LLM-orange?style=for-the-badge)](https://ollama.com/)

[**GitHub Repository**](https://github.com/limpu/SEOTool) • [**Live Installation**](#-quick-start) • [**Feature Tour**](#-core-features--functionalities) • [**Architecture**](#-system-architecture) • [**Author Profile**](https://www.linkedin.com/in/atiqueullahlimon)

</div>

---

## 📌 Overview

**SEOTool** is an enterprise-grade, open-source intelligence platform designed to replace expensive commercial SEO suites (Semrush, Ahrefs, Screaming Frog) with a **private, 100% self-hosted platform running with zero recurring third-party API token costs**.

Built for modern search dynamics, **SEOTool** audits traditional search algorithms (Google, Bing) alongside **AI Search Engines and Generative Answer Engines (ChatGPT Search, Perplexity, Google SGE, Claude Bot)**.

---

## 📸 Product Interface Preview

<div align="center">

![Dashboard Preview](docs/images/dashboard-preview.svg)

</div>

---

## 💡 Why SEOTool? (The Value Proposition)

| Challenge in Commercial SEO Tools | SEOTool Open-Source Solution |
| :--- | :--- |
| **Expensive Monthly Subscriptions** ($120 - $500+/mo per seat) | **100% Free & Open Source** (MIT License). Host on your own VPS or home server. |
| **Per-Page & Per-Crawl Token Limits** | **Unlimited Crawls & Audits**. Your hardware is the only limit. |
| **Data Privacy & Third-Party Leakage** | **Zero Data Sharing**. All crawled site structures, keywords, and client audits remain in your private database. |
| **No Next-Gen AI Search (AEO) Auditing** | **Native Answer Engine Optimization (AEO)** audits page answerability, `llms.txt`, and AI crawler permissions. |
| **Expensive Third-Party AI API Bills** | **Local LLM Integration via Ollama**. Run Llama 3, Mistral, or DeepSeek locally with $0 API expense. |
| **Locked Multi-User Access** | **Built-in RBAC Multi-Tenancy**. Create unlimited client accounts, custom tiered plans, and feature quotas. |

---

## 👥 Who Needs SEOTool?

1. **Digital Marketing & SEO Agencies**: Deliver white-label client site audits, manage dozens of client domains under dedicated workspaces, and generate automated PDF/CSV reports without per-seat charges.
2. **Full-Stack Developers & DevOps**: Integrate technical SEO checks and Lighthouse Core Web Vitals into continuous monitoring without depending on paid SaaS APIs.
3. **Indie Hackers & Startup Founders**: Gain enterprise SEO intelligence for new ventures with zero overhead cost.
4. **Privacy-Conscious Organizations & Enterprises**: Keep sensitive pre-launch URLs, intranet sites, and proprietary content audits fully isolated on internal infrastructure.
5. **Content Publishers & Bloggers**: Optimize articles for both traditional SERP rankings and modern conversational AI answer citations.

---

## ⚡ Core Features & Functionalities

### 1. 🕷️ High-Performance Autonomous Crawler
* **Multi-Threaded Concurrency Engine**: Fast, non-blocking asynchronous crawling powered by native Node.js streams and Cheerio DOM parsing.
* **SSRF (Server-Side Request Forgery) Guard**: Rigorous IP resolution filtering blocks private LAN access, localhost, AWS metadata IPs, and internal loopbacks.
* **Comprehensive Resource Ingestion**: Automatically crawls, discovers, and tracks HTML pages, internal links, external links, anchor text distribution, and media assets.
* **Robots.txt & XML Sitemap Processing**: Real-time robots parser with User-Agent matching, crawl-delay adherence, and recursive sitemap index discovery.

### 2. 🔍 Deep Technical SEO & On-Page Audit Engine
* **90+ Automated Heuristic Rules**: Evaluates indexability, status codes (200, 301, 302, 404, 500), canonical tags, and redirect loops.
* **Metadata & Headings Quality**: Audits `<title>`, `<meta description>`, OpenGraph tags, Twitter Cards, H1/H2/H3 tag hierarchies, and text-to-HTML ratios.
* **Schema Markup & Structured Data**: Validates JSON-LD and Microdata blocks against Schema.org definitions (Article, Organization, BreadcrumbList, Product, FAQPage, etc.).
* **Image Optimization Audits**: Detects missing `alt` attributes, unoptimized dimensions, oversized assets, and broken image sources.

### 3. 🧠 AI Search & Answer Engine Optimization (AEO)
* **AI Bot Crawler Directives**: Audits access for OpenAI (`GPTBot`), Perplexity (`PerplexityBot`), Anthropic (`ClaudeBot`), Google (`Google-Extended`), and Common Crawl.
* **`llms.txt` & `llms-full.txt` Standard Support**: Analyzes and monitors emerging LLM documentation files used by modern AI discovery engines.
* **AI Answerability Scoring**: Evaluates content density, direct answer clarity, bulleted fact summaries, and citation suitability for AI answer generation.
* **Local Semantic Gap Analysis**: Powered by local Ollama LLMs to uncover missing topical subheads and semantic entity gaps compared to top-ranking pages.

### 4. 🛡️ E-E-A-T & Trust Scoring Engine
* **Experience & Expertise**: Detects author bios, author Schema credentials, editorial review policies, and primary source citations.
* **Authoritativeness & Trust**: Checks presence of Privacy Policy, Terms of Service, physical contact information, copyright statements, and SSL/HTTPS enforcement.
* **Categorized Trust Severity**: Issues ranked by Severity (Critical, Warning, Notice) with exact code-level remediation recipes.

### 5. ⚡ Core Web Vitals & Performance (Lighthouse)
* **Headless Chromium Integration**: Executes real Chrome browser instances to measure live page rendering metrics.
* **Core Web Vitals Assessment**: Measures Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), Interaction to Next Paint (INP), First Contentful Paint (FCP), and Time to First Byte (TTFB).
* **Diagnostic Code Recommendations**: Identifies render-blocking scripts, uncompressed payloads, and layout shifting DOM nodes.

### 6. 📈 Native Google Search Console (GSC) & GA4 Integration
* **Direct Google API Sync**: Connect your Google Search Console and Google Analytics 4 properties via OAuth 2.0.
* **AES-256-GCM Token Encryption**: OAuth refresh tokens and API secrets are encrypted at rest using military-grade AES-256-GCM encryption.
* **Search Analytics**: Tracks real user clicks, impressions, click-through rates (CTR), and average search ranking positions over time.

### 7. 🎯 Competitor Intelligence & Benchmarking
* **Side-by-Side Domain Comparison**: Benchmark your website against direct competitors across health score, crawled pages, indexation, and E-E-A-T trust.
* **Content Gap Matrix**: Compare keyword and content coverage to spot untapped search opportunities.

### 8. 🏢 Multi-Tenant RBAC & Package Management
* **Role-Based Access Control**: Granular permission matrix supporting `SUPER_ADMIN`, `ADMIN`, `MEMBER`, and `VIEWER` roles.
* **Custom Plan Packages**: Define tiers (e.g., Free, Starter, Agency, Enterprise) with quotas for maximum websites, monthly crawl pages, and keyword tracking limits.
* **Self-Service Account Management**: User profile management, password updates, and secure email change verification.

### 9. 📑 Automated White-Label Reports
* **Exportable Formats**: Generate comprehensive PDF, structured CSV, and standalone HTML audit reports.
* **Client-Ready Branding**: Clean, visual summaries formatted for executive presentations and technical development teams.

### 10. 🛠️ Self-Healing 1-Click Web Installer (`/install`)
* **Automated Environment Verification**: Checks Node.js runtime, PostgreSQL connectivity, Chromium binary availability, and required environment secrets.
* **Zero-Touch Migration Runner**: Applies all 24 database migrations sequentially inside isolated transactions.
* **Ephemeral Token Security**: Secured by an ephemeral install token; automatically locks permanently once the initial Super Admin account is provisioned.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend Client (Next.js 16 App Router)"]
        UI["React 19 Server & Client Components"]
        Tailwind["Tailwind CSS v4 + Recharts Data Visualizations"]
    end

    subgraph Server["Application Server & API"]
        Middleware["Session & RBAC Middleware"]
        Auth["Jose JWT + DB Session Revocation"]
        Crawler["Autonomous Multi-Threaded Crawler"]
        Heuristics["90+ Technical SEO Rule Engines"]
        Lighthouse["Headless Chromium / Lighthouse CWV"]
        GoogleSync["Encrypted GSC & GA4 Sync Engine"]
    end

    subgraph AI["Local AI Gateway (Zero Cost)"]
        Ollama["Ollama Local LLM (Llama 3.2 / Mistral / DeepSeek)"]
        AEO["Answer Engine Readiness & Semantic Gap Analysis"]
    end

    subgraph Data["Persistent Storage"]
        Drizzle["Drizzle ORM 0.45"]
        Postgres[("PostgreSQL 18 Database")]
    end

    UI --> Middleware --> Server
    Server --> Drizzle --> Postgres
    Server --> Lighthouse
    Server --> AI
    Ollama --> AEO
    Server --> GoogleSync
```

---

## 🛠️ Tech Stack & Dependencies

* **Frontend**: Next.js 16 (App Router with Turbopack), React 19, Tailwind CSS v4, Lucide Icons, Recharts
* **Backend**: Node.js v20+ / v24, Next.js Route Handlers, Cheerio, Fast-XML-Parser, Nodemailer
* **Database & ORM**: PostgreSQL 18, Drizzle ORM, Drizzle Kit
* **Authentication**: Jose (HS256 JWT in HttpOnly secure cookies), Bcryptjs, DB-backed rate limiting & session revocation
* **Performance Testing**: Lighthouse 13, Chrome Launcher, Headless Chromium
* **AI Engine**: Ollama HTTP API (Local inference)
* **Testing & Quality**: Vitest 4, Playwright 1.62, ESLint 10, TypeScript 7

---

## 🚀 Quick Start Guide

### Prerequisites
* **Node.js**: v20.18.0 or newer (v24 LTS recommended)
* **Package Manager**: `pnpm` (v9 or v11 recommended)
* **Docker & Docker Compose** (or a local PostgreSQL 18 instance)

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/limpu/SEOTool.git
cd SEOTool
```

---

### Step 2: Start PostgreSQL Database via Docker

Launch PostgreSQL 18 in a lightweight Docker container:

```bash
docker run --name seo-postgres \
  -e POSTGRES_USER=seo_user \
  -e POSTGRES_PASSWORD=seo_password \
  -e POSTGRES_DB=seo_platform \
  -p 5434:5432 \
  -d postgres:18
```

*(Note: Port `5434` is mapped to avoid conflicts with native PostgreSQL installations running on port `5432`)*

---

### Step 3: Configure Environment Variables

Copy the provided `.env.example` template:

```bash
cp .env.example .env
```

Ensure your `DATABASE_URL` matches your PostgreSQL connection:
```env
DATABASE_URL=postgresql://seo_user:seo_password@localhost:5434/seo_platform
JWT_SECRET=generate_a_random_32_character_secret_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

### Step 4: Install Dependencies & Run Database Migrations

```bash
# Install packages
pnpm install

# Apply database migrations
Get-ChildItem "database\migrations\*.sql" | Sort-Object Name | ForEach-Object {
  Get-Content $_.FullName | docker exec -i seo-postgres psql -U seo_user -d seo_platform
}
```

---

### Step 5: Start the Development Server

```bash
pnpm dev
```

Open your browser and navigate to:
👉 **`http://localhost:3000`** (or `http://localhost:3001` if port 3000 is occupied)

Complete the web installer at `/install` or sign in with your administrator account.

---

## 🔒 Security & Privacy Architecture

* **Zero Cloud Data Telemetry**: No tracking pixels, external analytics, or remote logging.
* **Encrypted Secrets at Rest**: Google OAuth tokens and credentials are encrypted using AES-256-GCM with independent salt keys.
* **SSRF Shielding**: The crawler strictly disallows fetching loopback addresses, link-local IPs, RFC 1918 private subnets, and cloud instance metadata endpoints.
* **Constant-Time Verification**: Verification OTPs and password reset tokens use SHA-256 with constant-time buffer comparison to prevent timing attacks.

---

## 🤝 Contributing

Contributions make the open-source community thrive! Any contributions you make are **greatly appreciated**.

1. Fork the Project (`https://github.com/limpu/SEOTool/fork`)
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 👨‍💻 Author & Maintainer

<table border="0">
  <tr>
    <td width="80" align="center">
      <img src="public/icon.svg" width="60" height="60" alt="Atique Ullah" />
    </td>
    <td>
      <strong>Developed by Atique Ullah</strong><br />
      Full-Stack Software Engineer &amp; AI Systems Architect<br />
      🔗 <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/atiqueullahlimon" target="_blank">linkedin.com/in/atiqueullahlimon</a><br />
      🐙 <strong>GitHub:</strong> <a href="https://github.com/limpu" target="_blank">@limpu</a>
    </td>
  </tr>
</table>

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

<div align="center">
  <sub>Built with care by <a href="https://www.linkedin.com/in/atiqueullahlimon">Atique Ullah</a>. Star ⭐ the repository if you find it helpful!</sub>
</div>
