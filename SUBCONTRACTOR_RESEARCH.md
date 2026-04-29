# Sub-Management Module: Ground-Truth Research for Sylk v1

Research deliverable. Scope: US small-to-mid GCs and hybrid service businesses, with Brazil delta. All non-obvious claims cited inline.

---

## 1. Executive Summary — the 10 must-haves for v1

1. **COI tracking with expiry alerts and auto-blocks on payment.** Single highest-frequency, highest-liability touchpoint. Without it, a GC can be cited by OSHA and forced to cover injuries on its own workers' comp.
2. **Lien-waiver workflow tied to every payment cycle.** Conditional-on-progress before payment, unconditional-on-progress after payment clears, conditional-final / unconditional-final at closeout.
3. **A single sub profile any GC can re-use across projects.** #1 sub complaint is retyping the same data into every GC's portal. Wedge against Procore.
4. **Document set: W9, COI, additional-insured endorsement, business/contractor license, signed MSA, signed subcontract per job, lien waivers, final closeout pack.** That's the 80%.
5. **Per-project COI naming the project owner as additional insured + primary/non-contributory + waiver of subrogation language.** The annual master COI is not enough.
6. **Compliance gating on payment release.** If COI is expired, license expired, or required prior lien waiver missing, payment cannot be approved.
7. **Sub-side mobile-first UX.** Subs hate slow, bloated GC portals; they fill forms on phones in trucks.
8. **Lightweight prequalification — not AIA A305 in v1.** For small/mid GCs the threshold is "do we have a COI and license?"
9. **State-aware notice/lien deadline reminders for the four big states.** CA 20-day, TX monthly notice (15th of 3rd month), FL 45-day NTO, NY 8-month lien window.
10. **Long-term sub record.** Trades, geography, EMR, on-time score, callback count, dispute count, preferred flag.

---

## 2. The Document / Event Matrix

