/**********************************************************************************************************************
 * Handles twitch authentication functionality, including access token retrieval and refresh.
 **********************************************************************************************************************/

import { RefreshingAuthProvider } from "@twurple/auth"
import { Selectable, Updateable, Insertable, sql } from 'kysely'
import { DB } from "kysely-codegen"
import { db } from "../db/database.js"
import { twitch as twitchConfig } from "../config.js"
import { jsonArrayFrom } from 'kysely/helpers/mysql'
import type { TwitchAuthTokenValidationResponse, TwitchAuthTokenValidationErrorResponse, TwitchRefreshUserTokenRequest, TwitchRefreshUserTokenResponse } from "../types/authtypes.js"
import { isTwitchAuthTokenValidationResponse, isTwitchAuthTokenValidationErrorResponse, isTwitchRefreshUserTokenResponse } from "../types/authtypes.js"


// TODO: Set up token validation that the server should run hourly for all Twitch OAuth tokens.
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
            access_token: newTokenData.accessToken,
            refresh_token: newTokenData.refreshToken || '',
            scopes: JSON.stringify(newTokenData.scope),
            expires_in: newTokenData.expiresIn || -1,
            obtainment_timestamp: newTokenData.obtainmentTimestamp
        } satisfies Updateable<DB['Users']>

        updateUserAccessTokenForUser(userId, refreshedUser).then(() => {
            console.log(`DB: Successfully updated access token data for Twitch user ${userId}`)
        }).catch((error) => {
            console.error(`DB: Error updating access token data in database for Twitch user ${userId}: ${error}`)
        })

    })

    authProvider.onRefreshFailure((userId, error) => {

        invalidateUserAccessToken(userId).then(() => {
            console.log(`DB: Successfully invalidated access token for Twitch user ${userId} after refresh failure, error: ${error.name} - ${error.message}`)
            authProvider.removeUser(userId)
        }).catch((error) => {
            console.error(`DB: Error invalidating access token data for Twitch user ${userId}: ${error}`)
        })

    })

    // TODO: Test what the value of activeUser.scopes looks like when only one scope is stored for the token. If it stores it as a string instead of an array then we'll need to account for that.
    const activeUsers = await getActiveTokenUsers()
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
    const tokensToValidate: Pick<Selectable<DB['Users']>, 'channel_id' | 'access_token' | 'refresh_token'>[] = tokens ? 
                                    (Array.isArray(tokens) ?

                                        await getAccessTokens(tokens) 
                                        : await getAccessTokens([tokens]))
    
                                    : (await getAllAccessTokens())

    const tokensToRefresh = await validateUserAccessTokens(tokensToValidate)
    const tokensToUpdate = await refreshUserAccessTokens(tokensToRefresh.map(token => { return { channel_id: token.channel_id, refresh_token: token.refresh_token }  }))

    if(tokensToUpdate.length > 0) {
        const result = await updateUserAccessTokensForUsers(tokensToUpdate)
        console.log(`Database update result for refreshed tokens: ${result[0].numInsertedOrUpdatedRows?.toString()}`)
    }
}

// Returns an array of tokens to refresh, which contains objects of type { channel_id: string, access_token: string, refresh_token: string }
async function validateUserAccessTokens(tokens: Pick<Selectable<DB['Users']>, 'channel_id' | 'access_token' | 'refresh_token'>[]): Promise<{ channel_id: string, access_token: string, refresh_token: string}[]> {
        const tokensToRefresh: { channel_id: string, access_token: string, refresh_token: string }[] = []

    for(let token of tokens) {
        await fetch(new Request(`https://id.twitch.tv/oauth2/validate`, { method: 'GET',
                                                                          headers: { Authorization: `OAuth ${token.access_token}` } }
        )).then(async (res) => {

            const twitchResponse = await res.json()
            if(isTwitchAuthTokenValidationResponse(twitchResponse as TwitchAuthTokenValidationResponse)) { return }
            else if(isTwitchAuthTokenValidationErrorResponse(twitchResponse as TwitchAuthTokenValidationErrorResponse)) 
                tokensToRefresh.push(token)
            else {
                // TODO: Elevate this logging to urgent priority as this may indicate a change in Twitch's OAuth system that breaks our integration with it.
                console.log(`Received unexpected response from Twitch at their Access Token Validation endpoint`)
            }

        })
    }
    return tokensToRefresh
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

/************************************
 * Related database queries
 ************************************/

// Get all db info on users who have authenticated with this app
async function getActiveTokenUsers(): Promise<Selectable<DB['Users']>[]> {

    return await db.selectFrom('Users')
        .selectAll()
        .select((builder) => [
            jsonArrayFrom(
                builder.selectFrom('Users').select('scopes')
            ).as('Users')
        ])
        .where('access_token', '!=', '')
        .execute()

}

async function getAccessTokens(tokens: string[]): Promise<Pick<Selectable<DB['Users']>, 'channel_id' | 'access_token' | 'refresh_token'>[]> {

    return await db.selectFrom('Users')
        .select('channel_id')
        .select('access_token')
        .select('refresh_token')
        .where('access_token', 'in', tokens)
        .execute()

}

async function getAllAccessTokens(): Promise<Pick<Selectable<DB['Users']>, 'channel_id' | 'access_token' | 'refresh_token'>[]> {

    return await db.selectFrom('Users')
        .select('channel_id')
        .select('access_token')
        .select('refresh_token')
        .where('access_token', '!=', '')
        .execute()

}

// Refresh the access tokens for the users whose details are passed in
async function updateUserAccessTokensForUsers(users: Insertable<DB['Users']>[]) {

    return await db.insertInto('Users')
        .values(users)
        .onDuplicateKeyUpdate({
            access_token: sql`VALUES(access_token)`,
            refresh_token: sql`VALUES(refresh_token)`,
            expires_in: sql`VALUES(expires_in)`,
            scopes: sql`VALUES(scopes)`,
            obtainment_timestamp: sql`VALUES(obtainment_timestamp)`
        })
        .execute()

}

// Refresh the access token for a given user
async function updateUserAccessTokenForUser(userId: string, user: Updateable<DB['Users']>) {    

    return await db.updateTable('Users')
        .set(user)
        .where('channel_id', '=', userId)
        .executeTakeFirst()

}

async function invalidateUserAccessToken(channelId: string) {

    return await db.updateTable('Users')
        .set({
            access_token: '',
            refresh_token: '',
            expires_in: -1,
            obtainment_timestamp: -1
        })
        .where('channel_id', '=', channelId)
        .executeTakeFirst()

}