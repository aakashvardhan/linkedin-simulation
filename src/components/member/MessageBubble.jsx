export default function MessageBubble({ message }) {
  const isMe = message.sender === 'me';
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${
        isMe ? 'bg-linkedin text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md'
      }`}>
        <p>{message.text}</p>
        <p className={`text-[10px] mt-1 ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
