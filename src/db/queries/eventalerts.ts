import { db } from '../database.js';
import { Selectable, UpdateResult } from 'kysely';
import { DB } from 'kysely-codegen';

import { SlitherEventAlerts } from '../../classes/eventalerts.js';
import { SlitherEventSub } from '../../classes/eventsub.js';

import type { AlertUpdateData, EventAlertCategory, EventAlertDetails } from '../../types/alerttypes.js';
import type { SubscriptionType } from '../../types/eventsubtypes.js';

export async function initEventAlerts(): Promise<void> {

    const categories: {name: EventAlertCategory}[] = [];
    for(let category of SlitherEventAlerts.categoryToEventsMap.keys()) categories.push({ name: category });

    const eventSubs = await db.selectFrom('EventSubs')
                        .select(['type', 'id'])
                        .execute();

    const vals: {sub_id: string, audio_volume: number, category: EventAlertCategory | null}[] = [];
    eventSubs.forEach((eventSub) => {
        const category = SlitherEventAlerts.eventToCategoryMap.get(eventSub.type as SubscriptionType) ?? null
        if(!category) return;
        vals.push({
            sub_id: eventSub.id,
            audio_volume: 20,
            category: category
        });
    });

    await db.insertInto('EventAlerts')
            .values(vals)
            .ignore()
            .execute();

}

export async function getUserAlerts(twitchId: string | undefined): Promise<EventAlertDetails[]> {

    if(!twitchId) return [];

    const joinQuery = db.selectFrom('EventAlerts')
                    .selectAll('EventAlerts')
                    .leftJoin('EventSubs', 'EventSubs.id', 'EventAlerts.sub_id')
                    .selectAll('EventSubs')
                    .as('joinQuery');

    const result = await db.selectFrom(joinQuery)
                    .select(['category', 'sub_id as subscriptionId', 'type as subscriptionType',
                             'image_file as imageFile', 'audio_file as audioFile',
                             'image_file_name as imageFileName', 'audio_file_name as audioFileName',
                             'alert_text as alertText', 'duration as alertDuration',
                             'audio_volume as audioVolume'])
                    .where('channel_id', '=', twitchId)
                    .execute() as EventAlertDetails[];

    for(const alert of result) {
        alert.alertDescription = SlitherEventSub.descriptionOf(alert.subscriptionType);
    }

    return result;
}

export async function getAlert(subId: string): Promise<Selectable<DB['EventAlerts']> | undefined> {

    return await db.selectFrom('EventAlerts')
        .selectAll()
        .where('sub_id', '=', subId)
        .executeTakeFirst();

}

export async function updateAlert(subId: string, alertDetails: AlertUpdateData): Promise<UpdateResult | undefined> {

    alertDetails = Object.fromEntries(Object.entries(alertDetails).filter(([_, v]) => v !== undefined));
    if(Object.keys(alertDetails).length === 0) return;
    
    return await db.updateTable('EventAlerts')
        .set(alertDetails)
        .where('sub_id', '=', subId)
        .executeTakeFirst();

}

export async function getFriendlyFileName(filename: string): Promise<string | null> {

    const union = db.selectFrom('EventAlerts')
        .select(['audio_file as hostile_name', 'audio_file_name as friendly_name'])
        .union((qb) => qb.selectFrom('EventAlerts')
                         .select(['image_file as hostile_name','image_file_name as friendly_name']))
        .as('UnionedNames');

    const resultObj = await db.selectFrom(union)
        .select('friendly_name')
        .where('hostile_name', '=', filename)
        .executeTakeFirst();

    return resultObj?.friendly_name || null;

}

export async function getAllUserMediaData(): Promise<{ active_file: string | null, channel_id: string }[] > {

    const audioFiles = db.selectFrom('EventAlerts')
        .innerJoin('EventSubs', 'EventSubs.id', 'EventAlerts.sub_id')
        .select(['EventAlerts.audio_file as active_file', 'EventSubs.channel_id'])
        .where('EventAlerts.audio_file', 'is not', null);

    const imageFiles = db.selectFrom('EventAlerts')
        .innerJoin('EventSubs', 'EventSubs.id', 'EventAlerts.sub_id')
        .select(['EventAlerts.image_file as active_file', 'EventSubs.channel_id'])
        .where('EventAlerts.image_file', 'is not', null);

    return await audioFiles.union(imageFiles).execute();

}

export async function testQuery(filename: string): Promise<string | null> {

    const union = db.selectFrom('EventAlerts')
        .select(['audio_file as hostile_name', 'audio_file_name as friendly_name'])
        .union((qb) => qb.selectFrom('EventAlerts')
                         .select(['image_file as hostile_name','image_file_name as friendly_name']))
        .as('UnionedNames');

    const resultObj = await db.selectFrom(union)
        .select('friendly_name')
        .where('hostile_name', '=', filename)
        .executeTakeFirst();

    return resultObj?.friendly_name || null;
}

export * as default from './eventalerts.js';