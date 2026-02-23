// TODO: Implement authentication for client WebSockets to control access to the WebSocket server and to allow for user-specific functionality.

export type WSMessage = {
    type: MessageType
}

export function isWSMessage(message: WSMessage): message is WSMessage {
    return (message.type === 'alert' ||
            message.type === 'ping' ||
            message.type === 'pong'
    )
}

export type AlertMessage = WSMessage & {
    type: 'alert',
    imageFile: string | undefined,
    audioFile: string | undefined,
    alertText: string | undefined,
    duration: number | undefined
}

export function isAlertMessage(message: AlertMessage | PingMessage | PongMessage): message is AlertMessage {
    return (message.type === 'alert' &&
            (message.imageFile === undefined || typeof message.imageFile === 'string') &&
            (message.audioFile === undefined || typeof message.audioFile === 'string') &&
            (message.alertText === undefined || typeof message.alertText === 'string') &&
            (message.duration === undefined || typeof message.duration === 'number')
    )
}

export type PingMessage = WSMessage & {
    type: 'ping'
}

export function isPingMessage(message: AlertMessage | PingMessage | PongMessage): message is AlertMessage {
    return message.type === 'ping'
}

export type PongMessage = WSMessage & {
    type: 'pong'
}

export function isPongMessage(message: AlertMessage | PingMessage | PongMessage): message is AlertMessage {
    return message.type === 'pong'
}

export type Client = {
    type: ClientType,
    userId: string | undefined
}

export type ClientType = 'alerts' | 'controller'

export function isValidClientType(type: ClientType): type is ClientType {
    return (
        type === 'alerts' ||
        type === 'controller'
    )
}

export type MessageType = 'alert' | 'ping' | 'pong'

export function isValidMessageType(type: MessageType): type is MessageType {
    return(
        type === 'alert' ||
        type === 'ping' ||
        type === 'pong'
    )
}

export * as default from './slitherws.js'