import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    base: "./",
    server: {
        proxy: {
            "/fpl-api": {
                target: "https://fantasy.premierleague.com",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/fpl-api/, "/api"),
            },
        },
    },
});
