import type { HeadingNode, ParsedMetaTags } from '../../shared/types/messages';

export interface ISeoDomSnapshot {
  meta: ParsedMetaTags;
  headings: HeadingNode[];
}

const getMetaContentByName = (name: string): string => {
  return document
    .querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
    ?.getAttribute('content')
    ?.trim() ?? '';
};

const getMetaContentByProperty = (property: string): string => {
  return document
    .querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
    ?.getAttribute('content')
    ?.trim() ?? '';
};

const getDocumentLanguage = (): string => {
  return document.documentElement?.getAttribute('lang')?.trim() ?? '';
};

const getDocumentCharset = (): string => {
  return document
    .querySelector<HTMLMetaElement>('meta[charset]')
    ?.getAttribute('charset')
    ?.trim() ?? '';
};

const getImageStats = (): { total: number; missingAlt: number } => {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
  const missingAlt = images.filter((img) => !img.hasAttribute('alt') || !(img.getAttribute('alt') ?? '').trim())
    .length;

  return {
    total: images.length,
    missingAlt,
  };
};

const getCanonicalHref = (): string => {
  const canonicalRaw = document
    .querySelector<HTMLLinkElement>('link[rel="canonical"]')
    ?.getAttribute('href')
    ?.trim();

  if (!canonicalRaw) {
    return '';
  }

  try {
    return new URL(canonicalRaw, window.location.href).href;
  } catch {
    return canonicalRaw;
  }
};

const parseHeadings = (): HeadingNode[] => {
  const headingElements = document.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6');

  return Array.from(headingElements).map((heading) => {
    const levelValue = Number.parseInt(heading.tagName.slice(1), 10);
    const normalizedLevel = Number.isNaN(levelValue) ? 6 : Math.min(Math.max(levelValue, 1), 6);

    return {
      level: normalizedLevel as HeadingNode['level'],
      text: heading.textContent?.trim() ?? '',
    };
  });
};

export const parseSeoSnapshot = (): ISeoDomSnapshot => {
  const title = document.title?.trim() ?? '';
  const headings = parseHeadings();
  const h1Count = headings.filter((item) => item.level === 1).length;
  const imageStats = getImageStats();

  return {
    meta: {
      title,
      titleLength: title.length,
      description: getMetaContentByName('description'),
      canonical: getCanonicalHref(),
      url: window.location.href,
      language: getDocumentLanguage(),
      robots: getMetaContentByName('robots'),
      viewport: getMetaContentByName('viewport'),
      charset: getDocumentCharset(),
      h1Count,
      hasSingleH1: h1Count === 1,
      imageCount: imageStats.total,
      imageMissingAltCount: imageStats.missingAlt,
      openGraph: {
        title: getMetaContentByProperty('og:title'),
        description: getMetaContentByProperty('og:description'),
        image: getMetaContentByProperty('og:image'),
        url: getMetaContentByProperty('og:url'),
        type: getMetaContentByProperty('og:type'),
      },
      twitter: {
        card: getMetaContentByName('twitter:card'),
        title: getMetaContentByName('twitter:title'),
        description: getMetaContentByName('twitter:description'),
        image: getMetaContentByName('twitter:image'),
      },
    },
    headings,
  };
};

export const observeSeoHeadChanges = (onChange: () => void): (() => void) => {
  const head = document.head;
  if (!head) {
    return () => undefined;
  }

  let rafId: number | null = null;

  const schedule = (): void => {
    if (rafId !== null) {
      return;
    }

    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      onChange();
    });
  };

  const observer = new MutationObserver(() => {
    schedule();
  });

  observer.observe(head, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['content', 'href', 'name', 'property', 'rel'],
  });

  return () => {
    observer.disconnect();
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
  };
};

