import { Selectable, Insertable, Updateable, InsertResult, sql } from 'kysely'
import { DB } from 'kysely-codegen'
import { db } from '../database.js'

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

// TODO: This is untested. Obtain a User Access Token for the the test account or the bot account and add it to the database.
export async function upsertUser(user: Insertable<DB['Users']>): Promise<InsertResult> {

    return await db.insertInto('Users')
        .values(user)
        .onDuplicateKeyUpdate({
            access_token: sql`VALUES(access_token)`,
            scopes: sql`VALUES(scopes)`,
            expires_in: sql`VALUES(expires_in)`,
            obtainment_timestamp: sql`VALUES(obtainment_timestamp)`,
            refresh_token: sql`VALUES(refresh_token)`
        })
        .executeTakeFirst()

}