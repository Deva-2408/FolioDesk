import { useEffect, useRef, useState } from "react";
import { Lock, Eye, EyeOff, X, AlertCircle, Loader2 } from "lucide-react";

interface PasswordModalProps {
  open: boolean;
  filename: string;
  errorMessage: string | null;
  hintText?: string;
  isUnlocking: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordModal({
  open,
  filename,
  errorMessage,
  hintText,
  isUnlocking,
  onSubmit,
  onCancel,
}: PasswordModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setShowPassword(false);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open, filename]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isUnlocking) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isUnlocking, onCancel]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isUnlocking) return;
    onSubmit(password);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 text-blue-600" />
            <h2 id="password-modal-title" className="text-base font-semibold text-slate-900">
              Unlock Password-Protected PDF
            </h2>
          </div>
          <button
            type="button"
            disabled={isUnlocking}
            onClick={onCancel}
            aria-label="Cancel unlocking PDF"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-900 font-semibold">{filename}</strong> is encrypted.
            Enter its password to open and edit it in FolioDesk. Once unlocked, you can also
            permanently remove the password from the Edit Options panel.
          </p>

          {hintText && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
              {hintText}
            </div>
          )}

          <div>
            <label
              htmlFor="pdf-unlock-password"
              className="block text-xs font-semibold text-slate-800 mb-1.5"
            >
              Document password
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="pdf-unlock-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="off"
                placeholder="Enter PDF password"
                className="w-full rounded-lg border border-slate-300 pl-3 pr-10 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              disabled={isUnlocking}
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUnlocking || !password}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isUnlocking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Unlocking...</span>
                </>
              ) : (
                <span>Unlock &amp; Open</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
