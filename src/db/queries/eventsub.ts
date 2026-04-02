import { SlitherUserEventSubscription, SlitherAppEventSubscription, SubscriptionType } from '../../types/eventsubtypes.js'
import { db } from '../database.js'
import { DB } from 'kysely-codegen'
import { Insertable, InsertResult, Selectable } from 'kysely'
import { SlitherEventSub } from '../../classes/eventsub.js'

export async function getAllUserSubscriptions(): Promise<Set<SlitherUserEventSubscription>> {

    const allSubs = await db.selectFrom('UserEventSubs')
        .selectAll()
        .execute()

    const typedSubs: Set<SlitherUserEventSubscription> = new Set()
    allSubs.forEach((dbSub) => {
        typedSubs.add({
            channel_id: dbSub.channel_id,
            type: dbSub.type as SubscriptionType,
            version: dbSub.version,
            id: dbSub.id
        })
    })
    return typedSubs
}

export async function getAllAppSubscriptions(): Promise<Set<SlitherAppEventSubscription>> {

    const allSubs = await db.selectFrom('AppEventSubs')
        .selectAll()
        .execute()

    const typedSubs: Set<SlitherAppEventSubscription> = new Set()
    allSubs.forEach((dbSub) => {
        typedSubs.add({
            id: dbSub.id,
            type: dbSub.type as SubscriptionType,
            version: dbSub.version
        })
    })
    return typedSubs
}

// Insert EventSub subscriptions into the database only after responding to the webhook callback challenge 
export async function upsertUserEventSub(sub: Insertable<DB['UserEventSubs']> | Insertable<DB['UserEventSubs']>[]): Promise<InsertResult[] | undefined> {
    if(!Array.isArray(sub)) sub = [sub]

    return await db.insertInto('UserEventSubs')
                    .values(sub)
                        .onDuplicateKeyUpdate(({ ref }) => ({
                            id: ref('id')
                        }))
                    .execute()

}

export async function upsertAppEventSub(sub: Insertable<DB['AppEventSubs']> | Insertable<DB['AppEventSubs']>[]): Promise<InsertResult[] | undefined> {
    if(!Array.isArray(sub)) sub = [sub]

    return await db.insertInto('AppEventSubs')
                    .values(sub)
                        .onDuplicateKeyUpdate(({ ref }) => ({
                            id: ref('id')
                        }))
                    .execute()

}

export async function initRequiredUserSubs(channelId: string): Promise<InsertResult[]> {

    const insertArr: { channel_id: string, type: SubscriptionType, version: string, id?: string }[] = []

    for(let requiredType of SlitherEventSub.requiredUserTypes) {
        const version = SlitherEventSub.versionOf(requiredType)
        if(!version) {
            // TODO: Elevate logging as a critical bug
            console.error(`During upsert of required user types could not identify version for sub type ${requiredType}. Investigate.`)
            continue
        }

        insertArr.push({
            channel_id: channelId,
            type: requiredType,
            version: version
        })
    }

    return await db.insertInto('UserEventSubs')
            .values(insertArr)
                .onDuplicateKeyUpdate({ id: null })
            .execute()

}

export async function getUserEventSubIds(filter?: Partial<Selectable<DB['UserEventSubs']>>): Promise<(string | null)[] | undefined> {
    
    let query = db.selectFrom('UserEventSubs')
                    .select('id')
    
    let result
    if(filter) {
        if(filter.channel_id) query = query.where('channel_id', '=', filter.channel_id)
        if(filter.type) query = query.where('type', '=', filter.type)
        if(filter.version) query = query.where('version', '=', filter.version)
    }

    result = await query.execute()
    
    if(result === undefined) return undefined

    const arr: (string | null)[] = []
    result.forEach((item) => {
        arr.push(item.id)
    })
    return arr

}

export * as default from './eventsub.js'