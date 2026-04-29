# ARIA.md — Visual Assembly Plan

aesthetic: clean-minimal

## hero
| Layer | Component | Import | Props |
|-------|-----------|--------|-------|
| layout | full-bleed-section-with-sticky-summary | — | `min-h-[40vh] px-8 py-12 grid grid-cols-12 gap-6 relative overflow-hidden` |
| atmosphere-1 | gradient-blob | — | `absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full bg-[#0071e3]/[0.08] blur-[140px] pointer-events-none` |
| atmosphere-2 | DotPattern | @/components/ui/DotPattern | `className="absolute inset-0 opacity-[0.12] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"` |
| eyebrow | StatusBadge | @/components/ui/StatusBadge | `variant="accent"` text="Money · Bank Accounts" |
| headline | h1 | — | `text-[44px] font-semibold tracking-[-0.03em] text-[#1d1d1f] leading-[1.05]` text="Your money, reconciled." |
| subheadline | p | — | `text-[17px] text-[#6e6e73] leading-relaxed max-w-[620px] mt-3` |
| reconciliation-summary | StatCard×4 | @/components/app/dashboard/StatCard | grid-cols-12 col-span-12 row of: `unmatchedCount`, `matchedThisMonth`, `totalIn`, `totalOut` from `GET /api/teller/reconciliation-summary` |
| divider | gradient-line | — | `h-px bg-gradient-to-r from-transparent via-[#e5e5ea] to-transparent` |

## bank-strip (page: /app/money/bank)
| Layer | Component | Import | Props |
|-------|-----------|--------|-------|
| layout | horizontal-scroll-strip | — | `flex gap-5 overflow-x-auto snap-x snap-mandatory pb-6 px-8 -mx-8` |
| atmosphere-1 | gradient-blob-secondary | — | `absolute top-1/2 left-1/4 w-[500px] h-[500px] rounded-full bg-[#0071e3]/[0.06] blur-[120px] pointer-events-none -z-10` |
| atmosphere-2 | DotPattern | @/components/ui/DotPattern | `className="absolute inset-0 opacity-[0.10]"` |
| section-header | h2 + StatusBadge | — | `text-[28px] font-semibold tracking-[-0.02em]` "Connected accounts" + count badge |
| account-card | BankAccountCard | @/components/app/bank/BankAccountCard | `account={...} onSync={...} onDisconnect={...}` — `min-w-[340px] snap-start ring-1 ring-[#e5e5ea] rounded-2xl bg-white p-6 shadow-card hover:shadow-elevated transition-shadow` |
| card-content | bank-name + masked-account + balance | — | bank `text-[15px] font-medium text-[#1d1d1f]`; mask `font-mono text-[13px] text-[#86868b]`; balance `text-[28px] font-semibold tracking-tight tabular-nums` |
| card-meta | last-synced + provider chip | — | relative time via `formatRelativeDays` + `StatusBadge variant="neutral"` for provider |
| card-actions | Button row | @/components/ui/Button | "Sync now" `variant="secondary"` + "Disconnect" `variant="ghost"` |
| featured-card | active-account with BorderBeam | @/components/ui/BorderBeam | wraps the most-recently-synced card; `colorFrom="#0071e3" colorTo="#34c759" duration={8}` |
| connect-tile | ConnectBankButton | @/components/app/bank/ConnectBankButton | `min-w-[340px] snap-start border-2 border-dashed border-[#d2d2d7] rounded-2xl bg-[#fbfbfd]/50 p-6 hover:border-[#0071e3] hover:bg-[#0071e3]/[0.04] transition-colors min-h-[220px] flex items-center justify-center` |
| empty-state | EmptyState | @/components/ui/EmptyState | shown when zero accounts; `title="No bank accounts connected"` `action={<ConnectBankButton/>}` |
| loading | Skeleton×3 | @/components/ui/Skeleton | `h-[220px] min-w-[340px] rounded-2xl` |
| error | ErrorBanner | @/components/ui/ErrorBanner | with retry |
| confirm-disconnect | ConfirmDialog | @/components/ui/ConfirmDialog (NEW) | `title="Disconnect account?"` `tone="danger"` confirm `Button variant="danger"` |
| divider | gradient-line | — | `h-px bg-gradient-to-r from-transparent via-[#e5e5ea] to-transparent my-12` |

