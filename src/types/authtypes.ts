export type SlitherTokenType = 'access' | 'refresh' | 'alerts'

export type SlitherNewUser = {
    twitch_id: string,
    refresh_token: string,
    alerts_token: string
}

export type TwitchAuthAppTokenValidationResponse = {
    client_id: string
    scopes: null
    expires_in: number
}

export function isTwitchAuthAppTokenValidationResponse(obj: any): obj is TwitchAuthAppTokenValidationResponse {
    return (
        typeof obj.client_id === 'string'
        && obj.scopes === null
        && typeof obj.expires_in === 'number'
    )
}

export type TwitchAuthUserTokenValidationResponse = {
    client_id: string
    login: string
    user_id: string
    expires_in: number
    scopes: string[]
}

export function isTwitchAuthUserTokenValidationResponse(obj: any): obj is TwitchAuthUserTokenValidationResponse {
    return (
        typeof obj.client_id === 'string'
        && typeof obj.login === 'string'
        && typeof obj.user_id === 'string'
        && typeof obj.expires_in === 'number'
        && Array.isArray(obj.scopes)
        && obj.scopes.every((item: string) => typeof item === 'string')
    )
}

export type TwitchAuthTokenValidationErrorResponse = {
    status: 401,
    message: string
}

export function isTwitchAuthTokenValidationErrorResponse(obj: TwitchAuthTokenValidationErrorResponse | undefined): obj is TwitchAuthTokenValidationErrorResponse {
    if(!obj) return false
    return (
        obj.message.toLowerCase() === 'invalid access token'
        && obj.status === 401
    )
}

export type TwitchAuthCodeRequest = {
    client_id: string
    redirect_uri: URL
    response_type: 'code'
    scope: string
    state?: string
}

export function isTwitchAuthCodeRequest(obj: TwitchAuthCodeRequest): obj is TwitchAuthCodeRequest {
    return (
        typeof obj.client_id === 'string'
        && isValidHttpsUrl(obj.redirect_uri)
        && obj.response_type === 'code'
        && typeof obj.scope === 'string'
        && (typeof obj.state === 'string' || obj.state === undefined)
    )
}

export type TwitchAuthUserTokenRequest = {
    client_id: string
    client_secret: string
    code: string
    grant_type: 'authorization_code'
    redirect_uri: string
}

export function isTwitchAuthUserTokenRequest(obj: TwitchAuthUserTokenRequest): obj is TwitchAuthUserTokenRequest {
    return (
        typeof obj.client_id === 'string'
        && typeof obj.client_secret === 'string'
        && typeof obj.code === 'string'
        && obj.grant_type === 'authorization_code'
        && isValidHttpsUrl(obj.redirect_uri)
    )
}

export type TwitchRefreshUserTokenRequest = {
    client_id: string
    client_secret: string
    grant_type: 'refresh_token'
    refresh_token: string
}

export function isTwitchRefreshUserTokenRequest(obj: TwitchRefreshUserTokenRequest): obj is TwitchRefreshUserTokenRequest {
    return (
        typeof obj.client_id === 'string'
        && typeof obj.client_secret === 'string'
        && obj.grant_type === 'refresh_token'
        && typeof obj.refresh_token === 'string'
    )
}

export type TwitchRefreshUserTokenResponse = {
    access_token: string
    refresh_token: string
    scope: string[]
    token_type: 'bearer'
    expires_in: number | undefined
}

export function isTwitchRefreshUserTokenResponse(obj: TwitchRefreshUserTokenResponse): obj is TwitchRefreshUserTokenResponse {
    return (
        typeof obj.access_token === 'string'
        && typeof obj.refresh_token === 'string'
        && Array.isArray(obj.scope)
        && obj.scope.every(item => typeof item === 'string')
        && obj.token_type === 'bearer'
        && (typeof obj.expires_in === 'number' || obj.expires_in === undefined)
    )
}

export type TwitchAuthCode = {
    code: string
    scope: string
    state?: string
}

export function isTwitchAuthCode(obj: any): obj is TwitchAuthCode {
    return (
        typeof obj.code === 'string'
        && typeof obj.scope === 'string'
        && (typeof obj.state === 'string' || obj.state === undefined)
    )
}

export type TwitchAuthAppToken = {
    access_token: string
    expires_in: number
    token_type: 'bearer'
}

export function isTwitchAuthAppToken(obj: any): obj is TwitchAuthAppToken {
    if(!obj) return false
    
    return (
        typeof obj.access_token === 'string'
        && typeof obj.expires_in === 'number'
        && obj.token_type === 'bearer'
    )    
}

export type TwitchAuthUserToken = {
    access_token: string
    expires_in: number
    refresh_token: string
    scope: string[]
    token_type: 'bearer'
}

export function isTwitchAuthUserToken(obj: TwitchAuthUserToken): obj is TwitchAuthUserToken {
    return (
        typeof obj.access_token === 'string'
        && typeof obj.expires_in === 'number'
        && typeof obj.refresh_token === 'string'
        && Array.isArray(obj.scope)
        && obj.scope.every(item => typeof item === 'string')
        && obj.token_type === 'bearer'
    )
}

export type TwitchAuthError = {
    error: string
    error_description: string
    state?: string
}

export function isTwitchAuthError(obj: any): obj is TwitchAuthError {
    return (
        typeof obj.error === 'string'
        && typeof obj.error_description === 'string'
        && (typeof obj.state === 'string' || obj.state === undefined)
    )
}

function isValidHttpsUrl(url: string | URL): boolean {
    
    if(typeof url === 'object' && url instanceof URL) {
        return url.protocol === 'https:'
    }

    let tryUrl
    try {
        tryUrl = new URL(url)
    } catch (e) {
        return false
    }

    return tryUrl.protocol === 'https:'
}

export type AlertsWebSocketAuthInfo = {

    userId: string,
    alertsJwt: string

}

export * as default from './authtypes.js'