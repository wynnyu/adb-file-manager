import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "misans/lib/Normal/MiSansVF.min.css";
import "@fontsource/maple-mono/400.css";
import "@fontsource/maple-mono/500.css";
import "@fontsource/maple-mono/600.css";
import "./index.css";
import App from "./App.tsx";
import { I18nProvider } from "./i18n/index.tsx";
import { queryClient, syncFavicon } from "./lib/index.ts";

syncFavicon();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
