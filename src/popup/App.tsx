import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { MarketCode } from '../shared/types/region';
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
import { syncQaDarkModeWithActiveTab, toggleQaDarkMode } from './qaDarkMode';

type PopupTab = 'main' | 'fill-form' | 'accessibility' | 'seo';
type FillSection = 'login' | 'register' | 'checkout' | 'custom';

export const App = (): ReactElement => {
  const [enabled, setEnabled] = useState(false);
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
          <h3 className="stub-title">Accessibility (coming soon)</h3>
          <p className="hint-text">
            Planned: WCAG checks, contrast audit, missing alt attributes, and focus order validator.
          </p>
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