| Document | Trigger | Frequency | Issuer | Consumer | If missing |
|---|---|---|---|---|---|
| W9 (IRS Form W-9) | Onboarding a sub vendor | Once, refreshed if EIN/address changes | Sub | GC AP / accounting | Cannot 1099, IRS penalties; can't cut first check |
| EIN verification | Onboarding | Once | IRS / Sub | GC AP | Same as W9 |
| Contractor license (state/local) | Onboarding | Annual or 1–2 yr renewal | State licensing board | GC PM, owner | Sub may be working illegally; voidable contract in license-required states |
| Specialty trade license (electrical/plumbing/HVAC/fire) | Onboarding for that trade | 1–3 yr | State board | GC PM | Code violations, failed inspections |
| Business license / DBA | Onboarding | Annual | City / county | GC AP | Vendor cannot be onboarded |
| Master COI (GL, WC, Auto, Umbrella) | Onboarding | Annual; mid-year if cancelled | Sub's broker / carrier | GC compliance, owner, lender | OSHA citation, GC forced to cover injury under its own WC |
| Per-project COI (additional insured) | Award of project | Per project; refresh if policy renews mid-project | Sub's broker | GC PM, owner | GC not actually covered under sub's policy for this site |
| Additional Insured Endorsement (CG 20 10 / CG 20 37) | Per project | Per project | Sub's carrier | GC compliance | COI alone is informational; no contractual rights without endorsement |
| Waiver of Subrogation endorsement (CG 24 04) | Per project | Per project | Sub's carrier | GC compliance | Sub's insurer can subrogate against GC |
| Primary & Non-Contributory language | Per project | Per project | Sub's carrier | GC compliance | GC's own GL pays first instead of sub's |
| Workers' Comp certificate (statutory) | Onboarding | Annual | Sub's WC carrier | GC compliance | GC's WC mod inflates if sub-employee gets hurt |
| Bond (performance/payment) | Award (larger projects, public work) | Per project | Sub's surety | Owner, lender | No security against sub default |
| EMR rating letter | Prequal (larger GCs) | Annual | Sub's WC carrier / NCCI | GC safety / risk | Commercial GCs require <1.0, high-risk projects <0.85 |
| OSHA 300/300A logs (3 yrs) | Prequal | Annual | Sub | GC safety | Inability to assess incident rate |
| Drug/alcohol testing policy | Onboarding | Annual | Sub | GC safety | Site policy violation |
| Safety program / written safety plan | Per project | Per project | Sub | GC safety, OSHA | Multi-employer citation risk |
| MSA (Master Subcontract Agreement) | First engagement | Once, then referenced by Work Orders | GC drafts, both sign | GC, sub | No baseline terms |
| Subcontract / Work Order (per project) | Award | Per project (+ change orders) | GC | Both | No enforceable scope |
| References / past project list | Prequal | Once, refreshed annually | Sub | GC | No vetting |
| Financial statements | Prequal (larger GCs only) | Annual | Sub's CPA | GC risk | Bonding capacity unknown |
| Preliminary notice (CA 20-day, TX monthly, FL NTO 45-day) | First furnishing labor/materials | Per project, per state | Sub | Owner, GC, lender | Sub loses lien rights |
| Invoice / Pay App (AIA G702/G703 style) | Each draw | Monthly typically | Sub | GC AP | No payment |
| Conditional waiver on progress payment | With each pay app | Per draw | Sub | GC AP | Owner/GC won't cut check; double-payment risk |
| Unconditional waiver on progress payment | After check clears | Per draw | Sub | GC | Lien still possible |
| Sworn statement (MI / IL etc.) | With pay apps | Per draw | GC (lists subs/suppliers) | Owner, title co | Title insurer won't insure draw |
| Certified payroll WH-347 | Each week, federally-funded or prevailing-wage projects | Weekly | Sub | GC, contracting agency | Debarment, civil/criminal exposure, withheld payment |
| Conditional waiver on final payment | With final pay app | Once | Sub | GC | No final draw |
| Unconditional waiver on final payment | After final check clears | Once | Sub | GC, owner, title co | Lien still possible against retainage |
| Warranty letter | Substantial completion | Once | Sub | GC, owner | No remedy for callbacks |
| As-built drawings / O&M manuals / closeout package | Substantial completion | Once | Sub | Owner / GC | Owner withholds retainage |
| Retainage release | After punch list / warranty start | Once | GC | Sub | Sub liens for retainage |

---

## 3. Insurance Cheat Sheet

**Typical minimums small/mid GCs require of subs:**

- Commercial General Liability: $1M per occurrence / $2M general aggregate / $2M products-completed-ops aggregate. Larger commercial: $2M/$4M plus umbrella up to $5M–$10M.
- Workers' Compensation: statutory limits in the state where work is performed; Employer's Liability $1M/$1M/$1M.
- Commercial Auto: $1M combined single limit (any auto, hired & non-owned).
- Umbrella / Excess: $1M minimum, $5M+ on commercial.
- Professional Liability (design-assist or design-build subs): $1M–$2M.
- Pollution Liability (environmental subs): $1M–$5M.

**Why the COI alone isn't enough.** The ACORD 25 COI is informational only — "this certificate does not amend, extend, or alter the coverage afforded." Coverage rights flow from the policy endorsement, not the certificate. So GCs require:

- **Additional Insured Endorsement (CG 20 10 ongoing-ops, CG 20 37 completed-ops)** — gives the GC direct coverage under the sub's policy.
- **Waiver of Subrogation (CG 24 04)** — sub's insurer can't sue the GC after paying a claim.
- **Primary & Non-Contributory** — sub's policy responds first, GC's own policy doesn't get tapped or rated up.

**If a sub's COI lapses mid-project and an injury occurs:** the GC is exposed under OSHA's multi-employer policy as the controlling employer. The GC's own workers' comp may be forced to cover the injured sub-employee — driving the GC's mod up and producing a six- or seven-figure claim.

