import { defineConfig } from 'vite';

export default defineConfig({
  // 部署子目录路径，按实际部署位置修改（如 '/crazybird/' 或 '/mygame/'）
  base: '/crazybird/',
  build: {
    target: 'es2020',
    cssCodeSplit: false,
  },
});
