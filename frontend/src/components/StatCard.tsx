type StatCardProps = {
  title: string
  value: string
}

function StatCard({ title, value }: StatCardProps) {
  return (
    <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">

      <h3 className="text-gray-400 text-sm">
        {title}
      </h3>

      <p className="text-4xl font-bold mt-4">
        {value}
      </p>

    </div>
  )
}

export default StatCard