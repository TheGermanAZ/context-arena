import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Context Arena</h1>
        <p className="text-gray-400 mb-8">Benchmarking memory strategies for LLM conversations</p>
        <div className="flex gap-4 justify-center">
          <Link to="/demo" className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors">
            See the story
          </Link>
          <Link to="/dashboard" className="px-6 py-3 bg-gray-800 text-gray-200 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors">
            Explore the data
          </Link>
        </div>
      </div>
    </div>
  );
}
