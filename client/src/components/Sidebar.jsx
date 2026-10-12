import React from 'react';
import {
  ChevronRight, Database, Droplets, FileText, LayoutDashboard, Map, ShieldAlert, Sprout, Wrench,
} from 'lucide-react';

const menuItems = [
  { label: 'Executive Dashboard', icon: LayoutDashboard },
  { label: 'GIS Spatial Telemetry Map', icon: Map, badge: true },
  { label: 'Water & Telemetry', icon: Droplets },
  { label: 'Agronomic & Crops', icon: Sprout },
  { label: 'Infrastructure & O&M', icon: Wrench },
  { label: 'Sustainability & Risks', icon: ShieldAlert },
  { label: 'Scheme Data Registry', icon: Database },
  { label: 'Assessment Reports', icon: FileText },
];

export default function Sidebar({ activeTab, setActiveTab, schemeCount }) {
  return <aside className="portal-sidebar">
    <div className="portal-brand">
      <img className="portal-brand-logo" src="/images/department-of-irrigation-logo-transparent.png" alt="Department of Irrigation logo" />
      <div><div className="portal-brand-title">Irrigation Intelligence</div><small>Department of Irrigation · Zimbabwe</small></div>
    </div>
    <div className="portal-nav-label">GOVERNMENT PORTAL PAGES</div>
    <nav className="portal-nav">
      {menuItems.map(({ label, icon: Icon, badge }) => <button type="button" key={label} onClick={() => setActiveTab(label)} className={activeTab === label ? 'active' : ''}>
        <Icon size={18} /><span>{label}</span>{badge && <small>{schemeCount} Schemes</small>}
      </button>)}
    </nav>
    <div className="portal-sidebar-ministry">
      <div className="portal-gov-seal"><Droplets size={19} aria-hidden="true" /></div>
      <div><strong>Water management portal</strong><small>Government of Zimbabwe</small></div>
      <ChevronRight size={17} aria-hidden="true" />
    </div>
  </aside>;
}
