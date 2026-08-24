/**
 * UI message catalog. Each entry carries the English (`en`) source string and
 * its Somali (`so`) translation. Somali is the default language for the app's
 * Somaliland user base; English is the fallback.
 *
 * Keys are dot-namespaced by surface (nav.*, login.*, …). Add new strings here
 * rather than hardcoding them in components. `{placeholder}` tokens are filled
 * at render time via the second argument to `t()`.
 *
 * Somali reviewed by a native Af-Soomaali localizer. Glossary: tenant=kireyste,
 * rent=kiro/kirada, property=guri/guryaha, portfolio=hanti/hantida, unit=cutub,
 * password=furaha sirta, dashboard=Bogga Guud, employee=shaqaale, role=doorka,
 * Management(role)=Maareynta, Administration(section)=Maamulka.
 */
export interface Message {
  en: string;
  so: string;
}

export const messages = {
  // --- Generic / shared ---
  'common.appName': { en: 'Harmaal', so: 'Harmaal' },
  'common.cancel': { en: 'Cancel', so: 'Jooji' },
  'common.save': { en: 'Save', so: 'Kaydi' },
  'common.saving': { en: 'Saving…', so: 'Waa la kaydinayaa…' },
  'common.create': { en: 'Create', so: 'Abuur' },
  'common.creating': { en: 'Creating…', so: 'Waa la abuurayaa…' },
  'common.close': { en: 'Close', so: 'Xir' },
  'common.done': { en: 'Done', so: 'Diyaar' },
  'common.remove': { en: 'Remove', so: 'Ka saar' },
  'common.loading': { en: 'Loading…', so: 'Waa la soo rarayaa…' },
  'common.optional': { en: 'optional', so: 'ikhtiyaari' },
  'common.actions': { en: 'Actions', so: 'Ficillo' },
  'common.status': { en: 'Status', so: 'Xaalad' },
  'common.active': { en: 'Active', so: 'Firfircoon' },
  'common.disabled': { en: 'Disabled', so: 'La joojiyay' },
  'common.role': { en: 'Role', so: 'Doorka' },
  'common.email': { en: 'Email', so: 'Iimayl' },
  'common.name': { en: 'Name', so: 'Magaca' },
  'common.phone': { en: 'Phone', so: 'Taleefan' },

  // --- Language switcher ---
  'lang.label': { en: 'Language', so: 'Luqadda' },
  'lang.so': { en: 'Somali', so: 'Af-Soomaali' },
  'lang.en': { en: 'English', so: 'Ingiriisi' },

  // --- Role labels (coarse role → display) ---
  'role.admin': { en: 'Administrator', so: 'Maamule Sare' },
  'role.owner': { en: 'Owner', so: 'Milkiile' },
  'role.manager': { en: 'Management', so: 'Maareynta' },
  'role.maintenance': { en: 'Maintenance', so: 'Dayactirka' },
  'role.tenant': { en: 'Resident', so: 'Kireyste' },
  'role.portal': { en: 'Portal', so: 'Bogga' },

  // --- Navigation (sidebar) ---
  'nav.home': { en: 'Home', so: 'Bogga Hore' },
  'nav.section.overview': { en: 'Overview', so: 'Guudmar' },
  'nav.section.portfolio': { en: 'Portfolio', so: 'Hantida' },
  'nav.section.insights': { en: 'Insights', so: 'Aragtiyada' },
  'nav.section.administration': { en: 'Administration', so: 'Maamulka' },
  'nav.section.account': { en: 'Account', so: 'Akoonka' },
  'nav.section.myHome': { en: 'My Home', so: 'Gurigayga' },
  'nav.dashboard': { en: 'Dashboard', so: 'Bogga Guud' },
  'nav.properties': { en: 'Properties', so: 'Guryaha' },
  'nav.financials': { en: 'Financials', so: 'Maaliyadda' },
  'nav.maintenance': { en: 'Maintenance', so: 'Dayactirka' },
  'nav.analytics': { en: 'Analytics', so: 'Falanqaynta' },
  'nav.people': { en: 'People', so: 'Dadka' },
  'nav.employees': { en: 'Employees', so: 'Shaqaalaha' },
  'nav.profile': { en: 'Profile', so: 'Xogta Shaqsiga' },
  'nav.security': { en: 'Security', so: 'Amniga' },
  'nav.portalOverview': { en: 'Overview', so: 'Guudmar' },
  'nav.payments': { en: 'Payments', so: 'Lacag-bixinta' },
  'nav.signOut': { en: 'Sign Out', so: 'Ka bax' },
  'nav.workspace': { en: '{role} Workspace', so: 'Goobta Shaqada {role}' },

  // --- Landing page ---
  'landing.eyebrow': { en: 'Empowering Hargeisa', so: 'Awood-siinta Hargeysa' },
  'landing.titleLead': { en: 'The Future of', so: 'Mustaqbalka' },
  'landing.titleTrail': { en: 'Property Management.', so: 'Maareynta Hantida.' },
  'landing.subtitle': {
    en: 'A seamless enterprise solution designed for the unique needs of property owners in Somaliland. Managed locally, built globally.',
    so: 'Xal ganacsi oo dhamaystiran oo loogu talagalay baahiyaha gaarka ah ee milkiilayaasha guryaha ee Somaliland. Si maxalli ah loo maamulay, si caalami ah loo dhisay.',
  },
  'landing.ctaManagement': { en: 'Management', so: 'Maareynta' },
  'landing.ctaTenant': { en: 'Tenant', so: 'Kireyste' },
  'landing.philosophyTitle': { en: 'Built for Our Lands', so: 'Waxaa Loo Dhisay Dhulkeenna' },
  'landing.card1Title': { en: 'Local Infrastructure', so: 'Kaabayaal Maxalli ah' },
  'landing.card1Body': {
    en: 'Tailored for the unique rental landscapes from Hargeisa to Burao.',
    so: 'Waxaa loo habeeyay suuqyada kirada ee gaarka ah ee Hargeysa ilaa Burco.',
  },
  'landing.card2Title': { en: 'Secure Integrity', so: 'Amni La Aamini Karo' },
  'landing.card2Body': {
    en: 'Enterprise-grade security ensuring your lease data is always protected.',
    so: 'Amni heer-ganacsi ah oo hubinaya in xogtaada kirada had iyo jeer la ilaaliyo.',
  },
  'landing.card3Title': { en: 'Growth Centric', so: 'Diiradda Koritaanka' },
  'landing.card3Body': {
    en: 'Clear revenue tracking to help you scale your real estate portfolio.',
    so: 'La-socod dakhli oo cad si laguu caawiyo inaad ballaariso hantidaada guryaha.',
  },

  // --- Login page ---
  'login.mfaTitle': { en: 'Two-Factor Verification', so: 'Xaqiijinta Laba-Talaabo' },
  'login.tenantTitle': { en: 'Tenant Sign In', so: 'Gelitaanka Kireystaha' },
  'login.mgmtTitle': { en: 'Management', so: 'Maareynta' },
  'login.mfaSubtitle': {
    en: 'Enter the 6-digit code from your authenticator app.',
    so: 'Geli lambarka 6-god ee ka yimaada barnaamijkaaga xaqiijinta.',
  },
  'login.tenantSubtitle': { en: 'Sign in to your resident portal.', so: 'Ku gal boggaaga kireyste.' },
  'login.mgmtSubtitle': {
    en: 'Sign in to your Harmaal workspace.',
    so: 'Ku gal goobtaada shaqada ee Harmaal.',
  },
  'login.tabAdmin': { en: 'Admin', so: 'Maamule' },
  'login.tabManagement': { en: 'Management', so: 'Maareynta' },
  'login.tabMaintenance': { en: 'Maintenance', so: 'Dayactirka' },
  'login.emailLabel': { en: 'Email Address', so: 'Cinwaanka Iimaylka' },
  'login.passwordLabel': { en: 'Password', so: 'Furaha Sirta' },
  'login.signIn': { en: 'Sign In', so: 'Gal' },
  'login.signingIn': { en: 'Signing in…', so: 'Waa la gelayaa…' },
  'login.codeLabel': { en: 'Authentication Code', so: 'Lambarka Xaqiijinta' },
  'login.verify': { en: 'Verify', so: 'Xaqiiji' },
  'login.verifying': { en: 'Verifying…', so: 'Waa la xaqiijinayaa…' },
  'login.backToLogin': { en: '← Back to login', so: '← Ku noqo gelitaanka' },
  'login.newHere': { en: 'New here?', so: 'Ma cusub tahay?' },
  'login.becomeTenant': { en: 'Become a tenant', so: 'Noqo kireyste' },
  'login.unexpected': { en: 'Unexpected response from server.', so: 'Jawaab lama filaan ah ayaa ka timid server-ka.' },
  'login.invalidCreds': { en: 'Invalid credentials. Please try again.', so: 'Xogta gelitaanku waa khaldan tahay. Fadlan mar kale isku day.' },
  'login.invalidCode': { en: 'Invalid or expired code.', so: 'Lambarku waa khaldan yahay ama wuu dhacay.' },

  // --- Property detail + tenant creation ---
  'property.backToProperties': { en: '← Properties', so: '← Guryaha' },
  'property.unitsTenants': { en: '{units} units · {tenants} tenants', so: '{units} cutub · {tenants} kireyste' },
  'property.rentRoll': { en: 'Rent Roll', so: 'Diiwaanka Kirada' },
  'property.registerTenant': { en: '+ Register Tenant', so: '+ Diiwaangeli Kireyste' },
  'property.noTenants': { en: 'No tenants registered for this property yet.', so: 'Weli kireyste looma diiwaangelin guriga.' },
  'property.colTenant': { en: 'Tenant', so: 'Kireyste' },
  'property.colUnit': { en: 'Unit', so: 'Cutub' },
  'property.colRent': { en: 'Monthly Rent', so: 'Kirada Bishii' },
  'property.colLease': { en: 'Lease Term', so: 'Muddada Kirada' },
  'property.terminateConfirm': { en: 'Terminate this lease?', so: 'Ma joojinaysaa heshiiskan kirada?' },

  'tenantForm.title': { en: 'Initialize Lease', so: 'Bilaabista Kirada' },
  'tenantForm.fullName': { en: 'Full name', so: 'Magaca oo dhan' },
  'tenantForm.emailPlaceholder': { en: 'tenant@example.com', so: 'tenant@example.com' },
  'tenantForm.phonePlaceholder': { en: 'Phone (e.g. +252 63…)', so: 'Taleefan (tusaale +252 63…)' },
  'tenantForm.unitPlaceholder': { en: 'Unit (e.g. A-101)', so: 'Cutub (tusaale A-101)' },
  'tenantForm.rentPlaceholder': { en: 'Monthly rent', so: 'Kirada bishii' },
  'tenantForm.portalAccess': { en: 'Create tenant portal access', so: 'Abuur gelitaanka bogga kireystaha' },
  'tenantForm.tempPassword': { en: 'Temporary password (strong)', so: 'Furaha sirta ku-meel-gaarka ah (adag)' },
  'tenantForm.tempPasswordHint': { en: '≥12 chars, upper/lower/number/symbol.', so: '≥12 xaraf, weyn/yar/lambar/astaan.' },
  'tenantForm.activate': { en: 'Activate Lease', so: 'Hawlgeli Kirada' },
  'tenantForm.leaseActivated': { en: 'Lease activated.', so: 'Kirada waa la hawlgeliyay.' },
  'tenantForm.leaseAndAccount': { en: 'Lease activated and portal account created.', so: 'Kirada waa la hawlgeliyay, akoonka boggana waa la abuuray.' },
  'tenantForm.leaseAccountFailed': {
    en: 'Lease created, but portal account failed (password too weak or already exists).',
    so: 'Kirada waa la abuuray, laakiin akoonka bogga wuu fashilmay (furaha sirta aad buu u tabar-yar yahay ama horeba wuu u jiray).',
  },
  'tenantForm.failedRegister': { en: 'Failed to register tenant.', so: 'Diiwaangelinta kireystaha waa fashilantay.' },

  // --- Employees page (manager-created staff) ---
  'employees.title': { en: 'Employees', so: 'Shaqaalaha' },
  'employees.subtitle': { en: 'Onboard and manage your staff members.', so: 'Ku dar oo maamul shaqaalahaaga.' },
  'employees.addBtn': { en: '+ Add Employee', so: '+ Ku dar Shaqaale' },
  'employees.colName': { en: 'Name', so: 'Magaca' },
  'employees.colEmail': { en: 'Email', so: 'Iimayl' },
  'employees.colRole': { en: 'Role', so: 'Doorka' },
  'employees.col2fa': { en: '2FA', so: '2FA' },
  'employees.colStatus': { en: 'Status', so: 'Xaalad' },
  'employees.empty': { en: 'No employees yet. Add your first staff member.', so: 'Weli shaqaale ma jiro. Ku dar shaqaalahaaga koowaad.' },
  'employees.addTitle': { en: 'Add Employee', so: 'Ku dar Shaqaale' },
  'employees.createdTitle': { en: 'Employee created', so: 'Shaqaalaha waa la diiwaangeliyay' },
  'employees.otpShareNote': {
    en: 'Share this one-time password. They must change it on first login.',
    so: 'La wadaag furaha sirta hal-mar ah. Waa inay beddelaan markii ugu horreysay ee ay galaan.',
  },
  'employees.emailPlaceholder': { en: 'email@harmaal.com', so: 'email@harmaal.com' },
  'employees.namePlaceholder': { en: 'Display name (optional)', so: 'Magaca la muujinayo (ikhtiyaari)' },
  'employees.phonePlaceholder': { en: 'Phone (optional)', so: 'Taleefan (ikhtiyaari)' },
  'employees.roleLabel': { en: 'Role', so: 'Doorka' },
  'employees.createError': { en: 'Could not create employee (email may already exist).', so: 'Shaqaalaha lama abuuri karo (iimaylku horeba wuu u jiri karaa).' },

  // --- Hormaal Group (conglomerate hub at "/") ---
  // Somali here is a first pass and still needs native review; the property-app
  // strings above were localizer-reviewed, these have not been yet.
  'group.name': { en: 'Hormaal Group', so: 'Hormaal Group' },
  'group.eyebrow': { en: 'A Somaliland enterprise group', so: 'Koox ganacsi oo Somaliland ah' },
  'group.titleLead': { en: 'Six companies.', so: 'Lix shirkadood.' },
  'group.titleTrail': { en: 'One standard.', so: 'Hal heer.' },
  'group.subtitle': {
    en: 'Hormaal Group builds and operates businesses across property, agriculture, construction, logistics, trade and energy — run on shared systems, shared people, and one standard of care.',
    so: 'Hormaal Group waxay dhistaa oo maamushaa ganacsiyo ku saabsan hantida, beeraha, dhismaha, gaadiidka, ganacsiga iyo tamarta — iyagoo isticmaalaya nidaam wadaag ah, shaqaale wadaag ah, iyo hal heer oo daryeel ah.',
  },
  'group.companiesTitle': { en: 'Our companies', so: 'Shirkadaheenna' },
  'group.companiesSubtitle': {
    en: 'Two are live today. The rest are being brought onto the same platform.',
    so: 'Laba ayaa maanta shaqaynaya. Kuwa kalena waxaa lagu soo darayaa isla nidaamka.',
  },
  'group.enter': { en: 'Open', so: 'Fur' },
  'group.comingSoon': { en: 'Coming soon', so: 'Dhawaan' },
  'group.live': { en: 'Live', so: 'Shaqaynaya' },
  'group.co.property.name': { en: 'Hormaal Property Management', so: 'Hormaal Maareynta Hantida' },
  'group.co.property.blurb': {
    en: 'Landlord, tenant and rent operations for Hargeisa rental housing — leases, collections, maintenance and portfolio analytics.',
    so: 'Maareynta milkiilaha, kireystaha iyo kirada guryaha Hargeysa — heshiisyada, aruurinta, dayactirka iyo falanqaynta hantida.',
  },
  'group.co.feed.name': { en: 'Hormaal Animal Feed', so: 'Hormaal Cuntada Xoolaha' },
  'group.co.feed.blurb': {
    en: 'Camel, cattle, goat and poultry feed — inventory, batch expiry tracking, costing and margin analytics.',
    so: 'Cuntada geela, lo\'da, riyaha iyo digaagga — bakhaarka, taariikhda dhicitaanka, qiimaha iyo faaiidada.',
  },
  'group.co.construction.name': { en: 'Hormaal Construction', so: 'Hormaal Dhismaha' },
  'group.co.construction.blurb': {
    en: 'Residential and commercial building, from site survey through handover.',
    so: 'Dhismaha guryaha iyo ganacsiga, laga bilaabo sahanka ilaa wareejinta.',
  },
  'group.co.logistics.name': { en: 'Hormaal Logistics', so: 'Hormaal Gaadiidka' },
  'group.co.logistics.blurb': {
    en: 'Berbera corridor haulage, warehousing and last-mile distribution.',
    so: 'Xamuulka marinka Berbera, bakhaarrada iyo qaybinta ugu dambaysa.',
  },
  'group.co.trading.name': { en: 'Hormaal Trading', so: 'Hormaal Ganacsiga' },
  'group.co.trading.blurb': {
    en: 'Import, wholesale and distribution of agricultural and household goods.',
    so: 'Soo dejinta, jumlada iyo qaybinta alaabta beeraha iyo guriga.',
  },
  'group.co.energy.name': { en: 'Hormaal Energy', so: 'Hormaal Tamarta' },
  'group.co.energy.blurb': {
    en: 'Solar systems and off-grid power for homes, farms and businesses.',
    so: 'Nidaamyada qorraxda iyo korontada guryaha, beeraha iyo ganacsiga.',
  },
  'group.valuesTitle': { en: 'How we operate', so: 'Sida aan u shaqeyno' },
  'group.value1Title': { en: 'One platform', so: 'Hal nidaam' },
  'group.value1Body': {
    en: 'Every company runs on the same identity, access-control and reporting stack — so a manager learns one system, not six.',
    so: 'Shirkad kastaa waxay ku shaqaysaa isla nidaamka aqoonsiga, oggolaanshaha iyo warbixinta — sidaas darteed maamuluhu wuxuu bartaa hal nidaam, ma aha lix.',
  },
  'group.value2Title': { en: 'Accountable by default', so: 'Xisaabtan ah asal ahaan' },
  'group.value2Body': {
    en: 'Two-factor sign-in, role-based access and an audit trail on every number that matters.',
    so: 'Gelitaan laba-tallaabo ah, oggolaansho door-ku-saleysan, iyo raad-raac lambar kasta oo muhiim ah.',
  },
  'group.value3Title': { en: 'Built here', so: 'Halkan lagu dhisay' },
  'group.value3Body': {
    en: 'Designed for how business actually works in Somaliland — cash-first, bilingual, and usable on the phone in your pocket.',
    so: 'Loo naqshadeeyay sida ganacsigu dhab ahaan uga shaqeeyo Somaliland — lacag-caddaan horeysa, laba-luqadood, oo lagu isticmaali karo taleefankaaga.',
  },
  'group.footer': { en: 'Hargeisa, Somaliland', so: 'Hargeysa, Somaliland' },

  // --- Hormaal Animal Feed — public entry surface (sign-in + shell nav) ---
  'feed.brand': { en: 'Hormaal Animal Feed', so: 'Hormaal Cuntada Xoolaha' },
  'feed.brandShort': { en: 'Animal Feed', so: 'Cuntada Xoolaha' },
  'feed.tagline': { en: 'Inventory & stock control', so: 'Bakhaarka iyo xakameynta alaabta' },
  'feed.login.title': { en: 'Feed Admin', so: 'Maamulaha Cuntada' },
  'feed.login.subtitle': {
    en: 'Administrator access only. Sign in to manage inventory.',
    so: 'Maamulaha oo keliya. Gal si aad u maamusho bakhaarka.',
  },
  'feed.login.adminOnly': {
    en: 'This console is restricted to Hormaal Animal Feed administrators.',
    so: 'Nidaamkan waxaa loo xaddiday maamulayaasha Hormaal Cuntada Xoolaha.',
  },
  'feed.login.noAccess': {
    en: 'This account does not have access to the Animal Feed console.',
    so: 'Akoonkani ma laha oggolaansho uu ku galo nidaamka Cuntada Xoolaha.',
  },
  'feed.login.backToGroup': { en: 'Hormaal Group', so: 'Hormaal Group' },
  'feed.nav.dashboard': { en: 'Dashboard', so: 'Bogga Guud' },
  'feed.nav.products': { en: 'Products', so: 'Alaabta' },
  'feed.nav.inventory': { en: 'Stock & batches', so: 'Bakhaarka iyo dufcadaha' },
  'feed.nav.movements': { en: 'Stock ledger', so: 'Diiwaanka alaabta' },
  'feed.nav.signOut': { en: 'Sign out', so: 'Ka bax' },
  'feed.nav.group': { en: 'Group home', so: 'Bogga Kooxda' },
} as const;

export type MessageKey = keyof typeof messages;
