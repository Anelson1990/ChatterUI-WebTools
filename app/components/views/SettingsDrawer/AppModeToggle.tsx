import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'

import HorizontalSelector from '@components/input/HorizontalSelector'
import { IS_ROOM_BUILD } from '@lib/constants/RoomBuild'
import { useAppMode } from '@lib/state/AppMode'

const AppModeToggle = () => {
    const { t } = useTranslation()
    const { appMode, setAppMode } = useAppMode()

    // Room builds are local-only: there is no mode toggle.
    if (IS_ROOM_BUILD) return null

    return (
        <HorizontalSelector
            style={{ flex: 0, paddingBottom: 12, paddingHorizontal: 8, marginHorizontal: 4 }}
            values={[
                {
                    value: 'local',
                    label: t('appMode.options.local'),
                    icon: Platform.OS === 'android' ? 'phone-android' : 'phone-iphone',
                },
                { value: 'remote', label: t('appMode.options.remote'), icon: 'cloud' },
            ]}
            selected={appMode}
            onPress={setAppMode}
        />
    )
}

export default AppModeToggle
