import * as React from 'react'
import type { Room } from '../../../map/rooms/utils/Room'
import type { RoomEditPayload } from './types'
import { applyRoomChangesLocal } from './geoUtils'

export function useAdminMode({
  selectedBuild: _selectedBuild,
  selectedFloor: _selectedFloor,
  setRooms,
}: {
  selectedBuild: string
  selectedFloor: string
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>
}) {
  const [isAdminMode, setIsAdminMode] = React.useState(false)
  const [isAdminBackendAvailable] = React.useState(false)

  const toggleAdminMode = React.useCallback(async () => {
    if (isAdminMode) {
      setIsAdminMode(false)
      return
    }

    const password = window.prompt('Введите пароль администратора')
    if (password === 'poper') {
      setIsAdminMode(true)
      return
    }
    window.alert('Неверный пароль')
  }, [isAdminMode])

  const saveRoomChanges = React.useCallback(async (room: Room, changes: RoomEditPayload) => {
    void _selectedBuild
    void _selectedFloor
    const updatedRoom = applyRoomChangesLocal(room, changes)
    setRooms((prev) => prev.map((item) => (item.key === room.key ? updatedRoom : item)))
  }, [_selectedBuild, _selectedFloor, setRooms])

  return {
    isAdminMode,
    isAdminBackendAvailable,
    toggleAdminMode,
    saveRoomChanges,
  }
}
