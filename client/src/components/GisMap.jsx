import React from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { ArrowUpRight, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const schemeLocations = {
  'Nyanyadzi Irrigation Scheme': [-19.67, 32.85],
  'Exchange Irrigation Scheme': [-18.55, 29.65],
  'Tshovane Irrigation Scheme': [-21.05, 31.55],
  'Mubaira Solar Irrigation Scheme': [-18.65, 30.12],
  'Silalatshani Irrigation Scheme': [-19.2, 29.05],
};

export default function GisMap({ schemes = [], dashboard = false, expanded = false, onOpenMap }) {
  return <section className={`portal-card portal-map-card ${expanded ? 'portal-map-expanded' : ''}`}>
    <div className="portal-map-head">
      <div><h3><MapPin size={21} />{dashboard ? 'Interactive GIS Satellite Map — Zimbabwe Irrigation Schemes' : 'Irrigation Scheme Spatial Overview'}</h3>
        <p>{dashboard ? 'Click any pin marker to inspect live field data, coordinates, and survey responses.' : 'Live geospatial view of registered irrigation schemes and field telemetry.'}</p>
      </div>
      <div className="portal-map-legend"><span>All ({schemes.length})</span><span><i className="legend-functional" />Functional</span><span><i className="legend-attention" />Needs Attention</span></div>
    </div>
    <div className="portal-map-frame">
      <MapContainer center={[-19.1, 30.95]} zoom={expanded ? 6 : 5} scrollWheelZoom className="portal-leaflet">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {schemes.map((scheme, index) => {
          const supplied = scheme.coordinates;
          const position = Array.isArray(supplied)
            ? supplied
            : supplied && Number.isFinite(Number(supplied.lat)) && Number.isFinite(Number(supplied.lng))
              ? [Number(supplied.lat), Number(supplied.lng)]
              : schemeLocations[scheme.name] || [-19.1 + index * 0.25, 30.95 + index * 0.2];
          const functional = scheme.status?.toLowerCase().includes('fully');
          const status = String(scheme.status || '').toLowerCase();
          const offline = /offline|inactive|non[- ]functional/.test(status);
          const attention = !functional && !offline && /partial|attention|rehab/.test(status);
          return <React.Fragment key={scheme.id}>
            {(functional || attention) && <CircleMarker
            center={position}
            radius={expanded ? 17 : 14}
            interactive={false}
            pathOptions={{
              className: functional ? 'portal-scheme-pulse portal-scheme-pulse-functional' : 'portal-scheme-pulse portal-scheme-pulse-attention',
              color: functional ? '#16803c' : '#e89716',
              weight: 2,
              fillOpacity: 0,
            }}
            />}
            <CircleMarker
            center={position}
            radius={expanded ? 10 : 8}
            pathOptions={{
              className: 'portal-scheme-marker',
              color: '#fff',
              weight: 3,
              fillColor: functional ? '#16803c' : '#e89716',
              fillOpacity: 1,
            }}
            >
            <Popup><strong>{scheme.name}</strong><br />{scheme.district}, {scheme.province}<br />{scheme.status}<br />Functional area: {scheme.functional_area} Ha</Popup>
            </CircleMarker>
          </React.Fragment>;
        })}
      </MapContainer>
    </div>
    <div className="portal-map-foot"><span><i className="legend-functional" />Functional scheme</span><span><i className="legend-attention" />Needs attention</span><span>National Irrigation Survey · 2026</span>{dashboard && onOpenMap && <button onClick={onOpenMap}>Open full map <ArrowUpRight size={14} /></button>}</div>
  </section>;
}
