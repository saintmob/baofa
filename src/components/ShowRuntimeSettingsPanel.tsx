import { useState } from 'react';
import { loadShowRuntimeSettings, saveShowRuntimeSettings, type ShowRuntimeSettings } from '../lib/runtimeConfig';

export function ShowRuntimeSettingsPanel({ status }: { status?: string }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ShowRuntimeSettings>(() => loadShowRuntimeSettings());
  const [saved, setSaved] = useState(false);

  const update = (key: keyof ShowRuntimeSettings, value: string) => {
    setSaved(false);
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    saveShowRuntimeSettings(settings);
    setSaved(true);
  };

  return (
    <div
      className="fixed bottom-6 left-6 z-[70] flex max-w-[92vw] flex-col items-start gap-2 text-[11px]"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {open && (
        <section className="w-[360px] max-w-full rounded-2xl border border-emerald-400/20 bg-slate-950/95 p-4 text-emerald-50 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.24em]">Show Control</h2>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-emerald-200/50">线上总控连接，保存后刷新生效</p>
            </div>
            <button type="button" className="rounded-full border border-white/10 px-2 py-1 text-emerald-200/60" onClick={() => setOpen(false)}>Close</button>
          </div>
          <label className="mb-2 block">
            <span className="text-[9px] uppercase tracking-widest text-emerald-200/50">Transport</span>
            <select className="mt-1 w-full rounded-lg border border-emerald-400/20 bg-black px-3 py-2 text-xs" value={settings.transport} onChange={(event) => update('transport', event.target.value)}>
              <option value="websocket">websocket</option>
              <option value="firebase">firebase</option>
              <option value="cloudflare">cloudflare</option>
              <option value="auto">auto</option>
            </select>
          </label>
          {([
            ['backendUrl', 'Backend URL'],
            ['wsUrl', 'WebSocket URL'],
            ['showId', 'Show ID'],
            ['controlToken', 'Control Token'],
            ['clientId', 'Client ID'],
            ['firebaseDatabaseUrl', 'Firebase Database URL'],
          ] as Array<[keyof ShowRuntimeSettings, string]>).map(([key, label]) => (
            <label key={key} className="mb-2 block">
              <span className="text-[9px] uppercase tracking-widest text-emerald-200/50">{label}</span>
              <input
                className="mt-1 w-full rounded-lg border border-emerald-400/20 bg-black px-3 py-2 text-xs"
                type={key === 'controlToken' ? 'password' : 'text'}
                value={settings[key]}
                onChange={(event) => update(key, event.target.value)}
              />
            </label>
          ))}
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-black uppercase tracking-widest text-black" onClick={save}>Save</button>
            {saved && <span className="text-[10px] text-emerald-300">已保存，请刷新页面</span>}
          </div>
        </section>
      )}
      <button type="button" className="rounded-full border border-emerald-400/20 bg-black/70 px-4 py-2 font-black uppercase tracking-[0.2em] text-emerald-100 shadow-xl backdrop-blur" onClick={() => setOpen((current) => !current)}>
        Show API {status ? `/ ${status}` : ''}
      </button>
    </div>
  );
}
