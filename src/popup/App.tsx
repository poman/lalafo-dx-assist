import { useEffect, useState, type ReactElement } from 'react';
import { syncQaDarkModeWithActiveTab, toggleQaDarkMode } from './qaDarkMode';
import { Logo } from './Logo';

export const App = (): ReactElement => {
  const [enabled, setEnabled] = useState(false);
  const [isBusy, setIsBusy] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const loadState = async () => {
      try {
        const result = await syncQaDarkModeWithActiveTab();
        setEnabled(result.enabled);
        if (!result.appliedToTab) {
          setErrorText(result.warning ?? 'Could not sync QA Dark Mode on this tab.');
        }
      } catch {
        setErrorText('Could not load current state.');
      } finally {
        setIsBusy(false);
      }
    };

    void loadState();
  }, []);

  const onToggleChange = async (nextEnabled: boolean): Promise<void> => {
    setErrorText(null);
    setEnabled(nextEnabled);
    setIsBusy(true);

    try {
      const result = await toggleQaDarkMode(nextEnabled);
      if (!result.appliedToTab) {
        setErrorText(result.warning ?? 'State saved, but could not apply on this tab.');
      }
    } catch {
      setEnabled(!nextEnabled);
      setErrorText('Could not apply QA Dark Mode on this tab.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="popup-root">
      <div className="popup-header">
        <div className="popup-logo" aria-hidden="true">
          <Logo />
        </div>
        <h1 className="popup-title">Lalafo DX Assist</h1>
      </div>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={enabled}
          disabled={isBusy}
          onChange={(event) => {
            void onToggleChange(event.target.checked);
          }}
        />
        <span>Enable QA Dark Mode</span>
      </label>
      {errorText ? <p className="error-text">{errorText}</p> : null}
    </main>
  );
};



