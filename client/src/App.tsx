import { lazy, Suspense } from "react";
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  Link,
  useLocation,
} from "react-router-dom";
import { useAuth } from "./lib/auth";
import type { Role } from "./lib/types";
import { CustomerLayout, StaffLayout } from "./components/layouts";
import { Brand, Button, ErrorMessage } from "./components/ui";
const AuthPage = lazy(() =>
  import("./features/auth/AuthPage").then((m) => ({ default: m.AuthPage })),
);
const CustomerDashboard = lazy(() =>
  import("./features/customer/CustomerDashboard").then((m) => ({
    default: m.CustomerDashboard,
  })),
);
const BookingPage = lazy(() =>
  import("./features/customer/BookingPage").then((m) => ({
    default: m.BookingPage,
  })),
);
const ProfilePage = lazy(() =>
  import("./features/customer/ProfilePage").then((m) => ({
    default: m.ProfilePage,
  })),
);
const AdminPage = lazy(() =>
  import("./features/staff/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const BarberPage = lazy(() =>
  import("./features/staff/BarberPage").then((m) => ({
    default: m.BarberPage,
  })),
);
export function Loading() {
  return (
    <div className="loading-screen">
      <Brand />
      <p role="status">Preparando seu momento…</p>
    </div>
  );
}
function home(role: Role) {
  return role === "admin" ? "/admin" : role === "barber" ? "/barbeiro" : "/";
}
function Guard({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  return !user ? (
    <Navigate to="/login" replace />
  ) : !roles.includes(user.role) ? (
    <Navigate to={home(user.role)} replace />
  ) : (
    <Outlet />
  );
}
function PublicAuth() {
  const { user } = useAuth();
  return user ? <Navigate to={home(user.role)} replace /> : <AuthPage />;
}
function BookingRoute() {
  const location = useLocation();
  return <BookingPage key={location.key} />;
}
function NotFound() {
  return (
    <div className="loading-screen">
      <Brand />
      <h1>Página não encontrada</h1>
      <p>Volte ao início para continuar.</p>
      <Link to="/" className="button button-primary">
        Voltar ao início
      </Link>
    </div>
  );
}
export default function App() {
  const { user, loading, error, refresh } = useAuth();
  if (loading) return <Loading />;
  if (error)
    return (
      <div className="loading-screen">
        <Brand />
        <ErrorMessage message={error} />
        <Button onClick={() => void refresh()}>Tentar novamente</Button>
      </div>
    );
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {["/login", "/cadastro"].map((path) => (
          <Route key={path} path={path} element={<PublicAuth />} />
        ))}
        {["/recuperar", "/redefinir"].map((path) => (
          <Route key={path} path={path} element={<AuthPage />} />
        ))}
        <Route element={<Guard roles={["client"]} />}>
          <Route element={<CustomerLayout />}>
            <Route path="/" element={<CustomerDashboard />} />
            <Route path="/agendar" element={<BookingRoute />} />
          </Route>
        </Route>
        <Route element={<Guard roles={["admin", "barber"]} />}>
          <Route element={<StaffLayout />}>
            <Route
              path="/admin/*"
              element={
                user?.role === "admin" ? (
                  <AdminPage />
                ) : (
                  <Navigate to="/barbeiro" replace />
                )
              }
            />
            <Route
              path="/barbeiro/*"
              element={
                user?.role === "barber" ? (
                  <BarberPage />
                ) : (
                  <Navigate to="/admin" replace />
                )
              }
            />
          </Route>
        </Route>
        <Route element={<Guard roles={["client", "admin", "barber"]} />}>
          <Route
            element={
              user?.role === "client" ? <CustomerLayout /> : <StaffLayout />
            }
          >
            <Route path="/perfil" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={!user ? <Navigate to="/login" replace /> : <NotFound />}
        />
      </Routes>
    </Suspense>
  );
}