## reconciliation (page: /app/money/reconciliation)
| Layer | Component | Import | Props |
|-------|-----------|--------|-------|
| layout | 8/4-asymmetric-split-with-sticky-rail | — | `grid grid-cols-12 gap-6 px-8 py-8 relative` — table `col-span-8`, rail `col-span-4 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto` |
| atmosphere-1 | gradient-blob | — | `absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-[#0071e3]/[0.05] blur-[130px] pointer-events-none -z-10` |
| atmosphere-2 | DotPattern | @/components/ui/DotPattern | `className="absolute inset-0 opacity-[0.08] -z-10"` |
| filter-bar | FilterBar | @/components/ui/FilterBar | chips: account, dateRange, matchStatus (all/unmatched/matched/ignored) |
| toolbar | ReconciliationToolbar | @/components/app/money/ReconciliationToolbar | `selectedIds={...} onBulkMatch onBulkIgnore onBatchAssign` — sticky top, slides in when `selectedIds.length > 0`, `bg-white/90 backdrop-blur ring-1 ring-[#e5e5ea] rounded-xl px-4 py-3 shadow-card` |
| table | DataTable | @/components/ui/DataTable | columns: select-checkbox, Date, Description, Amount, Account, Match, Project, Actions; `density="compact"` `stickyHeader` |
| row | TransactionRow | @/components/app/money/TransactionRow | renders one `<tr>` per tx — composed inside DataTable `cell` renderers |
| select-cell | Checkbox | @/components/ui/Checkbox (NEW) | `checked indeterminate onCheckedChange` |
| date-cell | span | — | `font-mono text-[13px] text-[#1d1d1f] tabular-nums` via `formatDate` |
| amount-cell | AmountPill | @/components/app/money/AmountPill | debit: `text-[#1d1d1f] font-mono font-medium tabular-nums`; credit: `text-[#1d8a3a] font-mono font-medium tabular-nums`; `+`/`-` prefix |
| account-cell | StatusBadge | @/components/ui/StatusBadge | `variant="neutral"` bank short-name |
| match-cell | MatchPill | @/components/app/money/MatchPill | `confidence={0..1} tone="success"\|"warning"\|"neutral"\|"danger"` — high (≥0.85) success, mid warning, low neutral, ignored danger; rounded-full pill `text-[12px] px-2.5 py-0.5 ring-1` |
| project-cell | StatusBadge or chip | @/components/ui/StatusBadge | assigned: `variant="info"` project name; unassigned: `variant="neutral"` "Unassigned" |
| actions-cell | RowActions | @/components/ui/RowActions | items: Match, Ignore, Edit, Split, Assign |
| matching-rail | MatchingRail | @/components/app/money/MatchingRail | sticky right column; shows top 3 candidate projects for the focused tx with confidence bars + one-click apply; `ring-1 ring-[#e5e5ea] rounded-2xl bg-white p-5 shadow-card` |
| split-modal | SplitTransactionModal | @/components/app/money/SplitTransactionModal | rendered via Drawer from right; rows of project picker + amount input; sum-check warning if not equal to total |
| empty | EmptyState | @/components/ui/EmptyState | `title="No transactions to reconcile"` shown when zero rows |
| loading | Skeleton | @/components/ui/Skeleton | 8 shimmer rows |
| error | ErrorBanner | @/components/ui/ErrorBanner | with retry |
| divider | gradient-line | — | `h-px bg-gradient-to-r from-transparent via-[#e5e5ea] to-transparent` |