**Verifying COIs aren't fake.** Real verification:
1. COI must come from a licensed broker/carrier, never directly from the sub.
2. Verify the broker is licensed at state DOI website.
3. Call the carrier (not the broker) using NAIC's lookup.
4. Watch for: quote numbers in policy-number field, mismatched broker domain, white-out, handwriting in typed sections.
5. Automated: Certificial, myCOI, Billy, TrustLayer pull policies via broker APIs.

---

## 4. Lien Waiver Flow

Four canonical waiver types:

| Type | Timing | Effect |
|---|---|---|
| Conditional progress | Submitted with pay app, before payment | Waives lien rights for that draw only if/when payment actually clears |
| Unconditional progress | Submitted after payment clears | Irrevocably waives lien rights for that draw |
| Conditional final | With final pay app | Waives all lien rights conditional on final payment clearing |
| Unconditional final | After final payment clears | Irrevocable, full waiver including retainage |

**Per-payment-cycle workflow GCs actually run:**

1. Sub submits pay app + conditional-on-progress waiver for current draw + unconditional-on-progress waiver for prior draw (since prior check has now cleared).
2. GC AP cross-checks: pay app math, conditional waiver matches amount, prior unconditional present, COI still in force, license still in force.
3. GC pays.
4. Once funds clear sub's account, sub returns unconditional-on-progress for current draw — collected at the next cycle.

**Pay-when-paid vs pay-if-paid:**

- **Pay-when-paid** = timing only; GC must pay sub within reasonable time even if owner stiffs the GC. Generally enforceable.
- **Pay-if-paid** = condition precedent; if owner doesn't pay, sub doesn't get paid. **Banned/unenforceable** in CA, NY, NC, NV, OH, IL, IN, KS, MT, SC, UT, WI, DE, VA.

**Double-payment exposure:** if GC pays sub-tier-1 and sub-tier-1 doesn't pay sub-tier-2 (or supplier), the unpaid lower tier can lien the owner's property even though the GC and owner already paid. That's why owners and lenders demand sworn statements and unconditional waivers from all tiers.

---

## 5. State Variation Summary

| State | Notice from sub | Lien deadline (private) | Pay-if-paid | License | Other |
|---|---|---|---|---|---|
| **CA** | 20-day preliminary notice from first furnishing | 90 days after completion (or 60 days after Notice of Completion) | **Banned** | Required, $25k bond, no reciprocity except AZ/LA/MS/NV/NC | Statutory waiver forms; only 4 specific forms valid |
| **TX** | Monthly notices on non-residential, by 15th of 3rd month after work; lien filed by 15th of 4th month | 15th of 4th month after last work | Enforceable (timing only) | No state GC license; specialty trades licensed by TDLR; cities run their own | "Trapping" notices |
| **FL** | Notice to Owner (NTO) within 45 days of first furnishing | 90 days after last furnishing | Enforceable | State certified or registered, $10k bond | Sales-tax-on-materials nuance |
| **NY** | No preliminary notice required generally; sub can lien up to 8 months after last work (4 months for single-family residential) | 8 months / 4 months | **Banned** | NYC and most localities license individually | NY Lien Law §3 |
| **MI** | — | 90 days after last furnishing | Enforceable | — | Statutory sworn statement required |
| **IL** | — | 4 months (with notice to owner) / 2 yrs of recording | **Banned** | — | Sworn statement notarized, under oath |

**Federal / prevailing wage overlay (Davis-Bacon):** weekly certified payroll WH-347 with notarized Statement of Compliance from every contractor and subcontractor on the site, retained 3 years, prime is responsible for collecting from all sub-tiers. Many states have parallel "little Davis-Bacon" rules.

---

## 6. Sub Experience Pain Points

