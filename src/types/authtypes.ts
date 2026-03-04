export type TwitchAuthTokenValidationResponse = {
    client_id: string
    login: string
    user_id: string
    expires_in: number
    scopes: string[]
}

export type TwitchAuthTokenValidationErrorResponse = {
    status: 401,
    message: string
}

export type TwitchAuthCodeRequest = {
    client_id: string
    redirect_uri: string
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

export type TwitchAuthCode = {
    code: string
    scope: string
    state?: string
}

export function isTwitchAuthCode(obj: TwitchAuthCode): obj is TwitchAuthCode {
    return (
        typeof obj.code === 'string'
        && typeof obj.scope === 'string'
        && (typeof obj.state === 'string' || obj.state === undefined)
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
    )
}

export type TwitchAuthError = {
    error: string
    error_description: string
    state?: string
}

export function isTwitchAuthError(obj: TwitchAuthError): obj is TwitchAuthError {
    return (
        typeof obj.error === 'string'
        && typeof obj.error_description === 'string'
        && (typeof obj.state === 'string' || obj.state === undefined)
    )
}

function isValidHttpsUrl(url: string) {
    let tryUrl
    try {
        tryUrl = new URL(url)
    } catch (e) {
        return false
    }

    return tryUrl.protocol === 'https:'
}

export * as default from './authtypes.js'