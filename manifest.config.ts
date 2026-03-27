import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Lalafo DX Assist',
  description: 'QA toolkit for Lalafo domains: dark mode auditing and developer helpers.',
  version: '0.1.0',
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
    'https://*.lalafo.pl/*',
    'https://*.lalafo.kg/*',
    'https://*.lalafo.az/*',
    'https://*.lalafo.rs/*',
    'https://*.lalafo.gr/*',
  ],
});

