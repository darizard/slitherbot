import { InsertResult, UpdateResult } from 'kysely'
import { QueryError } from 'mysql2'
import { db } from '../database.js'

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
export async function upsertSlitherUser(twitchId: string, alertsToken: string): Promise<InsertResult | number> {

    try {

        return await db.insertInto('SlitherIDs')
            .values({ twitch_id: twitchId, alerts_token: alertsToken, require_login: 0})
            .onDuplicateKeyUpdate({
                alerts_token: alertsToken,
                require_login: 0
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

export async function requiresLogin(userId: string | undefined): Promise<boolean> {

    return (await db.selectFrom('SlitherIDs')
                    .select('require_login')
                    .where('twitch_id', '=', userId ?? '')
                    .executeTakeFirst())?.require_login === 1 ? true : false

}

export async function setLoginRequiredValue(twitchId: string, required: boolean): Promise<UpdateResult> {

    return await db.updateTable('SlitherIDs')
                    .set('require_login', required ? 1 : 0)
                    .where('twitch_id', '=', twitchId)
                    .executeTakeFirst()

}

export * as default from './slitherauth.js'