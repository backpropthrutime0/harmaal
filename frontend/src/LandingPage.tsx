import type { ReactElement } from 'react';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useT } from './i18n';

export default function LandingPage(): ReactElement {
  const t = useT();

  return (
    <div className="min-h-screen-safe bg-[#FDFBF7] text-[#2A5C82]">
      {/* Language toggle for public visitors (defaults to Somali). */}
      <div className="absolute right-4 top-4 z-20 sm:right-8 sm:top-6">
        <LanguageSwitcher />
      </div>

      {/* Hero Section */}
      <section className="relative flex min-h-[85vh] items-center overflow-hidden px-6 py-16 sm:px-10 lg:px-12">
        <div className="relative z-10 max-w-3xl">
          <span className="text-[#C5A059] font-bold tracking-widest uppercase text-xs sm:text-sm">
            {t('landing.eyebrow')}
          </span>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold mt-4 mb-6 leading-tight">
            {t('landing.titleLead')} <span className="text-[#A67C52]">Harmaal</span>{' '}
            {t('landing.titleTrail')}
          </h1>
          <p className="text-base sm:text-xl text-slate-600 mb-8 max-w-xl">{t('landing.subtitle')}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <a
              href="/login"
              className="bg-[#2A5C82] text-white text-center px-8 py-4 rounded-full font-bold hover:bg-blue-900 transition shadow-lg"
            >
              {t('landing.ctaManagement')}
            </a>
            <a
              href="/tenant-login"
              className="border-2 border-[#A67C52] text-[#A67C52] text-center px-8 py-4 rounded-full font-bold hover:bg-[#A67C52] hover:text-white transition"
            >
              {t('landing.ctaTenant')}
            </a>
          </div>
        </div>
        {/* Subtle decorative background pattern (hidden on phones to avoid crowding) */}
        <div className="absolute right-0 top-0 hidden h-full w-1/3 -skew-x-12 bg-[#A67C52]/5 sm:block"></div>
      </section>

      {/* Philosophy Section */}
      <section className="py-16 sm:py-24 px-6 sm:px-10 lg:px-12 bg-white">
        <h2 className="text-2xl sm:text-4xl font-bold text-center mb-10 sm:mb-16">
          {t('landing.philosophyTitle')}
        </h2>
        <div className="grid grid-cols-1 gap-10 sm:gap-12 text-center md:grid-cols-3">
          <div>
            <div className="text-4xl mb-4">🏠</div>
            <h3 className="text-xl font-bold mb-2">{t('landing.card1Title')}</h3>
            <p className="text-slate-500">{t('landing.card1Body')}</p>
          </div>
          <div>
            <div className="text-4xl mb-4">🛡️</div>
            <h3 className="text-xl font-bold mb-2">{t('landing.card2Title')}</h3>
            <p className="text-slate-500">{t('landing.card2Body')}</p>
          </div>
          <div>
            <div className="text-4xl mb-4">📈</div>
            <h3 className="text-xl font-bold mb-2">{t('landing.card3Title')}</h3>
            <p className="text-slate-500">{t('landing.card3Body')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
