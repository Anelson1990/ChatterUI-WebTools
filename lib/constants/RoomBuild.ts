import Constants from 'expo-constants'

/**
 * True only in the Room build (EAS profile "room", package com.nelco.nexusroom,
 * display name "Nexus — The Room"). Set via extra.roomBuild in app.config.js,
 * which reads EXPO_PUBLIC_ROOM_BUILD from the EAS room profile env.
 * Every Room-only behavior gates on this flag so Austin's regular Nexus
 * builds from the same source stay untouched.
 */
export const IS_ROOM_BUILD: boolean = Constants.expoConfig?.extra?.roomBuild === true