1. **Portal-per-GC fatigue.** A single sub crew on five jobs is logging into Procore, Buildertrend, JobTread, two custom GC portals, and Compliance Depot. Same COI uploaded 5x.
2. **Slow Procore performance + steep learning curve** — top Procore complaint, especially for field installers.
3. **Asymmetric value.** Subs pay nothing (free on every major platform) but absorb all the data entry.
4. **Email + PDF + texts is still the actual workflow.** Most subs run on QuickBooks for accounting and email/SMS/spreadsheets for everything else.
5. **Compliance demands without context.** A GC asks for "the endorsement" and the sub doesn't know which one; broker takes 2 weeks; GC's PM holds the draw.
6. **Pay-app cycle anxiety.** Subs don't know if their pay app is approved, kicked back, or sitting on a desk.
7. **Backcharges sprung at closeout** without prior visibility.

**UX implication for Sylk:** the sub maintains one profile in Sylk; when a GC adds them to a project, Sylk auto-publishes the relevant docs to that GC and only asks the sub for project-specific items. Mobile-first. Status of pay app, waiver, COI gap visible at a glance.

---

## 7. Competitor Feature Comparison

| Feature | Procore | Buildertrend | JobTread | TradeTapp / BuildingConnected | Compliance specialists (myCOI, Billy, TrustLayer, Certificial, Jones) |
|---|---|---|---|---|---|
| Target | Commercial GCs | Residential builders, $300k–$2M jobs | Remodelers + specialty + commercial | Mid-large commercial GCs | All sizes; bolted onto Procore/Sage |
| Pricing for GC | Custom, $$$$ | Tiered, mid | $199/mo + $20/user, unlimited sub portal users | Custom (Autodesk) | Per-vendor or per-policy fees |
| Pricing for sub | Free | Free | Free | Free | Free |
| Prequalification | Yes — flexible questionnaires, OSHA citations, EMR | Limited | Basic vendor mgmt | Strong — financial ratios, internal limits, approval workflows | Compliance focus only |
| COI tracking + alerts | Yes | Yes | Yes | Yes | Strongest; broker-API verified |
| Bid invitation / RFP | Yes | Yes | Yes | Yes (BuildingConnected core) | No |
| Subcontract eSign | Yes (DocuSign) | Yes | Yes | Yes | No |
| Pay app + waiver | Yes | Yes | Yes (vendor bills) | No | No |
| RFIs / submittals | Yes (best-in-class) | Yes | Yes | No | No |
| Performance scoring | Limited | No | No | Yes (financial + safety risk) | No |
| Mobile sub UX | Heavy / slow | OK | OK | Web-only mostly | Email-driven |
| Cross-GC sub profile | No (per-project per-GC) | No | No | Partial (network) | Some — myCOI/Certificial pool brokers |

**Key gap Sylk can hit:** none of these give a sub a true portable profile that travels across GCs without re-entry.

---

## 8. The 12-Stage Sub Engagement Lifecycle

| # | Stage | Initiator | Documents exchanged | Pain |
|---|---|---|---|---|
| 1 | Prequalification | GC | Questionnaire, COI, EMR, OSHA 300, financials | Sub redoes for every GC |
| 2 | Bid invitation (ITB) | GC | Plans, specs, scope, bid form, due date | Subs get spammed with low-fit ITBs |
| 3 | Bid response | Sub | Lump-sum or unit-price proposal, exclusions, alternates | RFI burden during bid window |
| 4 | Award / decline | GC | Letter of intent or rejection | Subs left guessing for weeks |
| 5 | Contract execution | GC drafts | MSA (one-time) + project-specific subcontract / Work Order; insurance compliance package due | Negotiating indemnity, retainage, flow-down clauses |
| 6 | Pre-job compliance | GC compliance | Per-project COI w/ AI endorsement, license verification, safety plan, drug-test cert, badged worker list | Pre-mobilization scramble; sub's broker can't issue endorsement same-day |
| 7 | Mobilization | Sub | Mobilization invoice, site-specific orientation sign-off, JSAs | First payment expectation conflict |
| 8 | Execution / daily reporting | Sub | Daily reports, T&M tickets, photos, RFIs upward, submittal logs | Reports requested but never read; RFI turn-around |
| 9 | Change orders | Either | COR / change order request, pricing breakdown, signed CO | Verbal "go ahead" → unpaid extra; backcharge surprises |
| 10 | Pay app cycle (monthly) | Sub | AIA G702/G703-style pay app, schedule of values, conditional waiver this draw, unconditional waiver prior draw, WH-347 if applicable, sworn statement (in MI/IL) | Slow approvals; missing prior waiver blocks draw |
| 11 | Substantial completion / closeout | Sub | Punch list, conditional final waiver, warranty, as-builts, O&M manuals, training | Punch list lingers; retainage stuck |
| 12 | Final payment + warranty | GC | Unconditional final waiver, retainage release, warranty period start | Warranty callbacks; performance review for preferred-sub list |

