import * as webVitals from 'web-vitals';
import {
  REQUEST_SEO_REPORT_TYPE,
  SEO_REPORT_RESPONSE_TYPE,
  SEO_REPORT_UPDATE_TYPE,
  WEB_VITALS_UPDATE_TYPE,
  type RequestSeoReportMessage,
  type SeoReportPayload,
  type SeoReportResponse,
  type SeoReportUpdateMessage,
  type WebVitalsUpdateMessage,
} from '../shared/types/messages';
import { observeSeoHeadChanges, parseSeoSnapshot } from './utils/seoParser';

interface ISeoVitalsState {
  lcp?: number;
  cls?: number;
  inp?: number;
}

interface IMetricLike {
  value: number;
}

type MetricCallback = (metric: IMetricLike) => void;

const getMetricRegistrar = (name: string): ((callback: MetricCallback) => void) | null => {
  const candidate = (webVitals as Record<string, unknown>)[name];
  return typeof candidate === 'function' ? (candidate as (callback: MetricCallback) => void) : null;
};

const vitalsState: ISeoVitalsState = {};
let lastSerializedReport = '';
let latestPayload: SeoReportPayload | null = null;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isRequestSeoReportMessage = (message: unknown): message is RequestSeoReportMessage => {
  if (!isObjectRecord(message)) {
    return false;
  }

  return message.type === REQUEST_SEO_REPORT_TYPE;
};

const runSafely = (task: () => void): void => {
  try {
    task();
  } catch {
    // Keep content script alive even if page-specific APIs throw.
  }
};

const sendRuntimeMessage = (message: SeoReportUpdateMessage | WebVitalsUpdateMessage): void => {
  try {
    chrome.runtime.sendMessage(message, () => {
      // Ignore absent listeners; popup can subscribe when opened.
      void chrome.runtime.lastError;
    });
  } catch {
    // Ignore restricted contexts where runtime messaging is temporarily unavailable.
  }
};

const buildSeoPayload = (): SeoReportPayload => {
  const snapshot = parseSeoSnapshot();

  return {
    meta: snapshot.meta,
    headings: snapshot.headings,
    vitals: {
      lcp: vitalsState.lcp,
      cls: vitalsState.cls,
      inp: vitalsState.inp,
    },
  };
};

const publishSeoReportIfChanged = (): void => {
  let payload: SeoReportPayload;

  try {
    payload = buildSeoPayload();
  } catch {
    return;
  }

  let serialized = '';

  try {
    serialized = JSON.stringify(payload);
  } catch {
    return;
  }

  if (serialized === lastSerializedReport) {
    latestPayload = payload;
    return;
  }

  lastSerializedReport = serialized;
  latestPayload = payload;

  sendRuntimeMessage({
    type: SEO_REPORT_UPDATE_TYPE,
    payload,
  });
};

const publishVitalsMetric = (
  metricName: WebVitalsUpdateMessage['metric'],
  value: number,
): void => {
  sendRuntimeMessage({
    type: WEB_VITALS_UPDATE_TYPE,
    metric: metricName,
    value,
  });

  publishSeoReportIfChanged();
};

const initWebVitals = (): void => {
  const onLCP = getMetricRegistrar('onLCP');
  const onCLS = getMetricRegistrar('onCLS');
  const onINP = getMetricRegistrar('onINP');
  const onFID = getMetricRegistrar('onFID');

  runSafely(() => {
    onLCP?.((metric) => {
      vitalsState.lcp = metric.value;
      publishVitalsMetric('lcp', metric.value);
    });
  });

  runSafely(() => {
    onCLS?.((metric) => {
      vitalsState.cls = metric.value;
      publishVitalsMetric('cls', metric.value);
    });
  });

  runSafely(() => {
    onINP?.((metric) => {
      vitalsState.inp = metric.value;
      publishVitalsMetric('inp', metric.value);
    });
  });

  // Keep FID as a standalone stream update for environments where it's still emitted.
  runSafely(() => {
    onFID?.((metric) => {
      publishVitalsMetric('fid', metric.value);
    });
  });
};

const initSeoScanner = (): void => {
  const stopHeadObserver = observeSeoHeadChanges(() => {
    publishSeoReportIfChanged();
  });

  const onRouteChange = (): void => {
    publishSeoReportIfChanged();
  };

  window.addEventListener('popstate', onRouteChange, { passive: true });
  window.addEventListener('hashchange', onRouteChange, { passive: true });

  initWebVitals();
  publishSeoReportIfChanged();

  // Content script lifetime usually matches page lifetime, but keep cleanup for safety.
  window.addEventListener(
    'pagehide',
    () => {
      stopHeadObserver();
      window.removeEventListener('popstate', onRouteChange);
      window.removeEventListener('hashchange', onRouteChange);
    },
    { once: true },
  );
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRequestSeoReportMessage(message)) {
    return false;
  }

  runSafely(() => {
    if (!latestPayload) {
      latestPayload = buildSeoPayload();
    }
  });

  if (!latestPayload) {
    return false;
  }

  const response: SeoReportResponse = {
    type: SEO_REPORT_RESPONSE_TYPE,
    payload: latestPayload,
  };

  sendResponse(response);
  return false;
});

runSafely(() => {
  initSeoScanner();
});


