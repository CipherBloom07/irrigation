import React, { useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, Send, X } from 'lucide-react';
import { answerPortalQuestion } from '../services/portalAssistant';

const suggestions = [
  'What is the current weather?',
  'Are field sensors live?',
  'How can an admin edit schemes?',
];

export default function PortalAssistant({ context }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const endOfMessages = useRef(null);
  const input = useRef(null);
  const messageId = useRef(0);

  useEffect(() => {
    if (open) input.current?.focus();
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
      setMessages((current) => [...current, { id: `${id}-user`, role: 'user', text: submitted }, { id: `${id}-assistant`, role: 'assistant', text: reply }]);
      setQuestion('');
      setError('');
    } catch (requestError) {
      console.error('Unable to answer portal question:', requestError);
      setError('Unable to prepare a response. Please try again.');
    }
  };

  return <>
    {open && <section className="portal-assistant" role="dialog" aria-modal="false" aria-labelledby="portal-assistant-title">
      <header className="portal-assistant-header">
        <span className="portal-assistant-avatar"><Bot size={20} /></span>
        <div><strong id="portal-assistant-title">Irrigation Portal Assistant</strong><small>Answers grounded in current portal data</small></div>
        <button type="button" aria-label="Close assistant" onClick={() => setOpen(false)}><X size={18} /></button>
      </header>
      <div className="portal-assistant-messages" aria-live="polite" aria-relevant="additions text">
        {!messages.length && <div className="portal-assistant-welcome">
          <strong>How can I help?</strong>
          <p>Ask about schemes, weather, data sources, risks, or using this portal. I’ll distinguish live readings from baseline records.</p>
          <div>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}</div>
        </div>}
        {messages.map((message) => <article key={message.id} className={`portal-assistant-message ${message.role}`}><span>{message.text}</span></article>)}
        {error && <p className="portal-assistant-error" role="alert">{error}</p>}
        <div ref={endOfMessages} />
      </div>
      <form className="portal-assistant-form" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
        <label className="portal-sr-only" htmlFor="portal-assistant-question">Ask a question about the irrigation portal</label>
        <input id="portal-assistant-question" ref={input} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about the portal..." maxLength={500} />
        <button type="submit" disabled={!question.trim()} aria-label="Send question"><Send size={17} /></button>
      </form>
      <p className="portal-assistant-note">Responses use information available in this portal; they are not operational or irrigation instructions.</p>
    </section>}
    <button className={`portal-assistant-toggle${open ? ' is-open' : ''}`} type="button" aria-label={open ? 'Close portal assistant' : 'Open portal assistant'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? <X size={22} /> : <MessageCircle size={22} />}<span>{open ? 'Close' : 'Ask the portal'}</span>
    </button>
  </>;
}
