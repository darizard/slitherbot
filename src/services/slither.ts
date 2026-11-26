import fs from 'fs'

import { appConfig, hostConfig } from '../config.js'

import { getAlert, getUserAlerts, updateAlert } from '../db/queries/eventalerts.js'
import { getAlertsTokenForUser } from '../db/queries/slitherauth.js'

import type { AlertPostReqBody, AlertUpdateData, EventAlertCategory, EventAlertDetails } from '../types/alerttypes.js'

/*******************************************************************************
*******************************     HOME PAGE     ******************************
********************************************************************************/

// Types for the service return value to ensure type safety between layers
export interface HomePageData {
    navItems: { label: string; href: string }[]
    alertsUrl: string
    alertsMap: Map<EventAlertCategory, Map<string, Omit<EventAlertDetails, 'imageFile' | 'audioFile' | 'category' | 'subscriptionType'>>>
    defaultCategory: EventAlertCategory
    defaultAlertType: string
}

export async function getHomePageData(twitchId: string): Promise<HomePageData> {
    // 1. Database Queries (Service Layer responsibility)
    const alertsToken = await getAlertsTokenForUser(twitchId)
    const alertsArr = await getUserAlerts(twitchId)

    // 2. Business Logic / URL Construction
    const alertsUrl = alertsToken ? `https://${hostConfig.hostName}/slither/alerts/${alertsToken}` : ''

    // 3. Data Transformation (Extracted logic)
    const alertsMap = transformAlertsToMap(alertsArr)

    return {
        navItems: [
            { href: '/slither/demo', label: 'Demo' },
            { href: '/slither/logout', label: 'Logout' }
        ],
        alertsUrl,
        alertsMap,
        defaultCategory: 'Follows',
        defaultAlertType: 'channelfollow' // strip periods/colons just as in the transformAlertsToMap function
    }
}

// Helper to group alerts by category and type
function transformAlertsToMap(alerts: EventAlertDetails[]): Map<EventAlertCategory, Map<string, Omit<EventAlertDetails, 'imageFile' | 'audioFile' | 'category' | 'subscriptionType'>>> {
  
  const rtnMap: Map<EventAlertCategory, Map<string, Omit<EventAlertDetails, 'imageFile' | 'audioFile' | 'category' | 'subscriptionType'>>> = new Map()

  alerts.forEach((alert) => {
    // Establish the category if necessary
    if (!rtnMap.has(alert.category)) {
      rtnMap.set(alert.category, new Map())
    }

    // Get the Subscription Type and establish its details in the second level map under the current category
    const alertTypePretty = alert.subscriptionType.replace(/[\.:]/g, '').toLowerCase()
    const alertsForCategory = rtnMap.get(alert.category)

    if (!alertsForCategory?.has(alertTypePretty)) {
      alertsForCategory?.set(alertTypePretty, {
        subscriptionId: alert.subscriptionId,
        imageFileName: alert.imageFileName,
        audioFileName: alert.audioFileName,
        alertText: alert.alertText,
        alertDuration: alert.alertDuration,
        audioVolume: alert.audioVolume,
        alertDescription: alert.alertDescription
      })
    }
  })

  return rtnMap
}

export async function saveAlertMedia(requestBody: AlertPostReqBody, files: { [fieldname: string]: Express.Multer.File[] }, twitchId: string): Promise<void> {

let imageFile, imageFileName, audioFile, audioFileName = undefined
    if(files['imageBlob'] && files['imageBlob'][0]) {
        const img = files['imageBlob'][0]
        imageFile = img.filename
        imageFileName = img.originalname
    }
    if(files['audioBlob'] && files['audioBlob'][0]) {
        const audio = files['audioBlob'][0]
        audioFile = audio.filename
        audioFileName = audio.originalname
    }

    const subId = requestBody.subscriptionId
    const updateData: AlertUpdateData = { }
    const audioVolume = requestBody.audioVolume ? parseInt(requestBody.audioVolume) : undefined
    const duration = requestBody.alertDuration ? parseFloat(requestBody.alertDuration) : undefined
    if(audioVolume) updateData.audio_volume = audioVolume
    if(duration) updateData.duration = duration
    if(requestBody.alertText) updateData.alert_text = requestBody.alertText
    if(imageFile) updateData.image_file = imageFile
    if(imageFileName) updateData.image_file_name = imageFileName
    if(audioFile) updateData.audio_file = audioFile
    if(audioFileName) updateData.audio_file_name = audioFileName

    // Get pre-update image and audio data filenames from the DB
    const { image_file, audio_file } = (await getAlert(subId)) || { audio_file: undefined, image_file: undefined }

    await updateAlert(subId, updateData)

    // If both the new and old file names reference a file, we should delete the old one!
    if(imageFile && image_file) {
        try {
            await fs.promises.unlink(`${appConfig.appPath}/resources/alertmedia/${twitchId}/${image_file}`)
        } catch(err) { 
            console.error(`Could not delete old image file for subId ${subId}`)
        }
    }
    if(audioFile && audio_file) {
        try {
            await fs.promises.unlink(`${appConfig.appPath}/resources/alertmedia/${twitchId}/${audio_file}`)
        } catch(err) { 
            console.error(`Could not delete old audio file for subId ${subId}`)
        }
    }

}