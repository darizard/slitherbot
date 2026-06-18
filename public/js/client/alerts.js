const DEFAULT_ALERT_DURATION = 8000;
let socket;
connectWebSocket();
const alertsToken = window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1);
function connectWebSocket() {
    // if a socket was previously defined, clean up its listeners and close it
    if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
    }
    socket = new WebSocket(`wss://${hostName}/slither?clientType=alerts&token=${connectionToken}`);
    let pingIntervalID = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: "ping" }));
    }, 30000); // Ping the WS server every 30 seconds to keep the connection alive
    let reconnectIntervalID = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) {
            console.log('Reconnecting WebSocket for alerts.ejs');
            clearInterval(pingIntervalID);
            clearInterval(reconnectIntervalID);
            connectWebSocket();
        }
    }, 15000); // Check for non-open and non-connecting socket every 15 seconds
    socket.addEventListener('open', () => {
        console.log('WebSocket connection established for alerts.ejs');
    });
    socket.addEventListener('close', () => {
        console.log('WebSocket connection closed for alerts.ejs');
    });
    socket.addEventListener('message', event => {
        let messageJSON;
        try {
            messageJSON = JSON.parse(event.data);
        }
        catch (e) {
            return;
        } // If non-json received over WebSocket, ignore it.
        // TODO: Allow different alerts to queue up one after the other instead of just replacing the current alert. 
        // This will likely require changes to the way the WebSocket server sends messages to include some sort of queue ID or timestamp, 
        // and changes to the client to manage a queue of incoming alerts and display them one at a time for their specified duration.
        if (messageJSON.type === "alert") {
            console.log('Message received from server: ', messageJSON.data);
            console.log('MessageEvent object: ', event);
            const alertImageElement = document.querySelector('#alert-image');
            const alertAudioElement = document.querySelector('#alert-audio');
            if (messageJSON.data.imageFile && alertImageElement) {
                alertImageElement.style.display = 'inline';
                alertImageElement.src = `/slither/alerts/media/${alertsToken}/${messageJSON.data.imageFile}`;
                setTimeout(() => {
                    alertImageElement.src = '';
                    alertImageElement.style.display = 'none';
                }, messageJSON.data.duration || DEFAULT_ALERT_DURATION); // Reset to default image after 8 seconds
            }
            if (messageJSON.data.audioFile && alertAudioElement) {
                alertAudioElement.src = `/slither/alerts/media/${alertsToken}/${messageJSON.data.audioFile}`;
                alertAudioElement.play();
                setTimeout(() => {
                    alertAudioElement.src = '';
                }, messageJSON.data.duration || DEFAULT_ALERT_DURATION); // Reset to default image after 8 seconds
            }
        }
    }); // End of 'message' event listener
}
export {};
