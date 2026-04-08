import * as React from 'react';
import { loadRoomsFromPublic, type RoomDataManifest } from '../../map/rooms/utils/roomData';
import type { Room } from '../../map/rooms/utils/Room';
import { formatRoomDescription } from '../../map/rooms/utils/stairDirection';
import type { SearchIndexedRoom, SmartSearchData } from './types';

type UseSmartSearchArgs = {
  manifest: RoomDataManifest | null;
  selectedBuild: string;
  searchText: string;
  isInteractiveRoom: (room: Room) => boolean;
};

function caseFold(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('ru-RU');
}

export function useSmartSearch({
  manifest,
  selectedBuild,
  searchText,
  isInteractiveRoom,
}: UseSmartSearchArgs): SmartSearchData {
  const [searchIndexRooms, setSearchIndexRooms] = React.useState<SearchIndexedRoom[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    if (!manifest || manifest.builds.length === 0) {
      setSearchIndexRooms([]);
      return;
    }

    (async () => {
      const list: SearchIndexedRoom[] = [];
      for (const build of manifest.builds) {
        for (const floorId of build.floors) {
          try {
            const floorRooms = await loadRoomsFromPublic({ buildId: build.id, floorId });
            for (const room of floorRooms) {
              if (!isInteractiveRoom(room)) continue;
              if (room.roomID === 100 || room.roomID === 200 || room.roomID === 300 || room.roomID === 301) continue;

              list.push({
                key: room.key,
                buildId: build.id,
                floorId,
                roomNo: (room.roomNo ?? '').trim(),
                description: formatRoomDescription(room.roomID, room.description),
                category: (room.category ?? '').trim(),
              });
            }
          } catch {
            // ignore missing floor data
          }
        }
      }

      if (!cancelled) setSearchIndexRooms(list);
    })();

    return () => {
      cancelled = true;
    };
  }, [manifest, isInteractiveRoom]);

  return React.useMemo(() => {
    const q = caseFold(searchText);

    const categoriesByKey = new Map<string, string>();
    for (const room of searchIndexRooms) {
      const label = room.category.trim();
      if (label.length === 0) continue;
      const key = caseFold(label);
      if (!categoriesByKey.has(key)) categoriesByKey.set(key, label);
    }

    const allCategories = Array.from(categoriesByKey.values()).sort((a, b) => a.localeCompare(b, 'ru'));
    const categoryMatches = q.length === 0 ? [] : allCategories.filter((c) => caseFold(c).includes(q));

    if (q.length === 0) {
      return {
        currentBuildMatches: [],
        otherBuildMatches: [],
        categoryMatches,
      } satisfies SmartSearchData;
    }

    const roomMatches = searchIndexRooms.filter((r) => {
      return caseFold(r.roomNo).includes(q) || caseFold(r.description).includes(q);
    });

    const currentBuildMatches = roomMatches
      .filter((r) => r.buildId === selectedBuild)
      .slice(0, 20);

    const otherBuildMatches = roomMatches
      .filter((r) => r.buildId !== selectedBuild)
      .slice(0, 20);

    return { currentBuildMatches, otherBuildMatches, categoryMatches } satisfies SmartSearchData;
  }, [searchIndexRooms, searchText, selectedBuild]);
}