---

## 9. The Long-Term Sub Record

**Identity / Legal**
- Legal name, DBA, EIN, CNPJ (BR), entity type, year founded
- Headquarters + branch addresses
- Owner / officers
- Bonding capacity ($) and surety
- Banking info (ACH)

**Trades & Capacity**
- CSI divisions / trades self-performed
- Self-perform vs lower-tier sub mix
- Crew size
- Service radius / states & licenses
- Max concurrent jobs (capacity)
- Typical contract size band

**Compliance state**
- Current COI status (in force / expiring / lapsed) per coverage type, with policy expiry
- Endorsements on file (CG 20 10, 20 37, 24 04, P&NC)
- Active contractor licenses by state, with expiry
- W9 on file, verified
- Drug-test policy on file
- OSHA 300/300A logs (3 yrs rolling)
- EMR by year (3 yrs)
- TRIR / DART
- OSHA citations 3 yrs

**Performance history (per project, rolled up)**
- On-time score (milestones hit / total)
- On-budget score (final cost / awarded)
- Quality score (punch list count, rework $)
- Safety score (incidents)
- Communication / RFI responsiveness
- Pay app accuracy (% kicked back)
- Backcharge $ history
- Warranty callback count + cost
- Disputes, claims, lien filings against the GC

**Commercial**
- Pricing history per scope
- Win rate on bids invited
- Preferred / approved / probation / blacklist flag
- Notes (free-form, dated, by user)

---

## 10. Top 5 Horror Stories

1. **Sound Construction Inc. (Easton, CT) — $1.22M OSHA penalty, 16 violations, 2025.** Concrete/earthwork contractor. Systemic LOTO failures. Largest single OSHA construction penalty of the year. Multi-employer policy means controlling GCs on those sites are exposed too.
2. **Glenburn, ME GC — June 2024 worker death.** Federal investigation found GC ignored its own onsite safety expert's warnings and its own site-specific safety plan. OSHA fines + civil exposure.
3. **Newark, NJ roofing contractor — ~$330k initial fines over summer 2024 fall-protection violations.** Three inspections in one season. Penalties for willful/repeat range $16,550 to $165,514 per violation in the 2025 schedule.
4. **The "double-payment" pattern (recurring).** GC pays first-tier sub. First-tier sub goes bankrupt without paying material supplier. Supplier had filed a 20-day preliminary in CA (or NTO in FL) and now liens the owner. Owner sues GC under contract; supplier forecloses. Owner pays twice; GC's reputation and balance sheet take the hit.
5. **OSHA controlling-employer citations against GCs for sub violations (ongoing pattern).** Recurring citations where the GC — not the sub — is fined for the sub's hazard, because the GC has general supervisory authority on a multi-employer site. One uninsured sub-employee injury can blow a GC's experience mod up for 3 years and cost $250k+ in WC claims, plus citation per violation.

