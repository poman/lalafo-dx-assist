import type { SeoReportPayload } from '../shared/types/messages';

export type SeoIssueSeverity = 'error' | 'warning' | 'info';

export interface ISeoIssue {
  id: string;
  severity: SeoIssueSeverity;
  title: string;
  details: string;
  recommendation: string;
}

const isTitleLengthRecommended = (length: number): boolean => length >= 30 && length <= 60;

const isDescriptionLengthRecommended = (length: number): boolean => length >= 70 && length <= 160;

const isLikelyAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const getHeadingLevelJumps = (levels: number[]): number[] => {
  const jumps: number[] = [];

  for (let i = 1; i < levels.length; i += 1) {
    const delta = levels[i] - levels[i - 1];
    if (delta > 1) {
      jumps.push(i);
    }
  }

  return jumps;
};

export const analyzeSeoReport = (report: SeoReportPayload): ISeoIssue[] => {
  const issues: ISeoIssue[] = [];

  const titleLength = report.meta.titleLength;
  const descriptionLength = report.meta.description.length;

  if (!report.meta.title) {
    issues.push({
      id: 'title-missing',
      severity: 'error',
      title: 'Title is missing',
      details: 'document.title is empty.',
      recommendation: 'Add a unique page title with target keyword intent.',
    });
  } else if (!isTitleLengthRecommended(titleLength)) {
    issues.push({
      id: 'title-length',
      severity: 'warning',
      title: 'Title length is outside recommended range',
      details: `Current title length is ${titleLength}. Recommended: 30-60 characters.`,
      recommendation: 'Shorten or extend the title to improve SERP display quality.',
    });
  }

  if (report.meta.title && report.meta.description) {
    const normalizedTitle = report.meta.title.trim().toLowerCase();
    const normalizedDescription = report.meta.description.trim().toLowerCase();

    if (normalizedTitle === normalizedDescription) {
      issues.push({
        id: 'title-description-duplicate',
        severity: 'warning',
        title: 'Title duplicates meta description',
        details: 'Title and description appear to be identical.',
        recommendation: 'Use complementary but distinct title/description texts.',
      });
    }
  }

  if (!report.meta.description) {
    issues.push({
      id: 'meta-description-missing',
      severity: 'error',
      title: 'Meta description is missing',
      details: 'No <meta name="description"> content found.',
      recommendation: 'Add a descriptive summary to improve CTR in search snippets.',
    });
  } else if (!isDescriptionLengthRecommended(descriptionLength)) {
    issues.push({
      id: 'meta-description-length',
      severity: 'warning',
      title: 'Meta description length is outside recommended range',
      details: `Current description length is ${descriptionLength}. Recommended: 70-160 characters.`,
      recommendation: 'Adjust description length while keeping strong intent and CTA.',
    });
  }

  if (!report.meta.canonical) {
    issues.push({
      id: 'canonical-missing',
      severity: 'warning',
      title: 'Canonical tag is missing',
      details: 'No <link rel="canonical"> found.',
      recommendation: 'Add canonical URL to prevent duplicate-content indexing issues.',
    });
  } else {
    if (!isLikelyAbsoluteUrl(report.meta.canonical)) {
      issues.push({
        id: 'canonical-relative',
        severity: 'warning',
        title: 'Canonical URL is not absolute',
        details: `Canonical value: ${report.meta.canonical}`,
        recommendation: 'Use an absolute canonical URL including protocol and host.',
      });
    }

    if (report.meta.url && report.meta.canonical !== report.meta.url) {
      issues.push({
        id: 'canonical-differs-from-url',
        severity: 'info',
        title: 'Canonical differs from current URL',
        details: `URL: ${report.meta.url} vs Canonical: ${report.meta.canonical}`,
        recommendation: 'Verify this is intentional (pagination, faceted pages, duplicates).',
      });
    }
  }

  const robots = report.meta.robots?.toLowerCase() ?? '';
  if (!robots) {
    issues.push({
      id: 'robots-missing',
      severity: 'info',
      title: 'Robots meta is missing',
      details: 'No <meta name="robots"> tag found.',
      recommendation: 'Add robots directives where needed for crawl/index control.',
    });
  } else if (robots.includes('noindex')) {
    issues.push({
      id: 'robots-noindex',
      severity: 'warning',
      title: 'Page is marked as noindex',
      details: `Robots directive: ${report.meta.robots}`,
      recommendation: 'Remove noindex if this page should appear in search results.',
    });
  }

  if (!report.meta.language) {
    issues.push({
      id: 'lang-missing',
      severity: 'warning',
      title: 'Document language is missing',
      details: 'No lang attribute on <html>.',
      recommendation: 'Set <html lang="..."> for accessibility and search localization signals.',
    });
  }

  if (!report.meta.viewport) {
    issues.push({
      id: 'viewport-missing',
      severity: 'warning',
      title: 'Viewport meta is missing',
      details: 'No mobile viewport meta tag found.',
      recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    });
  }

  if (!report.meta.charset) {
    issues.push({
      id: 'charset-missing',
      severity: 'warning',
      title: 'Charset declaration is missing',
      details: 'No <meta charset> found.',
      recommendation: 'Declare charset (usually UTF-8) early in <head>.',
    });
  }

  if (report.meta.h1Count === 0) {
    issues.push({
      id: 'h1-missing',
      severity: 'error',
      title: 'H1 heading is missing',
      details: 'No H1 heading was detected on this page.',
      recommendation: 'Add a single primary H1 that matches page intent.',
    });
  } else if (!report.meta.hasSingleH1) {
    issues.push({
      id: 'h1-multiple',
      severity: 'warning',
      title: 'Multiple H1 headings found',
      details: `Detected ${report.meta.h1Count} H1 headings.`,
      recommendation: 'Keep one primary H1 and use H2-H6 for structure.',
    });
  }

  const emptyHeadings = report.headings.filter((item) => !item.text.trim());
  if (emptyHeadings.length > 0) {
    issues.push({
      id: 'empty-headings',
      severity: 'warning',
      title: 'Empty heading tags detected',
      details: `${emptyHeadings.length} heading element(s) have empty text.`,
      recommendation: 'Avoid empty headings; provide meaningful section labels.',
    });
  }

  const headingLevels = report.headings.map((item) => item.level);
  const headingJumps = getHeadingLevelJumps(headingLevels);
  if (headingJumps.length > 0) {
    issues.push({
      id: 'heading-order-jumps',
      severity: 'info',
      title: 'Heading level jumps detected',
      details: `Detected ${headingJumps.length} jump(s) where heading levels skip hierarchy.`,
      recommendation: 'Follow a consistent heading order (H1 -> H2 -> H3...) for better structure.',
    });
  }

  if (!report.meta.openGraph.title || !report.meta.openGraph.description || !report.meta.openGraph.image) {
    issues.push({
      id: 'og-incomplete',
      severity: 'warning',
      title: 'Open Graph markup is incomplete',
      details: 'One or more of og:title, og:description, og:image are missing.',
      recommendation: 'Complete OG tags to improve social sharing previews.',
    });
  }

  if (report.meta.openGraph.image && !isLikelyAbsoluteUrl(report.meta.openGraph.image)) {
    issues.push({
      id: 'og-image-not-absolute',
      severity: 'warning',
      title: 'OG image URL is not absolute',
      details: `og:image value: ${report.meta.openGraph.image}`,
      recommendation: 'Use absolute image URLs for social crawlers.',
    });
  }

  if (!report.meta.openGraph.url) {
    issues.push({
      id: 'og-url-missing',
      severity: 'info',
      title: 'OG URL is missing',
      details: 'No og:url found.',
      recommendation: 'Set og:url for canonical social object URL consistency.',
    });
  }

  if (!report.meta.openGraph.type) {
    issues.push({
      id: 'og-type-missing',
      severity: 'info',
      title: 'OG type is missing',
      details: 'No og:type found.',
      recommendation: 'Set og:type (e.g., website, article, product) for richer previews.',
    });
  }

  const twitter = report.meta.twitter;
  if (!twitter?.card || !twitter.title || !twitter.description || !twitter.image) {
    issues.push({
      id: 'twitter-card-incomplete',
      severity: 'info',
      title: 'Twitter Card metadata is incomplete',
      details: 'One or more twitter:* tags are missing.',
      recommendation: 'Add twitter:card/title/description/image for better X/Twitter previews.',
    });
  }

  if ((report.meta.imageCount ?? 0) > 0) {
    const missingAlt = report.meta.imageMissingAltCount ?? 0;
    const imageCount = report.meta.imageCount ?? 0;
    const missingAltRatio = imageCount === 0 ? 0 : missingAlt / imageCount;

    if (missingAlt > 0) {
      issues.push({
        id: 'images-missing-alt',
        severity: missingAltRatio > 0.3 ? 'warning' : 'info',
        title: 'Images without alt text detected',
        details: `${missingAlt}/${imageCount} images are missing meaningful alt text.`,
        recommendation: 'Add descriptive alt text for informative images.',
      });
    }
  }

  if (report.vitals.lcp !== undefined) {
    if (report.vitals.lcp > 4000) {
      issues.push({
        id: 'lcp-poor',
        severity: 'error',
        title: 'LCP is poor',
        details: `LCP is ${report.vitals.lcp.toFixed(0)}ms.`,
        recommendation: 'Optimize above-the-fold rendering, images, and server response.',
      });
    } else if (report.vitals.lcp > 2500) {
      issues.push({
        id: 'lcp-needs-improvement',
        severity: 'warning',
        title: 'LCP needs improvement',
        details: `LCP is ${report.vitals.lcp.toFixed(0)}ms.`,
        recommendation: 'Improve rendering path and reduce largest-content load time.',
      });
    }
  }

  if (report.vitals.cls !== undefined) {
    if (report.vitals.cls > 0.25) {
      issues.push({
        id: 'cls-poor',
        severity: 'error',
        title: 'CLS is poor',
        details: `CLS is ${report.vitals.cls.toFixed(4)}.`,
        recommendation: 'Reserve layout space for dynamic content and media.',
      });
    } else if (report.vitals.cls > 0.1) {
      issues.push({
        id: 'cls-needs-improvement',
        severity: 'warning',
        title: 'CLS needs improvement',
        details: `CLS is ${report.vitals.cls.toFixed(4)}.`,
        recommendation: 'Reduce layout shifts during load and interaction.',
      });
    }
  }

  if (report.vitals.inp !== undefined) {
    if (report.vitals.inp > 500) {
      issues.push({
        id: 'inp-poor',
        severity: 'error',
        title: 'INP is poor',
        details: `INP is ${report.vitals.inp.toFixed(0)}ms.`,
        recommendation: 'Reduce main-thread blocking and optimize interaction handlers.',
      });
    } else if (report.vitals.inp > 200) {
      issues.push({
        id: 'inp-needs-improvement',
        severity: 'warning',
        title: 'INP needs improvement',
        details: `INP is ${report.vitals.inp.toFixed(0)}ms.`,
        recommendation: 'Optimize event handling and expensive JS execution.',
      });
    }
  } else {
    issues.push({
      id: 'inp-missing',
      severity: 'info',
      title: 'INP is not available yet',
      details: 'INP often appears after user interaction.',
      recommendation: 'Interact with the page and keep popup open to capture INP.',
    });
  }

  if (report.vitals.lcp === undefined) {
    issues.push({
      id: 'lcp-missing',
      severity: 'info',
      title: 'LCP is not available yet',
      details: 'LCP might not be finalized at this moment.',
      recommendation: 'Wait for full render or refresh the page and re-check metrics.',
    });
  }

  if (report.vitals.cls === undefined) {
    issues.push({
      id: 'cls-missing',
      severity: 'info',
      title: 'CLS is not available yet',
      details: 'CLS value may appear after layout lifecycle stabilizes.',
      recommendation: 'Scroll/interact and observe whether layout shifts are reported.',
    });
  }

  if (issues.length === 0) {
    issues.push({
      id: 'seo-healthy',
      severity: 'info',
      title: 'No major SEO issues detected',
      details: 'Current snapshot looks healthy for key on-page signals.',
      recommendation: 'Continue monitoring during client-side navigation changes.',
    });
  }

  return issues;
};

