import { UserPlus, UserCheck, UserMinus, X } from 'lucide-react';

export default function ConnectionCard({ connection, onAccept, onReject, onRemove }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
      <img src={connection.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 truncate">{connection.name}</p>
        <p className="text-sm text-gray-500 truncate">{connection.headline}</p>
      </div>
      <div className="flex gap-2">
        {connection.connected ? (
          <button onClick={() => onRemove?.(connection.id)} className="flex items-center gap-1 px-3 py-1 text-xs border border-gray-300 rounded-full hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-gray-600 transition-colors">
            <UserMinus className="w-3 h-3" /> Remove
          </button>
        ) : (
          <>
            <button onClick={() => onAccept?.(connection.id)} className="p-1.5 bg-linkedin text-white rounded-full hover:bg-linkedin-dark">
              <UserPlus className="w-4 h-4" />
            </button>
            <button onClick={() => onReject?.(connection.id)} className="p-1.5 border border-gray-300 rounded-full hover:bg-gray-50">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
