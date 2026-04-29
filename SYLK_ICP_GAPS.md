# Sylk — Focused Gap Analysis for Real ICP

_Date: 2026-04-28. Filtered version of COMPETITIVE_GAPS.md, scoped to David's actual target market._

---

## The ICP, stated honestly

**Who Sylk is for:**
1. **Project-only service businesses** — small residential remodelers, handymen, plumbers/electricians/HVAC doing one-off jobs, finish carpenters, painters, deck builders.
2. **Route-only service businesses** — pest, cleaning, lawn, pool, window washing, snow removal, dog poop scoopers.
3. **Hybrids** — businesses that do both. The daily checklist + service plans + projects bridge is the wedge here.

**Who Sylk is NOT for (yet, and maybe ever):**
- Commercial GCs ($5M+) — Procore territory.
- Commercial subs needing AIA/retainage/lien waivers — Knowify territory.
- Enterprise service trades ($5M+ HVAC fleets) — ServiceTitan territory.
- Architects, designers, owner's reps, lenders — Buildertrend's enterprise side.

**This means we can DELETE entire categories from the gap list:**
- ❌ AIA G702/G703 progress billing — not your customer
- ❌ Retainage / WIP / cost-code accounting depth — not your customer
- ❌ Lien waivers, preliminary notices — not your customer
- ❌ Certified payroll / Davis-Bacon / WH-347 — not your customer
- ❌ RFIs, submittals, spec books — not your customer
- ❌ Plan/blueprint viewer + version compare — not your customer
- ❌ Takeoff / measurement on plans — only matters for remodelers above $500K
- ❌ Subcontractor portal with COI tracking + 1099 prep — only matters at scale
- ❌ Multi-tier markup / multi-location franchise mode — not your customer
- ❌ Equipment/inventory tracking with bin locations — not your customer
- ❌ Salesforce, HubSpot, enterprise CRM integration — not your customer

That leaves a much shorter, sharper list of what you actually need.

---

## What ACTUALLY matters for your ICP

### Tier 1 — Existential gaps (won't win deals without these)

| # | Gap | ICP slice it blocks | Effort | Why |
|---|-----|---------------------|--------|-----|
| 1 | **Customer / Homeowner Portal** (magic-link, schedule + photos + invoices + pay + sign change orders) | All three — projects, routes, hybrids | M | Universal table stakes. Every Jobber/Housecall Pro/Buildertrend demo opens with this. Removes the #1 objection in any sales call. |
| 2 | **Two-way SMS inbox** (customer texts back, threaded, attached to customer record) | All three | S-M | Customers reply by text. If those replies land in someone's personal phone, the record is broken. Twilio-shaped. |
| 3 | **Online booking widget** (embed on website + Google, customer picks a slot) | Routes + hybrids especially | M | Inbound flywheel. Jobber and Housecall Pro brag about it for a reason — converts cold traffic into booked jobs. |
| 4 | **Two-way QuickBooks Online sync** | All three above ~$300K revenue | L | Single biggest objection from prospects with a bookkeeper. Deferrable for sub-$300K, hard wall above. |
| 5 | **E-signature on quotes/contracts/change orders** with audit trail | Projects + hybrids | S | DocuSign hand-off mid-deal is where deals die. Native is table stakes. |

### Tier 2 — Strong revenue lift (close more, charge more)

| # | Gap | ICP slice | Effort | Why |
|---|-----|-----------|--------|-----|
| 6 | **Selections + Allowances** (homeowner picks finishes from a portal, approval flows to change order + budget) | Project (remodel) | M-L | Gates the residential remodel segment. Without it remodelers default to Buildertrend/JobTread/BuildBook. Skip if remodelers aren't core. |
| 7 | **Consumer financing** at point of quote (Wisetack, Acorn) | All three on tickets >$2K | S-M | Lifts ticket size 25-40%. Mostly partner integration. Cheap moat. |
| 8 | **Review automation** (post-job text → filter sentiment → push 4-5★ to Google) | Routes + hybrids especially | S | Trades win on Google star count. ServiceTitan claims 12% YoY revenue lift for users. |
| 9 | **CRM lead pipeline** with stages + automated follow-ups | Projects + hybrids | M | Project businesses live in "lead → estimate sent → signed → scheduled." You have projects but not the pre-project funnel. |
| 10 | **Recurring service "memberships"** (auto-renewal, prepaid visit credits, member discount) | Routes + hybrids | M | HVAC/pest specifically — memberships are the highest-LTV revenue line in the category. ServiceTitan/FieldEdge sell hard on this. |

