import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { LivePage } from "./pages/LivePage";
import { HistoryPage } from "./pages/HistoryPage";
import { VenuesPage } from "./pages/VenuesPage";
import { VenueDetailPage } from "./pages/VenueDetailPage";
import { UsersPage } from "./pages/UsersPage";
import { PcButtonPage } from "./pages/PcButtonPage";
import { AdsPage } from "./pages/AdsPage";
import { SettingsPage } from "./pages/SettingsPage";

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

const rootRoute = createRootRoute({
  component: RootComponent,
});

function Guarded({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)" }}>
        Carregando…
      </div>
    );
  }
  if (!user) {
    return <LoginPage />;
  }
  if (user.role === "player") {
    return (
      <Shell>
        <HistoryPage />
      </Shell>
    );
  }
  return <Shell>{children}</Shell>;
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <Guarded>
      <LivePage />
    </Guarded>
  ),
});

const historicoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/historico",
  component: () => (
    <Guarded>
      <HistoryPage />
    </Guarded>
  ),
});

const quadrasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/quadras",
  component: () => (
    <Guarded>
      <VenuesPage />
    </Guarded>
  ),
});

const quadraDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/quadras/$venueId",
  component: function QuadraDetail() {
    const { venueId } = quadraDetailRoute.useParams();
    return (
      <Guarded>
        <VenueDetailPage venueId={Number(venueId)} />
      </Guarded>
    );
  },
});

const camerasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cameras",
  beforeLoad: () => {
    throw redirect({ to: "/quadras" });
  },
});

const usuariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usuarios",
  component: () => (
    <Guarded>
      <UsersPage />
    </Guarded>
  ),
});

const devicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/devices",
  beforeLoad: () => {
    throw redirect({ to: "/quadras" });
  },
});

const botaoPcRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/botao-pc",
  component: () => (
    <Guarded>
      <PcButtonPage />
    </Guarded>
  ),
});

const propagandaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/propaganda",
  component: () => (
    <Guarded>
      <AdsPage />
    </Guarded>
  ),
});

const configuracoesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/configuracoes",
  component: () => (
    <Guarded>
      <SettingsPage />
    </Guarded>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => {
    if (localStorage.getItem("token")) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  historicoRoute,
  quadrasRoute,
  quadraDetailRoute,
  camerasRoute,
  usuariosRoute,
  devicesRoute,
  botaoPcRoute,
  propagandaRoute,
  configuracoesRoute,
  loginRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5_000 },
  },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
