export default function ThreadItem({ thread, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors ${isActive ? 'bg-linkedin-light border-l-2 border-linkedin' : ''}`}
    >
      <img src={thread.participantAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-800 truncate">{thread.participantName}</p>
        <p className="text-xs text-gray-500 truncate">{thread.lastMessage}</p>
      </div>
    </button>
  );
}
