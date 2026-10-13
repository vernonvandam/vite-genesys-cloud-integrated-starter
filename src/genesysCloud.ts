const PENDING_AUTHORIZATION_KEY = 'genesys-cloud-pkce'

const SUPPORTED_REGIONS = new Set([
  'mypurecloud.com',
  'mypurecloud.ie',
  'mypurecloud.de',
  'mypurecloud.jp',
  'mypurecloud.com.au',
  'mypurecloud.ca',
  'usw2.pure.cloud',
  'use2.pure.cloud',
  'euw2.pure.cloud',
  'euc2.pure.cloud',
  'apne1.pure.cloud',
  'apne2.pure.cloud',
  'apse2.pure.cloud',
  'cac1.pure.cloud',
  'sae1.pure.cloud',
  'mec1.pure.cloud',
])

export type GenesysConfiguration = {
  clientId: string
  redirectURI: string
  region: string
}

export type GenesysUser = {
  id: string
  name?: string
  username?: string
  email?: string
  title?: string
  department?: string
  division?: { name?: string }
}

export type GenesysOrganization = {
  id?: string
  name?: string
  domain?: string
  state?: string
  defaultLanguage?: string
  defaultCountry?: string
}

type PendingAuthorization = {
  state: string
  verifier: string
  configuration: GenesysConfiguration
}

export function getConfigurationFromUrl(location: Location):
  | { configuration: GenesysConfiguration; error: null }
  | { configuration: null; error: string } {
  const query = new URLSearchParams(location.search)
  const clientId = query.get('clientId')?.trim()
  const redirectURI = (query.get('redirectURI') ?? query.get('redirectUri'))?.trim()
  const region = query.get('region')?.trim().toLowerCase()

  if (!clientId || !redirectURI || !region) {
    return {
      configuration: null,
      error: '',
    }
  }
  if (!SUPPORTED_REGIONS.has(region)) {
    return {
      configuration: null,
      error: `Unsupported Genesys Cloud region "${region}". Pass a valid region domain, such as mypurecloud.com or usw2.pure.cloud.`,
    }
  }

  let redirect: URL
  try {
    redirect = new URL(redirectURI)
  } catch {
    return { configuration: null, error: 'The redirectURI must be a valid absolute URL.' }
  }
  const isLocalHttp = redirect.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname)
  if (
    (redirect.protocol !== 'https:' && !isLocalHttp) ||
    redirect.origin !== location.origin ||
    redirect.username !== '' ||
    redirect.password !== ''
  ) {
    return {
      configuration: null,
      error: 'The redirectURI must use HTTPS (HTTP is allowed on localhost) and the same origin as this app.',
    }
  }

  return { configuration: { clientId, redirectURI, region }, error: null }
}

export function getPendingAuthorization(): PendingAuthorization | null {
  const saved = sessionStorage.getItem(PENDING_AUTHORIZATION_KEY)
  if (!saved) return null

  try {
    const parsed: unknown = JSON.parse(saved)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'state' in parsed &&
      typeof parsed.state === 'string' &&
      'verifier' in parsed &&
      typeof parsed.verifier === 'string' &&
      'configuration' in parsed &&
      isConfiguration(parsed.configuration)
    ) {
      return parsed as PendingAuthorization
    }
  } catch {
    clearPendingAuthorization()
    return null
  }

  clearPendingAuthorization()
  return null
}

export function clearPendingAuthorization() {
  sessionStorage.removeItem(PENDING_AUTHORIZATION_KEY)
}

export async function beginAuthorization(configuration: GenesysConfiguration) {
  const verifier = randomUrlSafeString(64)
  const state = randomUrlSafeString(32)
  const challenge = await createCodeChallenge(verifier)
  const pending: PendingAuthorization = { state, verifier, configuration }
  sessionStorage.setItem(PENDING_AUTHORIZATION_KEY, JSON.stringify(pending))

  const authorizeUrl = new URL(`https://login.${configuration.region}/oauth/authorize`)
  authorizeUrl.search = new URLSearchParams({
    client_id: configuration.clientId,
    redirect_uri: configuration.redirectURI,
    response_type: 'code',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  }).toString()
  window.location.assign(authorizeUrl)
}

export async function completeAuthorization(code: string, pending: PendingAuthorization): Promise<string> {
  const response = await fetch(`https://login.${pending.configuration.region}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: pending.configuration.clientId,
      code,
      redirect_uri: pending.configuration.redirectURI,
      code_verifier: pending.verifier,
    }),
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status} ${response.statusText}). Check the OAuth client, redirect URI, and Genesys region.`)
  }

  const tokenResponse: unknown = await response.json()
  if (
    typeof tokenResponse !== 'object' ||
    tokenResponse === null ||
    !('access_token' in tokenResponse) ||
    typeof tokenResponse.access_token !== 'string'
  ) {
    throw new Error('Genesys Cloud returned an invalid token response.')
  }
  return tokenResponse.access_token
}

export async function getCurrentGenesysDetails(configuration: GenesysConfiguration, accessToken: string) {
  const apiRoot = `https://api.${configuration.region}/api/v2`
  const headers = { Authorization: `Bearer ${accessToken}` }
  const userResponse = await fetch(`${apiRoot}/users/me`, { headers })

  if (!userResponse.ok) {
    throw new Error(`Could not load your Genesys Cloud user profile (${userResponse.status} ${userResponse.statusText}). Verify the OAuth client has the users:readonly scope.`)
  }

  const user = await userResponse.json() as GenesysUser
  if (!user.id || (!user.name && !user.username)) {
    throw new Error('Genesys Cloud returned an incomplete user profile.')
  }

  try {
    const organizationResponse = await fetch(`${apiRoot}/organizations/me`, { headers })
    if (!organizationResponse.ok) {
      return {
        user,
        organization: null,
        organizationError: `Organization details could not be loaded (${organizationResponse.status} ${organizationResponse.statusText}). Verify the OAuth client has the organizations:readonly scope.`,
      }
    }
    return {
      user,
      organization: await organizationResponse.json() as GenesysOrganization,
      organizationError: '',
    }
  } catch (error: unknown) {
    return {
      user,
      organization: null,
      organizationError: error instanceof Error
        ? `Organization details could not be loaded: ${error.message}`
        : 'Could not load Genesys Cloud organization details.',
    }
  }
}

export function getUserInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function isConfiguration(value: unknown): value is GenesysConfiguration {
  return (
    typeof value === 'object' &&
    value !== null &&
    'clientId' in value &&
    typeof value.clientId === 'string' &&
    'redirectURI' in value &&
    typeof value.redirectURI === 'string' &&
    'region' in value &&
    typeof value.region === 'string' &&
    SUPPORTED_REGIONS.has(value.region)
  )
}

function randomUrlSafeString(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return encodeBase64Url(bytes)
}

async function createCodeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return encodeBase64Url(new Uint8Array(digest))
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
