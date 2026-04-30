export default function BrandingPanel() {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <h2 className="text-xl font-bold mb-4">
        Branding
      </h2>

      <div className="space-y-4">
        <input
          type="text"
          placeholder="Nombre comercial"
          className="w-full bg-gray-800 rounded-xl p-3"
        />

        <input
          type="color"
          className="w-full h-12 bg-gray-800 rounded-xl"
        />

        <textarea
          placeholder="Mensaje del ticket"
          className="w-full bg-gray-800 rounded-xl p-3"
        />
      </div>
    </div>
  )
}