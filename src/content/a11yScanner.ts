import axe from 'axe-core';
import {
  A11Y_SCAN_RESPONSE_TYPE,
  FOCUS_A11Y_RULE_TYPE,
  REQUEST_A11Y_SCAN_TYPE,
  TOGGLE_HIGHLIGHTS_TYPE,
  type A11yViolation,
  type A11yImpact,
  type FocusA11yRuleMessage,
  type RequestA11yScanMessage,
  type RequestA11yScanResponse,
  type ToggleHighlightsMessage,
} from '../shared/types/messages';

const OVERLAY_HOST_ID = 'lalafo-dx-a11y-root';
const REPOSITION_DEBOUNCE_MS = 120;

interface IA11yIssueNode {
  selector: string;
  impact: A11yImpact;
  ruleId: string;
  help: string;
  element: Element;
  boxEl: HTMLDivElement;
  labelEl: HTMLSpanElement;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isToggleHighlightsMessage = (message: unknown): message is ToggleHighlightsMessage => {
  if (!isObjectRecord(message)) {
    return false;
  }

  return message.type === TOGGLE_HIGHLIGHTS_TYPE && typeof message.enabled === 'boolean';
};

const isA11yScanRequest = (message: unknown): message is RequestA11yScanMessage => {
  if (!isObjectRecord(message)) {
    return false;
  }

  return (
    message.type === REQUEST_A11Y_SCAN_TYPE &&
    (message.showHighlights === undefined || typeof message.showHighlights === 'boolean')
  );
};

const isFocusRuleMessage = (message: unknown): message is FocusA11yRuleMessage => {
  if (!isObjectRecord(message)) {
    return false;
  }

  return message.type === FOCUS_A11Y_RULE_TYPE && typeof message.ruleId === 'string';
};

const debounce = <TArgs extends unknown[]>(callback: (...args: TArgs) => void, waitMs: number) => {
  let timeoutId: number | null = null;

  return (...args: TArgs): void => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      callback(...args);
    }, waitMs);
  };
};

const impactToColor = (impact: A11yImpact): string => {
  if (impact === 'critical') return '#e11d48';
  if (impact === 'serious') return '#f97316';
  if (impact === 'moderate') return '#facc15';
  return '#2563eb';
};

const sanitizeViolations = (violations: axe.Result[]): A11yViolation[] => {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => {
      const target = node.target
        .map((entry): string | null => {
          if (typeof entry === 'string') {
            return entry;
          }

          if (Array.isArray(entry)) {
            return entry.find((selector) => selector.trim().length > 0) ?? null;
          }

          return null;
        })
        .filter((entry): entry is string => entry !== null);

      return {
        target,
        summary: node.failureSummary,
      };
    }),
  }));
};

class A11yHighlighter {
  private hostEl: HTMLDivElement | null = null;

  private shadowRootRef: ShadowRoot | null = null;

  private surfaceEl: HTMLDivElement | null = null;

  private issues: IA11yIssueNode[] = [];

  private listenersAttached = false;

  private readonly debouncedReposition = debounce(() => {
    this.repositionHighlights();
  }, REPOSITION_DEBOUNCE_MS);

  drawHighlights(violations: axe.Result[]): void {
    this.ensureOverlay();
    this.clearDrawnIssues();

    if (!this.surfaceEl) {
      return;
    }

    for (const violation of violations) {
      for (const node of violation.nodes) {
        const selector = node.target
          .map((candidate): string | null => {
            if (typeof candidate === 'string') {
              return candidate;
            }

            if (Array.isArray(candidate)) {
              return candidate.find((entry) => entry.trim().length > 0) ?? null;
            }

            return null;
          })
          .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);
        if (!selector) {
          continue;
        }

        const element = document.querySelector(selector);
        if (!element) {
          continue;
        }

        const boxEl = document.createElement('div');
        boxEl.setAttribute('data-rule-id', violation.id);
        boxEl.style.position = 'absolute';
        boxEl.style.border = `2px solid ${impactToColor(violation.impact ?? 'minor')}`;
        boxEl.style.borderRadius = '4px';
        boxEl.style.background = 'transparent';
        boxEl.style.boxSizing = 'border-box';
        boxEl.style.pointerEvents = 'none';
        boxEl.style.zIndex = '2';

        const labelEl = document.createElement('span');
        labelEl.textContent = violation.id;
        labelEl.title = violation.help;
        labelEl.style.position = 'absolute';
        labelEl.style.maxWidth = '320px';
        labelEl.style.padding = '2px 6px';
        labelEl.style.borderRadius = '4px';
        labelEl.style.background = impactToColor(violation.impact ?? 'minor');
        labelEl.style.color = '#ffffff';
        labelEl.style.font = '600 11px/1.4 Inter, Arial, sans-serif';
        labelEl.style.whiteSpace = 'nowrap';
        labelEl.style.overflow = 'hidden';
        labelEl.style.textOverflow = 'ellipsis';
        labelEl.style.pointerEvents = 'none';
        labelEl.style.zIndex = '3';

        this.surfaceEl.append(boxEl, labelEl);

        this.issues.push({
          selector,
          impact: violation.impact ?? 'minor',
          ruleId: violation.id,
          help: violation.help,
          element,
          boxEl,
          labelEl,
        });
      }
    }

