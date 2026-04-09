import adapter from '@sveltejs/adapter-auto';

const config = {
  kit: {
    adapter: adapter(),
    alias: {
      '@booger/shared': '../../packages/shared/src',
      '@booger/game': '../../packages/game/src'
    }
  }
};

export default config;
