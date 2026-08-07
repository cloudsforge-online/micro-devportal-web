/**
 * The route table.
 *
 * Two facts about it are enforced elsewhere and must stay in agreement with it: `ROUTES` in
 * lib/routes.ts is the declaration the navigation is derived from, and nginx.conf enumerates the
 * same top-level paths so that an address which is NOT here answers 404 rather than 200.
 *
 * ── Which routes are gated is read off the SERVICE, not chosen ────────────────────────────────
 *
 * Two of the four are public because `devplatform` made their routes public: `GET /v1/scopes`
 * (`devplatform/src/server.ts`), `GET /v1/apps` and `GET /v1/apps/:slug`
 * read no credential at all — their handlers take no principal and nothing on their path looks at
 * an `authorization` header. Putting either screen behind `ProtectedRoute` would send a visitor to
 * sign in for a page the service would have served them, which is the same class of mistake as
 * sending a bearer token to a route that never wanted one.
 *
 * The other two authenticate on every route beneath them, so they are gated. **The gate is not the
 * security boundary**: `devplatform` verifies the bearer itself (`devplatform/src/server.ts`),
 * asks identity for the caller's role per request, and answers 404 rather than 403 for an
 * organisation or project the caller may not see.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/scroll-to-top.tsx'
import { AppShell } from './components/shell.tsx'
import { AuthProvider, ProtectedRoute } from './lib/auth.tsx'
import { placementIsKnown } from './lib/hosts.ts'
import { PlatformPage } from './pages/platform.tsx'
import { ApplicationPage, DirectoryPage } from './pages/directory.tsx'
import { OrganisationsPage } from './pages/organisations.tsx'
import { OrganisationPage } from './pages/organisation.tsx'
import { ProjectOverviewPage, ProjectShell } from './pages/project.tsx'
import { KeysPage } from './pages/keys.tsx'
import { WebhooksPage } from './pages/webhooks.tsx'
import { OAuthPage } from './pages/oauth.tsx'
import { UsagePage } from './pages/usage.tsx'
import { NotFoundPage } from './pages/not-found.tsx'

export function App() {
  const unregistered = !placementIsKnown()

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <Routes>
          <Route element={<AppShell unregistered={unregistered} />}>
            {/* Public: the scope vocabulary is what somebody deciding whether to build here reads. */}
            <Route index element={<PlatformPage />} />

            {/* Public: the directory and one listing. */}
            <Route path="apps" element={<DirectoryPage />} />
            <Route path="apps/:slug" element={<ApplicationPage />} />

            <Route
              path="organisations"
              element={
                <ProtectedRoute>
                  <OrganisationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="organisations/:id"
              element={
                <ProtectedRoute>
                  <OrganisationPage />
                </ProtectedRoute>
              }
            />

            {/* One project, five sections. The shell fetches the project once and the sections
                fetch their own resource, so seeing a key list does not wait on the delivery log. */}
            <Route
              path="projects/:id"
              element={
                <ProtectedRoute>
                  <ProjectShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<ProjectOverviewPage />} />
              <Route path="keys" element={<KeysPage />} />
              <Route path="webhooks" element={<WebhooksPage />} />
              <Route path="oauth" element={<OAuthPage />} />
              <Route path="usage" element={<UsagePage />} />
            </Route>

            {/* Unknown paths render inside the shell, so the reader keeps the navigation they need
                to get back out — under a real 404, which nginx.conf preserves. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
