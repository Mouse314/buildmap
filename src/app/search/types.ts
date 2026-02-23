export type SearchIndexedRoom = {
  key: string;
  buildId: string;
  floorId: string;
  roomNo: string;
  description: string;
  category: string;
};

export type SmartSearchData = {
  currentBuildMatches: SearchIndexedRoom[];
  otherBuildMatches: SearchIndexedRoom[];
  categoryMatches: string[];
};
