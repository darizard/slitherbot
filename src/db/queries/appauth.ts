import { UpdateResult } from 'kysely'
import { db } from '../database.js'

export * as default from './appauth.js'

export async function getAuthorizationEventSubscriptionIDs(): Promise<{grant_id: string | null | undefined, revoke_id: string | null | undefined}> {

    const ids = await db.selectFrom('AppInfo')
                        .select('auth_grant_sub_id')
                        .select('auth_revoke_sub_id')
                        .executeTakeFirst()

    return { grant_id: ids?.auth_grant_sub_id, revoke_id: ids?.auth_revoke_sub_id }
}

export async function updateAuthorizationEventSubscriptionIDs(ids: { grant_id?: string, revoke_id?: string }): Promise<UpdateResult> {

    // Kysely omits a key from the generated SQL statement entirely if its value is undefined. This is exactly how we want this to behave here.
    return await db.updateTable('AppInfo')
        .set({
            'auth_grant_sub_id': ids.grant_id,
            'auth_revoke_sub_id': ids.revoke_id
        })
        .executeTakeFirst()

    

}