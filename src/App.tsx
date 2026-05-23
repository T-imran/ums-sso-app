import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type AppRoute = 'login' | 'console'
type ClientAppId = 'ums-admin-app' | 'lms-app'

type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_expires_in: number
  refresh_token: string
  token_type: string
  'not-before-policy': number
  session_state: string
  scope: string
}

type AuthSession = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  sessionState: string
  scope: string
  requestedClientId: string | null
}

type ApiError = {
  message: string
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8081/iam-admin-service'
const APP_SESSION_STORAGE_KEY = 'ums-auth-session'
const CLIENT_APP_CONFIG: Record<
  ClientAppId,
  {
    label: string
    redirectUri: string
  }
> = {
  'ums-admin-app': {
    label: 'UMS Admin App',
    redirectUri: 'http://localhost:5174/auth/callback',
  },
  'lms-app': {
    label: 'LMS App',
    redirectUri: 'http://localhost:5175/auth/callback',
  },
}

const initialLoginForm = {
  username: '',
  password: '',
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() => getCurrentRoute())
  const [session, setSession] = useState<AuthSession | null>(() => readSession(APP_SESSION_STORAGE_KEY))
  const [loginForm, setLoginForm] = useState(initialLoginForm)
  const [selectedClientId, setSelectedClientId] = useState<ClientAppId>(() => getInitialClientId())
  const [message, setMessage] = useState<string | null>(null)
  const [loadingLogin, setLoadingLogin] = useState(false)

  useEffect(() => {
    const syncRoute = () => setRoute(getCurrentRoute())

    syncRoute()
    window.addEventListener('popstate', syncRoute)

    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  useEffect(() => {
    syncClientSelectionInUrl(selectedClientId)
  }, [selectedClientId])

  const loginHints = getLoginRequestHints(selectedClientId)

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoadingLogin(true)
    setMessage(null)

    try {
      const response = await apiFetch<TokenResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: {
          ...loginForm,
          clientId: loginHints.clientId,
        },
      })

      const nextSession = persistSession(APP_SESSION_STORAGE_KEY, response, loginHints.clientId)
      setSession(nextSession)
      const redirected = redirectAfterLogin({
        username: loginForm.username,
        tokenResponse: response,
        loginHints,
      })

      setMessage(
        redirected
          ? 'Authenticated through the UMS realm.'
          : 'Authenticated successfully, but no redirect target was provided.',
      )
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setLoadingLogin(false)
    }
  }

  const handleLogout = async () => {
    if (session?.refreshToken) {
      try {
        await apiFetch<void>('/api/v1/auth/logout', {
          method: 'POST',
          body: {
            clientId: session.requestedClientId ?? loginHints.clientId,
            refreshToken: session.refreshToken,
          },
        })
      } catch {
        // Local cleanup still happens when backend logout fails.
      }
    }

    window.localStorage.removeItem(APP_SESSION_STORAGE_KEY)
    setSession(null)
    navigateTo('/login')
  }

  if (route === 'login') {
    return (
      <AuthPageShell
        title="Sign in to UMS"
        subtitle="A standalone identity screen for connected applications. Redirect users here whenever an app needs a UMS login."
        badge="UMS Realm Login"
        metaLabel="Client request"
        metaValue={loginHints.clientId}
        sideNote={
          loginHints.redirectUri
            ? `After sign-in, users will return to ${loginHints.redirectUri}.`
            : 'No redirect URI was provided, so successful login goes to the internal UMS console.'
        }
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        form={loginForm}
        onChange={setLoginForm}
        onSubmit={handleLogin}
        message={message}
        loading={loadingLogin}
        submitLabel="Sign In"
        debugInfo={loginHints}
      />
    )
  }

  return (
    <ConsoleShell
      session={session}
      title="UMS application session"
      description="A lightweight landing screen after the standalone tenant login completes."
      onLogout={() => void handleLogout()}
      warning="If an external application redirects here, pass query params like ?client_id=loan-portal&redirect_uri=http://localhost:3000/callback. When redirect_uri is missing, this app now tries to infer the calling app from the browser referrer instead of falling back to the local console."
      debugInfo={loginHints}
    />
  )
}

