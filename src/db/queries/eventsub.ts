import { SlitherUserEventSubscription, SlitherAppEventSubscription, SubscriptionType } from '../../types/eventsubtypes.js'
import { db } from '../database.js'
import { DB } from 'kysely-codegen'
import { sql, Insertable, InsertResult, Selectable } from 'kysely'
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
export async function upsertUserEventSub(subs: Insertable<DB['UserEventSubs']> | Insertable<DB['UserEventSubs']>[]): Promise<InsertResult[] | undefined> {
    if(!Array.isArray(subs)) subs = [subs]

    return await db.insertInto('UserEventSubs')
                    .values(subs)
                        .onDuplicateKeyUpdate({
                            id: sql`VALUES(id)`
                        })
                    .execute()

}

export async function upsertAppEventSub(subs: Insertable<DB['AppEventSubs']> | Insertable<DB['AppEventSubs']>[]): Promise<InsertResult[] | undefined> {
    if(!Array.isArray(subs)) subs = [subs]

    return await db.insertInto('AppEventSubs')
                    .values(subs)
                        .onDuplicateKeyUpdate(({ ref }) => ({
                            id: ref('id')
                        }))
                    .execute()

}

// Ensure that all of the required subs for the given channels have an entry in the database via INSERT IGNORE
export async function initRequiredUserSubs(channelIds: string | string[]): Promise<InsertResult | InsertResult[]> {

    if(!Array.isArray(channelIds)) channelIds = [channelIds]

    const insertArr: { channel_id: string, type: SubscriptionType, version: string, id: null }[] = []

    // Loop runs (channelIds.size * SlitherEventSub.requiredUserTypes) times = O(N * 1) = O(N)
    for(let channelId of channelIds) {
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
                version: version,
                id: null
            })
        }
    }

    const insertResult = await db.insertInto('UserEventSubs')
                                    .values(insertArr)
                                    .ignore()
                                    .execute()

    if(insertResult.length > 1) insertResult
    

    if(insertArr.length === 1 && insertResult[0]) return insertResult[0]
    return insertResult

}

export async function initRequiredAppSubs(): Promise<InsertResult[]> {

    const insertArr: { type: SubscriptionType, version: string, id: null }[] = []

    for(let requiredType of SlitherEventSub.requiredAppTypes) {
        const version = SlitherEventSub.versionOf(requiredType)
        if(!version) {
            // TODO: Elevate logging as a critical bug
            console.error(`During upsert of required user types could not identify version for sub type ${requiredType}. Investigate.`)
            continue
        }

        insertArr.push({
            type: requiredType,
            version: version,
            id: null
        })
    }

    return await db.insertInto('AppEventSubs')
                    .values(insertArr)
                    .ignore()
                    .execute()

}

export async function getNullUserSubs(channelIds: string | string[]): Promise<Set<{ channel_id: string, type: SubscriptionType }>> {

    const dbUserSubs = await db.selectFrom('UserEventSubs')
                                .select('channel_id')
                                .select('type')
                                    .where('channel_id', 'in', channelIds)
                                    .where('type', 'in', [...SlitherEventSub.requiredUserTypes])
                                    .where('id', 'is', null)
                                .execute()

        const returnSet = new Set<{ channel_id: string, type: SubscriptionType }>()
        dbUserSubs.forEach((dbUserSub) => {

            returnSet.add({
                channel_id: dbUserSub.channel_id,
                type: dbUserSub.type as SubscriptionType
            })
        })

        return returnSet
}

export async function getNullAppSubTypes(): Promise<Set<SubscriptionType>> {

    const dbAppSubs = await db.selectFrom('AppEventSubs')
                                .select('type')
                                    .where('id', 'is', null)
                                    .where('type', 'in', [...SlitherEventSub.requiredAppTypes])
                                .execute()

    const returnSet = new Set<SubscriptionType>()
    dbAppSubs.forEach((dbAppSub) => { returnSet.add(dbAppSub.type as SubscriptionType) })

    return returnSet
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