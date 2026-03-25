import { Selectable, Insertable, Updateable, InsertResult, sql } from 'kysely'
import { QueryError } from 'mysql2'
import { DB } from 'kysely-codegen'
import { db } from '../database.js'
import { error } from 'node:console'

export async function getUserIDForRefreshToken(refreshToken: string): Promise<string | null | undefined> {

    return (await db.selectFrom('SlitherIDs')
        .select('twitch_id')
        .where('refresh_token', '=', refreshToken)
        .executeTakeFirst())
            ?.twitch_id

}

// On a duplicate alerts_token error, returns the MySQL QueryError error code (1062).
// On any other MySQL QueryError code, returns -1
// Returns a kysely InsertResult otherwise
export async function upsertSlitherTokensForUser(twitchId: string, alertsToken: string): Promise<InsertResult | number> {

    try {

        return await db.insertInto('SlitherIDs')
            .values({ twitch_id: twitchId, alerts_token: alertsToken})
            .onDuplicateKeyUpdate({
                alerts_token: alertsToken
            })
            .executeTakeFirst()

    } catch(err) {

        if(err instanceof Error) {
            const mysqlErr = err as QueryError
            if(mysqlErr.errno === 1062) return 1062
        }

        return -1
        
    }

}

export async function getAlertsTokenForUser(twitchId: string | undefined): Promise<string | null | undefined> {

    if(!twitchId) return

    return (await db.selectFrom('SlitherIDs')
        .select('alerts_token')
        .where('twitch_id', '=', twitchId)
        .executeTakeFirst())
            ?.alerts_token
}

export async function getUserIDForAlertsToken(paramToken: string): Promise<string | null | undefined> {

    return (await db.selectFrom('SlitherIDs')
            .select('twitch_id')
            .where('alerts_token', '=', paramToken)
            .executeTakeFirst())
                ?.twitch_id

}

export * as default from './slitherauth.js'