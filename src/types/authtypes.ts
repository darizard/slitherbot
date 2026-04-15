import { Request } from 'express';

export interface SlitherAuthRequest extends Request {
    twitchId?: string;
}

export type SlitherTokenType = 'access' | 'refresh' | 'alerts'

export type TwitchAuthAppTokenValidationResponse = {
    client_id: string
    scopes: null
    expires_in: number
}

// When validating an app access token, Twitch returns { client_id: string, scopes: null, expires_in: number } in the response body
export function isTwitchAuthAppTokenValidationResponse(obj: unknown): obj is TwitchAuthAppTokenValidationResponse {
    return (
        typeof obj === 'object' && obj !== null
        && 'client_id' in obj && typeof obj.client_id === 'string'
        && 'scopes' in obj && obj.scopes === null
        && 'expires_in' in obj && typeof obj.expires_in === 'number'
    )
}

export type TwitchAuthUserTokenValidationResponse = {
    client_id: string
    login: string
    user_id: string
    expires_in: number
    scopes: string[]
}

export function isTwitchAuthUserTokenValidationResponse(obj: unknown): obj is TwitchAuthUserTokenValidationResponse {
    return (
        typeof obj === 'object' && obj !== null
        && 'client_id' in obj && typeof obj.client_id === 'string'
        && 'login' in obj && typeof obj.login === 'string'
        && 'user_id' in obj && typeof obj.user_id === 'string'
        && 'expires_in' in obj && typeof obj.expires_in === 'number'
        && 'scopes' in obj && Array.isArray(obj.scopes)
        && obj.scopes.every((item: string) => typeof item === 'string')
    )
}

export type TwitchAuthTokenValidationErrorResponse = {
    status: 401,
    message: string
}

export function isTwitchAuthTokenValidationErrorResponse(obj: unknown): obj is TwitchAuthTokenValidationErrorResponse {
    return (
        typeof obj === 'object' && obj != null
        && 'message' in obj && typeof obj.message === 'string' 
        && obj.message.toLowerCase() === 'invalid access token'
        && 'status' in obj && obj.status === 401
    )
}

export type TwitchAuthCodeRequest = {
    client_id: string
    redirect_uri: URL
    response_type: 'code'
    scope: string
    state?: string
}

export function isTwitchAuthCodeRequest(obj: unknown): obj is TwitchAuthCodeRequest {
    return (
        typeof obj === 'object' && obj !== null
        && 'client_id' in obj && typeof obj.client_id === 'string'
        && 'redirect_uri' in obj && typeof obj.redirect_uri === 'string' && isValidHttpsUrl(obj.redirect_uri)
        && 'response_type' in obj &&  obj.response_type === 'code'
        && 'scope' in obj && typeof obj.scope === 'string'
        && 'state' in obj && (typeof obj.state === 'string' || obj.state === undefined)
    )
}

export type TwitchAuthUserTokenRequest = {
    client_id: string
    client_secret: string
    code: string
    grant_type: 'authorization_code'
    redirect_uri: string
}

export function isTwitchAuthUserTokenRequest(obj: unknown): obj is TwitchAuthUserTokenRequest {
    return (
        typeof obj === 'object' && obj !== null
        && 'client_id' in obj && typeof obj.client_id === 'string'
        && 'client_secret' in obj && typeof obj.client_secret === 'string'
        && 'code' in obj && typeof obj.code === 'string'
        && 'grant_type' in obj && obj.grant_type === 'authorization_code'
        && 'redirect_uri' in obj && typeof obj.redirect_uri === 'string' && isValidHttpsUrl(obj.redirect_uri)
    )
}

export type TwitchRefreshUserTokenRequest = {
    client_id: string
    client_secret: string
    grant_type: 'refresh_token'
    refresh_token: string
}

export function isTwitchRefreshUserTokenRequest(obj: unknown): obj is TwitchRefreshUserTokenRequest {
    return (
        typeof obj === 'object' && obj !== null
        && 'client_id' in obj && typeof obj.client_id === 'string'
        && 'client_secret' in obj && typeof obj.client_secret === 'string'
        && 'grant_type' in obj && obj.grant_type === 'refresh_token'
        && 'refresh_token' in obj && typeof obj.refresh_token === 'string'
    )
}

export type TwitchRefreshUserTokenResponse = {
    access_token: string
    refresh_token: string
    scope: string[]
    token_type: 'bearer'
    expires_in: number | undefined
}

export function isTwitchRefreshUserTokenResponse(obj: unknown): obj is TwitchRefreshUserTokenResponse {
    return (
        typeof obj === 'object' && obj !== null
        && 'access_token' in obj && typeof obj.access_token === 'string'
        && 'refresh_token' in obj && typeof obj.refresh_token === 'string'
        && 'scope' in obj && Array.isArray(obj.scope) && obj.scope.every(item => typeof item === 'string')
        && 'token_type' in obj && obj.token_type === 'bearer'
        && 'expires_in' in obj && (typeof obj.expires_in === 'number' || obj.expires_in === undefined)
    )
}

export type TwitchAuthCode = {
    code: string
    scope: string
    state?: string
}

export function isTwitchAuthCode(obj: unknown): obj is TwitchAuthCode {
    return (
        typeof obj === 'object' && obj !== null
        && 'code' in obj && typeof obj.code === 'string'
        && 'scope' in obj && typeof obj.scope === 'string'
        && 'state' in obj && (typeof obj.state === 'string' || obj.state === undefined)
    )
}

export type TwitchAuthAppToken = {
    access_token: string
    expires_in: number
    token_type: 'bearer'
}

export function isTwitchAuthAppToken(obj: unknown): obj is TwitchAuthAppToken {
    if(!obj) return false
    
    return (
        typeof obj === 'object' && obj !== null
        && 'access_token' in obj && typeof obj.access_token === 'string'
        && 'expires_in' in obj && typeof obj.expires_in === 'number'
        && 'token_type' in obj && obj.token_type === 'bearer'
    )    
}

export type TwitchAuthUserToken = {
    access_token: string
    expires_in: number
    refresh_token: string
    scope: string[]
    token_type: 'bearer'
}

export function isTwitchAuthUserToken(obj: unknown): obj is TwitchAuthUserToken {
    return (
        typeof obj === 'object' && obj !== null
        && 'access_token' in obj && typeof obj.access_token === 'string'
        && 'expires_in' in obj && typeof obj.expires_in === 'number'
        && 'refresh_token' in obj && typeof obj.refresh_token === 'string'
        && 'scope' in obj && Array.isArray(obj.scope) && obj.scope.every(item => typeof item === 'string')
        && 'token_type' in obj && obj.token_type === 'bearer'
    )
}

export type TwitchAuthError = {
    error: string
    error_description: string
    state?: string
}

export function isTwitchAuthError(obj: unknown): obj is TwitchAuthError {
    return (
        typeof obj === 'object' && obj !== null
        && 'error' in obj && typeof obj.error === 'string'
        && 'error_description' in obj && typeof obj.error_description === 'string'
        && 'state' in obj && (typeof obj.state === 'string' || obj.state === undefined)
    )
}

export type AlertsWebSocketAuthInfo = {

    userId: string,
    alertsJwt: string

}

//****************************HELPER FUNCTIONS****************************//
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

export * as default from './authtypes.js'