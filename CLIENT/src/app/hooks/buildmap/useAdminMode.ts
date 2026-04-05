import * as React from 'react'
import type { Room } from '../../../map/rooms/utils/Room'
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

  const probeAdminBackend = React.useCallback(async (): Promise<boolean> => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 1800)
    try {
      const response = await fetch('/api/admin/rooms/update', {
        method: 'OPTIONS',
        signal: controller.signal,
      })
      return response.ok
    } catch {
      return false
    } finally {
      window.clearTimeout(timeoutId)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    const refreshAdminBackendStatus = async () => {
      const available = await probeAdminBackend()
      if (cancelled) return
      setIsAdminBackendAvailable(available)
      if (!available) setIsAdminMode(false)
    }

    void refreshAdminBackendStatus()
    const intervalId = window.setInterval(() => {
      void refreshAdminBackendStatus()
    }, 20000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [probeAdminBackend])

  const toggleAdminMode = React.useCallback(async () => {
    if (isAdminMode) {
      setIsAdminMode(false)
      return
    }

    const backendAvailable = await probeAdminBackend()
    setIsAdminBackendAvailable(backendAvailable)
    if (!backendAvailable) {
      window.alert('Админ-панель недоступна: сервер не подключён')
      return
    }

    const password = window.prompt('Введите пароль администратора')
    if (password === 'poper') {
      setIsAdminMode(true)
      return
    }
    window.alert('Неверный пароль')
  }, [isAdminMode, probeAdminBackend])

  const saveRoomChanges = React.useCallback(async (room: Room, changes: RoomEditPayload) => {
    const backendAvailable = isAdminBackendAvailable || await probeAdminBackend()
    if (!backendAvailable) {
      setIsAdminBackendAvailable(false)
      throw new Error('Админ-панель недоступна: сервер не подключён')
    }

    let response: Response
    try {
      response = await fetch('/api/admin/rooms/update', {
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
      throw new Error('Админ-панель недоступна: нет соединения с сервером')
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Ошибка сохранения (${response.status})`)
    }

    const updatedRoom = applyRoomChangesLocal(room, changes)
    setRooms((prev) => prev.map((item) => (item.key === room.key ? updatedRoom : item)))
    setIsAdminBackendAvailable(true)
  }, [isAdminBackendAvailable, probeAdminBackend, selectedBuild, selectedFloor, setRooms])

  return {
    isAdminMode,
    isAdminBackendAvailable,
    toggleAdminMode,
    saveRoomChanges,
  }
}
