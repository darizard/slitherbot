/**********************************************************************************************************************
 * Handles twitch authentication functionality, including access token retrieval and refresh.
 **********************************************************************************************************************/

import { RefreshingAuthProvider } from "@twurple/auth"
import { Selectable, Updateable } from 'kysely'
import { DB, JsonValue } from "kysely-codegen"
import { db } from "../db/database.js"
import { twitch as twitchBotConfig } from "../config.js"
import { jsonArrayFrom } from 'kysely/helpers/mysql'

// TODO: Investigate middleware and Apache config conflict with respect to callback functions not firing on middleware events.
// The middlware object is defined in ./eventsubclient.ts

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
        "clientId": twitchBotConfig.clientId,
        "clientSecret": twitchBotConfig.clientSecret
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

        refreshUserAccessToken(userId, refreshedUser).then(() => {
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
        console.log(`DB: After getting Active Token Users, parsed scopes for user ${activeUser.channel_id} as ${JSON.stringify(activeUser.scopes)}`)

        const userToAdd = { accessToken: activeUser.access_token, 
                                scope: activeUser.scopes as string[],
                                refreshToken: activeUser.refresh_token,
                                expiresIn: activeUser.expires_in,
                                obtainmentTimestamp: activeUser.obtainment_timestamp }

        authProvider.addUser(activeUser.channel_id, userToAdd)
    }

    return authProvider
}

/************************************
 * Related database queries
 ************************************/

// Get all db info on users who have authenticated with this app
// TODO: Test performance difference between .selectAll() followed by .select()
//                                       and a .select() for each desired field without .selectAll()
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

// Refresh the access token for a given user
async function refreshUserAccessToken(userId: string, user: Updateable<DB['Users']>) {    

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

/************************************
 * Helper functions
 ************************************/
function jsonToArray(jsonArr: JsonValue): string[] {
    return [];
}