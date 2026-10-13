import { useEffect, useRef, useState } from 'react'
import {
  beginAuthorization,
  completeAuthorization,
  getConfigurationFromUrl,
  getCurrentGenesysDetails,
  getPendingAuthorization,
  getUserInitials,
  clearPendingAuthorization,
  type GenesysConfiguration,
  type GenesysOrganization,
  type GenesysUser,
} from './genesysCloud'
import './App.css'

type ViewState = 'ready' | 'authorizing' | 'loading' | 'connected'

function App() {
  const started = useRef(false)
  const [initialState] = useState(() => {
    const callback = new URL(window.location.href)
    const code = callback.searchParams.get('code')
    const oauthError = callback.searchParams.get('error')
    const hasCallback = Boolean(code || oauthError)
    const pending = hasCallback ? getPendingAuthorization() : null
    const result = getConfigurationFromUrl(window.location)
    const validCallback = Boolean(code && pending && callback.searchParams.get('state') === pending.state)
    const error = oauthError
      ? callback.searchParams.get('error_description') ?? `Genesys Cloud authorization failed: ${oauthError}`
      : code && !validCallback
        ? 'The sign-in response could not be verified. Please start the login again.'
        : result.error

    return {
      configuration: result.configuration ?? pending?.configuration ?? null,
      error,
      hasCallback,
      pending,
      validCallback,
    }
  })
  const [configuration] = useState<GenesysConfiguration | null>(initialState.configuration)
  const [user, setUser] = useState<GenesysUser | null>(null)
  const [organization, setOrganization] = useState<GenesysOrganization | null>(null)
  const [viewState, setViewState] = useState<ViewState>(initialState.validCallback ? 'authorizing' : 'ready')
  const [error, setError] = useState(initialState.error)
  const [organizationError, setOrganizationError] = useState('')

  useEffect(() => {
    if (started.current) return
    started.current = true

    if (!initialState.hasCallback) return

    const callback = new URL(window.location.href)
    const code = callback.searchParams.get('code')
    const oauthError = callback.searchParams.get('error')
    const pending = initialState.pending
    callback.searchParams.delete('code')
    callback.searchParams.delete('state')
    callback.searchParams.delete('error')
    callback.searchParams.delete('error_description')
    callback.searchParams.delete('iss')
    window.history.replaceState({}, document.title, callback)

    if (oauthError) {
      clearPendingAuthorization()
      return
    }

    if (!code || !pending || !initialState.validCallback) {
      clearPendingAuthorization()
      return
    }

    void completeAuthorization(code, pending)
      .then(async (accessToken) => {
        clearPendingAuthorization()
        setViewState('loading')
        const details = await getCurrentGenesysDetails(pending.configuration, accessToken)
        setUser(details.user)
        setOrganization(details.organization)
        setOrganizationError(details.organizationError)
        setViewState('connected')
      })
      .catch((reason: unknown) => {
        clearPendingAuthorization()
        setViewState('ready')
        setError(reason instanceof Error ? reason.message : 'Genesys Cloud sign-in failed.')
      })
  }, [initialState])

  async function handleConnect() {
    if (!configuration) return
    setError('')
    setViewState('authorizing')
    try {
      await beginAuthorization(configuration)
    } catch (reason: unknown) {
      setViewState('ready')
      setError(reason instanceof Error ? reason.message : 'Unable to start Genesys Cloud sign-in.')
    }
  }

  function handleDisconnect() {
    setUser(null)
    setOrganization(null)
    setOrganizationError('')
    setViewState('ready')
    setError('')
    clearPendingAuthorization()
  }

  const isBusy = viewState === 'authorizing' || viewState === 'loading'
  const displayName = user?.name || user?.username || 'Genesys Cloud user'

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Genesys Cloud starter home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>cloud<span className="brand-light">connect</span></span>
        </a>
        <div className="topbar-meta">
          <span className="starter-label">INTEGRATION STARTER</span>
          <span className={`connection-pill ${viewState === 'connected' ? 'is-connected' : ''}`}>
            <span className="status-dot" />
            {viewState === 'connected' ? 'Connected' : 'Not connected'}
          </span>
        </div>
      </header>

      <main className="main-content">
        <section className="intro">
          <div className="intro-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> YOUR GENESYS CLOUD WORKSPACE</p>
            <h1>Hello, <span>world.</span></h1>
            <p className="intro-description">
              Your starting point for building with Genesys Cloud. Connect securely to see your
              profile and organization details.
            </p>
          </div>
          <div className="intro-art" aria-hidden="true">
            <div className="orbit orbit-outer" />
            <div className="orbit orbit-inner" />
            <div className="orbit-core"><span>GC</span></div>
            <span className="orbit-node node-one" />
            <span className="orbit-node node-two" />
            <span className="orbit-node node-three" />
          </div>
        </section>

        <section className="workspace">
          <div className="section-heading">
            <div>
              <p className="eyebrow">OVERVIEW</p>
              <h2>Your connection</h2>
            </div>
            {configuration && (
              <span className="region-badge">
                <span className="region-icon">◎</span>
                {configuration.region}
              </span>
            )}
          </div>

          {error && (
            <div className="notice notice-error" role="alert">
              <span className="notice-icon">!</span>
              <span>{error}</span>
            </div>
          )}

          {viewState === 'connected' && user ? (
            <div className="details-grid">
              <article className="info-card user-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">SIGNED IN AS</p>
                    <h3>Your profile</h3>
                  </div>
                  <span className="card-icon user-icon" aria-hidden="true">♙</span>
                </div>
                <div className="profile-summary">
                  <div className="avatar">{getUserInitials(displayName)}</div>
                  <div className="profile-name">
                    <strong>{displayName}</strong>
                    <span>{user.title || user.email || 'Genesys Cloud user'}</span>
                  </div>
                  <span className="verified-badge" aria-label="Authenticated">✓</span>
                </div>
                <dl className="detail-list">
                  <Detail label="Email" value={user.email} />
                  <Detail label="Username" value={user.username} />
                  <Detail label="Department" value={user.department} />
                  <Detail label="Division" value={user.division?.name} />
                  <Detail label="User ID" value={user.id} />
                </dl>
              </article>

              <article className="info-card organization-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">GENESYS CLOUD</p>
                    <h3>Organization</h3>
                  </div>
                  <span className="card-icon org-icon" aria-hidden="true">⌂</span>
                </div>
                {organization ? (
                  <>
                    <div className="org-summary">
                      <div className="org-avatar" aria-hidden="true">G</div>
                      <div className="profile-name">
                        <strong>{organization.name || 'Genesys Cloud organization'}</strong>
                        <span>{organization.domain || 'Organization details'}</span>
                      </div>
                      {organization.state && <span className="org-state">{organization.state}</span>}
                    </div>
                    <dl className="detail-list">
                      <Detail label="Organization ID" value={organization.id} />
                      <Detail label="Domain" value={organization.domain} />
                      <Detail label="Default language" value={organization.defaultLanguage} />
                      <Detail label="Default country" value={organization.defaultCountry} />
                    </dl>
                  </>
                ) : (
                  <div className="empty-organization">
                    <span className="empty-symbol">⌂</span>
                    <p>{organizationError || 'Organization details are not available.'}</p>
                    <span>The user profile connected successfully.</span>
                  </div>
                )}
              </article>

              <div className="connected-footer">
                <span><span className="status-dot" /> Secure session active</span>
                <button className="text-button" onClick={handleDisconnect}>Disconnect</button>
              </div>
            </div>
          ) : (
            <div className="connect-panel">
              <div className="connect-panel-main">
                <span className={`connect-icon ${isBusy ? 'is-loading' : ''}`} aria-hidden="true">
                  {isBusy ? <span className="spinner" /> : <ConnectGlyph />}
                </span>
                <div className="connect-copy">
                  <h3>{isBusy ? (viewState === 'loading' ? 'Loading your workspace' : 'Connecting to Genesys Cloud') : 'Connect your Genesys Cloud account'}</h3>
                  <p>
                    {isBusy
                      ? 'A secure PKCE sign-in is in progress. This usually takes just a moment.'
                      : 'Sign in with OAuth 2.0 Authorization Code + PKCE. Your access token stays in memory and is never saved to local storage.'}
                  </p>
                  {!configuration && !error && (
                    <p className="config-hint">
                      Add <code>clientId</code>, <code>redirectURI</code>, and <code>region</code> to this page’s URL to get started.
                    </p>
                  )}
                </div>
                <button
                  className="connect-button"
                  type="button"
                  onClick={handleConnect}
                  disabled={!configuration || isBusy}
                >
                  {isBusy ? 'Please wait' : 'Connect account'}
                  {!isBusy && <span aria-hidden="true">↗</span>}
                </button>
              </div>
              <div className="connect-panel-foot">
                <span><span className="lock-icon">⌑</span> OAuth 2.0 · PKCE (S256)</span>
                <span>Credentials stay in your browser</span>
              </div>
            </div>
          )}

          <div className="setup-note">
            <span className="setup-sparkle" aria-hidden="true">✳</span>
            <p><strong>Built for your Genesys Cloud org.</strong> Create a public OAuth client with the Authorization Code grant and PKCE enabled, then allow the app’s redirect URI.</p>
            <span className="setup-tag">SETUP TIP</span>
          </div>
        </section>
      </main>

      <footer className="page-footer">
        <span>GENESYS CLOUD INTEGRATED STARTER</span>
        <span>Secure by design <span className="footer-separator">·</span> Built with Vite + React</span>
      </footer>
    </div>
  )
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd title={value || undefined}>{value || '—'}</dd>
    </div>
  )
}

function ConnectGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 15.5 6.8 17.2a3.25 3.25 0 0 1-4.6-4.6l4-4a3.25 3.25 0 0 1 4.6 0" />
      <path d="m15.5 8.5 1.7-1.7a3.25 3.25 0 0 1 4.6 4.6l-4 4a3.25 3.25 0 0 1-4.6 0" />
      <path d="m8.5 15.5 7-7" />
    </svg>
  )
}

export default App
