import React, { useEffect } from 'react';
import { Download, Trash2, X } from 'lucide-react';

export interface CapturedItem {
  id: string;
  kind: 'photo' | 'video';
  url: string;
  decadeLabel: string;
  title: string;
  timestamp: string;
  filename: string;
}

interface CaptureModalProps {
  item: CapturedItem | null;
  onClose: () => void;
  onDownload: (item: CapturedItem) => void;
  onDelete: (id: string) => void;
}

export const CaptureModal: React.FC<CaptureModalProps> = ({
  item,
  onClose,
  onDownload,
  onDelete,
}) => {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa ${item.decadeLabel}`}
      onClick={onClose}
    >
      <div
        className="sgx-panel sgx-panel--solid w-full max-w-4xl p-4 md:p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-display font-bold text-base md:text-lg tracking-wider uppercase text-sgx-yellow whitespace-nowrap">
              {item.decadeLabel}
            </span>
            <span className="text-[var(--ink-muted)]" aria-hidden="true">
              //
            </span>
            <span className="font-hud uppercase text-xs md:text-sm tracking-wider truncate">
              {item.title}
            </span>
            <span className="hidden sm:inline sgx-readout text-xs ml-2">
              {item.timestamp}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="sgx-btn sgx-btn--story sgx-btn--sm"
            aria-label="Cerrar vista previa"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Cerrar</span>
          </button>
        </div>

        <div className="sgx-hud-rule" />

        <div className="relative bg-black border border-[var(--panel-line)] overflow-hidden max-h-[68vh] flex items-center justify-center">
          {item.kind === 'photo' ? (
            <img
              src={item.url}
              alt={`Captura ${item.decadeLabel} ${item.title}`}
              referrerPolicy="no-referrer"
              className="max-h-[68vh] w-auto object-contain"
            />
          ) : (
            <video
              src={item.url}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[68vh] w-auto"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="sgx-readout text-xs truncate max-w-xs sm:max-w-md">
            {item.filename}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="sgx-btn sgx-btn--ground sgx-btn--sm"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar</span>
            </button>
            <span className="sgx-glow">
              <button
                type="button"
                onClick={() => onDownload(item)}
                className="sgx-btn sgx-btn--sm"
              >
                <Download className="w-4 h-4" />
                <span>Descargar</span>
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
