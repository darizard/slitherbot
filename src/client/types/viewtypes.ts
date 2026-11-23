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
    fileBlob: Blob, 
    fileName: string, 
    fileMime: string,
}

export * as default from './viewtypes.js';