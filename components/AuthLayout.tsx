import { Shield } from 'lucide-react';

export default function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(14,165,233,0.14),transparent)] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500 shadow-lg shadow-sky-500/20">
            <Shield className="h-5 w-5 text-white" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-black/30">{children}</div>
        <p className="mt-6 text-center text-sm text-slate-400">{footer}</p>
      </div>
    </div>
  );
}
