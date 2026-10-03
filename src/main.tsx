import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "misans/lib/Normal/MiSansVF.min.css";
import "@fontsource/maple-mono/400.css";
import "@fontsource/maple-mono/500.css";
import "@fontsource/maple-mono/600.css";
import "./index.css";
import App from "./App.tsx";
import { syncFavicon } from "./theme.ts";
import { I18nProvider } from "./i18n/index.tsx";

syncFavicon();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </I18nProvider>
  </StrictMode>,
);
