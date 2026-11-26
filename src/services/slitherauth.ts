/**********************************************************************************************************************
 * Handles SlitherBot authentication functionality, including access token retrieval and refresh.
 **********************************************************************************************************************/

import type { Response } from 'express'
import fs from 'fs'
import { SignJWT, jwtVerify } from 'jose'

import { appConfig } from '../config.js'

import { createAlertsToken } from './eventalertsclient.js'
import { subToEvent } from './eventsubclient.js'
import { getSecret } from './secrets.js'
import { fetchTwitchUAT, registerTwitchUser, validateTwitchUAT } from './twitchauth.js'

import { SlitherEventSub } from '../classes/eventsub.js'

import type { SlitherTokenType } from '../types/authtypes.js'

import slitherauthsql from '../db/queries/slitherauth.js'
import eventsubsql from '../db/queries/eventsub.js'

export async function setupNewSlitherUser(twitchAuthCode: string): Promise<string | undefined> {

    // We have received an Authorization Code from Twitch that we can use to obtain a User Access Token for a user wanting to use
    // SlitherBot. We can send our response to Twitch. POST the auth code to https://id.twitch.tv/oauth2/token with query params:
    // { client_id, client_secret, code, grant_type, redirect_uri }
    const twitchTokenData = await fetchTwitchUAT(twitchAuthCode)
    const obtainmentTimestamp = Date.now()

    // Immediately validate the access token to get the userID from Twitch
    const twitchId = await validateTwitchUAT(twitchTokenData.access_token)
    if(!twitchId) return undefined
    
    // Store Twitch access tokens in the database. This function will print a log message to the console in case of a DB error.
    // Also if we already have an old user access token, be a good client and send a revocation request to Twitch
    // We have already received and validated the access tokens as part of the OAuth flow so in the event of an error, keep going.
    await registerTwitchUser(twitchTokenData, twitchId, obtainmentTimestamp)

    // Now register the user with Slither. If the user's twitch ID is already mapped to an alerts token, treat this as a simple login
    // and move on to issuing cookies
    if(!await registerSlitherUser(twitchId)) return undefined

	// We have now sucessfully logged in the user. If we set the require_login flag in the DB, unset it now.
	await slitherauthsql.setLoginRequiredValue(twitchId, false)
    
}

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
export async function registerSlitherUser(userId: string): Promise<void | null> {

    await createAlertsToken(userId)

    // Now that the user has been logged in, subscribe to all nonexisting required subscriptions for that user.
    const existingSubTypes: Set<string> = new Set<string>()
    const subsForUser = await eventsubsql.getSubscriptionsForUsers(userId)
    subsForUser.forEach((sub) => { existingSubTypes.add(sub.type) })

    SlitherEventSub.getRequiredUserSubscriptions(userId).forEach(async (requiredSub) => {
        if(!existingSubTypes.has(requiredSub.type) && !await subToEvent(requiredSub.type, requiredSub.channel_id)) {
            console.error(`Error upserting newly registered user's required EventSub user event types for userId ${userId}`)
        }
    })

    void fs.promises.mkdir(`${appConfig.appPath}/resources/alertmedia/${userId}`, { recursive: true} )

}

export async function signSlitherToken(userId: string, tokenType: SlitherTokenType): Promise<string | undefined> {

    const secret = getSecret(tokenType)
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

    const secret = getSecret(tokenType)
    if(!secret) {
        console.error(`Invalid tokenType for verification: ${tokenType}`)
        return
    }

    try {

        const jwtVerificationResult = await jwtVerify(token, secret)
        if(jwtVerificationResult.payload['token_type'] !== tokenType)
            { throw new Error(`Token type mismatch. Token type expected: ${tokenType}; token type received: ${jwtVerificationResult.payload['token_type']}`) }

        return jwtVerificationResult.payload['user_id'] as string

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

// TODO: Implement refresh token rotation!
// function rotateSlitherRefreshToken(token: string): string {

//     return ''

// }

export * as default from './slitherauth.js'