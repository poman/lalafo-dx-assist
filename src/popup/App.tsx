import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { MarketCode } from '../shared/types/region';
import {
  A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
  A11Y_RESULTS_BY_TAB_STORAGE_KEY,
  AUTO_A11Y_SCAN_STORAGE_KEY,
} from '../shared/constants';
import { Logo } from './Logo';
import {
  applyTemplateFieldsToActiveTab,
  type AutoFillPopupStatus,
  resolveActiveTabMarket,
} from './formFiller';
import {
  createCustomField,
  createCustomForm,
  loadTemplateConfig,
  saveTemplateConfig,
  type IMarketTemplateConfig,
  type ITemplateField,
  type ITemplateForm,
  type TemplateType,
} from './formTemplates';
import {
  focusA11yRuleOnActiveTab,
  requestA11yScanFromActiveTab,
  toggleA11yHighlightsOnActiveTab,
  type A11yPopupScanStatus,
} from './a11yScanner';
import { syncQaDarkModeWithActiveTab, toggleQaDarkMode } from './qaDarkMode';
import type { A11yViolation } from '../shared/types/messages';

type PopupTab = 'main' | 'fill-form' | 'accessibility' | 'seo';
type FillSection = 'login' | 'register' | 'checkout' | 'custom';
const A11Y_BLINK_ON_CLICK_STORAGE_KEY = 'a11yBlinkOnClick';
const A11Y_LAST_SELECTED_RULE_STORAGE_KEY = 'a11yLastSelectedRuleId';
type A11yScanFailure = Extract<A11yPopupScanStatus, { kind: 'failure' }>;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStoredA11yViolation = (value: unknown): value is A11yViolation => {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.help !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.helpUrl !== 'string' ||
    !Array.isArray(value.nodes)
  ) {
    return false;
  }

  return value.nodes.every(
    (node) =>
      isObjectRecord(node) &&
      Array.isArray(node.target) &&
      (node.summary === undefined || typeof node.summary === 'string') &&
      node.target.every((selector) => typeof selector === 'string'),
  );
};

type A11yPopupStatus =
  | { kind: 'idle' }
  | { kind: 'sent' }
  | { kind: 'success'; count: number }
  | { kind: 'failure'; error: A11yScanFailure['error']; detail?: A11yScanFailure['detail'] }
  | { kind: 'restricted-tab' };

