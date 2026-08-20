import React, { useRef, useState } from 'react';
import { aiChat } from '../utils/api';

export default function ChatBox() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m WasteWise Helper. Ask me about zones, routes, flags, or risk analysis.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const history = messages.filter((m) => m.role !== 'system');
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const data = await aiChat({
        message: text,
        sessionHistory: history.map(({ role, content }) => ({ role, content })),
      });

      // Backend returns { answer, dataPoints, recommendation, ... }
      let reply = '';
      if (typeof data === 'string') {
        reply = data;
      } else if (data) {
        reply = data.answer || '';
        if (data.dataPoints && data.dataPoints.length > 0) {
          reply += '\n\n- ' + data.dataPoints.join('\n- ');
        }
        if (data.recommendation) {
          reply += '\n\nRecommendation: ' + data.recommendation;
        }
      }
      if (!reply) reply = '(No response from Helper)';

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Warning: Could not reach Helper. Check your GROQ_API_KEY.' },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="chatbox">
      <div className="chatbox__header">
        <span className="ai-dot" />
        WasteWise Helper
      </div>

      <div className="chatbox__messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${msg.role}`}>
            <pre className="chat-text">{msg.content}</pre>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble chat-bubble--assistant">
            <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chatbox__input-row">
        <textarea
          className="chat-input"
          rows={2}
          placeholder="Ask WasteWise Helper..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
        />
        <button className="chat-send-btn" onClick={send} disabled={loading}>
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
