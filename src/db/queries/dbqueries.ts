import { db, UserContext } from '../database.js';

export async function getFullUserByChannelId(channelId: string): Promise<UserContext['User'] | undefined> {
    let result = await db.selectFrom('Users')
        .selectAll()
        .where('channel_id', '=', channelId)
        .executeTakeFirst();
    return result;
}

export async function getLimitedUserByChannelId(channelId: string): Promise<Pick<UserContext['User'], 'channel_id' | 'scopes'> | undefined> {
    let result = await db.selectFrom('Users')
        .select(['channel_id', 'scopes'])
        .where('channel_id', '=', channelId)
        .executeTakeFirst();
    return result;
}

// TODO: This is untested. Obtain a User Access Token for the the test account or the bot account and add it to the database.
export async function addUser(user: UserContext['NewUser']) {
    return await db.insertInto('Users')
        .values(user)
        .execute();
}