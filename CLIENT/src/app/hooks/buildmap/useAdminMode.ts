import * as React from 'react'
import type { Room } from '../../../map/rooms/utils/Room'
import { plansApiUrl } from '../../../map/rooms/utils/roomData'
import type { RoomEditPayload } from './types'
import { applyRoomChangesLocal } from './geoUtils'

export function useAdminMode({
  selectedBuild,
  selectedFloor,
  setRooms,
}: {
  selectedBuild: string
  selectedFloor: string
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>
}) {
  const [isAdminMode, setIsAdminMode] = React.useState(false)
  const [isAdminBackendAvailable, setIsAdminBackendAvailable] = React.useState(false)

  const toggleAdminMode = React.useCallback(async () => {
    if (isAdminMode) {
      setIsAdminMode(false)
      return
    }

    try {
      const health = await fetch(plansApiUrl('/api/admin/health'), {
        method: 'GET',
        cache: 'no-store',
      })

      if (!health.ok) {
        setIsAdminBackendAvailable(false)
        window.alert('Сервер недоступен. Вход в админ-режим запрещён.')
        return
      }
    } catch {
      setIsAdminBackendAvailable(false)
      window.alert('Сервер недоступен. Вход в админ-режим запрещён.')
      return
    }

    setIsAdminBackendAvailable(true)

    const password = window.prompt('Введите пароль администратора')
    if (password === 'poper') {
      setIsAdminMode(true)
      return
    }
    window.alert('Неверный пароль')
  }, [isAdminMode])

  const saveRoomChanges = React.useCallback(async (room: Room, changes: RoomEditPayload) => {
    let response: Response
    try {
      response = await fetch(plansApiUrl('/api/admin/rooms/update'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          buildId: selectedBuild,
          floorId: selectedFloor,
          roomKey: room.key,
          changes,
        }),
      })
    } catch {
      setIsAdminBackendAvailable(false)
      throw new Error('Сервер сохранения недоступен. Запустите SERVER и повторите попытку.')
    }

    if (!response.ok) {
      setIsAdminBackendAvailable(false)
      const details = (await response.text()).trim()
      throw new Error(details.length > 0 ? details : `Ошибка сохранения (${response.status})`)
    }

    setIsAdminBackendAvailable(true)
    const updatedRoom = applyRoomChangesLocal(room, changes)
    setRooms((prev) => prev.map((item) => (item.key === room.key ? updatedRoom : item)))
  }, [selectedBuild, selectedFloor, setRooms])

  return {
    isAdminMode,
    isAdminBackendAvailable,
    toggleAdminMode,
    saveRoomChanges,
  }
}
