export type OfficeLocation = {
  buildId: string;
  floorId: string;
  roomKey: string;
  roomNo: string;
};

export type OfficeNode = {
  id: string;
  type: 'institute' | 'faculty' | 'department';
  name: string;
  cabinet: string;
  link: string;
  location: OfficeLocation | null;
  children: OfficeNode[];
};

export type OfficesHierarchyData = {
  generatedAt: string;
  stats: {
    totalRows: number;
    mappedRows: number;
    unmappedRows: number;
  };
  institutes: OfficeNode[];
};