**Liability ballpark per incident:** OSHA serious $16,550, willful/repeat up to $165,514 per violation; uninsured worker injury claims commonly $50k–$500k; wrongful death civil exposure $1M–$10M+; lien-foreclosure double-payment to the value of the unpaid lower tier ($10k–$millions). Single missing COI can produce all of these.

---

## 11. Brazil Delta

- **Vendor identity = CNPJ** (legal entity tax ID), with a public registry. Real-time CNPJ validation is table stakes. Many subempreiteiros are MEI (Microempreendedor Individual) — CNPJ but capped at R$81k/yr revenue and very limited contractual capacity.
- **Tax regime check.** Simples Nacional vs Lucro Presumido vs Lucro Real changes how the GC retains taxes. A `Consulta Optantes` API from Receita lets you check whether a sub is in Simples/SIMEI.
- **INSS retainage on subempreitada.** When labor is subcontracted at the client's site, the contracting party retains 11% of the invoice value as INSS (Lei 9.711/98). Closest analog to US "joint check / sworn statement" double-payment risk.
- **FGTS and labor obligations.** FGTS deposits and CNDs (Certidão Negativa de Débitos) for INSS, FGTS, and federal/state/municipal taxes are the BR equivalents of W9 + COI verification. Joint-and-several liability (responsabilidade subsidiária/solidária) for sub's labor obligations under CLT means the GC can be sued by the sub's employees if FGTS/INSS/wages aren't paid.
- **No mechanic's lien tradition.** Brazilian subs don't lien property; they sue in trabalhista (labor court) for wages, and federal/state for taxes. The exposure shape is different but equally severe.
- **eSocial.** Federal portal for labor/social events; relevant for medium and larger GCs. Not for v1.
- **Document set in Brazil**: CNPJ card, contrato social, CNDs (federal, INSS, FGTS, municipal, trabalhista), inscrição estadual/municipal, alvará, ART/RRT (engineering responsibility), NR-18 safety program, PCMSO/PPRA/PGR, certificado de regularidade do FGTS.

For Sylk's data model: country flag on vendor record, tax-ID type (EIN | CNPJ | CPF), country-specific compliance doc set + expiry rules. Don't hardwire "W9".

---

## 12. v1 Scope Recommendation

### Build in v1 (the 80%)

1. Sub vendor record — single profile per sub. EIN/CNPJ, legal/DBA, contacts, trades, service area. Sub can claim and self-update.
2. Document vault per sub with: type, file, issued/expiry dates, status (current / expiring-30 / expired), and visibility setting (which GCs / which projects).
3. Document type catalog with state-aware required-set: W9, COI (GL/WC/Auto/Umbrella), additional-insured endorsement, contractor license(s), business license, signed MSA, drug policy. Per-state additions (CA license, TX TDLR specialty, etc.).
4. Expiry alerts — to sub and to GC compliance contact, 30/15/0 days. Hard block on payment if expired.
5. Project-sub assignment. When GC adds a sub to a project: auto-publish current vault docs, auto-request project-specific items.
6. Subcontract eSignature. One MSA per sub, then per-project Work Order/subcontract.
7. Pay app submission with line-item SOV, retainage tracking, and lien waiver attached automatically by stage. Use state-statutory waiver forms in CA (only 4 valid forms).
8. Compliance gate on pay-app approval. Cannot approve if: COI expired, license expired, prior unconditional waiver missing, required certified payroll missing on prevailing-wage jobs.
9. State deadline reminders for the sub: CA 20-day, TX monthly notice, FL 45-day NTO, NY lien window. Generate the notice document.
10. Sub long-term record. Performance scoring inputs come automatically from pay app on-time, RFI response, change-order count, callback flags entered at closeout.
11. Mobile-first sub UX. Phone-friendly upload, camera-to-PDF for COI/license, "renew this doc" flow. Subs sign waivers from phone.
12. Brazil-ready data model day one (vendor type, tax-ID type, doc-type catalog by country) — even if the US doc set ships first.

