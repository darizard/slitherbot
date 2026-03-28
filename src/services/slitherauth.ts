/**********************************************************************************************************************
 * Handles SlitherBot authentication functionality, including access token retrieval and refresh.
 **********************************************************************************************************************/

import { generateSecret } from './secrets.js'
import slithersql from '../db/queries/slitherauth.js'
import { SignJWT, jwtVerify } from 'jose'
import { jwt as jwtConfig, ws as wsConfig } from '../config.js'
import type { SlitherTokenType, AlertsWebSocketAuthInfo } from '../types/authtypes.js'
import type { Response } from 'express'

const SECRETS = new Map<string, Uint8Array>()
SECRETS.set('refresh', new TextEncoder().encode(jwtConfig.refreshSecret))
SECRETS.set('access', new TextEncoder().encode(jwtConfig.accessSecret))
SECRETS.set('alerts', new TextEncoder().encode(wsConfig.alertsSecret))

// Issue an access token based on the provided SlitherBot refresh token
export async function refreshSlitherAccessToken(refreshToken: string): Promise<{ accessToken: string | undefined, userId: string } | undefined> {

    const userId = await verifySlitherToken(refreshToken, 'refresh')
    if(!userId) return

    const accessToken = await signSlitherToken(userId, 'access')

    return { accessToken: accessToken, userId: userId }
}

// Called as a follow-up to a completed twitch User Access Token OAuth flow. Need to add the user
// into the SlitherIDs table if necessary. Afterward, return a JWT containing the payload argument 
// signed with the secret from jwtConfig
export async function registerOrLoginSlitherUser(userId: string): Promise<string | undefined> {

    if(!await slithersql.getAlertsTokenForUser(userId))
    {
        const alertsToken = generateSecret()
        let upsertResult = await slithersql.upsertSlitherTokensForUser(userId, alertsToken)

        // in case of a collision, try again with a small delay
        if(upsertResult === 1062) {
            setTimeout(async () => {
                upsertResult = await slithersql.upsertSlitherTokensForUser(userId, alertsToken)
            }, 250)
        }

        if(upsertResult === 1062) console.error(`Alerts token collision error on slither user upsert attempt during registration or login`)
        if(!upsertResult) console.error(`Error upserting new alerts token into slither auth table for user ${userId}`)
    }
    
    // Signed slither refresh token
    return await signSlitherToken(userId, 'refresh')

}

export async function signSlitherToken(userId: string, tokenType: SlitherTokenType): Promise<string | undefined> {

    const secret = SECRETS.get(tokenType)
    if(!secret) {
        console.error(`Invalid tokenType for signing: ${tokenType}`)
        return
    }

    const maxAge = (() => {
        switch(tokenType) {
            case 'access':
                return '15min' // 15 minute access token
            case 'refresh':
                return '400day' // 400 day refresh token
            case 'alerts':
                return '10min' // 10 minute alerts connection token
            default:
                console.error(`Invalid token type for signing: ${tokenType satisfies never}`)
                return '0sec'
        }
    })()

    return await new SignJWT({ user_id: userId, token_type: tokenType})
                    .setProtectedHeader({alg: 'HS256'})
                    .setIssuedAt()
                    .setExpirationTime(maxAge)
                    .sign(secret)

}

export async function verifySlitherToken(token: string, tokenType: SlitherTokenType): Promise<string | undefined> {

    const secret = SECRETS.get(tokenType)
    if(!secret) {
        console.error(`Invalid tokenType for verification: ${tokenType}`)
        return
    }

    try {

        const jwtVerificationResult = await jwtVerify(token, secret)
        if(jwtVerificationResult.payload.token_type !== tokenType) 
            { throw new Error(`Token type mismatch. Token type expected: ${tokenType}; token type received: ${jwtVerificationResult.payload.token_type}`) }

        return jwtVerificationResult.payload.user_id as string

    } catch (err) {

        return

    }

}

export function addSlitherTokenCookie(res: Response, token: string | undefined, tokenType: SlitherTokenType): void {

    let maxAge: number
    let cookieKey: string

    switch(tokenType) {
        case 'access':
            cookieKey = 'access_token'
            maxAge = 1000 * 60 * 15 // 15 minutes
            break
        case 'refresh':
            cookieKey = 'refresh_token'
            maxAge = 1000 * 60 * 60 * 24 * 400 // 400 days
            break
        case 'alerts': // don't use cookies for alerts tokens
            cookieKey = ''
            maxAge = 0
            break
        default:
            cookieKey = ''
            maxAge = 0
            console.error(`Invalid token type requested for cookie issuance: ${tokenType satisfies never}`)
    }

    res.cookie(cookieKey, token, { 
        
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: maxAge

    })

}

// If user found for the provided alerts token in the 'Token' URL query parameter, returns a signed JWT with payload
// {userId = SlitherIDs.twitch_id, tokenType = 'alerts'}
export async function verifyAlertsConnectionToken(paramToken: string): Promise<string | undefined> {

    const user_id = await slithersql.getUserIDForAlertsToken(paramToken)
    if(!user_id) return

    return await signSlitherToken(user_id, 'alerts')

}

function rotateSlitherRefreshToken(token: string): string {

    return ''

}

export * as default from './slitherauth.js'