### Tier 3 — Vertical-specific (only build if chasing that vertical)

| Feature | Vertical it gates | Skip unless |
|---------|-------------------|-------------|
| EagleView / Hover aerial roof measurement | Roofing | You're going after roofers. If yes, S-M effort. |
| Chemical / pesticide tracking (regulated) | Pest control | You're chasing pest. State law requires it; gate. |
| Customer equipment tracking (which AC, model, install date, warranty) | HVAC service | You're chasing HVAC repeat business. |
| GBB (good-better-best) proposal presentation | HVAC/plumbing service | High-ticket service trades. |
| Pricebook with flat-rate library | HVAC/plumbing service | Same as above. |
| Live tech location + "tech is on the way" SMS link | Routes (HVAC, pest, cleaning) | Wins on customer experience. |
| Roof / siding visualizer | Roofing sales | Closing roof deals at the kitchen table. |
| In-home tablet sales mode (offline contracts) | Roofing/siding/window sales orgs | Door-knocker companies only. |

### Tier 4 — Deferrable (can ship without, address later)

- Subcontractor portal with COI/W-9 tracking — nice for residential remodelers above $1M, deferrable below
- Punch list with photo annotation — useful for remodel, not blocking
- GPS fleet tracking (hardware) — only enterprise routes care
- Direct mail campaigns — nice marketing, not gating
- Call tracking + AI call scoring — only matters when you have CSRs

---

## The hybrid wedge — where Sylk is uniquely positioned

This is your real differentiator and the report buried it. **No major competitor handles project + route + hybrid well in one product.**

| Tool | Projects | Routes | Hybrid story |
|------|----------|--------|--------------|
| Buildertrend | ✅ excellent | ❌ none | None |
| JobTread | ✅ excellent | ❌ none | None |
| BuildBook | ✅ good | ❌ none | None |
| Houzz Pro | ✅ excellent | ❌ none | None |
| Procore | ✅ enterprise | ❌ none | None |
| ServiceTitan | ⚠️ thin | ✅ excellent | Service-only |
| FieldEdge | ⚠️ thin | ✅ good | Service-only |
| Jobber | ⚠️ light projects | ✅ good | Awkward — quotes + jobs but no project phases |
| Housecall Pro | ⚠️ light | ✅ excellent | Same as Jobber |
| GorillaDesk | ❌ none | ✅ good | Pest only |
| LMN | ⚠️ landscape only | ✅ landscape only | Single-vertical |

**The hybrid customer profile that nobody serves well today:**
- Landscaper running weekly mowing routes + occasional $40K patio installs
- Pest company doing monthly routes + $15K termite remediation projects
- HVAC shop with maintenance memberships + $12K new install jobs
- Pool company with weekly cleans + $25K pool resurfacing projects
- Cleaning company with recurring + $5K deep-clean / move-out projects
- Painter with recurring HOA contracts + one-off interior repaints

For all of these owners, **the daily checklist + service plans + projects in one app is genuinely unique**. If a landscaper has to use LMN for routes and Buildertrend for projects, they're paying two subscriptions and reconciling two databases. Sylk solves that.

**This positioning is your headline. Lead every demo with it.**

---

## The Spanish/Portuguese wedge

Worth restating because the original report underweighted it:

