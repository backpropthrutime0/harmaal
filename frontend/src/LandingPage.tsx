export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2A5C82]">
      {/* Hero Section */}
      <section className="relative h-screen flex items-center px-12">
        <div className="max-w-3xl">
          <span className="text-[#C5A059] font-bold tracking-widest uppercase text-sm">Empowering Hargeisa</span>
          <h1 className="text-7xl font-extrabold mt-4 mb-6 leading-tight">
            The Future of <span className="text-[#A67C52]">Harmaal</span> Property Management.
          </h1>
          <p className="text-xl text-slate-600 mb-8 max-w-xl">
            A seamless enterprise solution designed for the unique needs of property owners in Somaliland. Managed locally, built globally.
          </p>
          <div className="flex gap-4">
            <a href="/login" className="bg-[#2A5C82] text-white px-8 py-4 rounded-full font-bold hover:bg-blue-900 transition shadow-lg">Access Portal</a>
            <a href="/register" className="border-2 border-[#A67C52] text-[#A67C52] px-8 py-4 rounded-full font-bold hover:bg-[#A67C52] hover:text-white transition">Become a Tenant</a>
          </div>
        </div>
        {/* Subtle decorative background pattern */}
        <div className="absolute right-0 top-0 w-1/3 h-full bg-[#A67C52]/5 -skew-x-12"></div>
      </section>

      {/* Philosophy Section */}
      <section className="py-24 px-12 bg-white">
        <h2 className="text-4xl font-bold text-center mb-16">Built for Our Lands</h2>
        <div className="grid grid-cols-3 gap-12 text-center">
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