    this.attachListeners();
    this.repositionHighlights();
  }

  clearAll(): void {
    this.detachListeners();
    this.clearDrawnIssues();

    if (this.hostEl) {
      this.hostEl.remove();
    }

    this.hostEl = null;
    this.surfaceEl = null;
    this.shadowRootRef = null;
  }

  blinkRule(ruleId: string): boolean {
    const targets = this.issues.filter((issue) => issue.ruleId === ruleId);
    if (targets.length === 0) {
      return false;
    }

    for (const issue of targets) {
      issue.boxEl.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0.35, transform: 'scale(1.02)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 700, iterations: 2, easing: 'ease-in-out' },
      );
      issue.labelEl.animate(
        [{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }],
        { duration: 700, iterations: 2, easing: 'ease-in-out' },
      );
    }

    targets[0].element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    return true;
  }

  private ensureOverlay(): void {
    if (this.hostEl && this.surfaceEl && this.shadowRootRef) {
      return;
    }

    const existingHost = document.getElementById(OVERLAY_HOST_ID);

    if (existingHost && existingHost instanceof HTMLDivElement) {
      existingHost.remove();
    }

    const hostEl = document.createElement('div');
    hostEl.id = OVERLAY_HOST_ID;
    hostEl.style.position = 'absolute';
    hostEl.style.top = '0';
    hostEl.style.left = '0';
    hostEl.style.width = '100%';
    hostEl.style.height = '100%';
    hostEl.style.pointerEvents = 'none';
    hostEl.style.zIndex = '999999';
    document.body.appendChild(hostEl);
    this.hostEl = hostEl;

    if (!this.shadowRootRef) {
      this.shadowRootRef = this.hostEl.attachShadow({ mode: 'closed' });
    }

    if (!this.surfaceEl) {
      const surfaceEl = document.createElement('div');
      surfaceEl.style.position = 'absolute';
      surfaceEl.style.top = '0';
      surfaceEl.style.left = '0';
      surfaceEl.style.width = '100%';
      surfaceEl.style.height = '100%';
      surfaceEl.style.pointerEvents = 'none';
      this.shadowRootRef.appendChild(surfaceEl);
      this.surfaceEl = surfaceEl;
    }
  }

  private clearDrawnIssues(): void {
    for (const issue of this.issues) {
      issue.boxEl.remove();
      issue.labelEl.remove();
    }

    this.issues = [];
  }

  private repositionHighlights(): void {
    if (!this.surfaceEl || !this.hostEl) {
      return;
    }

    for (const issue of this.issues) {
      if (!issue.element.isConnected) {
        issue.boxEl.style.display = 'none';
        issue.labelEl.style.display = 'none';
        continue;
      }

      const rect = issue.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        issue.boxEl.style.display = 'none';
        issue.labelEl.style.display = 'none';
        continue;
      }

      const top = rect.top + window.scrollY;
      const left = rect.left + window.scrollX;

      issue.boxEl.style.display = 'block';
      issue.boxEl.style.top = `${top}px`;
      issue.boxEl.style.left = `${left}px`;
      issue.boxEl.style.width = `${rect.width}px`;
      issue.boxEl.style.height = `${rect.height}px`;

      issue.labelEl.style.display = 'inline-block';
      issue.labelEl.style.top = `${Math.max(0, top - 20)}px`;
      issue.labelEl.style.left = `${left}px`;
    }
  }

  private attachListeners(): void {
    if (this.listenersAttached) {
      return;
    }

    window.addEventListener('scroll', this.debouncedReposition, { passive: true });
    window.addEventListener('resize', this.debouncedReposition);
    this.listenersAttached = true;
  }

  private detachListeners(): void {
    if (!this.listenersAttached) {
      return;
    }

    window.removeEventListener('scroll', this.debouncedReposition);
    window.removeEventListener('resize', this.debouncedReposition);
    this.listenersAttached = false;
  }
}

export const runA11yScan = async (): Promise<axe.Result[]> => {
  const result = await axe.run(document.documentElement, {
    resultTypes: ['violations'],
  });

  return result.violations;
};

const highlighter = new A11yHighlighter();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isFocusRuleMessage(message)) {
    void (async (): Promise<void> => {
      let focused = highlighter.blinkRule(message.ruleId);

      // If highlights are currently hidden, scan and render only the clicked rule.
      if (!focused) {
        try {
          const violations = await runA11yScan();
          const selectedRuleViolations = violations.filter((violation) => violation.id === message.ruleId);

          if (selectedRuleViolations.length > 0) {
            highlighter.drawHighlights(selectedRuleViolations);
            focused = highlighter.blinkRule(message.ruleId);
          }
        } catch {
          focused = false;
        }
      }

      sendResponse({ ok: focused });
    })();

    return true;
  }

  if (isToggleHighlightsMessage(message)) {
    if (!message.enabled) {
      highlighter.clearAll();
    }

    sendResponse({ ok: true });
    return false;
  }

  if (!isA11yScanRequest(message)) {
    return false;
  }

  void (async (): Promise<void> => {
    try {
      const violations = await runA11yScan();
      if (message.showHighlights === true) {
        highlighter.drawHighlights(violations);
      } else {
        highlighter.clearAll();
      }
      const serializedViolations = sanitizeViolations(violations);

      const response: RequestA11yScanResponse = {
        type: A11Y_SCAN_RESPONSE_TYPE,
        success: true,
        violations: serializedViolations,
      };

      sendResponse(response);
    } catch (error) {
      const response: RequestA11yScanResponse = {
        type: A11Y_SCAN_RESPONSE_TYPE,
        success: false,
        violations: [],
        error: error instanceof Error ? error.message : 'A11Y_SCAN_FAILED',
      };

      sendResponse(response);
    }
  })();

  return true;
});