- **No competitor at any tier serves Spanish/Portuguese-speaking owners well.** ServiceTitan barely does. Jobber has English UI. LMN has bilingual crew app but English-only owner UX. Buildertrend has limited Spanish.
- **Foreman with voice in EN/ES/PT is genuinely unique.** Hispanic-owned construction/landscape/cleaning/pest businesses in the US are an enormous undertargeted market. Brazilian-owned painting and cleaning companies likewise.
- This is a wedge no one will out-build quickly because it requires real native fluency in product, marketing, and support — not Google Translate.

**Marketing implication:** the product page should have visible ES + PT switchers in the hero, customer testimonials in those languages, and pricing/onboarding flows that don't degrade in non-English. This is cheap to do and a persistent moat.

---

## What to actually build next quarter (revised for ICP)

The original report said: Selections + Portal + QBO + Financing + SMS-and-reviews.

**Revised for your ICP, in dependency order:**

### 1. Customer Portal + e-sign + magic-link auth (M)
- Foundation for almost everything else
- Magic-link auth (no signup) — text/email a link, customer lands in their portal
- Surfaces: schedule, photos from daily reports, invoices + Stripe pay link, contracts/change orders pending sign, message thread
- E-sign with audit trail (timestamp, IP, device) — DocuSign-quality without DocuSign
- White-label (company logo + brand color)
- **Why first:** unblocks selections, financing, change-order approval, reviews. It's the surface those features land on.

### 2. Two-way SMS inbox + auto review request (S-M)
- Twilio number per company; inbound + outbound both visible to whole team
- Threaded by customer
- Foreman can read + draft + send replies
- Auto post-job review request with sentiment routing
- **Why second:** S effort. Marketing-quality differentiator immediately. Pairs with portal.

### 3. Online booking widget for routes/services (M)
- Embed code for the customer's website
- Customer picks service + slot; respects technician zones/availability/skills
- Lands as a draft visit/job on Sylk side; agent can confirm or auto-confirm
- **Why third:** the missing piece for route businesses competing against Jobber/Housecall Pro. Highest-impact feature for the recurring-services slice of the ICP.

### 4. Consumer financing on quotes (Wisetack/Acorn) (S-M)
- "From $X/mo" CTA on every quote and shared estimate link
- Pass to partner; webhook approval back; Sylk gets paid in full, customer pays partner
- **Why fourth:** mostly partner integration work. Lifts ticket size on every project quote. No replatforming required.

### 5. QuickBooks Online two-way sync (L) — only if pursuing >$300K accounts
- Sync customers, vendors, invoices, bills, payments, time entries
- This is a 2-3 month dedicated push. Don't mix it with feature work.
- **Why deferrable:** sub-$300K solo operators don't have a bookkeeper to please. Above that revenue tier, this is gating. Pick when ready to move up-market.

**Selections + allowances** drops from "next quarter" to "build only if you decide remodel-heavy contractors are a core segment." If your hybrids are landscape/HVAC/pest-leaning, selections is not on the path. If they're remodel-leaning, it should bump up to #2 or #3.

---

## Honest summary

**You are not trying to be Buildertrend + ServiceTitan + Procore at once. You are trying to be the first ops platform that handles project + route + hybrid in one app, in three languages, with an AI agent at the center.**

The gap list, filtered to your ICP, is:
- 5 existential gaps (portal, SMS, booking, QBO, e-sign)
- 5 strong revenue-lifters (selections, financing, reviews, CRM pipeline, memberships)
- A handful of vertical-specific features to build only when chasing that vertical
- A long tail of stuff you can ignore forever (AIA, certified payroll, plan markup, subcontractor portals)

**That's a buildable roadmap, not a death march.** The 5 existential gaps are 4-6 months of focused work. The vertical-specific features are 2-4 weeks each when needed.

Foreman + tri-lingual + project/route/hybrid integration is the moat. The 5 existential gaps are admission price. The vertical-specific stuff is what you ship when expanding to that segment.

Don't try to ship all of it. Ship the portal first; everything else lands on it.
