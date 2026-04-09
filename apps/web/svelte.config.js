import adapter from '@sveltejs/adapter-static';

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
