import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useT, type MessageKey } from './i18n';

/**
 * Public homepage for **Hormaal Group** — the parent of six operating companies.
 *
 * This is the root route (`/`). Each company gets a card; the two that have a
 * product behind them link into it, the rest render as non-interactive
 * "coming soon" tiles so the group's full shape is visible without implying a
 * destination that doesn't exist yet.
 *
 * Note on spelling: the property-management product ships under the internal
 * brand "Harmaal" (module names, JWT issuer, seeded emails). The group brand is
 * "Hormaal", so that is what every customer-facing string here uses.
 */

interface Company {
  key: string;
  /** i18n keys for the company name and one-line description. */
  nameKey: MessageKey;
  blurbKey: MessageKey;
  icon: string;
  /** Internal route. Absent for companies that aren't on the platform yet. */
  to?: string;
  /** Tailwind gradient for the card's icon plate — one accent per company. */
  accent: string;
}

const COMPANIES: Company[] = [
  {
    key: 'property',
    nameKey: 'group.co.property.name',
    blurbKey: 'group.co.property.blurb',
    icon: '🏢',
    to: '/property-management',
    accent: 'from-[#2a5c82] to-[#3f7ba8]',
  },
  {
    key: 'feed',
    nameKey: 'group.co.feed.name',
    blurbKey: 'group.co.feed.blurb',
    icon: '🐐',
    to: '/feed',
    accent: 'from-[#3f7d3f] to-[#6aa84f]',
  },
  {
    key: 'construction',
    nameKey: 'group.co.construction.name',
    blurbKey: 'group.co.construction.blurb',
    icon: '🏗️',
    accent: 'from-[#a67c52] to-[#c5a059]',
  },
  {
    key: 'logistics',
    nameKey: 'group.co.logistics.name',
    blurbKey: 'group.co.logistics.blurb',
    icon: '🚛',
    accent: 'from-[#475569] to-[#64748b]',
  },
  {
    key: 'trading',
    nameKey: 'group.co.trading.name',
    blurbKey: 'group.co.trading.blurb',
    icon: '📦',
    accent: 'from-[#7c3aed] to-[#a78bfa]',
  },
  {
    key: 'energy',
    nameKey: 'group.co.energy.name',
    blurbKey: 'group.co.energy.blurb',
    icon: '☀️',
    accent: 'from-[#d97706] to-[#f0b429]',
  },
];

function CompanyCard({ company }: { company: Company }): ReactElement {
  const t = useT();
  const live = Boolean(company.to);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${company.accent} text-2xl shadow-sm`}
          aria-hidden="true"
        >
          {company.icon}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
            live ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
          }`}
        >
          {live ? t('group.live') : t('group.comingSoon')}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{t(company.nameKey)}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">{t(company.blurbKey)}</p>
      {live && (
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#2a5c82]">
          {t('group.enter')}
          <span aria-hidden="true">→</span>
        </span>
      )}
    </>
  );

  const shell =
    'flex h-full flex-col rounded-2xl border p-6 text-left transition bg-white border-slate-100 shadow-sm';

  if (!live) {
    // Deliberately not a link or a button: there is nowhere to go yet, and a
    // dead control is worse than an obviously inert card.
    return <div className={`${shell} opacity-70`}>{body}</div>;
  }

  return (
    <Link
      to={company.to as string}
      className={`${shell} hover:-translate-y-0.5 hover:border-[#2a5c82]/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2a5c82]`}
    >
      {body}
    </Link>
  );
}

export default function GroupLanding(): ReactElement {
  const t = useT();

  return (
    <div className="min-h-screen-safe bg-[#FDFBF7] text-[#2A5C82]">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10 lg:px-12">
        <div className="text-xl font-extrabold tracking-tighter text-[#2A5C82]">HORMAAL</div>
        <LanguageSwitcher />
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-14 pt-6 sm:px-10 sm:pb-20 lg:px-12">
        <div className="relative z-10 max-w-3xl">
          <span className="text-xs font-bold uppercase tracking-widest text-[#C5A059] sm:text-sm">
            {t('group.eyebrow')}
          </span>
          <h1 className="mt-4 mb-6 text-4xl font-extrabold leading-tight sm:text-6xl lg:text-7xl">
            {t('group.titleLead')}{' '}
            <span className="text-[#A67C52]">{t('group.titleTrail')}</span>
          </h1>
          <p className="max-w-2xl text-base text-slate-600 sm:text-xl">{t('group.subtitle')}</p>
        </div>
        <div
          className="absolute right-0 top-0 hidden h-full w-1/3 -skew-x-12 bg-[#A67C52]/5 sm:block"
          aria-hidden="true"
        />
      </section>

      {/* Companies */}
      <section className="bg-white px-6 py-14 sm:px-10 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold sm:text-4xl">{t('group.companiesTitle')}</h2>
          <p className="mt-2 text-slate-500">{t('group.companiesSubtitle')}</p>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {COMPANIES.map((company) => (
              <CompanyCard key={company.key} company={company} />
            ))}
          </div>
        </div>
      </section>

      {/* How we operate */}
      <section className="px-6 py-14 sm:px-10 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-10 text-center text-2xl font-bold sm:mb-14 sm:text-4xl">
            {t('group.valuesTitle')}
          </h2>
          <div className="grid grid-cols-1 gap-10 text-center md:grid-cols-3">
            {(
              [
                ['🧩', 'group.value1Title', 'group.value1Body'],
                ['🛡️', 'group.value2Title', 'group.value2Body'],
                ['📍', 'group.value3Title', 'group.value3Body'],
              ] as const
            ).map(([icon, titleKey, bodyKey]) => (
              <div key={titleKey}>
                <div className="mb-4 text-4xl" aria-hidden="true">
                  {icon}
                </div>
                <h3 className="mb-2 text-xl font-bold">{t(titleKey)}</h3>
                <p className="text-slate-500">{t(bodyKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 px-6 py-8 text-center text-sm text-slate-400 sm:px-10 lg:px-12">
        {t('group.name')} · {t('group.footer')}
      </footer>
    </div>
  );
}
