import { EventAlertCategory } from '../types/alerttypes.js';
import { SubscriptionType } from '../types/eventsubtypes.js';

export class SlitherEventAlerts {

    static readonly alertCategories: EventAlertCategory[] = [
        'Follows',
        'Subscriptions', 
        'Channel Points', 
        'Raids', 
        'Hype Trains', 
        'Bits'
    ];

    static readonly categoryToEventsMap: Map<EventAlertCategory, Set<SubscriptionType>> = new Map([
        ['Follows', new Set<SubscriptionType>(['channel.follow'])],
        ['Subscriptions', new Set<SubscriptionType>(['channel.subscribe',
                                           'channel.subscription.gift',
                                           'channel.subscription.message'])],
        ['Raids', new Set<SubscriptionType>(['channel.raid'])],
        ['Hype Trains', new Set<SubscriptionType>(['channel.hype_train.begin',
                                         'channel.hype_train.end'])],
        ['Channel Points', new Set<SubscriptionType>(['channel.channel_points_custom_reward_redemption.add',
                                            'channel.channel_points_custom_reward_redemption.update'])],
        ['Bits', new Set<SubscriptionType>(['channel.bits.use'])]
    ]);

    static readonly eventToCategoryMap: Map<SubscriptionType, EventAlertCategory> = (() => {

        const rtnMap = new Map<SubscriptionType, EventAlertCategory>();
        this.categoryToEventsMap.keys().forEach((category) => {
            this.categoryToEventsMap.get(category)?.forEach((subType) => { rtnMap.set(subType,category); })
        })
        return rtnMap;
        
    })();
    
    

}