import React, { useEffect, useState } from 'react';
import { Activity, Database, Download, LogIn, LogOut, MapPin, Menu, Plus, RefreshCw, RotateCcw, Search, ShieldCheck } from 'lucide-react';

export default function Header({
  search, setSearch, onAddClick, onExportCSV, onReset, schemeCount, onMenuClick,
  isSyncing, lastSyncedAt, telemetryStatus, gisOnline, onRefresh,
  admin, onAdminClick, onAdminLogout,
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const timeLabel = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const syncLabel = lastSyncedAt
    ? `Updated ${new Date(lastSyncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : isSyncing ? 'Syncing data' : 'Waiting for sync';
  const telemetryOnline = telemetryStatus === 'ONLINE' || telemetryStatus === 'PARTIAL';
  const telemetryLabel = telemetryStatus === 'ONLINE' ? 'ONLINE' : telemetryStatus === 'PARTIAL' ? 'PARTIAL' : 'BASELINE';

  return <header className="portal-header">
    <div className="portal-mobile-topbar">
      <button type="button" className="portal-mobile-menu" onClick={onMenuClick} aria-label="Open navigation menu"><Menu size={21} /><span>Irrigation Intelligence</span></button>
      <span className={`portal-mobile-status ${telemetryStatus === "BASELINE" ? "baseline" : telemetryStatus === "PARTIAL" ? "partial" : "live"}`}>{telemetryLabel}</span>
    </div>
    <div className="portal-government-bar">
      <div className="portal-government-identity">
        <img className="portal-ministry-image" src="/images/ministry-land-agriculture-logo.png" alt="Zimbabwe coat of arms and Ministry of Lands, Agriculture, Fisheries, Water and Rural Development" />
        <span><strong>MINISTRY OF LANDS, AGRICULTURE, FISHERIES, WATER & RURAL DEVELOPMENT</strong><small>GOVERNMENT OF ZIMBABWE · DEPARTMENT OF IRRIGATION</small></span>
      </div>
      <div className="portal-live-flags">
        <span className={telemetryStatus === 'PARTIAL' ? 'partial' : telemetryOnline ? 'online' : 'offline'}><i aria-hidden="true" />TELEMETRY {telemetryLabel}</span>
        <span className={gisOnline ? 'online' : 'offline'}><i aria-hidden="true" />{gisOnline ? 'GIS ACTIVE' : 'GIS BASELINE'}</span>
        <b>{timeLabel}<small>{now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</small></b>
      </div>
    </div>
    <div className="portal-toolbar">
      <div className="portal-product">
        <div className="portal-product-mark"><Activity size={24} /></div>
        <div><h1>National Irrigation Intelligence <span className={telemetryStatus === 'BASELINE' ? 'baseline' : telemetryStatus === 'PARTIAL' ? 'partial' : 'live'}>{telemetryLabel}</span> <em>Monitoring & decision support</em></h1>
          <div className="portal-crumbs"><MapPin size={14} /> Zimbabwe <b>›</b> National Irrigation Schemes <b>›</b> 8 Provinces <em><Database size={12} /> {schemeCount} Schemes</em><small className={isSyncing ? 'sync-pending' : ''}>{syncLabel}</small></div>
        </div>
      </div>
      <div className="portal-toolbar-actions">
        <label className="portal-search"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search schemes, officers, districts..." /><kbd>⌘K</kbd></label>
        <button className="portal-reset" onClick={onReset}><RotateCcw size={17} />Reset</button>
        <button className="portal-reset portal-refresh" onClick={onRefresh} disabled={isSyncing} title="Refresh scheme and telemetry feeds"><RefreshCw size={17} className={isSyncing ? 'spin' : ''} />Refresh</button>
        <button className="portal-button" onClick={onExportCSV}><Download size={17} />Export CSV</button>
        {admin
          ? <><button className="portal-reset portal-admin-session" onClick={onAdminClick} title={`Signed in as ${admin.email}`}><ShieldCheck size={16} />Admin</button><button className="portal-reset" onClick={onAdminLogout}><LogOut size={16} />Sign out</button><button className="portal-button portal-button-primary" onClick={onAddClick}><Plus size={18} />Add Scheme</button></>
          : <button className="portal-button portal-admin-login" onClick={onAdminClick}><LogIn size={16} />Admin sign in</button>}
      </div>
    </div>
  </header>;
}
