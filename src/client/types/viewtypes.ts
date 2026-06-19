import { SubscriptionType } from '../../types/eventsubtypes.js'

export type AlertMediaData = {
    imageUrl?: string | undefined,
    audioUrl?: string | undefined,
    imageName?: string | undefined,
    audioName?: string | undefined
}

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