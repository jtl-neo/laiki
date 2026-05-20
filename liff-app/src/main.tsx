import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { initLiff } from "./liff";
import "./index.css";

const queryClient = new QueryClient();

initLiff()
  .catch((e) => console.error("LIFF init failed:", e))
  .finally(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename="/laiki">
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </StrictMode>,
    );
  });
