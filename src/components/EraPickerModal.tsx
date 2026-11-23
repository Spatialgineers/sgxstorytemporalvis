import React, { useEffect } from 'react';
import { Shuffle, X } from 'lucide-react';
import { DECADES } from '../data/decades';

interface EraPickerModalProps {
  open: boolean;
  activeEraIndex: number;
  onSelectEra: (index: number) => void;
  onRandomJump: () => void;
  onClose: () => void;
}

const GROUP_LABELS: Record<string, string> = {
  origen: 'Origen Óptico · 1890–1920',
  analogico: 'Era Analógica · 1930–1980',
  digital: 'Era Digital · 1990–2020',
  espacial: 'Horizonte Espacial · 2030–2090',
};

export const EraPickerModal: React.FC<EraPickerModalProps> = ({
  open,
  activeEraIndex,
  onSelectEra,
  onRandomJump,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const groups: Array<'origen' | 'analogico' | 'digital' | 'espacial'> = [
    'origen',
    'analogico',
    'digital',
    'espacial',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Mapa de Eras 1890 a 2090"
      onClick={onClose}
    >
      <div
        className="sgx-panel sgx-panel--solid w-full sm:max-w-3xl max-h-[82dvh] flex flex-col p-4 sm:p-6 gap-4 sgx-safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-hud text-[11px] uppercase tracking-[0.08em] text-[var(--telemetry)]">
              SGX.STORY // 16 ERAS · 48 VARIANTES
            </p>
            <h2 className="font-display font-bold text-base sm:text-lg uppercase tracking-wider text-[var(--ink)]">
              Mapa Temporal 1890 — 2090
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onRandomJump();
                onClose();
              }}
              className="sgx-btn sgx-btn--story sgx-btn--sm"
            >
              <Shuffle className="w-4 h-4" />
              <span className="hidden sm:inline">Salto</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="sgx-btn sgx-btn--story sgx-btn--sm"
              aria-label="Cerrar mapa temporal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="sgx-hud-rule" />

        <div className="overflow-y-auto sgx-scroll pr-1 flex flex-col gap-5">
          {groups.map((groupKey) => {
            const items = DECADES.map((d, idx) => ({ d, idx })).filter(
              (x) => x.d.eraGroup === groupKey
            );
            return (
              <div key={groupKey} className="flex flex-col gap-2">
                <span className="font-hud text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                  {GROUP_LABELS[groupKey]}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {items.map(({ d, idx }) => {
                    const isSelected = idx === activeEraIndex;
                    return (
                      <button
                        key={d.year}
                        type="button"
                        onClick={() => {
                          onSelectEra(idx);
                          onClose();
                        }}
                        className={`text-left p-3 min-h-[68px] border transition-colors cursor-pointer flex flex-col justify-between gap-1 ${
                          isSelected
                            ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow'
                            : 'bg-[var(--surface)] text-[var(--ink)] border-[var(--panel-line)] hover:border-sgx-yellow'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-display font-black text-lg leading-none">
                            {d.label}
                          </span>
                          <span
                            className={`font-mono text-[10px] uppercase ${
                              isSelected ? 'text-sgx-black-base/80' : 'text-[var(--telemetry)]'
                            }`}
                          >
                            {d.medium}
                          </span>
                        </div>
                        <span
                          className={`font-hud text-xs uppercase tracking-wider truncate ${
                            isSelected ? 'text-sgx-black-base font-bold' : 'text-[var(--ink-muted)]'
                          }`}
                        >
                          {d.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
