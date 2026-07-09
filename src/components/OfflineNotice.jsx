import { AlertTriangle, Download, Folder } from 'lucide-react';

export default function OfflineNotice({
  offlineMode,
  localFolderName,
  localError,
  localLoading,
  openLocalFolder,
  offlineSupported,
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/80 p-4 text-sm text-foreground shadow-lg">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Folder size={20} />
        </span>
        <div className="flex-1">
          <p className="font-semibold">Modo offline disponible</p>
          <p className="text-xs text-muted-foreground">
            {offlineMode
              ? `Usando música de carpeta local: ${localFolderName || 'Descargadas'}`
              : 'Abre una carpeta con música descargada en tu celular para escuchar canciones sin servidor.'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          onClick={openLocalFolder}
          disabled={!offlineSupported || localLoading}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          <Download size={16} />
          {offlineMode ? 'Actualizar carpeta local' : 'Abrir carpeta de música'}
        </button>
        {!offlineSupported && (
          <p className="text-xs text-muted-foreground">Tu navegador no soporta acceso a carpetas locales.</p>
        )}
      </div>

      {localError && (
        <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle size={14} className="inline-block mr-2" /> {localError}
        </div>
      )}
    </div>
  );
}
