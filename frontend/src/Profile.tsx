export default function Profile() {
  return (
    <div className="p-10 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">User Profile</h1>
      <div className="border p-6 rounded-xl shadow-sm">
        <p className="text-gray-600">Name: Isaaq Mohamed</p>
        <p className="text-gray-600">Role: Engineering Lead</p>
        <button className="mt-4 bg-gray-200 px-4 py-2 rounded">Edit Settings</button>
      </div>
    </div>
  );
}