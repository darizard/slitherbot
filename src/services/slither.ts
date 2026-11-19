import { sslConfig } from '../config.js'
import eventalertssql from '../db/queries/eventalerts.js'
import slithersql from '../db/queries/slitherauth.js'
import type { EventAlertCategory, EventAlertDetails } from '../types/alerttypes.js'

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
    const alertsToken = await slithersql.getAlertsTokenForUser(twitchId)
    const alertsArr = await eventalertssql.getUserAlerts(twitchId)

    // 2. Business Logic / URL Construction
    const alertsUrl = alertsToken ? `https://${sslConfig.hostName}/slither/alerts/${alertsToken}` : ''

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

