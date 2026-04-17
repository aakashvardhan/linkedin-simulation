import { Search } from 'lucide-react';
import { useState } from 'react';

export default function SearchBar({ onSearch, placeholder = 'Search...', initialValue = '' }) {
  const [query, setQuery] = useState(initialValue);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent"
        />
      </div>
      <button
        type="submit"
        className="px-6 py-2 bg-linkedin text-white rounded-lg hover:bg-linkedin-dark transition-colors"
      >
        Search
      </button>
    </form>
  );
}