function AuthPageShell(props: {
  title: string
  subtitle: string
  badge: string
  metaLabel: string
  metaValue: string
  sideNote: string
  selectedClientId: ClientAppId
  onSelectClient: React.Dispatch<React.SetStateAction<ClientAppId>>
  form: typeof initialLoginForm
  onChange: React.Dispatch<React.SetStateAction<typeof initialLoginForm>>
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  message: string | null
  loading: boolean
  submitLabel: string
  debugInfo: ReturnType<typeof getLoginRequestHints>
}) {
  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-logo">
          <img 
            src="https://basis.org.bd/public/images/logo/5f3ccda2cdc18ERA-Logo_New_Final.png" 
            alt="ERA Infotech Logo" 
          />
        </div>

        <h1 className="login-title">Welcome to ERA</h1>
        <p className="login-subtitle">Sign in to your account</p>

        <div className="client-selector" aria-label="Select client application">
          {(
            Object.entries(CLIENT_APP_CONFIG) as Array<
              [ClientAppId, (typeof CLIENT_APP_CONFIG)[ClientAppId]]
            >
          ).map(([clientId, config]) => {
            const isSelected = props.selectedClientId === clientId

            return (
              <button
                key={clientId}
                type="button"
                className={`client-button${isSelected ? ' client-button-selected' : ''}`}
                onClick={() => props.onSelectClient(clientId)}
              >
                {config.label}
              </button>
            )
          })}
        </div>

        <form className="login-form" onSubmit={props.onSubmit}>
          <div className="form-group">
            <label htmlFor="username">
              Username or Email
            </label>
            <input
              id="username"
              value={props.form.username}
              onChange={(event) =>
                props.onChange((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              placeholder="Enter your username"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={props.form.password}
              onChange={(event) =>
                props.onChange((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button className="login-submit" type="submit" disabled={props.loading}>
            {props.loading ? 'Signing in...' : props.submitLabel}
          </button>
        </form>

        {props.message && <p className="login-message">{props.message}</p>}
      </div>
    </div>
  )
}

function ConsoleShell(props: {
  session: AuthSession | null
  title: string
  description: string
  warning: string
  onLogout: () => void
  debugInfo: ReturnType<typeof getLoginRequestHints>
}) {
  if (!props.session) {
    navigateTo('/login')
    return null
  }

  return (
    <div className="console-page">
      <div className="console-card">
        <div className="console-header">
          <div>
            <p className="login-kicker">UMS session</p>
            <h1>{props.title}</h1>
            <p className="console-copy">{props.description}</p>
          </div>
          <button type="button" className="console-logout" onClick={props.onLogout}>
            Logout
          </button>
        </div>

        <div className="console-grid">
          <section className="console-panel">
            <h2>Session</h2>
            <div className="console-list">
              <div>
                <span>Status</span>
                <strong>Authenticated</strong>
              </div>
              <div>
                <span>Access token</span>
                <strong>Available</strong>
              </div>
              <div>
                <span>Refresh token</span>
                <strong>{props.session.refreshToken ? 'Available' : 'Not available'}</strong>
              </div>
              <div>
                <span>Scope</span>
                <strong>{props.session.scope || 'OpenID defaults'}</strong>
              </div>
            </div>
          </section>

          <section className="console-panel">
            <h2>Redirect debug</h2>
            <div className="console-list">
              <div>
                <span>Client ID</span>
                <strong>{props.debugInfo.clientId}</strong>
              </div>
              <div>
                <span>Redirect URI</span>
                <strong>{props.debugInfo.redirectUri ?? 'Missing redirect_uri query param'}</strong>
              </div>
              <div>
                <span>State</span>
                <strong>{props.debugInfo.state ?? 'Missing state query param'}</strong>
              </div>
              <div>
                <span>Referrer origin</span>
                <strong>{props.debugInfo.referrerOrigin ?? 'No browser referrer detected'}</strong>
              </div>
            </div>
          </section>
        </div>

        <section className="console-warning">
          <h2>Integration note</h2>
          <p>{props.warning}</p>
        </section>
      </div>
    </div>
  )
}

function getCurrentRoute(): AppRoute {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'

  switch (pathname) {
    case '/':
    case '/login':
      return 'login'
    case '/console':
      return 'console'
    default:
      return 'login'
  }
}

function navigateTo(path: string) {
  if (window.location.pathname !== path) {
    window.history.replaceState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

function getLoginRequestHints(selectedClientId: ClientAppId) {
  const referrer = getReferrerDetails()
  const clientConfig = CLIENT_APP_CONFIG[selectedClientId]
  const search = new URLSearchParams(window.location.search)

  return {
    clientId: selectedClientId,
    redirectUri: clientConfig.redirectUri,
    state: search.get('state'),
    referrerOrigin: referrer?.origin ?? null,
  }
}

function redirectAfterLogin(options: {
  username: string
  tokenResponse: TokenResponse
  loginHints: ReturnType<typeof getLoginRequestHints>
}) {
  const search = new URLSearchParams(window.location.search)
  const redirectUri = options.loginHints.redirectUri ?? getReferrerCallbackUrl()
  const state = search.get('state')
  const clientId = options.loginHints.clientId

  if (redirectUri) {
    const target = new URL(redirectUri, window.location.origin)
    target.searchParams.set('ums_login', 'success')
    target.searchParams.set('username', options.username)
    target.searchParams.set('access_token', options.tokenResponse.access_token)
    target.searchParams.set('refresh_token', options.tokenResponse.refresh_token)
    target.searchParams.set('token_type', options.tokenResponse.token_type)
    target.searchParams.set('scope', options.tokenResponse.scope ?? '')
    target.searchParams.set('expires_in', String(options.tokenResponse.expires_in ?? 0))
    target.searchParams.set(
      'refresh_expires_in',
      String(options.tokenResponse.refresh_expires_in ?? 0),
    )

    if (clientId) {
      target.searchParams.set('client_id', clientId)
    }

    if (state) {
      target.searchParams.set('state', state)
    }

    window.location.assign(target.toString())
    return true
  }

  return false
}

function getReferrerCallbackUrl() {
  const referrer = getReferrerDetails()

  if (!referrer || referrer.origin === window.location.origin) {
    return null
  }

  return `${referrer.origin}/auth/callback`
}

function getReferrerDetails() {
  if (!document.referrer) {
    return null
  }

  try {
    return new URL(document.referrer)
  } catch {
    return null
  }
}

function getInitialClientId(): ClientAppId {
  const search = new URLSearchParams(window.location.search)
  const requestedClientId = search.get('client_id')

  if (requestedClientId === 'ums-admin-app' || requestedClientId === 'lms-app') {
    return requestedClientId
  }

  return 'ums-admin-app'
}

function syncClientSelectionInUrl(selectedClientId: ClientAppId) {
  const nextUrl = new URL(window.location.href)
  const nextRedirectUri = CLIENT_APP_CONFIG[selectedClientId].redirectUri

  nextUrl.searchParams.set('client_id', selectedClientId)
  nextUrl.searchParams.set('redirect_uri', nextRedirectUri)

  const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

  if (nextPath !== currentPath) {
    window.history.replaceState({}, '', nextPath)
  }
}

function readSession(storageKey: string): AuthSession | null {
  const raw = window.localStorage.getItem(storageKey)

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    window.localStorage.removeItem(storageKey)
    return null
  }
}

function persistSession(storageKey: string, response: TokenResponse, requestedClientId: string | null) {
  const nextSession: AuthSession = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresIn: response.expires_in,
    tokenType: response.token_type,
    sessionState: response.session_state,
    scope: response.scope,
    requestedClientId,
  }

  window.localStorage.setItem(storageKey, JSON.stringify(nextSession))
  return nextSession
}

async function apiFetch<T>(
  path: string,
  options?: {
    method?: string
    token?: string
    body?: unknown
  },
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw await buildApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function buildApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Record<string, unknown>
    const message = body.message

    if (typeof message === 'string' && message.trim().length > 0) {
      return { message }
    }

    return {
      message: `Request failed with status ${response.status}.`,
    }
  } catch {
    return {
      message: `Request failed with status ${response.status}.`,
    }
  }
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = error.message
    if (typeof value === 'string') {
      return value
    }
  }

  return 'Something went wrong while calling the API.'
}

export default App
