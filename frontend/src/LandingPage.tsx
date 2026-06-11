export default function LandingPage() {
  return (
    <div className="text-center py-20 px-10">
      <h1 className="text-6xl font-bold mb-6">Manage Properties Smarter.</h1>
      <p className="text-xl text-gray-500 mb-10">The ultimate ERP for modern real estate.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-6 border rounded-xl"><h3>Automated Invoicing</h3></div>
        <div className="p-6 border rounded-xl"><h3>Tenant Management</h3></div>
        <div className="p-6 border rounded-xl"><h3>Real-time Analytics</h3></div>
      </div>
    </div>
  );
}