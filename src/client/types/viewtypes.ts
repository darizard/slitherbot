import eventsubtypes from '../../types/eventsubtypes.js';
import alerttypes from '../../types/alerttypes.js';

export type SubscriptionType = eventsubtypes.SubscriptionType;
export type EventAlertCategory = alerttypes.EventAlertCategory;
export type EventAlertDetails = Omit<alerttypes.EventAlertDetails, 'subscriptionType' | 'category' | 'imageFile' | 'audioFile'> 
& {
    imageUrl?: string | undefined,
    audioUrl?: string | undefined
};

export type APIMedia = {
    imageBlob?: Blob, 
    imageFileName?: string, 
    imageFileMime?: string,
    audioBlob?: Blob,
    audioFileName?: string,
    audioFileMime?: string,
    subType: SubscriptionType
}

export * as default from './viewtypes.js';