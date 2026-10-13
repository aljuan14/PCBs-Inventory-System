import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import type { RuleCheck } from '@/lib/upload-rules';

/** The upload rules for companies with their result; broken ones are only warnings while `enforced` is false. */
export default function UploadRules({ title, checks, enforced }: { title: string; checks: RuleCheck[] | null; enforced: boolean }) {
  const broken = checks?.filter((check) => !check.ok) ?? [];
  return (
    <div className={`rounded-xl border p-4 text-xs ${broken.length === 0 ? 'border-slate-200 bg-white' : enforced ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <p className="flex items-center gap-2 font-semibold text-slate-800">
        <ShieldCheck className="h-4 w-4 text-slate-500" /> {title}
        {checks && <span className={`ml-auto font-semibold ${broken.length === 0 ? 'text-emerald-700' : enforced ? 'text-rose-700' : 'text-amber-800'}`}>{broken.length === 0 ? 'Semua terpenuhi' : `${broken.length} tidak terpenuhi`}</span>}
      </p>
      {!checks ? (
        <p className="mt-2 flex items-center gap-2 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memeriksa berkas…</p>
      ) : (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {checks.map((check) => (
            <li key={check.key} className="flex items-start gap-1.5">
              {check.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${enforced ? 'text-rose-600' : 'text-amber-600'}`} />}
              <span><span className={check.ok ? 'text-slate-600' : 'font-semibold text-slate-900'}>{check.label}</span>{check.detail && <span className="block text-slate-600">{check.detail}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {broken.length > 0 && !enforced && (
        <p className="mt-3 text-[11px] text-slate-500">Untuk admin hanya peringatan: berkas tetap bisa diproses. Nanti unggahan dari akun perusahaan yang melanggar aturan ini akan ditolak.</p>
      )}
    </div>
  );
}
