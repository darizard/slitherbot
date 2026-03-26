/**********************************************************************************************************************
 * Handles twitch authentication functionality, including access token retrieval and refresh.
 **********************************************************************************************************************/

import crypto from 'crypto'
import type { Request, Response } from 'express'
import { Insertable, InsertResult } from 'kysely'
import { DB } from "kysely-codegen"
import twitchsql, { updateSlitherAppToken } from '../db/queries/twitchauth.js'
import { twitch as twitchConfig, ssl as sslConfig } from "../config.js"
import type { TwitchAuthUserTokenValidationResponse, TwitchAuthTokenValidationErrorResponse, TwitchRefreshUserTokenRequest, TwitchRefreshUserTokenResponse, 
              TwitchAuthError, TwitchAuthCode, TwitchAuthUserTokenRequest, TwitchAuthUserToken, TwitchAuthAppToken, TwitchAuthAppTokenValidationResponse } from "../types/authtypes.js"
import { isTwitchAuthUserTokenValidationResponse, isTwitchAuthTokenValidationErrorResponse, isTwitchRefreshUserTokenResponse, isTwitchAuthError, isTwitchAuthCode, 
         isTwitchAuthUserToken, isTwitchAuthAppToken, isTwitchAuthAppTokenValidationResponse } from "../types/authtypes.js"

export async function getValidatedSlitherAppToken(): Promise<string | undefined> {

    // If our app access token exists in db, retrieve and validate it
    let appToken: string | undefined = await twitchsql.getSlitherAppToken()

    // Return the token from the DB if it can be validated by Twitch (does not attempt to validate if undefined)
    if(appToken && await validateAppAccessToken(appToken)) return appToken

    // If not valid, get a new one and immediately validate it, then return it
    appToken = await obtainNewAppAccessToken()
    appToken = await validateAppAccessToken(appToken)
    if(appToken) return appToken

    // Something went wrong...
    console.log(`Unable to get an app token. Investigate.`)
    return undefined

}

export async function obtainNewAppAccessToken(): Promise<string | undefined> {

    const appToken = await fetch(`https://id.twitch.tv/oauth2/token`, {
        method: 'POST',
        body: new URLSearchParams({ client_id: twitchConfig.clientId,
                                    client_secret: twitchConfig.clientSecret,
                                    grant_type: 'client_credentials'})
    }).then(async (res) => {

        if(!res.ok) return undefined
        const appTokenFetchResult = await res.json()
        return appTokenFetchResult
        
    })

    const tokenUpdateResult = await updateSlitherAppToken(appToken)
    if(tokenUpdateResult.numChangedRows && tokenUpdateResult.numChangedRows > 0n) return appToken?.access_token
    return

}

export async function validateAppAccessToken(appToken: string | undefined): Promise<string | undefined> {

    const appTokenInfo = await fetch(new Request(`https://id.twitch.tv/oauth2/validate`, { method: 'GET',
                                                                                        headers: {
                                                                                            Authorization: `OAuth ${appToken}`
                                                                                        }
    })).then(async (res) => {

        const validationResponse = await res.json()
        if(res.ok) return validationResponse as TwitchAuthAppTokenValidationResponse
        console.log(`Validation response not ok: ${JSON.stringify(validationResponse)}`)
        return validationResponse as TwitchAuthTokenValidationErrorResponse

    })

    if(isTwitchAuthAppTokenValidationResponse(appTokenInfo)) return appToken
    if(isTwitchAuthTokenValidationErrorResponse(appTokenInfo)) return

    console.log(`Unexpected response received from Twitch Auth Token Validation endpoint: ${JSON.stringify(appTokenInfo)}`)

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
                if(isTwitchAuthUserTokenValidationResponse(twitchResponse as TwitchAuthUserTokenValidationResponse)) { 
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

export async function fetchUserAccessToken(code: string): Promise<TwitchAuthUserToken> {
    const tokenRequest: TwitchAuthUserTokenRequest = {
        client_id: `${twitchConfig.clientId}`,
        client_secret: `${twitchConfig.clientSecret}`,
        code: `${code}`,
        grant_type: 'authorization_code',
        redirect_uri: `https://${sslConfig.hostName}/slither/oauth`
    }

    const twitchTokenResponse = await fetch(`https://id.twitch.tv/oauth2/token`, {
        method: 'POST',
        body: new URLSearchParams(tokenRequest)
    })

    return await twitchTokenResponse.json() as TwitchAuthUserToken
}

export async function validateUserAccessToken(access_token: string): Promise<string | undefined> {

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