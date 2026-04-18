import { SlitherEventAlerts } from '../../classes/eventalerts.js';
import { SlitherEventSub } from '../../classes/eventsub.js';
import type { EventAlertCategory, EventAlertDetails } from '../../types/alerttypes.js';
import type { SubscriptionType } from '../../types/eventsubtypes.js';
import { db } from '../database.js';

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

export async function getUserAlerts(twitchId: string | undefined): Promise<({ category: EventAlertCategory} & EventAlertDetails)[]> {

    if(!twitchId) return [];

    const eventAlertsRaw = await db.selectFrom('EventAlerts')
                    .leftJoin('EventSubs', 'EventSubs.id', 'EventAlerts.sub_id')
                    .select(['EventAlerts.sub_id', 'EventSubs.type', 'EventAlerts.image_file', 
                             'EventAlerts.audio_file', 'EventAlerts.alert_text', 'EventAlerts.duration', 
                             'EventAlerts.audio_volume', 'EventAlerts.category'])
                    .where('EventSubs.channel_id', '=', twitchId)
                    .execute();

    return (() => {
        const rtnArr: ({ category: EventAlertCategory } & EventAlertDetails)[] = [];
        eventAlertsRaw.forEach((eventAlertRaw) => {
            rtnArr.push({
                category: eventAlertRaw.category as EventAlertCategory,
                subscriptionId: eventAlertRaw.sub_id,
                subscriptionType: eventAlertRaw.type as SubscriptionType,
                imageFile: eventAlertRaw.image_file,
                audioFile: eventAlertRaw.audio_file,
                alertText: eventAlertRaw.alert_text,
                alertDuration: eventAlertRaw.duration,
                audioVolume: eventAlertRaw.audio_volume,
                alertDescription: SlitherEventSub.descriptionOf(eventAlertRaw.type as SubscriptionType)
            });

        });
        return rtnArr;
    })();
}

export * as default from './eventalerts.js';