## subscription (page: /app/settings/subscription)
| Layer | Component | Import | Props |
|-------|-----------|--------|-------|
| layout | centered-narrow-column | — | `max-w-[760px] mx-auto px-8 py-12 relative` |
| atmosphere-1 | gradient-blob | — | `absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-[#0071e3]/[0.07] blur-[140px] pointer-events-none -z-10` |
| atmosphere-2 | DotPattern | @/components/ui/DotPattern | `className="absolute inset-0 opacity-[0.10] -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_60%)]"` |
| eyebrow | StatusBadge | @/components/ui/StatusBadge | `variant="accent"` "Settings · Subscription" |
| headline | h1 | — | `text-[36px] font-semibold tracking-[-0.025em] text-[#1d1d1f]` "Subscription & payouts" |
| sub | p | — | `text-[16px] text-[#6e6e73] mt-2` |
| stat-row | StatCard×3 | @/components/app/dashboard/StatCard | `grid grid-cols-3 gap-4 mt-8`: Plan / Status / Next bill date — values from `GET /api/subscription` |
| status-card | featured StatCard with BorderBeam | @/components/ui/BorderBeam | wraps Status card when `status==='active'`; `colorFrom="#34c759" colorTo="#0071e3" duration={6}` |
| billing-section | section card | — | `ring-1 ring-[#e5e5ea] rounded-2xl bg-white p-6 mt-8 shadow-card` |
| manage-billing | Button | @/components/ui/Button | `variant="primary"` "Manage billing" → `POST /api/stripe/create-portal-session` then `window.location.assign(url)` |
| payouts-section | section card | — | `ring-1 ring-[#e5e5ea] rounded-2xl bg-white p-6 mt-4 shadow-card` |
| connect-payouts | Button | @/components/ui/Button | `variant="secondary"` "Connect payouts" → `POST /api/stripe/connect/create-account` then redirect to onboarding URL |
| post-redirect-poll | useEffect | — | on mount with `?return=stripe`, poll `GET /api/subscription` 3× at 1s/2s/4s |
| no-sub-empty | EmptyState | @/components/ui/EmptyState | when no active sub: title "Start your subscription" with primary CTA → `/api/stripe/checkout` via existing `CheckoutButton` |
| loading | Skeleton×3 | @/components/ui/Skeleton | StatCard placeholders |
| error | ErrorBanner | @/components/ui/ErrorBanner | with retry |
| divider | gradient-line | — | `h-px bg-gradient-to-r from-transparent via-[#e5e5ea] to-transparent my-10` |

## nav
| Layer | Component | Import | Props |
|-------|-----------|--------|-------|
| sidebar | DesktopSidebar | @/components/app/DesktopSidebar | already wired by `AppShell`; ensure Money tab highlights for `/app/money/*` |
| money-tabs | MoneyShell tabs | @/components/app/money/MoneyShell | extend `TABS`: Invoices, Estimates, Contracts, Recurring, **Bank**, **Reconciliation** — active tab `text-[#0071e3] border-b-2 border-[#0071e3]` |
| topbar | TopBar | @/components/app/TopBar | inherited from AppShell |
| settings-nav-row | row in settings index | — | add "Subscription" link to `/app/settings` index list (out of segment if not present, leave seam) |
| mobile-bottom | BottomTabBar | @/components/app/BottomTabBar | inherited |

## footer
| Layer | Component | Import | Props |
|-------|-----------|--------|-------|
| layout | inherited | — | `/app/*` cockpit has no marketing footer; AppShell handles chrome |
| separator | gradient-line | — | `h-px bg-gradient-to-r from-transparent via-[#e5e5ea] to-transparent mt-16` above any in-page meta line |
| meta | small text | — | `text-[12px] text-[#86868b]` "Last sync: {relativeTime}" on bank page |

## tokens
| Token | Value |
|-------|-------|
| primary | #1d1d1f |
| accent | #0071e3 |
| accent-hover | #0077ed |
| success | #34c759 |
| success-deep | #1d8a3a |
| warning | #ff9500 |
| danger | #ff3b30 |
| background | #fbfbfd |
| surface | #ffffff |
| surface-muted | #f5f5f7 |
| border | #e5e5ea |
| border-strong | #d2d2d7 |
| text-primary | #1d1d1f |
| text-secondary | #6e6e73 |
| text-tertiary | #86868b |
| heading-font | Inter (var(--font-inter)), tight letter-spacing -0.02em–-0.03em |
| body-font | Inter, 15–17px, leading-relaxed |
| mono-font | JetBrains Mono — all numerics (amounts, dates, masked accounts, percentages, IDs) |
| radius-card | 16px (rounded-2xl) |
| radius-button | 10px (rounded-[10px]) |
| radius-pill | 9999px |
| section-padding | px-8 py-12 desktop / px-4 py-8 mobile |
| shadow-card | `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)` |
| shadow-elevated | `0 8px 24px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)` |
| ring-default | `ring-1 ring-[#e5e5ea]` |
| ring-focus | `ring-2 ring-[#0071e3]/40 ring-offset-2 ring-offset-white` |