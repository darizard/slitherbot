import { Selectable, Insertable, sql, UpdateResult } from 'kysely'
import { DB } from 'kysely-codegen'
import { db } from '../database.js'
import { jsonArrayFrom } from 'kysely/helpers/mysql'
import { TwitchAuthAppToken } from '../../types/authtypes.js'

/************************************
 * Twitch-Auth-Related database queries
 ************************************/

export async function getSlitherAppToken(): Promise<string | undefined> {

    return (await db.selectFrom('AppInfo')
        .select('app_access_token')
        .executeTakeFirst())?.app_access_token

}

export async function updateSlitherAppToken(token: TwitchAuthAppToken): Promise<UpdateResult> {

    return await db.updateTable('AppInfo')
        .set({ app_access_token: token.access_token,
               expires_in: token.expires_in,
               obtainment_timestamp: Date.now()
         })
        .executeTakeFirst()

}

// Get all db info on users for whom we have a Twitch User Refresh Token
export async function getActiveUsers(): Promise<Selectable<DB['Users']>[]> {

    return await db.selectFrom('Users')
        .selectAll()
        .select((builder) => [
            jsonArrayFrom(
                builder.selectFrom('Users').select('scopes')
            ).as('Users')
        ])
        .where('refresh_token', '!=', '')
        .execute()

}

export async function getActiveChannels(): Promise<string[]> {

    const objArr = await db.selectFrom('Users')
                            .select('channel_id')
                            .execute()

    const strArr: string[] = []
    objArr.forEach((item) => strArr.push(item.channel_id))
    return strArr
}

export async function getAccessTokens(tokens: string[] | string): Promise<Pick<Selectable<DB['Users']>, 'channel_id' | 'access_token' | 'refresh_token'>[]> {

    const tokensArr = typeof tokens === 'string' ? [tokens] : tokens

    return await db.selectFrom('Users')
        .select('channel_id')
        .select('access_token')
        .select('refresh_token')
        .where('access_token', 'in', tokensArr)
        .execute()

}

export async function getAllAccessTokens(): Promise<Pick<Selectable<DB['Users']>, 'channel_id' | 'access_token' | 'refresh_token'>[]> {

    return await db.selectFrom('Users')
        .select('channel_id')
        .select('access_token')
        .select('refresh_token')
        .where('access_token', '!=', '')
        .execute()

}

export async function getAccessTokenForUser(userId: string): Promise<string | undefined> {

    return (await db.selectFrom('Users')
        .select('access_token')
        .where('channel_id', '=', userId)
        .executeTakeFirst())?.access_token

}

export async function clearAccessTokensForUser(channelIds: string[] | string) {

    return await db.updateTable('Users')
        .set({
            access_token: '',
            refresh_token: '',
            expires_in: -1,
            obtainment_timestamp: -1
        })
        .where('channel_id', 'in', channelIds)
        .execute()

}

export async function getFullUserByChannelId(channelId: string): Promise<Selectable<DB['Users']> | undefined> {

    return await db.selectFrom('Users')
        .selectAll()
        .where('channel_id', '=', channelId)
        .executeTakeFirst()

}

export async function getLimitedUserByChannelId(channelId: string): Promise<Pick<Selectable<DB['Users']>, 'channel_id' | 'scopes'> | undefined> {

    return await db.selectFrom('Users')
        .select(['channel_id', 'scopes'])
        .where('channel_id', '=', channelId)
        .executeTakeFirst()

}

export async function upsertUsers(users: Insertable<DB['Users']>[] | Insertable<DB['Users']>) {

    return await db.insertInto('Users')
        .values(users)
        .onDuplicateKeyUpdate({
            access_token: sql`VALUES(access_token)`,
            scopes: sql`VALUES(scopes)`,
            expires_in: sql`VALUES(expires_in)`,
            obtainment_timestamp: sql`VALUES(obtainment_timestamp)`,
            refresh_token: sql`VALUES(refresh_token)`
        })
    .execute()

}

export * as default from './twitchauth.js'