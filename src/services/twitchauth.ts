/**********************************************************************************************************************
 * Handles twitch authentication functionality, including access token retrieval and refresh.
 **********************************************************************************************************************/

import { RefreshingAuthProvider } from "@twurple/auth"
import { Insertable } from 'kysely'
import { DB } from "kysely-codegen"
import twitchsql from '../db/queries/twitchauth.js'
import { twitch as twitchConfig } from "../config.js"
import type { TwitchAuthTokenValidationResponse, TwitchAuthTokenValidationErrorResponse, TwitchRefreshUserTokenRequest, TwitchRefreshUserTokenResponse } from "../types/authtypes.js"
import { isTwitchAuthTokenValidationResponse, isTwitchAuthTokenValidationErrorResponse, isTwitchRefreshUserTokenResponse } from "../types/authtypes.js"


// TODO: Wean ourselves off of anything related to twurple! It was nice to use to get started but this is a learning 
// project and I'm learning a lot more by doing everything raw
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

        twitchsql.upsertUsers(refreshedUser).then(() => {
            console.log(`DB: Successfully updated access token data for Twitch user ${userId}`)
        }).catch((error) => {
            console.error(`DB: Error updating access token data in database for Twitch user ${userId}: ${error}`)
        })

    })

    authProvider.onRefreshFailure((userId, error) => {

        twitchsql.invalidateUserAccessToken(userId).then(() => {
            console.log(`DB: Successfully invalidated access token for Twitch user ${userId} after refresh failure, error: ${error.name} - ${error.message}`)
            authProvider.removeUser(userId)
        }).catch((error) => {
            console.error(`DB: Error invalidating access token data for Twitch user ${userId}: ${error}`)
        })

    })

    // TODO: Test what the value of activeUser.scopes looks like when only one scope is stored for the token. If it stores it as a string instead of an array then we'll need to account for that.
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

export async function validateAndRefreshUserAccessTokens(tokens: string | string[] | null = null): Promise<void> {

    // If tokens is null, validate all tokens. Otherwise validate the token(s) provided.
    const tokensToValidate = tokens === null ? await twitchsql.getAllAccessTokens() : await twitchsql.getAccessTokens(tokens)

    const tokensToRefresh = await validateUserAccessTokens(tokensToValidate)
    const tokensToUpdate = await refreshUserAccessTokens(tokensToRefresh)

    if(tokensToUpdate.length > 0) {
        const upsertResult = await twitchsql.upsertUsers(tokensToUpdate)
        console.log(`Database update result for refreshed tokens: ${upsertResult.numInsertedOrUpdatedRows?.toString()}`)
    }
}

// Returns an array of tokens to refresh, which contains objects of type { channel_id: string, access_token: string, refresh_token: string }
async function validateUserAccessTokens(tokens: { channel_id: string, access_token: string, refresh_token: string}[]): Promise<{ channel_id: string, access_token: string, refresh_token: string}[]> {
        const validatedTokens: { channel_id: string, access_token: string, refresh_token: string }[] = []

    for(let token of tokens) {
        await fetch(new Request(`https://id.twitch.tv/oauth2/validate`, { method: 'GET',
                                                                          headers: { Authorization: `OAuth ${token.access_token}` } }
        )).then(async (res) => {

            const twitchResponse = await res.json()
            if(isTwitchAuthTokenValidationResponse(twitchResponse as TwitchAuthTokenValidationResponse)) { return }
            else if(isTwitchAuthTokenValidationErrorResponse(twitchResponse as TwitchAuthTokenValidationErrorResponse)) 
                validatedTokens.push(token)
            else {
                // TODO: Elevate this logging to urgent priority as this may indicate a change in Twitch's OAuth system that breaks our integration with it.
                console.log(`Received unexpected response from Twitch at their Access Token Validation endpoint`)
            }

        })
    }
    return validatedTokens
}

async function refreshUserAccessTokens(tokens: { channel_id: string, refresh_token: string }[]): Promise<Insertable<DB['Users']>[]> {

    const refreshed_tokens_arr: Insertable<DB['Users']>[] = []

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
            if(isTwitchRefreshUserTokenResponse(refreshedAccessToken)) refreshed_tokens_arr.push(
                {
                    channel_id: token.channel_id,
                    refresh_token: refreshedAccessToken.refresh_token,
                    scopes: JSON.stringify(refreshedAccessToken.scope),
                    access_token: refreshedAccessToken.access_token,
                    expires_in: refreshedAccessToken.expires_in,
                    obtainment_timestamp: Date.now()
                }
            )
        })
    }

    return refreshed_tokens_arr

}