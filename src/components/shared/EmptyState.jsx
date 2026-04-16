import { Inbox } from 'lucide-react';

export default function EmptyState({ title = 'Nothing here yet', message = '', icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Icon className="w-12 h-12 mb-3" />
      <h3 className="text-lg font-medium text-gray-600">{title}</h3>
      {message && <p className="mt-1 text-sm">{message}</p>}
    </div>
  );
}
