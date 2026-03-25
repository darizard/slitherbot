/**********************************************************************************************************************
 * Handles twitch authentication functionality, including access token retrieval and refresh.
 **********************************************************************************************************************/

import crypto from 'crypto'
import type { Request, Response } from 'express'
import { RefreshingAuthProvider } from "@twurple/auth"
import { Insertable, InsertResult } from 'kysely'
import { DB } from "kysely-codegen"
import twitchsql from '../db/queries/twitchauth.js'
import { twitch as twitchConfig, ssl as sslConfig } from "../config.js"
import type { TwitchAuthTokenValidationResponse, TwitchAuthTokenValidationErrorResponse, TwitchRefreshUserTokenRequest, TwitchRefreshUserTokenResponse, TwitchAuthError, TwitchAuthCode, TwitchAuthUserTokenRequest, TwitchAuthUserToken } from "../types/authtypes.js"
import { isTwitchAuthTokenValidationResponse, isTwitchAuthTokenValidationErrorResponse, isTwitchRefreshUserTokenResponse, isTwitchAuthError, isTwitchAuthCode, isTwitchAuthUserToken } from "../types/authtypes.js"

// TODO: Remove Twurple from project
/*
 * Returns a RefreshingAuthProvider that contains token and scope information for all users connecting to the service.
 * This object also listens for events related to token refreshing. It is currently unclear whether these callbacks will
 * fire when the refresh events actually happen as there is some configuration conflict between the middleware using it
 * and the Apache web server's reverse proxy. Investigate further if any situations arise.
 */
export async function createAuthProvider() {

    // Establish RefreshingAuthProvider using twitch app credentials
    const authProvider = new RefreshingAuthProvider({
        // Client id and secret of registered Twitch App (https://dev.twitch.tv/console/apps)
        "clientId": twitchConfig.clientId,
        "clientSecret": twitchConfig.clientSecret
    })

    // Set up token refresh event listeners
    authProvider.onRefresh(async (userId, newTokenData) => {

        console.log(`DB: Refreshed access token data for Twitch user ${userId}`)

        const refreshedUser = {
            channel_id: userId,
            access_token: newTokenData.accessToken,
            refresh_token: newTokenData.refreshToken || '',
            scopes: JSON.stringify(newTokenData.scope),
            expires_in: newTokenData.expiresIn || -1,
            obtainment_timestamp: newTokenData.obtainmentTimestamp
        }

        await twitchsql.upsertUsers(refreshedUser).then(() => {
            console.log(`DB: Successfully updated access token data for Twitch user ${userId}`)
        }).catch((error) => {
            console.error(`DB: Error updating access token data in database for Twitch user ${userId}: ${error}`)
        })

    })

    authProvider.onRefreshFailure(async (userId, error) => {

        await clearTwitchUserAccessTokens(userId).then(() => {
            console.log(`DB: Successfully invalidated access token for Twitch user ${userId} after refresh failure, error: ${error.name} - ${error.message}`)
            authProvider.removeUser(userId)
        }).catch((error) => {
            console.error(`DB: Error invalidating access token data for Twitch user ${userId}: ${error}`)
        })

    })

    const activeUsers = await twitchsql.getActiveTokenUsers()
    for(let activeUser of activeUsers) {
        
        const userToAdd = { accessToken: activeUser.access_token, 
                                scope: activeUser.scopes as string[],
                                refreshToken: activeUser.refresh_token,
                                expiresIn: activeUser.expires_in,
                                obtainmentTimestamp: activeUser.obtainment_timestamp }

        authProvider.addUser(activeUser.channel_id, userToAdd)
    }

    return authProvider
}

