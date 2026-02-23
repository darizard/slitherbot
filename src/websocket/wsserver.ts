// ***************************************************************************************************************
// ***************************************************************************************************************
// ***************************************************************************************************************
//
// WebSocket server for Twitch alerts. Listens for messages from the Twitch bot and forwards them to the apporpriate
// connected clients based on client type.
// 
// Currently only supports "alerts" client type, which is used by the Twitch
// alerts webpage to display channel point reward redemptions and other Twitch events as visual and audio alerts on stream.
//
// ***************************************************************************************************************
// ***************************************************************************************************************
// ***************************************************************************************************************

// TODO: Implement authentication for client WebSockets to control access to the WebSocket server and to allow for user-specific functionality.
// TODO: Secure websocket connections using JWTs.

import fs from 'fs'
import type { Server as httpsServer } from 'https'
import { WebSocketServer, WebSocket } from 'ws'
import url from 'url'
import slitherws from './slitherws.js' // Import the WebSocket connection and connection management functions defined in slitherws.js

export default { init }

const connections = new Map<WebSocket, slitherws.Client>()

//====================================EXPORTED METHODS====================================
export function init(server: httpsServer) {
    // We are behind a reverse proxy that forwards traffic from port 443 to the local WebSocket server on port 8080, 
    // so we can only receive WebSocket connections on the path '/twitch' and must parse the client type from the connection URL
    const wsServer = new WebSocketServer({ server: server, path: '/twitch' })

    wsServer.on('connection', function connection(ws, request) {
        ws.on('error', (error) => {
            console.error(`WebSocket error: ${error}`)
            ws.close()
        })

        const clientType = url.parse(request.url || '', true).query['clientType'] as slitherws.ClientType
        // Validate the client type with internal type guard
        if(!slitherws.isValidClientType(clientType)) {
            console.error(`WebSocket connection with invalid client type '${clientType}' rejected`)
            return
        }
        // TODO: Populate userId if clientType === 'alerts'
        connections.set(ws, { type: clientType, userId: undefined } )
        console.log(`WebSocket connection established with client type: ${clientType}. Total connections: ${connections.size}`)

        // Expect stringified JSON as incoming messages
        ws.on('message', function incoming(messageRaw) {

            // Extract JSON and validate that it is a properly formed message of a known type
            let messageJSON: slitherws.WSMessage

            try {
                messageJSON = JSON.parse(messageRaw.toString())
            } catch(e) {
                if(e instanceof SyntaxError) console.error(`Invalid JSON received from client: ${messageRaw}`)
                else console.error(`Error parsing message from client: ${messageRaw}. Error: ${e}`)
                return
            }
            
            // Forward to clients based on message type. "satisfies never" syntax used for exhaustive type checking on message types
            switch (messageJSON.type) {
                case "alert":
                    if(!slitherws.isAlertMessage(messageJSON as slitherws.AlertMessage)) {
                        console.error(`Malformed alert message received by WebSocket: ${messageJSON}`)
                        break
                    }
                    for(const [key, value] of connections)
                        // Only send message on to the client if the requested media exists on the server.
                        if(value.type === 'alerts' && mediaExist(messageJSON as slitherws.AlertMessage)) {
                            key.send(JSON.stringify(messageJSON))
                        }
                    break
                case "ping":
                    if(!slitherws.isPingMessage(messageJSON as slitherws.PingMessage)) {
                        console.error(`WebSocket has somehow received a malformed ping message: ${messageJSON}`)
                        break
                    }
                    ws.send(JSON.stringify({type: "pong"} satisfies slitherws.PongMessage))
                    break
                case "pong":
                    if(!slitherws.isPongMessage(messageJSON as slitherws.PongMessage)) {
                        console.error(`WebSocket has somehow received a malformed pong message: ${messageJSON}`)
                        break
                    }
                    break
                default:
                    // This can happen at runtime. Ignore messages of invalid types.
                    console.error(`Unknown message type received: ${messageJSON.type satisfies never}`)
                    return
            }
        });

        ws.on('close', function close() {
            console.log(`WebSocket connection of type ${connections.get(ws)?.type} closed with client.`)
            connections.delete(ws)
        })
    })

    wsServer.on('error', (error) => {
        console.error('WebSocket server error:', error)
    })
}

// Returns `false` if an alert message specifies a string for its audio or image file that does not exist on the server.
// Returns `true` otherwise.
function mediaExist(message: slitherws.AlertMessage): boolean {

    let pathToSound = `/opt/slitherbot/public/sounds/${message.audioFile}`
    let pathToImage = `/opt/slitherbot/public/images/${message.imageFile}`
    if ((message.audioFile && !fs.existsSync(pathToSound))
        || message.imageFile && !fs.existsSync(pathToImage)) 
    {
        return false;
    }
    return true;

}