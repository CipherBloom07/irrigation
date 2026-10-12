import React, { useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, Send, X, Sparkles, Trash2 } from 'lucide-react';
import { answerPortalQuestion } from '../services/portalAssistant';

const suggestions = [
  'What is the current weather & rainfall?',
  'How many schemes are fully functional?',
  'What is current soil moisture & irrigation demand?',
  'How do I add or edit schemes as admin?',
  'Explain drip vs furrow irrigation efficiency',
];

function FormattedText({ text }) {
  if (!text) return null;
  const lines = text.split('\n');

  return (
    <div className="portal-assistant-text">
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="my-1.5" />;
        }

        // Parse bold **text**
        const formatted = line.split(/(\*\*.*?\*\*)/g).map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={i}>{part.slice(1, -1)}</em>;
          }
          return part;
        });

        if (line.startsWith('• ') || line.startsWith('- ')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-2 my-0.5 text-sm leading-relaxed">
              <span className="text-emerald-500 font-bold leading-none select-none">•</span>
              <span>{formatted.slice(1)}</span>
            </div>
          );
        }

        if (line.startsWith('---')) {
          return <hr key={idx} className="my-2 border-slate-200 dark:border-slate-700" />;
        }

        return (
          <p key={idx} className="my-0.5 text-sm leading-relaxed">
            {formatted}
          </p>
        );
      })}
    </div>
  );
}

export default function PortalAssistant({ context }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const endOfMessages = useRef(null);
  const input = useRef(null);
  const messageId = useRef(0);

  useEffect(() => {
    if (open) {
      setTimeout(() => input.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, open]);

  const ask = (text) => {
    const submitted = text.trim();
    if (!submitted) return;

    try {
      const reply = answerPortalQuestion(submitted, context);
      messageId.current += 1;
      const id = messageId.current;

      setMessages((current) => [
        ...current,
        { id: `${id}-user`, role: 'user', text: submitted },
        { id: `${id}-assistant`, role: 'assistant', text: reply },
      ]);
      setQuestion('');
      setError('');
    } catch (requestError) {
      console.error('Unable to answer portal question:', requestError);
      setError('Unable to prepare a response. Please try again.');
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError('');
  };

  return (
    <>
      {open && (
        <section
          className="portal-assistant"
          role="dialog"
          aria-modal="false"
          aria-labelledby="portal-assistant-title"
        >
          <header className="portal-assistant-header">
            <span className="portal-assistant-avatar">
              <Bot size={20} />
            </span>
            <div className="flex-1">
              <strong id="portal-assistant-title">Irrigation AI Assistant</strong>
              <small>Real-time analytics, scheme records & agronomic intelligence</small>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  title="Clear chat"
                  aria-label="Clear chat history"
                  onClick={clearChat}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                type="button"
                aria-label="Close assistant"
                onClick={() => setOpen(false)}
                className="p-1"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div
            className="portal-assistant-messages"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!messages.length && (
              <div className="portal-assistant-welcome">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={18} className="text-emerald-500" />
                  <strong>How can I help you today?</strong>
                </div>
                <p>
                  Ask me anything about Zimbabwe’s irrigation schemes, live meteorological feeds, field sensor telemetry, agricultural engineering, or administrative registry management.
                </p>
                <div className="portal-suggestions-list">
                  {suggestions.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      onClick={() => ask(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <article key={message.id} className={`portal-assistant-message ${message.role}`}>
                <FormattedText text={message.text} />
              </article>
            ))}

            {error && <p className="portal-assistant-error" role="alert">{error}</p>}
            <div ref={endOfMessages} />
          </div>

          <form
            className="portal-assistant-form"
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
          >
            <label className="portal-sr-only" htmlFor="portal-assistant-question">
              Ask a question about the irrigation portal
            </label>
            <input
              id="portal-assistant-question"
              ref={input}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about schemes, weather, sensors, or agriculture..."
              maxLength={500}
            />
            <button type="submit" disabled={!question.trim()} aria-label="Send question">
              <Send size={17} />
            </button>
          </form>

          <p className="portal-assistant-note">
            Powered by live telemetry, Open-Meteo & national irrigation survey records.
          </p>
        </section>
      )}

      <button
        className={`portal-assistant-toggle${open ? ' is-open' : ''}`}
        type="button"
        aria-label={open ? 'Close portal assistant' : 'Open portal assistant'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        <span>{open ? 'Close' : 'Ask Portal AI'}</span>
      </button>
    </>
  );
}