/*
*  Uses the Twitch API to validate and refresh any User Access Tokens granted to SlitherBot. Also handles any refresh tokens
*  that have become invalid due to users disconnecting SlitherBot in their Twitch connections or changing their Twitch 
*  password (https://dev.twitch.tv/docs/authentication/refresh-tokens/#can-a-refresh-token-become-invalid).
*  We will maintain the user in the database but clear any token data they have.
*/
export async function validateAndRefreshUserAccessTokens(tokens: string | string[] | null = null): Promise<void> {

    // If tokens is null, validate all tokens. Otherwise validate the token(s) provided.
    const tokensToValidate = tokens === null ? await twitchsql.getAllAccessTokens() : await twitchsql.getAccessTokens(tokens)

    // Internal helper/organization functions defined within this one
    const invalidAccessTokens = await validateUserAccessTokens(tokensToValidate)
    const refreshTokenResults = await refreshUserAccessTokens(invalidAccessTokens)

    const tokensToUpsert: Insertable<DB['Users']>[] = []
    const channelIDsToClear: string[] = []

    for(let refresh_result of refreshTokenResults) {
        refresh_result.valid ? tokensToUpsert.push({channel_id: refresh_result.channel_id,
                                                     access_token: refresh_result.access_token,
                                                     refresh_token: refresh_result.refresh_token,
                                                     expires_in: refresh_result.expires_in,
                                                     scopes: refresh_result.scopes,
                                                     obtainment_timestamp: refresh_result.obtainment_timestamp}) 

                             : channelIDsToClear.push(refresh_result.channel_id)
    }

    if(tokensToUpsert.length > 0) await twitchsql.upsertUsers(tokensToUpsert)
    if(channelIDsToClear.length > 0) await clearTwitchUserAccessTokens(channelIDsToClear)

    // ******************************HELPER FUNCTIONS INTERNAL TO OVERALL VALIDATION AND REFRESH******************************
    // Validates the provided User Access Token(s) with the Twitch API /oauth/validate endpoint. Any tokens that Twitch returns
    // as _invalid) are returned in an array containing objects of type:
    //                              { channel_id: string, access_token: string, refresh_token: string }
    async function validateUserAccessTokens(tokens: { channel_id: string, access_token: string, refresh_token: string}[]): Promise<{ channel_id: string, access_token: string, refresh_token: string}[]> {
            const invalidTokens: { channel_id: string, access_token: string, refresh_token: string }[] = []

        for(let token of tokens) {
            await fetch(new Request(`https://id.twitch.tv/oauth2/validate`, { method: 'GET',
                                                                            headers: { Authorization: `OAuth ${token.access_token}` } }
            )).then(async (res) => {

                const twitchResponse = await res.json()
                if(isTwitchAuthTokenValidationResponse(twitchResponse as TwitchAuthTokenValidationResponse)) { 
                    return 
                }
                else if(isTwitchAuthTokenValidationErrorResponse(twitchResponse as TwitchAuthTokenValidationErrorResponse)) {
                    invalidTokens.push(token)
                }
                else {
                    // TODO: Elevate this logging to urgent priority as this may indicate a change in Twitch's OAuth system that breaks our integration with it.
                    console.log(`Received unexpected response from Twitch at their Access Token Validation endpoint`)
                }

            })
        }
        return invalidTokens
    }

    async function refreshUserAccessTokens(tokens: { channel_id: string, refresh_token: string }[]): Promise<({ valid: boolean } & Insertable<DB['Users']>)[]> {

        const refresh_results_arr: ({ valid: boolean } & Insertable<DB['Users']>)[] = []

        for(let token of tokens) {

            const refreshRequestBody: TwitchRefreshUserTokenRequest = {
                client_id: twitchConfig.clientId,
                client_secret: twitchConfig.clientSecret,
                refresh_token: encodeURIComponent(token.refresh_token),
                grant_type: 'refresh_token'
            }

            await fetch(new Request(`https://id.twitch.tv/oauth2/token`, { method: 'POST',
                                                                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                                                        body: new URLSearchParams(refreshRequestBody) }
            )).then(async (res) => {

                const refreshedAccessToken: TwitchRefreshUserTokenResponse & { channel_id: string } = await res.json()

                if(isTwitchRefreshUserTokenResponse(refreshedAccessToken)) refresh_results_arr.push({
                        channel_id: token.channel_id,
                        refresh_token: refreshedAccessToken.refresh_token,
                        scopes: JSON.stringify(refreshedAccessToken.scope),
                        access_token: refreshedAccessToken.access_token,
                        expires_in: refreshedAccessToken.expires_in,
                        obtainment_timestamp: Date.now(),
                        valid: true
                    })
                else if(res.status === 401 || res.status === 400) {
                    console.log(`Received ${res.status} status for refresh token for channel_id: ${token.channel_id}`)
                    refresh_results_arr.push({ channel_id: token.channel_id,
                                                valid: false
                                                
                    })
                }
            })
        }

        return refresh_results_arr

    }
}

// For a given channel ID or array of channel IDs, clear out all Twitch token data from the database
export async function clearTwitchUserAccessTokens(channel_ids: string[] | string) {

    const updateResults = await twitchsql.clearAccessTokensForUser(typeof channel_ids === 'string' ? [channel_ids] : channel_ids)
    console.log(`Invalidated Twitch token data for users: ${typeof channel_ids === 'string' ? channel_ids : JSON.stringify(channel_ids)}`)
    return updateResults

}

type TwitchMessageVerificationOptions = {
    TWITCH_MESSAGE_ID: string
    TWITCH_MESSAGE_TIMESTAMP: string
    TWITCH_MESSAGE_SIGNATURE: string
}

