import React from 'react';
import './PagePurposeBanner.css';

const pageVisuals = {
  gis: {
    eyebrow: 'SPATIAL INTELLIGENCE',
    title: 'See irrigation schemes in their landscape',
    description: 'Explore scheme locations and geographic context across Zimbabwe.',
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=70',
    alt: 'Broad agricultural fields and rural landscape viewed from above',
  },
  water: {
    eyebrow: 'WATER RESOURCES',
    title: 'Water delivery, flow and hydrology',
    description: 'Review water indicators, source status and hydrological trends in one place.',
    image: 'https://images.unsplash.com/photo-1548337138-e87d889cc369?auto=format&fit=crop&w=1200&q=70',
    alt: 'Agricultural land with water management and irrigation context',
  },
  infrastructure: {
    eyebrow: 'ENGINEERING & ASSET HEALTH',
    title: 'Infrastructure that keeps schemes operating',
    description: 'Assess headworks, conveyance systems, storage, infield equipment and maintenance needs.',
    image: 'https://www.novibechej.com/images/tisa/ilustracija_1507251.jpg',
    alt: 'Concrete irrigation pumping station beside a canal, with large water pipes and safety railings',
    sourceUrl: 'https://www.novibechej.com/en/chronicle-of-water-management-in-vojvodina/water-supply-from-the-basic-canal-network-okm-potentials-challenges-and-development-opportunities.html',
    sourceLabel: 'Image source: Novibecej water-management article',
  },
  sustainability: {
    eyebrow: 'RESILIENCE & RISK',
    title: 'Understand pressures on irrigation schemes',
    description: 'Review climate exposure, operational risks and long-term sustainability priorities.',
    image: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=1200&q=70',
    alt: 'Dry arid landscape illustrating water stress and climate exposure',
  },
  registry: {
    eyebrow: 'NATIONAL SCHEME RECORDS',
    title: 'A structured view of the irrigation portfolio',
    description: 'Browse scheme records, locations, operational status and reported water sources.',
    image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=70',
    alt: 'Planning documents and notes arranged on a work surface',
  },
  reports: {
    eyebrow: 'ASSESSMENT & EVIDENCE',
    title: 'Turn field records into useful decisions',
    description: 'Find scheme assessment summaries and prepare reports for review or printing.',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=70',
    alt: 'Data analytics dashboard displayed on a computer screen',
  },
};

export default function PagePurposeBanner({ page }) {
  const visual = pageVisuals[page];
  if (!visual) return null;

  return (
    <section className={`page-purpose-banner page-purpose-banner-${page}`} aria-label={visual.eyebrow}>
      <img className="page-purpose-banner-image" src={visual.image} alt={visual.alt} loading="eager" fetchPriority="high" decoding="async" />
      <div className="page-purpose-banner-shade" />
      <div className="page-purpose-banner-content">
        <span>{visual.eyebrow}</span>
        <h3>{visual.title}</h3>
        <p>{visual.description}</p>
      </div>
      <small className="page-purpose-banner-note">Illustrative context imagery · not a live or scheme-specific photograph{visual.sourceUrl ? <> · <a href={visual.sourceUrl} target="_blank" rel="noreferrer">{visual.sourceLabel}</a></> : null}</small>
    </section>
  );
}
