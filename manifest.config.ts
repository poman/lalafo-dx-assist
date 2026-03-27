import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Lalafo DX Assist',
  short_name: 'DX Assist',
  description:
    'QA and developer toolkit for Lalafo domains: dark mode auditing, accessibility checks, SEO diagnostics, and form-filling helpers.',
  version: '0.1.0',
  homepage_url: 'https://github.com/poman/lalafo-dx-assist',
  action: {
    default_popup: 'index.html',
    default_title: 'Lalafo DX Assist',
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
    },
  },
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  background: {
    service_worker: 'src/background/main.ts',
    type: 'module',
  },
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: [
    'https://lalafo.pl/*',
    'https://*.lalafo.pl/*',
    'https://lalafo.kg/*',
    'https://*.lalafo.kg/*',
    'https://lalafo.az/*',
    'https://*.lalafo.az/*',
    'https://lalafo.rs/*',
    'https://*.lalafo.rs/*',
    'https://lalafo.gr/*',
    'https://*.lalafo.gr/*',
  ],
  content_scripts: [
    {
      matches: [
        'https://lalafo.pl/*',
        'https://*.lalafo.pl/*',
        'https://lalafo.kg/*',
        'https://*.lalafo.kg/*',
        'https://lalafo.az/*',
        'https://*.lalafo.az/*',
        'https://lalafo.rs/*',
        'https://*.lalafo.rs/*',
        'https://lalafo.gr/*',
        'https://*.lalafo.gr/*',
      ],
      js: ['src/content/main.ts'],
      run_at: 'document_idle',
    },
  ],
});