export function verifyEventMessage(req: Request): boolean {

    const options: TwitchMessageVerificationOptions = {
        TWITCH_MESSAGE_ID   : 'Twitch-Eventsub-Message-Id'.toLowerCase(),
        TWITCH_MESSAGE_TIMESTAMP: 'Twitch-Eventsub-Message-Timestamp'.toLowerCase(),
        TWITCH_MESSAGE_SIGNATURE: 'Twitch-Eventsub-Message-Signature'.toLowerCase()
    }

    const HMAC_PREFIX: string = 'sha256='

    let secret = getSecret()
    let message = getHmacMessage(req, options)
    let hmac = HMAC_PREFIX + getHmac(secret, message)

    //*****************HELPER EVENT MESSAGE VERIFICATION FUNCTIONS RECOMMENDED BY TWITCH DOCS*****************/

    // HMAC signature header sent by twitch is of type string according to their docs
    return verifyMessage(hmac, req.headers[options.TWITCH_MESSAGE_SIGNATURE] as string)

    // Our application's client secret generated on dev.twitch.tv
    function getSecret(): string {
        return twitchConfig.eventsubSecret
    }


    function getHmacMessage(req: Request, options: TwitchMessageVerificationOptions): string {
        return (req.headers[options.TWITCH_MESSAGE_ID] as string + 
                req.headers[options.TWITCH_MESSAGE_TIMESTAMP] as string +
                req.body as string)
    }

    // Get the HMAC
    function getHmac(secret: string, message: string): string {
        return crypto.createHmac('sha256', secret)
                    .update(message)
                    .digest('hex')
    }

    // Verify whether our signature matches Twitch's signature
    function verifyMessage(hmac: string, verifySignature: string): boolean {
        return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(verifySignature))
    }
}

// Used by the GET /slither/oauth route to validate state and the query params received from Twitch.
// The function mutates the Response object
export async function oauthStateOrParamProblem(auth_states: Set<string>, req: Request, res: Response): Promise<boolean> {
    // Process a request with any given state only once
    const state = req.query.state
    if(typeof state !== 'string' || !auth_states.has(state)) {
        // TODO: Treat this error as a security risk and elevate the logging
        console.log(`Received an auth code with an invalid or already used state value: ${state}. Rejecting request.`)
        res.status(400)
        return true
    }
    auth_states.delete(state)

    if(isTwitchAuthError(req.query as TwitchAuthError)) {
        console.log(`OAuth Error received from Twitch: ${JSON.stringify(req.query)}`)
        res.status(302)
        res.location(`/slither/home?tokenType=null`)
        return true
    }

    if(!isTwitchAuthCode(req.query as TwitchAuthCode)) {
        console.log(`Received a call to GET /slither/oauth that was neither an error nor an auth code. Query: ${JSON.stringify(req.query)}`)
        res.status(400)
        return true
    }

    return false
}

export async function fetchTwitchUserAccessToken(req: Request): Promise<TwitchAuthUserToken> {
    const tokenRequest: TwitchAuthUserTokenRequest = {
        client_id: `${twitchConfig.clientId}`,
        client_secret: `${twitchConfig.clientSecret}`,
        code: `${req.query.code}`,
        grant_type: 'authorization_code',
        redirect_uri: `https://${sslConfig.hostName}/slither/oauth`
    }

    const twitchTokenResponse = await fetch(`https://id.twitch.tv/oauth2/token`, {
        method: 'POST',
        body: new URLSearchParams(tokenRequest)
    })

    return await twitchTokenResponse.json() as TwitchAuthUserToken
}

export async function validateTokenAndGetUserID(access_token: string): Promise<string | undefined> {

    return await fetch(`https://id.twitch.tv/oauth2/validate`,
                                { method: 'GET',
                                  headers: 
                                    { Authorization: `OAuth ${access_token}` } }
    ).then(async (res) => {

        return (await res.json()).user_id as string

    }).catch((validation_err) => {

        console.log(`Error during immediate post-OAuth token validation: ${JSON.stringify(validation_err)}`)
        return undefined

    })

}

export async function registerTwitchUser(twitchTokenData: TwitchAuthUserToken, userID: string, obtainmentTimestamp: number): Promise<InsertResult[] | void> {

    // If the user already has a twitch access / refresh token recorded in our database, send a revocation request to Twitch
    const oldAccessToken = await twitchsql.getAccessTokenForUser(userID) 
    if(oldAccessToken) {

        await fetch(`https://id.twitch.tv/oauth2/revoke`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: twitchConfig.clientId,
                token: oldAccessToken
            })
        })

    }

    return await twitchsql.upsertUsers({

        channel_id: userID,
        expires_in: twitchTokenData.expires_in,
        access_token: twitchTokenData.access_token,
        refresh_token: twitchTokenData.refresh_token,
        scopes: JSON.stringify(twitchTokenData.scope),
        obtainment_timestamp: obtainmentTimestamp

    }).catch((upsert_err) => {

        // TODO: Elevate this error as it indicates an internal issue with our database
        console.log(`Error during upsert of Twitch UserAccessToken: ${JSON.stringify(upsert_err)}`)
        return
        
    })

}