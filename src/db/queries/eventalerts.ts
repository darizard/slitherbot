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

export async function getAlertsByCategory(twitchId: string | undefined): Promise<Map<EventAlertCategory, Set<EventAlertDetails>>> {
    if(!twitchId) return new Map();

    const subObjArray = await db.selectFrom('EventSubs')
                             .select(['id', 'type'])
                             .where('channel_id', '=', twitchId)
                             .execute();

    const subDescriptionMap: Map<string, SubscriptionType> = (() => {

        const rtnMap = new Map();
        subObjArray.forEach((subObj) => { rtnMap.set(subObj.id, subObj.type); })
        return rtnMap;

    })();
    
    const eventAlertsRaw = await db.selectFrom('EventAlerts')
                    .select(['sub_id', 'image_file', 'audio_file', 'alert_text', 'duration', 'audio_volume', 'category'])
                    .where('sub_id', 'in', subObjArray.map((subObj) => { return subObj.id; }))
                    .execute();
    return (() => {
        const rtnMap = new Map<EventAlertCategory, Set<EventAlertDetails>>();
        eventAlertsRaw.forEach((eventAlertRaw) => {
            const category = eventAlertRaw.category as EventAlertCategory;
            if(!rtnMap.has(category)) rtnMap.set(category, new Set<EventAlertDetails>());

            rtnMap.get(category)?.add({
                subscriptionId: eventAlertRaw.sub_id,
                imageFile: eventAlertRaw.image_file,
                audioFile: eventAlertRaw.audio_file,
                alertText: eventAlertRaw.alert_text,
                alertDuration: eventAlertRaw.duration,
                audioVolume: eventAlertRaw.audio_volume,
                alertDescription: SlitherEventSub.descriptionOf(subDescriptionMap.get(eventAlertRaw.sub_id) as SubscriptionType)
            });

        });
        return rtnMap;
    })();
}

export * as default from './eventalerts.js';