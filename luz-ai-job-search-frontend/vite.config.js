import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const RECRUITMENT_BACKEND_URL = process.env.VITE_RECRUITMENT_BACKEND_URL || "http://example.invalid";
const AI_BACKEND_URL = process.env.VITE_AI_BACKEND_URL || "http://127.0.0.1:8321";
const LOCAL_DEV_AUTH_TOKEN = process.env.DEV_AUTH_PROXY_TOKEN || "";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    proxy: {
      "/api/ai": {
        target: AI_BACKEND_URL,
        changeOrigin: true,
      },
      "/api/resumes": {
        target: AI_BACKEND_URL,
        changeOrigin: true,
      },
      "/api/login/wechat/dev-session": {
        target: AI_BACKEND_URL,
        changeOrigin: true,
        headers: LOCAL_DEV_AUTH_TOKEN
          ? { "X-GQLD-Local-Dev-Token": LOCAL_DEV_AUTH_TOKEN }
          : {},
      },
      "/api/login": {
        target: AI_BACKEND_URL,
        changeOrigin: true,
      },
      "/api/wechat": {
        target: AI_BACKEND_URL,
        changeOrigin: true,
      },
      "/api/campusRecruitment": {
        target: AI_BACKEND_URL,
        changeOrigin: true,
      },
      "/api/internship": {
        target: AI_BACKEND_URL,
        changeOrigin: true,
      },
      "/api/openRecruitment": {
        target: AI_BACKEND_URL,
        changeOrigin: true,
      },
      "/api/recruitment": {
        target: RECRUITMENT_BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
});

