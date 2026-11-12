declare const hostName: string
declare const connectionToken: string

const alertsToken = window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1)

const DEFAULT_ALERT_DURATION = 8000
const ALERTS_MEDIA_URI_BASE = `/slither/alerts/media/${alertsToken}`
const WEBSOCKET_URI = `wss://${hostName}/slither?clientType=alerts&token=${connectionToken}`

let socket: WebSocket
connectWebSocket()

  function connectWebSocket() {

    // if a socket was previously defined, clean up its listeners and close it
    if(socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      socket.close()
    }

    socket = new WebSocket(WEBSOCKET_URI)

    let pingIntervalID = setInterval(() => {

      if(socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type: "ping"}))

    }, 30000) // Ping the WS server every 30 seconds to keep the connection alive

    let reconnectIntervalID = setInterval(() => {

      if(socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) {
        console.log('Reconnecting WebSocket for alerts.ejs')
        clearInterval(pingIntervalID)
        clearInterval(reconnectIntervalID)
        connectWebSocket()
      }

    }, 15000) // Check for non-open and non-connecting socket every 15 seconds
  
    socket.addEventListener('open', () => {
      console.log('WebSocket connection established for alerts.ejs')
    })

    socket.addEventListener('close', () => {
      console.log('WebSocket connection closed for alerts.ejs')
    })

    socket.addEventListener('message', event => {

      // TODO: Make messageJSON a const and change this error handling to a result pattern? Look into it
      let messageJSON
      try { messageJSON = JSON.parse(event.data) } 
      catch (e) { return } // If non-json received over WebSocket, ignore it.
      
      // TODO: Allow different alerts to queue up one after the other instead of just replacing the current alert. 
      // This will likely require changes to the way the WebSocket server sends messages to include some sort of queue ID or timestamp, 
      // and changes to the client to manage a queue of incoming alerts and display them one at a time for their specified duration.
      if(messageJSON.type === "alert") {

        console.log('Message received from server: ', messageJSON.data)
        console.log('MessageEvent object: ', event)

        const { alertText, imageFile, audioFile, audioVolume } = messageJSON.data
        const alertDuration = messageJSON.data.duration || DEFAULT_ALERT_DURATION
        
        const imageURL = `${ALERTS_MEDIA_URI_BASE}/${imageFile}`
        const audioURL = `${ALERTS_MEDIA_URI_BASE}/${audioFile}`

        const alertImageElement = document.querySelector<HTMLImageElement>('#alert-image')
        const alertAudioElement = document.querySelector<HTMLAudioElement>('#alert-audio')
        const alertTextElement = document.querySelector<HTMLParagraphElement>('#alert-text')

        if(imageFile && alertImageElement) {

          alertImageElement.style.display = 'inline'
          alertImageElement.src = imageURL
        
          setTimeout(() => {

            alertImageElement.src = ''
            alertImageElement.style.display = 'none'

          }, alertDuration)
          
        }

        if(audioFile && alertAudioElement) {

          alertAudioElement.src = audioURL
          alertAudioElement.volume = parseInt(audioVolume) / 100
          alertAudioElement.play()

          setTimeout(() => {

            alertAudioElement.src = ''
            
          }, alertDuration)

        }

        if(alertText && alertTextElement) {

          alertTextElement.textContent = alertText
    
          setTimeout(() => {

            alertTextElement.textContent = ''

          }, alertDuration)

        }

      }

    }) // End of 'message' event listener

  }