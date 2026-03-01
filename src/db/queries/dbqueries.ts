import { Selectable, Insertable, Updateable } from 'kysely'
import { DB } from 'kysely-codegen'
import { db } from '../database.js'

export async function getFullUserByChannelId(channelId: string): Promise<Selectable<DB['Users']> | undefined> {
    let result = await db.selectFrom('Users')
        .selectAll()
        .where('channel_id', '=', channelId)
        .executeTakeFirst();
    return result;
}

export async function getLimitedUserByChannelId(channelId: string): Promise<Pick<Selectable<DB['Users']>, 'channel_id' | 'scopes'> | undefined> {
    let result = await db.selectFrom('Users')
        .select(['channel_id', 'scopes'])
        .where('channel_id', '=', channelId)
        .executeTakeFirst();
    return result;
}

// TODO: This is untested. Obtain a User Access Token for the the test account or the bot account and add it to the database.
export async function addUser(user: Insertable<DB['Users']>) {
    return await db.insertInto('Users')
        .values(user)
        .execute();
}