export const App = (): ReactElement => {
  const [enabled, setEnabled] = useState(false);
  const [autoA11yEnabled, setAutoA11yEnabled] = useState(false);
  const [isBusy, setIsBusy] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<PopupTab>('main');
  const [market, setMarket] = useState<MarketCode | null>(null);
  const [marketStatus, setMarketStatus] = useState<string | null>(null);
  const [templateConfig, setTemplateConfig] = useState<IMarketTemplateConfig | null>(null);
  const [isTemplateBusy, setIsTemplateBusy] = useState(false);
  const [isAutoFillBusy, setIsAutoFillBusy] = useState(false);
  const [autoFillStatus, setAutoFillStatus] = useState<AutoFillPopupStatus | null>(null);

  const [newFormName, setNewFormName] = useState('');
  const [newFormType, setNewFormType] = useState<TemplateType>('custom');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<FillSection>('login');
  const [isA11yBusy, setIsA11yBusy] = useState(false);
  const [a11yStatus, setA11yStatus] = useState<A11yPopupStatus>({ kind: 'idle' });
  const [a11yViolations, setA11yViolations] = useState<A11yViolation[]>([]);
  const [a11yHighlightsEnabled, setA11yHighlightsEnabled] = useState(false);
  const [a11yBlinkOnClick, setA11yBlinkOnClick] = useState(true);
  const [a11ySelectedRuleId, setA11ySelectedRuleId] = useState<string | null>(null);

  const getAutoFillStatusText = (status: AutoFillPopupStatus): string => {
    if (status.kind === 'sent') return 'Status: sent';
    if (status.kind === 'restricted-tab') return 'Status: restricted tab';
    if (status.kind === 'success') {
      return status.detectedFormKind === 'unknown'
        ? 'Status: success'
        : `Status: success (${status.detectedFormKind})`;
    }
    return `Status: failure (${status.error})`;
  };

  const getA11yStatusText = (status: A11yPopupStatus): string | null => {
    if (status.kind === 'idle') return null;
    if (status.kind === 'sent') return 'Status: scanning...';
    if (status.kind === 'restricted-tab') return 'Status: open a regular website tab (http/https) first.';
    if (status.kind === 'success') return `Status: done (${status.count} issues)`;
    return status.detail ? `Status: failed (${status.error}) - ${status.detail}` : `Status: failed (${status.error})`;
  };

  useEffect(() => {
    const loadState = async () => {
      try {
        const [result, autoA11yData] = await Promise.all([
          syncQaDarkModeWithActiveTab(),
          chrome.storage.local.get([AUTO_A11Y_SCAN_STORAGE_KEY]),
        ]);

        setEnabled(result.enabled);
        setAutoA11yEnabled(autoA11yData[AUTO_A11Y_SCAN_STORAGE_KEY] === true);
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

  useEffect(() => {
    const loadA11ySettings = async (): Promise<void> => {
      try {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTabId = typeof active?.id === 'number' ? String(active.id) : null;

        const stored = (await chrome.storage.local.get([
          A11Y_BLINK_ON_CLICK_STORAGE_KEY,
          A11Y_RESULTS_BY_TAB_STORAGE_KEY,
          A11Y_LAST_SELECTED_RULE_STORAGE_KEY,
        ])) as Record<string, unknown>;

        if (typeof stored[A11Y_BLINK_ON_CLICK_STORAGE_KEY] === 'boolean') {
          setA11yBlinkOnClick(stored[A11Y_BLINK_ON_CLICK_STORAGE_KEY] as boolean);
        }

        const byTab = isObjectRecord(stored[A11Y_RESULTS_BY_TAB_STORAGE_KEY])
          ? (stored[A11Y_RESULTS_BY_TAB_STORAGE_KEY] as Record<string, unknown>)
          : null;

        const activeEntry = activeTabId && byTab ? byTab[activeTabId] : null;
        const restored =
          isObjectRecord(activeEntry) && Array.isArray(activeEntry.violations)
            ? activeEntry.violations.filter(isStoredA11yViolation)
            : [];

        if (restored.length > 0) {
          setA11yViolations(restored);
          setA11yStatus({ kind: 'success', count: restored.length });
          setActiveTab('accessibility');
        }

        if (typeof stored[A11Y_LAST_SELECTED_RULE_STORAGE_KEY] === 'string') {
          setA11ySelectedRuleId(stored[A11Y_LAST_SELECTED_RULE_STORAGE_KEY] as string);
        }
      } catch {
        // Keep defaults when storage is unavailable.
      }
    };

    const syncA11yFromActiveTabCache = async (): Promise<void> => {
      try {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = typeof active?.id === 'number' ? String(active.id) : null;
        if (!tabId) {
          return;
        }

        const storage = (await chrome.storage.local.get([A11Y_RESULTS_BY_TAB_STORAGE_KEY])) as Record<string, unknown>;
        const byTab = isObjectRecord(storage[A11Y_RESULTS_BY_TAB_STORAGE_KEY])
          ? (storage[A11Y_RESULTS_BY_TAB_STORAGE_KEY] as Record<string, unknown>)
          : null;
        const entry = byTab?.[tabId];

        const restored =
          isObjectRecord(entry) && Array.isArray(entry.violations)
            ? entry.violations.filter(isStoredA11yViolation)
            : [];

        if (restored.length > 0) {
          setA11yViolations(restored);
          setA11yStatus({ kind: 'success', count: restored.length });
          return;
        }

        setA11yViolations([]);
        setA11yStatus((prev) => (prev.kind === 'success' ? { kind: 'idle' } : prev));
      } catch {
        // Ignore transient storage/query failures.
      }
    };

    const onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
      if (areaName !== 'local' || !(A11Y_RESULTS_BY_TAB_STORAGE_KEY in changes)) {
        return;
      }

      void syncA11yFromActiveTabCache();
    };

    void loadA11ySettings();
    chrome.storage.onChanged.addListener(onStorageChanged);

    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  useEffect(() => {
    const loadFillFormState = async () => {
      setIsTemplateBusy(true);
      try {
        const context = await resolveActiveTabMarket();
        if (!context) {
          setMarket(null);
          setTemplateConfig(null);
          setMarketStatus('Open a supported Lalafo domain to use Fill Form presets.');
          return;
        }

        setMarket(context.market);
        setMarketStatus(null);
        setTemplateConfig(await loadTemplateConfig(context.market));
      } catch {
        setMarketStatus('Could not load Fill Form presets.');
      } finally {
        setIsTemplateBusy(false);
      }
    };

    void loadFillFormState();
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

  const onAutoA11yToggleChange = async (nextEnabled: boolean): Promise<void> => {
    setAutoA11yEnabled(nextEnabled);

    try {
      await chrome.storage.local.set({ [AUTO_A11Y_SCAN_STORAGE_KEY]: nextEnabled });
    } catch {
      setAutoA11yEnabled(!nextEnabled);
      setErrorText('Could not save automatic accessibility scan setting.');
    }
  };

  const updateTemplateConfig = (updater: (prev: IMarketTemplateConfig) => IMarketTemplateConfig): void => {
    setTemplateConfig((prev) => (prev ? updater(prev) : prev));
  };

  const applyPreset = async (form: ITemplateForm): Promise<void> => {
    setIsAutoFillBusy(true);
    setAutoFillStatus({ kind: 'sent' });

    updateTemplateConfig((prev) => ({
      ...prev,
      activeByType: {
        ...prev.activeByType,
        [form.type]: form.id,
      },
    }));

    try {
      const result = await applyTemplateFieldsToActiveTab(
        form.fields.map((field) => ({
          selector: field.selector,
          value: field.value,
          inputKind: field.inputKind,
        })),
      );
      setAutoFillStatus(result);
    } catch {
      setAutoFillStatus({ kind: 'failure', error: 'UNEXPECTED_ERROR' });
    } finally {
      setIsAutoFillBusy(false);
    }
  };

  const formsByType = useMemo(() => {
    if (!templateConfig) {
      return {
        login: [] as ITemplateForm[],
        registration: [] as ITemplateForm[],
        checkout: [] as ITemplateForm[],
      };
    }

    return {
      login: templateConfig.forms.filter((item) => item.type === 'login'),
      registration: templateConfig.forms.filter((item) => item.type === 'registration'),
      checkout: templateConfig.forms.filter((item) => item.type === 'checkout'),
    };
  }, [templateConfig]);

  const customForms = useMemo(
    () => (templateConfig ? templateConfig.forms.filter((item) => item.type === 'custom') : []),
    [templateConfig],
  );

  const handleTemplateFieldChange = (
    formId: string,
    fieldId: string,
    next: Partial<ITemplateField>,
  ): void => {
    updateTemplateConfig((prev) => ({
      ...prev,
      forms: prev.forms.map((form) =>
        form.id !== formId
          ? form
          : {
              ...form,
              fields: form.fields.map((field) => (field.id === fieldId ? { ...field, ...next } : field)),
            },
      ),
    }));
  };

  const handlePresetNameChange = (formId: string, name: string): void => {
    updateTemplateConfig((prev) => ({
      ...prev,
      forms: prev.forms.map((form) => (form.id === formId ? { ...form, name } : form)),
    }));
  };

  const addCustomFieldToForm = (formId: string): void => {
    updateTemplateConfig((prev) => ({
      ...prev,
      forms: prev.forms.map((form) =>
        form.id === formId ? { ...form, fields: [...form.fields, createCustomField()] } : form,
      ),
    }));
  };

  const removeFieldFromForm = (formId: string, fieldId: string): void => {
    updateTemplateConfig((prev) => ({
      ...prev,
      forms: prev.forms.map((form) => {
        if (form.id !== formId || form.fields.length <= 1) {
          return form;
        }

        return {
          ...form,
          fields: form.fields.filter((field) => field.id !== fieldId),
        };
      }),
    }));
  };

  const createNewTemplateForm = (): void => {
    if (!newFormName.trim()) return;

    const custom = createCustomForm(newFormType, newFormName.trim());
    updateTemplateConfig((prev) => ({
      ...prev,
      forms: [...prev.forms, custom],
      activeByType: {
        ...prev.activeByType,
        [newFormType]: custom.id,
      },
    }));

    setEditingPresetId(custom.id);
    setNewFormName('');
  };

  const deletePreset = (formId: string): void => {
    updateTemplateConfig((prev) => {
      const forms = prev.forms.filter((item) => item.id !== formId);
      const fallback = (type: TemplateType): string =>
        forms.find((item) => item.type === type)?.id ?? prev.activeByType[type];

      return {
        ...prev,
        forms,
        activeByType: {
          login: prev.activeByType.login === formId ? fallback('login') : prev.activeByType.login,
          registration:
            prev.activeByType.registration === formId ? fallback('registration') : prev.activeByType.registration,
          checkout:
            prev.activeByType.checkout === formId ? fallback('checkout') : prev.activeByType.checkout,
          custom: prev.activeByType.custom === formId ? fallback('custom') : prev.activeByType.custom,
        },
      };
    });

    if (editingPresetId === formId) {
      setEditingPresetId(null);
    }
  };

  const saveTemplates = async (): Promise<void> => {
    if (!market || !templateConfig) return;

    try {
      await saveTemplateConfig(market, templateConfig);
      setMarketStatus('Preset configuration saved.');
    } catch {
      setMarketStatus('Failed to save preset configuration.');
    }
  };

  const runAccessibilityScan = async (): Promise<void> => {
    setIsA11yBusy(true);
    setA11yStatus({ kind: 'sent' });

    try {
      const result = await requestA11yScanFromActiveTab({ showHighlights: a11yHighlightsEnabled });

      if (result.kind === 'restricted-tab') {
        setA11yViolations([]);
        setA11yStatus({ kind: 'restricted-tab' });
        return;
      }

      if (result.kind === 'failure') {
        setA11yViolations([]);
        setA11yStatus({ kind: 'failure', error: result.error, detail: result.detail });
        return;
      }

      setA11yViolations(result.violations);
      setA11yStatus({ kind: 'success', count: result.violations.length });
      setA11ySelectedRuleId(result.violations[0]?.id ?? null);
      setActiveTab('accessibility');

      await chrome.storage.local.set({
        [A11Y_LAST_SELECTED_RULE_STORAGE_KEY]: result.violations[0]?.id ?? null,
      });
    } finally {
      setIsA11yBusy(false);
    }
  };

  const toggleAccessibilityHighlights = async (enabled: boolean): Promise<void> => {
    setIsA11yBusy(true);

    try {
      if (enabled) {
        const scanResult = await requestA11yScanFromActiveTab({ showHighlights: true });
        if (scanResult.kind === 'success') {
          setA11yViolations(scanResult.violations);
          setA11yStatus({ kind: 'success', count: scanResult.violations.length });
          setA11yHighlightsEnabled(true);
          return;
        }

        if (scanResult.kind === 'restricted-tab') {
          setA11yStatus({ kind: 'restricted-tab' });
          return;
        }

        setA11yStatus({ kind: 'failure', error: scanResult.error, detail: scanResult.detail });
        return;
      }

      const applied = await toggleA11yHighlightsOnActiveTab(false);
      if (!applied) {
        setA11yStatus({ kind: 'restricted-tab' });
        return;
      }

      setA11yHighlightsEnabled(false);
    } finally {
      setIsA11yBusy(false);
    }
  };

  const toggleA11yBlinkConfig = async (enabled: boolean): Promise<void> => {
    setA11yBlinkOnClick(enabled);
    try {
      await chrome.storage.local.set({ [A11Y_BLINK_ON_CLICK_STORAGE_KEY]: enabled });
    } catch {
      // Keep in-memory value even if storage write fails.
    }
  };

  const focusViolationOnPage = async (violation: A11yViolation): Promise<void> => {
    setA11ySelectedRuleId(violation.id);

    try {
      await chrome.storage.local.set({ [A11Y_LAST_SELECTED_RULE_STORAGE_KEY]: violation.id });
    } catch {
      // Ignore persistence errors and continue focusing.
    }

    if (!a11yBlinkOnClick) {
      return;
    }

    const focused = await focusA11yRuleOnActiveTab(violation.id);
    if (!focused) {
      setA11yStatus({ kind: 'failure', error: 'SEND_MESSAGE_FAILED', detail: 'Could not focus selected rule on page.' });
    }
  };

  const focusAdjacentViolation = async (offset: 1 | -1): Promise<void> => {
    if (a11yViolations.length === 0) {
      return;
    }

    const currentIndex = a11ySelectedRuleId
      ? a11yViolations.findIndex((item) => item.id === a11ySelectedRuleId)
      : -1;

    const startIndex = currentIndex < 0 ? (offset === 1 ? 0 : a11yViolations.length - 1) : currentIndex;
    const nextIndex = (startIndex + offset + a11yViolations.length) % a11yViolations.length;
    const nextViolation = a11yViolations[nextIndex];

    await focusViolationOnPage(nextViolation);
  };

  const clearSavedA11yResults = async (): Promise<void> => {
    setA11yViolations([]);
    setA11ySelectedRuleId(null);
    setA11yStatus({ kind: 'idle' });

    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = typeof active?.id === 'number' ? String(active.id) : null;

      if (!tabId) {
        await chrome.storage.local.remove([A11Y_LAST_SELECTED_RULE_STORAGE_KEY]);
        return;
      }

      const storage = (await chrome.storage.local.get([
        A11Y_RESULTS_BY_TAB_STORAGE_KEY,
        A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
      ])) as Record<string, unknown>;

      const byTab = isObjectRecord(storage[A11Y_RESULTS_BY_TAB_STORAGE_KEY])
        ? (storage[A11Y_RESULTS_BY_TAB_STORAGE_KEY] as Record<string, unknown>)
        : {};

      const countByTab = isObjectRecord(storage[A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY])
        ? (storage[A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY] as Record<string, unknown>)
        : {};

      delete byTab[tabId];
      delete countByTab[tabId];

      await chrome.storage.local.set({
        [A11Y_RESULTS_BY_TAB_STORAGE_KEY]: byTab,
        [A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY]: countByTab,
        [A11Y_LAST_SELECTED_RULE_STORAGE_KEY]: null,
      });
    } catch {
      // Ignore clear errors.
    }
  };

  const getPresetLabel = (name: string): string => {
    return name.replace(/\bCustomer:?\s*/gi, '').replace(/\s{2,}/g, ' ').trim();
  };

  const renderPresetEditor = (form: ITemplateForm): ReactElement => {
    return (
      <div className="editor-box preset-editor-box">
        <div className="form-card-header">
          <h3>Edit preset: {getPresetLabel(form.name)}</h3>
          <button type="button" className="mini-button" onClick={() => setEditingPresetId(null)}>
            Close
          </button>
        </div>

        <label className="field-stack preset-title-field">
          <span className="field-caption">Preset name</span>
          <input
            className="field-input field-label"
            value={form.name}
            onChange={(event) => {
              handlePresetNameChange(form.id, event.target.value);
            }}
          />
        </label>

        <div className="preset-editor-fields">
          {form.fields.map((field) => (
            <div className="preset-field-card" key={field.id}>
              <label className="field-stack">
                <span className="field-caption">Name</span>
                <input
                  className="field-input field-label"
                  value={field.label}
                  onChange={(event) => {
                    handleTemplateFieldChange(form.id, field.id, { label: event.target.value });
                  }}
                />
              </label>

              <label className="field-stack">
                <span className="field-caption">Selector</span>
                <input
                  className="field-input"
                  value={field.selector}
                  onChange={(event) => {
                    handleTemplateFieldChange(form.id, field.id, { selector: event.target.value });
                  }}
                />
              </label>

              <label className="field-stack">
                <span className="field-caption">Value</span>
                <input
                  className="field-input"
                  value={field.value}
                  type={field.inputKind === 'password' ? 'password' : 'text'}
                  onChange={(event) => {
                    handleTemplateFieldChange(form.id, field.id, { value: event.target.value });
                  }}
                />
              </label>

              <button
                type="button"
                className="mini-button danger"
                onClick={() => removeFieldFromForm(form.id, field.id)}
              >
                Remove field
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="mini-button" onClick={() => addCustomFieldToForm(form.id)}>
          + Add field
        </button>
      </div>
    );
  };

  const renderPresetButtons = (forms: ITemplateForm[]): ReactElement => {
    return (
      <div className="preset-row">
        {forms.map((form) => {
          const isActive = templateConfig?.activeByType[form.type] === form.id;

          return (
            <div className="preset-item" key={form.id}>
              <div className="preset-chip">
                <button
                  type="button"
                  className={`preset-button ${isActive ? 'active' : ''}`}
                  disabled={isAutoFillBusy}
                  onClick={() => {
                    void applyPreset(form);
                  }}
                >
                  {getPresetLabel(form.name)}
                </button>
                <button
                  type="button"
                  className={`menu-button ${isActive ? 'active' : ''}`}
                  aria-label={`Open preset actions for ${getPresetLabel(form.name)}`}
                  onClick={() => {
                    setMenuOpenId((prev) => (prev === form.id ? null : form.id));
                  }}
                >
                  &#9662;
                </button>
              </div>
              {menuOpenId === form.id ? (
                <div className="custom-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPresetId(form.id);
                      setMenuOpenId(null);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      deletePreset(form.id);
                      setMenuOpenId(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSection = (
    section: FillSection,
    title: string,
    forms: ITemplateForm[],
    withCreate = false,
  ): ReactElement => {
    const isOpen = openSection === section;
    const sectionEditingPreset = forms.find((form) => form.id === editingPresetId) ?? null;
    const showSaveButton = sectionEditingPreset !== null || withCreate;

    return (
      <article className="accordion-card" key={section}>
        <button
          type="button"
          className="accordion-header"
          onClick={() => setOpenSection(section)}
        >
          <span>{title}</span>
          <span>{isOpen ? '-' : '+'}</span>
        </button>

        {isOpen ? (
          <div className="accordion-body">
            {forms.length === 0 ? <p className="hint-text">No presets in this section.</p> : renderPresetButtons(forms)}

            {sectionEditingPreset ? renderPresetEditor(sectionEditingPreset) : null}

            {withCreate ? (
              <div className="new-form-box">
                <div className="new-form-stack">
                  <input
                    className="field-input field-label"
                    placeholder="Preset name"
                    value={newFormName}
                    onChange={(event) => setNewFormName(event.target.value)}
                  />
                  <select
                    className="form-select"
                    value={newFormType}
                    onChange={(event) => setNewFormType(event.target.value as TemplateType)}
                  >
                    <option value="login">Login</option>
                    <option value="registration">Register</option>
                    <option value="checkout">Checkout</option>
                    <option value="custom">Custom</option>
                  </select>
                  <button type="button" className="mini-button" onClick={createNewTemplateForm}>
                    Add New Preset
                  </button>
                </div>
              </div>
            ) : null}

            {showSaveButton ? (
              <div className="section-actions-row">
                <button
                  type="button"
                  className="action-button secondary"
                  disabled={!templateConfig || !market}
                  onClick={() => {
                    void saveTemplates();
                  }}
                >
                  Save presets
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <main className="popup-root">
      <div className="popup-header">
        <div className="popup-logo" aria-hidden="true">
          <Logo />
        </div>
        <h1 className="popup-title">Lalafo DX Assist</h1>
      </div>

      <div className="tabs" role="tablist" aria-label="Feature tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'main'}
          className={`tab-button ${activeTab === 'main' ? 'active' : ''}`}
          onClick={() => setActiveTab('main')}
        >
          Main
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'fill-form'}
          className={`tab-button ${activeTab === 'fill-form' ? 'active' : ''}`}
          onClick={() => setActiveTab('fill-form')}
        >
          Fill form
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'accessibility'}
          className={`tab-button ${activeTab === 'accessibility' ? 'active' : ''}`}
          onClick={() => setActiveTab('accessibility')}
        >
          Accessibility
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'seo'}
          className={`tab-button ${activeTab === 'seo' ? 'active' : ''}`}
          onClick={() => setActiveTab('seo')}
        >
          SEO
        </button>
      </div>

      {activeTab === 'main' ? (
        <section className="tab-panel" role="tabpanel" aria-label="Main">
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

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={autoA11yEnabled}
              onChange={(event) => {
                void onAutoA11yToggleChange(event.target.checked);
              }}
            />
            <span>Enable auto Accessibility checks on Lalafo page navigation</span>
          </label>
          {errorText ? <p className="error-text">{errorText}</p> : null}
        </section>
      ) : null}

      {activeTab === 'fill-form' ? (
        <section className="tab-panel" role="tabpanel" aria-label="Fill form">
          <p className="hint-text">
            4 grouped sections: Login, Register, Checkout, Custom. Click preset buttons for instant
            fill.
          </p>

          {market ? <p className="market-chip">Market: {market.toUpperCase()}</p> : null}
          {marketStatus ? <p className="status-text">{marketStatus}</p> : null}
          {isTemplateBusy ? <p className="status-text">Loading presets...</p> : null}

          {templateConfig ? (
            <div className="accordion-grid">
              {renderSection('login', 'Login', formsByType.login)}
              {renderSection('register', 'Register', formsByType.registration)}
              {renderSection('checkout', 'Checkout', formsByType.checkout)}
              {renderSection('custom', 'Custom', customForms, true)}
            </div>
          ) : null}


          {autoFillStatus ? <p className="status-text">{getAutoFillStatusText(autoFillStatus)}</p> : null}
        </section>
      ) : null}

      {activeTab === 'accessibility' ? (
        <section className="tab-panel" role="tabpanel" aria-label="Accessibility">
          <h3 className="stub-title">WCAG Accessibility Scanner</h3>
          <p className="hint-text">Run axe-core checks and highlight detected issues directly on the page.</p>

          <div className="a11y-actions">
            <button
              type="button"
              className="action-button"
              disabled={isA11yBusy}
              onClick={() => {
                void runAccessibilityScan();
              }}
            >
              Run scan
            </button>
          </div>

          <div className="a11y-actions">
            <button
              type="button"
              className="action-button secondary"
              disabled={isA11yBusy || a11yViolations.length === 0}
              onClick={() => {
                void focusAdjacentViolation(-1);
              }}
            >
              Previous issue
            </button>
            <button
              type="button"
              className="action-button secondary"
              disabled={isA11yBusy || a11yViolations.length === 0}
              onClick={() => {
                void focusAdjacentViolation(1);
              }}
            >
              Next issue
            </button>
          </div>

          <div className="a11y-config-stack">
            <label className="a11y-config-row">
              <input
                type="checkbox"
                checked={!a11yHighlightsEnabled}
                disabled={isA11yBusy}
                onChange={(event) => {
                  void toggleAccessibilityHighlights(!event.target.checked);
                }}
              />
              <span>Hide highlights</span>
            </label>

            <label className="a11y-config-row">
              <input
                type="checkbox"
                checked={a11yBlinkOnClick}
                onChange={(event) => {
                  void toggleA11yBlinkConfig(event.target.checked);
                }}
              />
              <span>Blink and scroll to rule on click</span>
            </label>
          </div>

          {getA11yStatusText(a11yStatus) ? <p className="status-text">{getA11yStatusText(a11yStatus)}</p> : null}

          {a11yViolations.length > 0 ? (
            <div className="a11y-results">
              <div className="a11y-results-head">
                <p className="hint-mini">Found rules: {a11yViolations.length}</p>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => {
                    void clearSavedA11yResults();
                  }}
                >
                  Clear saved
                </button>
              </div>
              <ul className="a11y-list">
                {a11yViolations.map((violation) => (
                  <li
                    key={violation.id}
                    className={`a11y-item ${a11ySelectedRuleId === violation.id ? 'active' : ''}`}
                    onClick={() => {
                      void focusViolationOnPage(violation);
                    }}
                  >
                    <div className="a11y-item-head">
                      <span className={`a11y-impact ${violation.impact ?? 'minor'}`}>{violation.impact ?? 'minor'}</span>
                      <span className="a11y-rule">{violation.id}</span>
                      <span className="a11y-count">Nodes: {violation.nodes.length}</span>
                    </div>
                    <p className="a11y-help-text">{violation.help}</p>
                    <p className="a11y-description-text">{violation.description}</p>
                    <a
                      className="a11y-link"
                      href={violation.helpUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open official rule docs
                    </a>
                    {violation.nodes[0]?.summary ? (
                      <p className="a11y-summary-text">{violation.nodes[0].summary}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'seo' ? (
        <section className="tab-panel" role="tabpanel" aria-label="SEO">
          <h3 className="stub-title">SEO (coming soon)</h3>
          <p className="hint-text">
            Planned: meta tags audit, structured data checks, heading hierarchy and indexability hints.
          </p>
        </section>
      ) : null}
    </main>
  );
};

