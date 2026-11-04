import { useState, type ReactNode } from 'react';
import { post } from '../../lib/api';
import { Field, Modal } from '../../components/ui';
import { toast, toastError } from '../../components/toast';

const REASONS: [string, string][] = [
  ['spam', 'Spam ou divulgação'],
  ['harassment', 'Assédio ou ofensa'],
  ['hate', 'Discurso de ódio'],
  ['nsfw', 'Conteúdo impróprio'],
  ['violence', 'Ameaça ou violência'],
  ['impersonation', 'Falsidade ideológica'],
  ['other', 'Outro motivo'],
];

export function ReportModal({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: string; targetId: string }) {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Denunciar"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              try {
                await post('/reports', { targetType, targetId, reason, details });
                toast('Denúncia enviada à moderação.', 'success');
                onClose();
              } catch (e) {
                toastError(e);
              }
            }}
          >
            Enviar denúncia
          </button>
        </>
      }
    >
      <p className="mb-4 text-[14px] text-muted">A moderação recebe uma cópia do conteúdo denunciado. Quem foi denunciado não sabe quem denunciou.</p>
      <div className="mb-4 space-y-1">
        {REASONS.map(([v, l]) => (
          <label key={v} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-hover">
            <input type="radio" name="reason" className="accent-[var(--accent)]" checked={reason === v} onChange={() => setReason(v)} />
            <span className="text-[14px]">{l}</span>
          </label>
        ))}
      </div>
      <Field label="Detalhes (opcional)">
        <textarea className="field min-h-20" maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function ReportButton({ targetType, targetId, children, className }: { targetType: string; targetId: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <ReportModal open onClose={() => setOpen(false)} targetType={targetType} targetId={targetId} />}
    </>
  );
}
