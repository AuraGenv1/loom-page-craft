import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import MyProjects from "./pages/MyProjects";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import Admin from "./pages/Admin";
import FAQ from "./pages/FAQ";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Hard-override: if the auth recovery type is present in the URL hash, force the reset page.
  useEffect(() => {
    const hash = window.location.hash || "";
    // Check for recovery token in hash (Supabase sends #access_token=...&type=recovery)
    if (hash.includes("type=recovery") || hash.includes("type=signup") || hash.includes("type=magiclink")) {
      // Only redirect to reset-password for recovery type
      if (hash.includes("type=recovery")) {
        // Use window.location.replace to ensure a hard redirect
        window.location.replace('/reset-password' + window.location.hash);
        return;
      }
    }
  }, []);

  // Secondary effect to catch any missed recovery redirects
  useEffect(() => {
    const hash = window.location.hash || "";
    if (hash.includes("type=recovery") && location.pathname !== "/reset-password") {
      navigate("/reset-password", { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/book/:bookId" element={<Index />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/my-projects" element={<MyProjects />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admin" element={<Admin />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AppRoutes />
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
