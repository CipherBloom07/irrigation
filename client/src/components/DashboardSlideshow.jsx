import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import './DashboardSlideshow.css';

const slides = [
  {
    image: '/agriculture/field-landscape.jpg',
    alt: 'Agricultural field extending across the landscape',
    eyebrow: 'IRRIGATION & AGRICULTURE',
    title: 'Making every drop count',
    description: 'A clearer view of irrigation schemes, water resources, and agricultural performance across Zimbabwe.',
  },
  {
    image: '/agriculture/golden-field.jpg',
    alt: 'Golden agricultural field in warm evening light',
    eyebrow: 'SCHEME PERFORMANCE',
    title: 'From field data to better decisions',
    description: 'Bring scheme records, operational indicators, and planning insights together in one place.',
  },
  {
    image: '/agriculture/crop-seedlings.jpg',
    alt: 'Young crop seedlings growing in prepared soil',
    eyebrow: 'SUSTAINABLE GROWTH',
    title: 'Support resilient crop production',
    description: 'Explore the information that helps teams monitor infrastructure, water delivery, and crop systems.',
  },
];

export default function DashboardSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [isPaused]);

  const showPrevious = () => {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  };

  const showNext = () => {
    setActiveIndex((current) => (current + 1) % slides.length);
  };

  return (
    <section className="dashboard-slideshow" aria-label="Irrigation and agriculture highlights">
      <div className="dashboard-slideshow-images" aria-hidden="true">
        {slides.map((slide, index) => (
          <img
            key={slide.image}
            className={`dashboard-slideshow-image${index === activeIndex ? ' is-active' : ''}`}
            src={slide.image}
            alt=""
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ))}
      </div>

      <div className="dashboard-slideshow-shade" />
      <div className="dashboard-slideshow-content" aria-live="polite" aria-atomic="true">
        <span className="dashboard-slideshow-eyebrow">{slides[activeIndex].eyebrow}</span>
        <h2>{slides[activeIndex].title}</h2>
        <p>{slides[activeIndex].description}</p>
      </div>

      <div className="dashboard-slideshow-controls" aria-label="Slideshow controls">
        <span className="dashboard-slideshow-count">{String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
        <button type="button" onClick={showPrevious} aria-label="Previous slide" title="Previous slide">
          <ArrowLeft size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setIsPaused((paused) => !paused)}
          aria-label={isPaused ? 'Play slideshow' : 'Pause slideshow'}
          title={isPaused ? 'Play slideshow' : 'Pause slideshow'}
          aria-pressed={isPaused}
        >
          {isPaused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
        </button>
        <button type="button" onClick={showNext} aria-label="Next slide" title="Next slide">
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>

      <p className="dashboard-slideshow-credit">Illustrative agriculture photography</p>
    </section>
  );
}
