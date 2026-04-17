import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
        const page = i + 1;
        return (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-3 py-1 rounded-lg border ${
              page === currentPage
                ? 'bg-linkedin text-white border-linkedin'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            {page}
          </button>
        );
      })}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
