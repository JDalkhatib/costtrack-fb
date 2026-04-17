import { useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { setAuthToken } from "@/lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import InvoicesPage from "@/pages/InvoicesPage";
import InvoiceDetailPage from "@/pages/InvoiceDetailPage";
import NewInvoicePage from "@/pages/NewInvoicePage";
import CategoriesPage from "@/pages/CategoriesPage";
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/not-found";

export default function App() {
  const [token, setToken] = useState<string | null>(null);

  function handleLogin(newToken: string) {
    setAuthToken(newToken);
    setToken(newToken);
    // Clear any stale cached queries
    queryClient.clear();
  }

  if (!token) {
    return (
      <ThemeProvider>
        <LoginPage onLogin={handleLogin} />
        <Toaster />
      </ThemeProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router hook={useHashLocation}>
          <Layout>
            <Switch>
              <Route path="/" component={InvoicesPage} />
              <Route path="/invoices/new" component={NewInvoicePage} />
              <Route path="/invoices/:id" component={InvoiceDetailPage} />
              <Route path="/categories" component={CategoriesPage} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </Router>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