### Defer past v1

- AIA A305 full prequal questionnaire, financial statements, bonding analysis (TradeTapp territory)
- Broker-API insurance verification (myCOI/Certificial real-time policy lookup) — start with manual upload + visual verification checklist
- RFIs / submittals workflow (Procore's strength)
- Daily reports, photos, jobsite weather, schedule integration
- Bid invitation marketplace (BuildingConnected territory)
- Backcharge ledger
- Warranty service-call integration
- BR eSocial / SPED integrations
- AI risk scoring of subs

### v1 differentiators

**Why a sub adopts Sylk:**
- One profile, every GC. Sub uploads COI once; any GC who invites them on Sylk sees the current doc, no re-upload.
- Mobile waiver signing in <60 seconds.
- Preliminary-notice generator that protects their lien rights automatically.
- Free for subs.

**Why a GC adopts Sylk:**
- No more chasing COIs. Auto alerts, auto block on payment.
- Audit-clean closeout pack assembled automatically (final waiver, sworn statement, warranties, as-builts).
- State-aware out of the box for the four states (CA/TX/FL/NY).
- Long-term sub scorecard that survives PMs leaving — institutional knowledge.

---

## Sources

- Billy — 8 Documents GCs Should Collect From Every Subcontractor
- Coverage Criteria — Subcontractor Insurance Requirements 2026
- WL Butler — Subcontractor Insurance Requirements
- DPR — Insurance Requirements to the Subcontract
- CFMA — Lien Waiver Essentials
- CSLB — Conditional and Unconditional Waiver/Release Forms
- AIA — Lien Waivers & Payment Bond Releases
- Siteline — Pay-if-Paid vs Pay-when-Paid
- Levelset — Pay-When-Paid vs Pay-If-Paid Explained
- Levelset — California 20-Day Preliminary Notice
- Levelset — Texas / Florida / New York Mechanics Lien Guides
- Porter Hedges — Construction Liens in Texas
- DOL — Davis-Bacon Weekly Certified Payroll WH-347
- HUD — Davis-Bacon Compliance Requirements
- AIA — A305-2020 / A421/A422
- Procore — Prequalification, Subcontractor Management, License Reciprocity, RFI Guide
- Buildertrend vs Procore (Capterra)
- JobTread — Vendor and Subcontractor Management, Pricing
- Autodesk — TradeTapp
- Certificial — How to Detect Fraudulent COIs
- FieldPass — How to Verify a Sub's COI
- Bunker — How to Spot a Fake COI
- SuperConstruct — Subcontractor & GC Pain Points
- FileFlo — Subcontractor Compliance Management 2026 Guide
- Highwire — EMR Guide, Contractor Safety Ratings
- TRADESAFE — Experience Modification Rate
- ClickSafety — OSHA Recordkeeping 2026
- FTQ360 — Evaluate Subcontractor Performance
- SubScorecard
- Jackson Lewis — OSHA Citing GCs for Sub Violations
- HCH Lawyers — Multi-Employer Policy
- NAHB — Top OSHA Violations 2024
- NASP — Top OSHA Fines of 2025
- Construction Dive — Q4 2024 OSHA Fines
- OSHA — Penalties
- Stimmel Law / Levelset — Mechanics Liens & Danger of Paying Twice
- Wyman Legal Solutions — Florida Lien Law Pay Twice
- Levy Law — Washington Lien Law
- MDOT — Sworn Statement & Waivers of Lien Forms
- Illinois FNTIC — Sworn Statement Guidelines
- Knowify — RFI / Submittal Management for Trade Contractors
- CMiC — Subcontract Lifecycle
- Receita Federal — MEI / Simples Nacional Manual
- Portal Empresas — MEI services
- CNPJá — Brazilian CNPJ Lookup
- Mellow — Freelance and taxes Brazil
