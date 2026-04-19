import { useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { setAuth, clearAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import InvoicesPage from "@/pages/InvoicesPage";
import InvoiceDetailPage from "@/pages/InvoiceDetailPage";
import NewInvoicePage from "@/pages/NewInvoicePage";
import CategoriesPage from "@/pages/CategoriesPage";
import AdminPage from "@/pages/AdminPage";
import LoginPage from "@/pages/LoginPage";
import RecipesPage from "@/pages/RecipesPage";
import RecipeFormPage from "@/pages/RecipeFormPage";
import RecipeDetailPage from "@/pages/RecipeDetailPage";
import NotFound from "@/pages/not-found";

interface AuthState {
  token: string;
  isAdmin: boolean;
  restaurantId: number | null;
  restaurantName: string | null;
}

export default function App() {
  const [auth, setAuthState] = useState<AuthState | null>(null);

  function handleLogin(token: string, isAdmin: boolean, restaurantId: number | null, restaurantName: string | null) {
    setAuth(token, isAdmin, restaurantId, restaurantName);
    setAuthState({ token, isAdmin, restaurantId, restaurantName });
    queryClient.clear();
  }

  function handleLogout() {
    clearAuth();
    setAuthState(null);
    queryClient.clear();
  }

  if (!auth) {
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
          <Layout
            restaurantName={auth.restaurantName}
            isAdmin={auth.isAdmin}
            onLogout={handleLogout}
          >
            <Switch>
              <Route path="/" component={InvoicesPage} />
              <Route path="/invoices/new" component={NewInvoicePage} />
              <Route path="/invoices/:id" component={InvoiceDetailPage} />
              <Route path="/categories" component={CategoriesPage} />
              <Route path="/recipes" component={RecipesPage} />
              <Route path="/recipes/new" component={RecipeFormPage} />
              <Route path="/recipes/:id/edit" component={RecipeFormPage} />
              <Route path="/recipes/:id" component={RecipeDetailPage} />
              {auth.isAdmin && <Route path="/admin" component={AdminPage} />}
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </Router>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
