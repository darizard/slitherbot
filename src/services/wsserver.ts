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

import type { Server as httpsServer } from 'https';
import { WebSocketServer } from 'ws';
import url from 'url';
import { WSClientType } from '../types/slitherwstypes.js'; // Import the WebSocket connection and connection management functions defined in slitherws.js
import { SlitherAlertsServerWebSocket, SlitherControllerServerWebSocket } from '../classes/slitherws.js';
import { jwtVerify } from 'jose';

import { ws as wsConfig } from '../config.js';
import { verifySlitherToken } from './slitherauth.js';

export default { init };

const alertsServerWebSockets = new Set<SlitherAlertsServerWebSocket>();
const controllerServerSocket = new SlitherControllerServerWebSocket(alertsServerWebSockets);

//====================================EXPORTED METHODS====================================
export function init(server: httpsServer) {

    // We are behind a reverse proxy that forwards traffic from port 443 to the local WebSocket server on port 8080, 
    // so we can only receive WebSocket connections on the path '/slither' and must parse the client type from the connection URL
    const wsServer = new WebSocketServer({  server: server, path: '/slither' });

    wsServer.on('error', (error) => {
        console.error('WebSocket server error:', error);
    });

    // On any successful connection, immediately attached an error handler, verify the shape of the request params,
    // and validate the token provided. Once this is done, pass the connection off using the appropriate slitherws
    // service method to attach more specific event handlers and maintain any necessary object references 
    wsServer.on('connection', async function connection(ws, request) {

        // In case anything happens before we initialize the related objects properly
        ws.on('error', genericWebSocketError);

        const urlQuery = url.parse(request.url ?? '', true).query;
        const clientType = urlQuery['clientType'] as WSClientType;
        
        // Validate the client type and authenticate the connection. If everything is in order, 
        switch(clientType) {

            case 'alerts':
                const userId = await (async () => {
                    try { return await verifySlitherToken(urlQuery['token'] as string, 'alerts'); }
                    catch (err) {

                        console.log(`Error during verification of alerts connection token. Investigate request: ${JSON.stringify(request.url?.toString())}`);
                        ws.removeAllListeners();
                        ws.close();
                        return;

                    }
                })();

                if(!userId) return;

                const alertsServerSocket = new SlitherAlertsServerWebSocket(userId);

                try { alertsServerSocket.connect(ws); }
                catch (err) {

                    console.error(`Error connecting server-side alerts socket wrapper: ${JSON.stringify(err)}`);
                    ws.close(1011);

                }

                alertsServerWebSockets.add(alertsServerSocket);
                
                ws.on('close', (ws) => {  alertsServerWebSockets.delete(alertsServerSocket);  })
                
                // TODO: Add the alerts socket to the data structure we're going to use here (time for a HashMap?)
                // We will probably also need to add another on.('close') callback to remove the object from memory.
                // This means we should restructure the way we connect these socket wrappers. Maybe remove just the
                // on.('error') callback rather than all listeners when calling .connect(), then we can transfer any
                // callbacks the server wants to apply into the instances of these wrappers
                break;

            case 'controller':            
                // Kill connection if the token from the connection url params cannot be verified 
                try {
                    
                    const secret = new TextEncoder().encode(wsConfig.controllerSecret);
                    const jwtVerificationResult = await jwtVerify(urlQuery['token'] as string, secret);
                    const { userId, clientType } = jwtVerificationResult.payload;
                    if(userId !== '.controller.' || clientType != 'controller' || Object.keys(jwtVerificationResult.payload).indexOf('iat') === -1
                                               || Object.keys(jwtVerificationResult.payload).length !== 3) {

                        // TODO: Elevate logging as this could represent a security problem
                        console.error(`Verified WebSocket controller connection received without valid payload. `,
                                      `Investigate request: ${JSON.stringify(request.url?.toString())}`);
                        console.error(`Payload: ${JSON.stringify(jwtVerificationResult.payload)}`);
                        return;

                    }

                } catch (err) {

                    console.log(`Error during verification of controller connection token. Investigate request: ${JSON.stringify(request.url?.toString())}`);
                    ws.removeAllListeners();
                    ws.close();
                    return;

                }

                // Inject the incoming WebSocket connection into the Controller Server Socket wrapper
                try { controllerServerSocket.connect(ws); }
                catch(err) {

                    console.error(`Error connecting server-side controller socket wrapper: ${JSON.stringify(err)}`);
                    ws.removeAllListeners();
                    ws.close(1011);

                } 
                
                break;

            default:
                console.log(`WebSocket connection with invalid client type '${clientType satisfies never}' `,
                            `has been rejected by the WebSocket Server.`);
                return;
        }
    })
}

function genericWebSocketError(error: Error): void {
    console.log(`WebSocket error: ${JSON.stringify(error)}`);
}