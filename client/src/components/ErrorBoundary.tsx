import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle } from 'lucide-react';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Ловит только render-ошибки потомков. Не ловит: event handlers, async, Promise rejections.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-red-500/40 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle size={28} />
            <h2 className="text-xl font-bold">{i18n.t('errorBoundary.title')}</h2>
          </div>
          <p className="text-gray-300 text-sm">
            {i18n.t('errorBoundary.description')}
          </p>
          <details className="text-xs text-gray-500 bg-black/40 rounded-lg p-3">
            <summary className="cursor-pointer text-gray-400">{i18n.t('errorBoundary.details')}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{this.state.error.message}</pre>
          </details>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold shadow-lg shadow-emerald-500/30 hover:opacity-90"
            >
              {i18n.t('errorBoundary.reload')}
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10"
            >
              {i18n.t('errorBoundary.home')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
