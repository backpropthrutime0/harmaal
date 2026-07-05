export default function LandingPage() {
  return (
    <div className="min-h-screen-safe bg-[#FDFBF7] text-[#2A5C82]">
      {/* Hero Section */}
      <section className="relative flex min-h-[85vh] items-center overflow-hidden px-6 py-16 sm:px-10 lg:px-12">
        <div className="relative z-10 max-w-3xl">
          <span className="text-[#C5A059] font-bold tracking-widest uppercase text-xs sm:text-sm">
            Empowering Hargeisa
          </span>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold mt-4 mb-6 leading-tight">
            The Future of <span className="text-[#A67C52]">Harmaal</span> Property Management.
          </h1>
          <p className="text-base sm:text-xl text-slate-600 mb-8 max-w-xl">
            A seamless enterprise solution designed for the unique needs of property owners in
            Somaliland. Managed locally, built globally.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <a
              href="/login"
              className="bg-[#2A5C82] text-white text-center px-8 py-4 rounded-full font-bold hover:bg-blue-900 transition shadow-lg"
            >
              Management
            </a>
            <a
              href="/tenant-login"
              className="border-2 border-[#A67C52] text-[#A67C52] text-center px-8 py-4 rounded-full font-bold hover:bg-[#A67C52] hover:text-white transition"
            >
              Tenant
            </a>
          </div>
        </div>
        {/* Subtle decorative background pattern (hidden on phones to avoid crowding) */}
        <div className="absolute right-0 top-0 hidden h-full w-1/3 -skew-x-12 bg-[#A67C52]/5 sm:block"></div>
      </section>

      {/* Philosophy Section */}
      <section className="py-16 sm:py-24 px-6 sm:px-10 lg:px-12 bg-white">
        <h2 className="text-2xl sm:text-4xl font-bold text-center mb-10 sm:mb-16">
          Built for Our Lands
        </h2>
        <div className="grid grid-cols-1 gap-10 sm:gap-12 text-center md:grid-cols-3">
          <div>
            <div className="text-4xl mb-4">🏠</div>
            <h3 className="text-xl font-bold mb-2">Local Infrastructure</h3>
            <p className="text-slate-500">Tailored for the unique rental landscapes from Hargeisa to Burao.</p>
          </div>
          <div>
            <div className="text-4xl mb-4">🛡️</div>
            <h3 className="text-xl font-bold mb-2">Secure Integrity</h3>
            <p className="text-slate-500">Enterprise-grade security ensuring your lease data is always protected.</p>
          </div>
          <div>
            <div className="text-4xl mb-4">📈</div>
            <h3 className="text-xl font-bold mb-2">Growth Centric</h3>
            <p className="text-slate-500">Clear revenue tracking to help you scale your real estate portfolio.</p>
          </div>
        </div>
      </section>
    </div>
  );
}