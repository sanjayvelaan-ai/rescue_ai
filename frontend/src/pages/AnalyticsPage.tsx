import React, { useState } from 'react';
import {filterRecords,recordBreakdown,downloadRecords} from '../lib/record-filters';
import { calculateAnalytics } from '../lib/analytics';
import { BarChart3 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Brush, CartesianGrid } from 'recharts';

import type { Survivor, RescueTeam } from '../types';
export const AnalyticsPage: React.FC<{survivors: Survivor[]; teams: RescueTeam[]; loading?:boolean; error?:string; lastUpdated?:string|null; onRefresh?:()=>void}> = ({survivors, teams, loading, error, lastUpdated, onRefresh}) => {
  const [source, setSource] = useState('all');
  const [hours,setHours]=useState(0),[confidence,setConfidence]=useState(0),[status,setStatus]=useState('all'),[chartMode,setChartMode]=useState('cumulative');
  const [openedAt]=useState(()=>Date.now());
  const filtered=filterRecords(survivors,{hours,confidence,status,source,now:lastUpdated?Date.parse(lastUpdated):openedAt});
  const breakdown=recordBreakdown(filtered);
  const data = calculateAnalytics(filtered, teams, false);
  const survivorData = data.timeline.length ? [{time:data.timeline[0].time-60000,detected:0}, ...data.timeline.map((point,i)=>({...point,detected:chartMode==='cumulative'?point.detected:point.detected-(data.timeline[i-1]?.detected||0)}))] : [];
  const chartDomain:[number,number] = survivorData.length ? [survivorData[0].time, survivorData.at(-1)!.time+60000] : [0,1];
  const responseTimeData = data.routes;
  const averageConfidence = data.averageConfidence === null ? '—' : data.averageConfidence.toFixed(1)+'%';
  const averageEta = data.averageEta === null ? '—' : data.averageEta.toFixed(1)+' min';
  const dateLabel = (time: number) => new Date(time).toLocaleString([], {month:'short', day:'numeric',hour:'2-digit',minute:'2-digit'});

  return (
    <div className="page-shell p-6 space-y-6 font-mono bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            SYSTEM PERFORMANCE & RESCUE ANALYTICS
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Saved tracks across sessions, operator outcomes and simulated route estimates</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center text-xs text-slate-400" role="status">
        <span>{loading ? 'Loading records…' : lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()} · refreshes every 2 seconds` : 'Waiting for backend data'}</span>
        <button className="theme-control rounded border border-slate-700 px-3 py-2" onClick={onRefresh}>Refresh data</button>
      </div>
      {error && <p role="alert" className="rounded border border-amber-700 bg-amber-950 p-3 text-xs text-amber-200">{error}</p>}
      <label className="block text-xs text-slate-300">Record source
        <select aria-label="Record source" value={source} onChange={e => setSource(e.target.value)} className="ml-2 rounded bg-slate-900 border border-slate-700 p-2">
          <option value="browser">Browser camera records</option><option value="live">Live camera records</option><option value="all">All records (includes simulations)</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-3 items-end text-xs">
        <label>Time window<select aria-label="Analytics time window" value={hours} onChange={e=>setHours(+e.target.value)} className="block rounded p-2 bg-slate-900 border border-slate-700"><option value="0">All time</option><option value="1">Last hour</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option></select></label>
        <label>Status<select aria-label="Analytics status" value={status} onChange={e=>setStatus(e.target.value)} className="block rounded p-2 bg-slate-900 border border-slate-700"><option value="all">All statuses</option>{[...new Set(survivors.map(s=>s.status))].sort().map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Minimum confidence: {confidence}%<input aria-label="Minimum confidence" type="range" min="0" max="100" value={confidence} onChange={e=>setConfidence(+e.target.value)} className="block"/></label>
        <button className="map-toolbar-button" onClick={()=>{setHours(0);setConfidence(0);setStatus('all');setSource('all');}}>Reset filters</button>
        <button className="map-toolbar-button" disabled={!filtered.length} onClick={()=>downloadRecords(filtered)}>Export filtered CSV</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs"><div className="theme-card p-3 rounded border border-slate-800">Capture locations <strong>{breakdown.located}/{data.total}</strong></div><div className="theme-card p-3 rounded border border-slate-800">Awaiting review <strong>{filtered.filter(s=>s.status==='DETECTED').length}</strong></div><div className="theme-card p-3 rounded border border-slate-800">Marked rescued <strong>{data.total?Math.round(data.rescued/data.total*100)+'%':'—'}</strong></div></div>
      <p className="text-xs text-slate-400">Track counts are not unique people or measured accuracy. Re-entry after track expiry may create another record.</p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div className="theme-card bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 font-bold">ACTIVE TEAM ETA</div>
          <div className="text-2xl font-black text-cyan-400 mt-1">{averageEta}</div>
          <div className="text-slate-500 mt-1">En-route teams only; simulated estimates</div>
        </div>

        <div className="theme-card bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 font-bold">AVG LATEST CONFIDENCE</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{averageConfidence}</div>
          <div className="text-slate-500 mt-1">Latest model scores; not accuracy</div>
        </div>

        <div className="theme-card bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 font-bold">SAVED TRACK RECORDS</div>
          <div className="text-2xl font-black text-blue-400 mt-1">{data.total}</div>
          <div className="text-slate-500 mt-1">Saved records, including earlier sessions</div>
        </div>

        <div className="theme-card bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="text-slate-400 font-bold">MARKED RESCUED</div>
          <div className="text-2xl font-black text-emerald-300 mt-1">{data.rescued} Survivors</div>
          <div className="text-slate-500 mt-1">Records marked rescued</div>
        </div>
      </div>

      <div className="theme-card p-4 rounded-xl text-xs border border-slate-800">
        RGB snapshots: <strong>{data.rgbSnapshots}/{data.total}</strong> · False-color previews: <strong>{data.previewSnapshots}/{data.total}</strong>
        <p className="text-slate-400 mt-1">Previews use RGB brightness; no temperature or independent heat detection is measured.</p>
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="theme-card bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3 shadow-xl">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            TRACKS BY FIRST DETECTION
          </h3>
          <label className="text-xs">Chart metric <select aria-label="Chart metric" value={chartMode} onChange={e=>setChartMode(e.target.value)} className="rounded bg-slate-950 p-2"><option value="cumulative">Cumulative tracks</option><option value="minute">New tracks per minute</option></select></label>
          {survivorData.length === 0 && <p className="text-xs text-slate-400">No dated detection records for this source.</p>}
          <div className="h-64">
            {survivorData.length > 0 && <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={survivorData}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="time" type="number" domain={chartDomain} tickFormatter={dateLabel} stroke="#64748b" fontSize={10} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={10} />
                <Tooltip labelFormatter={v => dateLabel(Number(v))} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                {survivorData.length>2&&<Brush key={`${source}-${hours}-${status}-${confidence}`} dataKey="time" height={24} tickFormatter={dateLabel} stroke="#64748b"/>}
                <Area isAnimationActive={false} dot={{r:3}} type="stepAfter" dataKey="detected" stroke="#00e5ff" fill="#00e5ff" fillOpacity={0.2} />
                
              </AreaChart>
            </ResponsiveContainer>}
          </div>
        </div>

        <div className="theme-card bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3 shadow-xl">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            ACTIVE TEAM ETA (SIMULATED MINUTES)
          </h3>
          {responseTimeData.length === 0 && <p className="text-xs text-slate-400">No teams are currently en route.</p>}
          <div className="h-64">
            {responseTimeData.length > 0 && <ResponsiveContainer width="100%" height="100%">
              <BarChart data={responseTimeData}>
                <XAxis dataKey="team" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                <Bar dataKey="minutes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{[{title:'Outcome distribution',rows:breakdown.statuses},{title:'Confidence distribution',rows:breakdown.bins}].map(chart=><section key={chart.title} className="theme-card rounded border border-slate-800 p-4"><h3 className="text-sm mb-3">{chart.title}</h3>{filtered.length?<div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart.rows}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/><XAxis dataKey="name" fontSize={9}/><YAxis allowDecimals={false}/><Tooltip contentStyle={{background:'var(--card)',color:'var(--foreground)'}}/><Bar dataKey="count" fill="#0891b2" isAnimationActive={false}/></BarChart></ResponsiveContainer></div>:<p className="text-xs text-slate-400">No matching records.</p>}</section>)}</div>
    </div>
  );
};

