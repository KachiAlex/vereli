import {
  defineKiteConfig,
  kiteBadgeInjector,
} from '@appsmithorg/template-frontend/vite';

export default defineKiteConfig(({ env }) => ({
  plugins: [kiteBadgeInjector({ disabled: true, appId: env.VITE_APP_ID })],
}));
