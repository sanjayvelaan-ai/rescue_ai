import React, { useState } from 'react';
import { Package, ShieldAlert, CheckCircle2, Droplet, HeartPulse, Flame, Radio } from 'lucide-react';
import confetti from 'canvas-confetti';
import { SpinningBorderButton } from '@/components/ui/spinning-border-button';

export const EmergencyPayloadPage: React.FC = () => {
  const [deployed, setDeployed] = useState<string | null>(null);

  const handleDeployPayload = (itemName: string) => {
    setDeployed(itemName);
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => setDeployed(null), 5000);
  };

  const payloadOptions = [
    { id: 'MED', name: 'Advanced First Aid & Medical Kit', weight: '2.4 kg', icon: HeartPulse, desc: 'Contains emergency hemorrhage control, oxygen canister, and burn dressings.' },
    { id: 'WATER', name: 'Emergency Hydration Supply Pack', weight: '3.0 kg', icon: Droplet, desc: '4 liters of purified water and electrolyte sachets.' },
    { id: 'THERMAL', name: 'Thermal Survival Blanket & Shelter', weight: '1.5 kg', icon: Flame, desc: 'Reflective insulation blanket and collapsible pop-up shelter tent.' },
    { id: 'BEACON', name: 'GPS Emergency Locator Beacon', weight: '0.8 kg', icon: Radio, desc: 'High-power 406 MHz satellite distress transmitter.' },
  ];

  return (
    <div className="page-shell p-6 space-y-6 font-mono bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-cyan-400" />
            EMERGENCY PAYLOAD AIR-DROP CONTROLLER
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Precision Drone Drop Mechanism for Immediate Aid Deployment</p>
        </div>
      </div>

      {deployed && (
        <div className="p-4 bg-emerald-950/90 border border-emerald-500 rounded-xl text-emerald-300 font-bold text-xs flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          AIR-DROP SUCCESSFUL: {deployed} released over Target Coordinates 10.936423, 76.955785!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {payloadOptions.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="theme-card bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-sm text-slate-100">{item.name}</span>
                  </div>
                  <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">{item.weight}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </div>

              <SpinningBorderButton
                onClick={() => handleDeployPayload(item.name)}
                className="w-full"
                surfaceClassName="px-3 tracking-normal"
              >
                RELEASE AIR-DROP PAYLOAD
              </SpinningBorderButton>
            </div>
          );
        })}
      </div>
    </div>
  );
};
