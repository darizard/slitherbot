import { SlitherEventSubscription, SubscriptionType } from '../../types/eventsubtypes.js';
import { db } from '../database.js';
import { DB } from 'kysely-codegen';
import { sql, Insertable, InsertResult, Selectable } from 'kysely';

export async function getAllSubscriptions(): Promise<Set<SlitherEventSubscription>> {

    const allSubs = await db.selectFrom('EventSubs')
        .selectAll()
        .execute();

    const typedSubs: Set<SlitherEventSubscription> = new Set();
    allSubs.forEach((dbSub) => {
        typedSubs.add({
            channel_id: dbSub.channel_id,
            type: dbSub.type as SubscriptionType,
            version: dbSub.version,
            id: dbSub.id
        });
    });
    return typedSubs;
}

export async function getUserSubscriptions(twitchId?: string): Promise<Set<SlitherEventSubscription>> {

    let subsQuery = db.selectFrom('EventSubs')
        .selectAll();

    if(twitchId === undefined) subsQuery = subsQuery.where('channel_id', '!=', '.');
    else subsQuery = subsQuery.where('channel_id', '=', twitchId);

    const queryResult = await subsQuery.execute();

    const typedSubs: Set<SlitherEventSubscription> = new Set();
    queryResult.forEach((dbSub) => {
        typedSubs.add({
            channel_id: dbSub.channel_id,
            type: dbSub.type as SubscriptionType,
            version: dbSub.version,
            id: dbSub.id
        });
    });
    return typedSubs;
}

export async function getAllAppSubscriptions(): Promise<Set<SlitherEventSubscription>> {

    const allSubs = await db.selectFrom('EventSubs')
        .selectAll()
            .where('channel_id', '=', '.')
        .execute();

    const typedSubs: Set<SlitherEventSubscription> = new Set();
    allSubs.forEach((dbSub) => {
        typedSubs.add({
            channel_id: '.',
            id: dbSub.id,
            type: dbSub.type as SubscriptionType,
            version: dbSub.version
        });
    });
    return typedSubs;
}

export async function getSubscriptionsForUsers(userIds: string |string[]): Promise<Set<SlitherEventSubscription>> {
    if(!Array.isArray(userIds)) userIds = [userIds];

    const queryResult = await db.selectFrom('EventSubs')
                    .selectAll()
                    .where('channel_id', 'in', userIds)
                    .execute();

    const typedSubs: Set<SlitherEventSubscription> = new Set();
    queryResult.forEach((dbSub) => {
        typedSubs.add({
            channel_id: dbSub.channel_id,
            type: dbSub.type as SubscriptionType,
            version: dbSub.version,
            id: dbSub.id
        });
    });
    return typedSubs;
}

// Insert EventSub subscriptions into the database only after responding to the webhook callback challenge 
export async function upsertEventSub(subs: Insertable<DB['EventSubs']> | Insertable<DB['EventSubs']>[]): Promise<InsertResult[] | undefined> {
    if(!Array.isArray(subs)) subs = [subs];

    return await db.insertInto('EventSubs')
                    .values(subs)
                        .onDuplicateKeyUpdate({
                            id: sql`VALUES(id)`
                        })
                    .execute();

}

export async function getUserEventSubIds(filter?: Partial<Selectable<DB['EventSubs']>>): Promise<(string | null)[] | undefined> {
    
    let query = db.selectFrom('EventSubs')
                    .select('id')
                        .where('channel_id', '!=', '.');
    
    let result;
    if(filter) {
        if(filter.channel_id) query = query.where('channel_id', '=', filter.channel_id);
        if(filter.type) query = query.where('type', '=', filter.type);
        if(filter.version) query = query.where('version', '=', filter.version);
    }

    result = await query.execute();
    
    if(result === undefined) return undefined;

    const arr: (string | null)[] = [];
    result.forEach((item) => {
        arr.push(item.id);
    });
    return arr;

}

export async function deleteEventSub(subId: string): Promise<boolean> {

    return await db.deleteFrom('EventSubs')
                    .where('id', '=', subId)
                    .executeTakeFirst()
                    .then((result) => {

                        return result.numDeletedRows > 0;

                    });

}

export * as default from './eventsub.js';